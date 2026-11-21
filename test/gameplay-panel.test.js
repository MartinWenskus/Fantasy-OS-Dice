import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postFoundryChat } from '../scripts/foundry-chat.js';
import { GameplayPanel } from '../scripts/gameplay-panel.js';
import { GameplayStore } from '../scripts/gameplay-store.js';

function panelFixture(generation = 14) {
  const flags = new Map(),
    events = [],
    messages = [],
    notices = [];
  const user = {
    id: 'player',
    getFlag: (_, key) => flags.get(key),
    setFlag: async (_, key, value) => {
      events.push('save');
      flags.set(key, value);
    },
  };
  globalThis.game = {
    user,
    release: { generation },
    i18n: { lang: 'de', localize: (value) => value, has: () => true },
  };
  globalThis.ui = { notifications: { warn: (value) => notices.push(value), error: (value) => notices.push(value) } };
  const gmIds = ['gm'];
  const applyMode = (data, mode) => {
    assert.ok(['public', 'self', 'gm', 'blind'].includes(mode));
    return {
      ...data,
      whisper: mode === 'public' ? [] : mode === 'self' ? [user.id] : [...gmIds],
      blind: mode === 'blind',
    };
  };
  const ChatMessage = {
    getSpeaker: () => ({ user: 'player' }),
    create: async (data) => {
      events.push('chat');
      messages.push(data);
    },
  };
  if (generation >= 14) ChatMessage.applyMode = applyMode;
  else
    ChatMessage.applyRollMode = (data, mode) => {
      assert.ok(mode.endsWith('roll'));
      return applyMode(data, mode.slice(0, -4));
    };
  globalThis.CONFIG = { ChatMessage: { documentClass: ChatMessage } };
  const panel = Object.assign(Object.create(GameplayPanel.prototype), {
    character: {
      id: 'demo',
      name: '<img src=x onerror=alert(1)>',
      mana: 10,
      max_mana: 10,
      spells: [{ id: 1, Name: 'Flamme', Mana: '3' }],
    },
    key: 'test',
    store: new GameplayStore(user),
    tray: { visibilitySelect: { value: 'public' }, updateConnectButtons() {} },
    busy: false,
    render() {},
  });
  return { panel, events, messages, notices, user, ChatMessage, gmIds };
}

test('initiative click rolls d20 with the sheet value and leaves resources untouched', async () => {
  const { panel, events } = panelFixture();
  const rolls = [];
  panel.tray.roll = async (formula, flavor) => rolls.push({ formula, flavor });
  const event = { target: { closest: () => ({ dataset: { gameAction: 'initiative' }, disabled: false }) } };
  for (const [value, formula] of [
    [4, '1d20 + 4'],
    [-2, '1d20 - 2'],
    [0, '1d20 + 0'],
    ['7', '1d20 + 7'],
  ]) {
    panel.character.initiative = value;
    await panel.onClick(event);
    assert.equal(rolls.at(-1).formula, formula);
    assert.match(rolls.at(-1).flavor, /FOSDice.Stat_initiative/);
    assert.doesNotMatch(rolls.at(-1).flavor, /<img/);
  }
  assert.equal(panel.state.resources.mana, 10);
  assert.deepEqual(events, []);
  panel.tray.isRolling = true;
  await panel.onClick(event);
  assert.equal(rolls.length, 4, 'a pending roll prevents duplicate initiative rolls');
});

test('action persists first, then posts escaped chat and optional decision/follow-up rolls', async () => {
  const { panel, events, messages } = panelFixture();
  await panel.dispatch({
    type: 'configure',
    key: 'spell:1',
    rule: { manaCost: 3, max: 1, unlimited: false, reset: 'long-rest', die: '1d6', outcomesText: '3 = Schutz (1w6)' },
  });
  events.length = 0;
  panel.evaluate = async (formula) => {
    events.push('roll');
    return { formula, total: 3 };
  };
  await panel.useAction('spell:1');
  assert.deepEqual(events, ['roll', 'roll', 'save', 'chat']);
  assert.equal(panel.state.resources.mana, 7);
  assert.equal(messages[0].rolls.length, 2);
  assert.match(messages[0].flavor, /&lt;img/);
  assert.doesNotMatch(messages[0].flavor, /<img/);
  assert.equal(messages[0].content, '', 'native dice must not be hidden by custom HTML');
  assert.equal(messages[0].flags['fantasy-os-dice'].actionKey, 'spell:1');
});

for (const generation of [13, 14]) {
  test(`chat visibility uses Foundry V${generation} modes and rejects private messages with no recipients`, async () => {
    const { panel, messages, notices, gmIds } = panelFixture(generation);
    for (const [mode, expected] of [
      ['public', []],
      ['self', ['player']],
      ['gm', ['gm']],
      ['blind', ['gm']],
    ]) {
      panel.tray.visibilitySelect.value = mode;
      await panel.chat('Test');
      assert.deepEqual(messages.at(-1).whisper, expected);
      assert.equal(messages.at(-1).blind, mode === 'blind');
    }
    gmIds.length = 0;
    await panel.chat('Private');
    assert.equal(messages.length, 4);
    assert.equal(notices.length, 1);
  });

  test(`single rolls use the native V${generation} roll data and require private recipients`, async () => {
    const { ChatMessage, gmIds, messages } = panelFixture(generation);
    const roll = {
      async toMessage(data, options) {
        if (generation === 14) {
          assert.deepEqual(options, { create: false, messageMode: 'blind' });
          return ChatMessage.applyMode({ ...data, rolls: [this] }, options.messageMode);
        }
        assert.deepEqual(options, { create: false, rollMode: 'blindroll' });
        return ChatMessage.applyRollMode({ ...data, rolls: [this] }, options.rollMode);
      },
    };
    await postFoundryChat({ flavor: 'Test' }, 'blind', roll);
    assert.deepEqual(messages[0].rolls, [roll]);
    assert.deepEqual(messages[0].whisper, ['gm']);
    assert.equal(messages[0].blind, true);

    gmIds.length = 0;
    await assert.rejects(postFoundryChat({ flavor: 'Test' }, 'blind', roll), /NoWhisperRecipients/);
    assert.equal(messages.length, 1);
  });
}

test('save failure posts no success; chat failure warns without undoing saved mana', async () => {
  const { panel, messages, notices, user, ChatMessage } = panelFixture();
  const save = user.setFlag;
  user.setFlag = async () => {
    throw new Error('Save failed');
  };
  await assert.rejects(panel.useAction('spell:1'), /Save failed/);
  assert.equal(messages.length, 0);
  assert.equal(panel.state.resources.mana, 10);
  user.setFlag = save;
  ChatMessage.create = async () => {
    throw new Error('Chat failed');
  };
  await panel.useAction('spell:1');
  assert.equal(panel.state.resources.mana, 7);
  assert.equal(notices.at(-1), 'FOSDice.ChatFailedStateSaved');
});

test('retry preserves private visibility even when the selector now says public', async () => {
  const { panel, messages } = panelFixture();
  panel.store = { remote: true, pending: { visibility: 'blind' }, retry: async () => ({ text: 'Secret 17' }) };
  const event = { target: { closest: () => ({ dataset: { gameAction: 'retry-game' }, disabled: false }) } };
  await panel.onClick(event);
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].whisper, ['gm']);
  assert.equal(messages[0].blind, true);
});
