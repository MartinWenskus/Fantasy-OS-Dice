import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  actionsFor,
  initialState,
  applyCommand,
  numericCost,
  spellRolls,
  shortRestFormula,
  skillRolls,
  parseOutcomes,
} from '../scripts/gameplay.js';
import { GameplayStore } from '../scripts/gameplay-store.js';

const character = {
  id: 'demo',
  name: 'Alva',
  level: 3,
  con: 2,
  con_bonus: 5,
  spell_attack: 4,
  hp: 8,
  max_hp: 20,
  mana: 9,
  max_mana: 15,
  dp: 1,
  max_dp: 6,
  ap: 1,
  max_ap: 3,
  arcana_number: 7,
  extra_1_label: 'Segeln',
  extra_1_number: 3,
  spells: [
    { id: 1, Name: 'Flamme', Mana: '4', dice: [{ count: 2, sides: 6, modifier: 'SP', effect: 'damage' }] },
    { id: 2, Name: 'Telepathie', Mana: '0' },
    { id: 3, Name: 'Teleport', Mana: '0' },
    { id: 4, Name: 'Variabel', Mana: 'X' },
  ],
  foundryGameplay: {
    catalogComplete: true,
    abilities: [
      {
        key: 'race:1:ability_1_title',
        source: 'race',
        translations: [{ title: '1 AP Teleport', languages_code: 'de' }],
      },
    ],
  },
};
const rule = (overrides = {}) => ({ manaCost: 0, max: 1, unlimited: false, reset: 'long-rest', ...overrides });
const action = (state, key) => actionsFor(character, state, 'de').find((entry) => entry.key === key);
const change = (state, command) => applyCommand(character, state, command, 'de');

test('casts spend mana once, respect availability, and leave rejected state untouched', () => {
  let state = initialState(character);
  assert.equal(action(state, 'spell:1').uses, 2);
  state = change(state, { type: 'use', key: 'spell:1' });
  state = change(state, { type: 'use', key: 'spell:1' });
  assert.equal(state.resources.mana, 1);
  const before = structuredClone(state);
  assert.throws(() => change(state, { type: 'use', key: 'spell:1' }), /NotEnoughMana/);
  assert.deepEqual(state, before);
  assert.equal(action(state, 'spell:2').ready, true);
  assert.equal(action(state, 'spell:4').reason, 'configure');
});

test('innate spells share one action and require a configured rest limit', () => {
  let state = initialState(character);
  assert.equal(actionsFor(character, state, 'de').length, 4);
  assert.equal(action(state, 'spell:3').reason, 'configure');
  state = change(state, { type: 'configure', key: 'spell:3', rule: rule({ manaCost: 2 }) });
  state = change(state, { type: 'use', key: 'spell:3' });
  assert.equal(action(state, 'spell:3').reason, 'exhausted');
  assert.equal(state.resources.mana, 7);
  state = change(state, { type: 'refund', key: 'spell:3' });
  assert.equal(action(state, 'spell:3').remaining, 1);
  assert.equal(state.resources.mana, 7, 'refunding a use does not conjure mana');
});

test('combined mana and rest limits use the smaller remaining allowance', () => {
  let state = change(initialState(character), {
    type: 'configure',
    key: 'spell:1',
    rule: rule({ max: 3, manaCost: 4 }),
  });
  assert.equal(action(state, 'spell:1').uses, 2);
  state = change(state, { type: 'resource', resource: 'mana', value: 3 });
  assert.equal(action(state, 'spell:1').reason, 'mana');
});

test('short, long, and session resets keep their separate scope', () => {
  let state = initialState(character);
  for (const period of ['short-rest', 'long-rest', 'session', 'never']) {
    state = change(state, { type: 'add', key: `custom:${period}`, label: period, rule: rule({ reset: period }) });
    state = change(state, { type: 'use', key: `custom:${period}` });
  }
  state = change(state, { type: 'rest', period: 'short-rest', target: 'hp', amount: 100 });
  assert.equal(state.resources.hp, 20);
  assert.equal(state.resources.dp, 6);
  assert.equal(state.resources.mana, 9);
  assert.equal(state.resources.ap, 1);
  assert.equal(state.configs['custom:short-rest'].used, 0);
  assert.equal(state.configs['custom:long-rest'].used, 1);
  state = change(state, { type: 'rest', period: 'long-rest' });
  assert.deepEqual(state.resources, { hp: 20, mana: 15, dp: 6, ap: 3 });
  assert.equal(state.configs['custom:long-rest'].used, 0);
  assert.equal(state.configs['custom:session'].used, 1);
  state = change(state, { type: 'rest', period: 'session' });
  assert.equal(state.configs['custom:session'].used, 0);
  assert.equal(state.configs['custom:never'].used, 1);
  assert.equal(shortRestFormula(character), '3d10 + 6', 'short rests use base CON per level');
});

test('resource clamps and synchronization preserve consumption', () => {
  let state = change(initialState(character), { type: 'resource', resource: 'hp', value: -10 });
  assert.equal(state.resources.hp, 0);
  state = change(state, { type: 'resource', resource: 'mana', delta: 1000 });
  assert.equal(state.resources.mana, 15);
  state = change(state, { type: 'use', key: 'spell:1' });
  assert.equal(initialState({ ...character, mana: 15 }, state).resources.mana, 11);
});

test('unknown costs, malformed rules and outcomes cannot become free actions', () => {
  for (const value of ['', null, undefined, 'X', -1, false, Infinity]) assert.equal(numericCost(value), null);
  assert.equal(numericCost('0'), 0);
  const state = initialState(character);
  for (const overrides of [
    { manaCost: '' },
    { reset: 'round' },
    { max: 0 },
    { die: '2000d6' },
    { outcomesText: '3-1 = Nope' },
  ]) {
    assert.throws(() => change(state, { type: 'configure', key: 'spell:1', rule: rule(overrides) }));
  }
  assert.deepEqual(parseOutcomes('1-2 = Leer\n3 = Schutz (1w6)'), [
    { from: 1, to: 2, label: 'Leer', followUp: null },
    { from: 3, to: 3, label: 'Schutz (1w6)', followUp: '1d6' },
  ]);
});

test('spell effects include SP, prefer structured fields and omit summon statistics', () => {
  assert.equal(spellRolls(character.spells[0], character, 'de')[0].formula, '2d6 + 4');
  assert.equal(spellRolls({ dice: [{ actor: 'summon', count: 1, sides: 6 }] }, character, 'de').length, 0);
  const spell = {
    translations: [{ languages_code: { code: 'de-DE' }, content: '<p>Heilt 2w8 + ZK Lebenspunkte.</p>' }],
  };
  assert.equal(spellRolls(spell, character, 'de')[0].effect, 'healing');
  assert.equal(spellRolls(spell, character, 'de')[0].formula, '2d8 + 4');
  assert.equal(skillRolls(character, 'de').find((row) => row.key === 'arcana').value, 7);
  assert.equal(skillRolls(character, 'de').find((row) => row.key === 'extra_1').label, 'Segeln');
});

function userStore() {
  const flags = new Map();
  return {
    flags,
    getFlag: (_, key) => flags.get(key),
    async setFlag(_, key, value) {
      flags.set(key, value);
    },
  };
}

test('store serializes rapid uses, persists reconnects and isolates origins/characters', async () => {
  const user = userStore(),
    store = new GameplayStore(user);
  const key = await store.keyFor('https://fantasy-os.com', 'demo');
  assert.notEqual(key, await store.keyFor('http://localhost:3000', 'demo'));
  assert.notEqual(key, await store.keyFor('https://fantasy-os.com', 'other'));
  await store.dispatch(character, key, { type: 'configure', key: 'spell:3', rule: rule() });
  const results = await Promise.allSettled(
    [1, 2].map(() => store.dispatch(character, key, { type: 'use', key: 'spell:3' })),
  );
  assert.equal(results.filter((entry) => entry.status === 'fulfilled').length, 1);
  assert.equal(new GameplayStore(user).read(character, key).configs['spell:3'].used, 1);
  await store.dispatch(character, key, { type: 'remove', key: 'spell:3' });
  assert.equal(store.read(character, key).configs['spell:3'], undefined);
});

test('failed persistence and corrupt/future saves do not silently refill or consume resources', async () => {
  const user = userStore(),
    store = new GameplayStore(user),
    key = 'test';
  user.setFlag = async () => {
    throw new Error('Permission denied');
  };
  await assert.rejects(store.dispatch(character, key, { type: 'use', key: 'spell:1' }), /Permission denied/);
  assert.equal(store.read(character, key).resources.mana, 9);
  user.flags.set(key, '{broken');
  assert.throws(() => store.read(character, key));
  user.flags.set(key, JSON.stringify({ schemaVersion: 2 }));
  assert.throws(() => store.read(character, key), /StateVersionUnsupported/);
});
