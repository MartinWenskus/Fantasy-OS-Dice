import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseGameEvent,
  canControlGameCharacter,
  eventReaders,
  portalRuntimeState,
  applyPortalEvent,
} from '../scripts/game-sync.js';
import { parseGameConnection, PortalGameStore } from '../scripts/game-api.js';

const character = {
  id: 'hero',
  user: 'owner',
  name: 'Alva',
  hp: 20,
  max_hp: 20,
  mana: 12,
  max_mana: 12,
  spells: [
    { id: 1, Name: 'Flamme', Mana: '4' },
    { id: 2, Name: 'Teleport', Mana: '0' },
  ],
};
const room = { user: 'gm', members: ['gm', 'owner', 'other'], characters: [{ characterId: 'hero', user: 'owner' }] };
const event = (command, extra = {}) =>
  parseGameEvent({ eventId: '1234567890abcdef', visibility: 'public', locale: 'de', command, rolls: [], ...extra });
const roll = { formula: '1d20 + 4', total: 17, dice: [{ faces: 20, results: [13] }] };

test('only the real character owner can grant game access, even with forged party metadata', () => {
  assert.equal(canControlGameCharacter('owner', room, character, 'hero'), true);
  for (const uid of ['gm', 'other', '']) assert.equal(canControlGameCharacter(uid, room, character, 'hero'), false);
  assert.equal(canControlGameCharacter('owner', { ...room, members: ['gm'] }, character, 'hero'), false);
  assert.equal(canControlGameCharacter('owner', { ...room, characters: [] }, character, 'hero'), false);
  const forged = { ...room, characters: [{ characterId: 'hero', user: 'other' }] };
  assert.equal(canControlGameCharacter('other', forged, character, 'hero'), false);
});

test('portal resources and limited trackers remain authoritative and preserve their keys', () => {
  const stored = {
    hp: 7,
    mana: 6,
    trackers: [
      {
        key: 'race:teleport',
        label: 'Teleport',
        spellId: 2,
        used: 1,
        max: 1,
        reset: 'long-rest',
        source: 'race',
        manaCost: 0,
      },
    ],
  };
  assert.equal(portalRuntimeState(character, stored).configs['spell:2'].used, 1);
  assert.throws(() => applyPortalEvent(character, stored, event({ type: 'use', key: 'spell:2' })), /UsesExhausted/);
  const result = applyPortalEvent(character, stored, event({ type: 'use', key: 'spell:1' }));
  assert.equal(result.state.resources.mana, 2);
  assert.equal(result.roomState.trackers[0].key, 'race:teleport');
  assert.equal(result.roomState.trackers[0].used, 1);
  assert.match(result.text, /Mana 6 → 2/);
  assert.equal(result.state.resources.hp, 7);
});

test('rolls log their result and leave each game state unchanged', () => {
  for (const mana of [2, 11]) {
    const result = applyPortalEvent(
      character,
      { mana },
      event({ type: 'roll' }, { rolls: [roll], label: 'Initiative' }),
    );
    assert.equal(result.state.resources.mana, mana);
    assert.match(result.text, /Initiative.*1d20 \+ 4 = 17/);
  }
});

test('portal spell costs, custom actions and rest counters round-trip', () => {
  const rule = { manaCost: 1, max: 1, unlimited: false, reset: 'long-rest' };
  let result = applyPortalEvent(character, { spellManaCosts: { 1: 6 } }, event({ type: 'use', key: 'spell:1' }));
  assert.equal(result.state.resources.mana, 6);
  result = applyPortalEvent(
    character,
    result.roomState,
    event({ type: 'add', key: 'custom:shield', label: 'Schild', rule }),
  );
  result = applyPortalEvent(character, result.roomState, event({ type: 'use', key: 'custom:shield' }));
  assert.equal(result.state.resources.mana, 5);
  assert.equal(result.state.configs['custom:shield'].used, 1);
  result = applyPortalEvent(character, result.roomState, event({ type: 'rest', period: 'long-rest' }));
  assert.equal(result.state.resources.mana, 12);
  assert.equal(result.state.configs['custom:shield'].used, 0);
});

test('visibility produces separate reader lists, including a blind author exclusion', () => {
  assert.deepEqual(eventReaders(room, 'owner', 'self'), ['owner']);
  assert.deepEqual(eventReaders(room, 'owner', 'blind'), ['gm']);
  assert.deepEqual(eventReaders(room, 'owner', 'gm'), ['owner', 'gm']);
  assert.deepEqual(eventReaders(room, 'owner', 'public'), ['owner', 'gm', 'other']);
});

test('malformed or excessive events fail before any state change', () => {
  assert.throws(() => event({ type: 'unknown' }));
  assert.throws(() => event({ type: 'roll' }));
  assert.throws(() => event({ type: 'resource', value: '5' }));
  assert.throws(() => event({ type: 'rest', period: 'short-rest', amount: 9 }, { rolls: [roll] }));
  assert.throws(() => event({ type: 'roll' }, { rolls: [{ ...roll, dice: [{ faces: 6, results: [7] }] }] }));
  assert.throws(() => event({ type: 'roll' }, { label: 'x'.repeat(65000), rolls: [roll] }));
});

const token = 'a'.repeat(64);
const link = `https://fantasy-os.com/api/foundry/v1/games/game/characters/hero/logs#token=${token}`;
const connection = parseGameConnection(link);
test('private token stays outside the request URL and untrusted hosts/queries are rejected', () => {
  assert.equal(connection.token, token);
  assert.equal(connection.logsUrl, 'https://fantasy-os.com/api/foundry/v1/games/game/characters/hero/logs');
  for (const invalid of [
    link.replace('fantasy-os.com', 'evil.test'),
    link.replace('https:', 'http:'),
    link.replace('#token=', '?token='),
    link.replace('/hero/', '/%2e%2e/'),
  ]) {
    assert.throws(() => parseGameConnection(invalid), /InvalidGameConnection/);
  }
});

class MemoryStorage {
  values = new Map();
  getItem(key) {
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    this.values.set(key, value);
  }
  removeItem(key) {
    this.values.delete(key);
  }
}
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const payload = () => ({
  apiVersion: 1,
  game: { id: 'game', name: 'Abenteuer' },
  character,
  state: portalRuntimeState(character, { mana: 9 }),
});

test('game connection reports an HTTP outage even when the response is not JSON', async (t) => {
  const store = new PortalGameStore(connection, { storage: new MemoryStorage() });
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: false,
    status: 503,
    json: async () => {
      throw new SyntaxError('HTML response');
    },
  }));
  await assert.rejects(store.refresh(), { message: 'GameSyncFailed', status: 503 });
});

test('uncertain requests survive reload and retry with the exact same ID/body', async (t) => {
  const storage = new MemoryStorage(),
    requests = [];
  let attempts = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.equal(url.includes(token), false);
    if (options.method !== 'POST') return response(payload());
    requests.push(options.body);
    if (++attempts === 1) throw new Error('Connection lost after server commit');
    const input = JSON.parse(options.body);
    return response({
      apiVersion: 1,
      eventId: input.eventId,
      duplicate: true,
      state: portalRuntimeState(character, { mana: 5 }),
      text: 'Verwendet: Flamme',
    });
  });
  const store = new PortalGameStore(connection, { storage, scope: 'world:player' });
  await store.refresh();
  await assert.rejects(store.dispatch(character, '', { type: 'use', key: 'spell:1' }, 'de'), /Connection lost/);
  assert.ok(store.pending);
  assert.equal(store.read().resources.mana, 9);
  await assert.rejects(store.dispatch(character, '', { type: 'use', key: 'spell:1' }, 'de'), /PendingGameAction/);
  const restored = new PortalGameStore(connection, { storage, scope: 'world:player' });
  await restored.refresh();
  await restored.retry();
  assert.equal(requests[0], requests[1]);
  assert.equal(restored.read().resources.mana, 5);
  assert.equal(restored.pending, null);
  assert.equal(storage.values.size, 0);
});

test('explicit server rejection unlocks controls and refreshes state', async (t) => {
  const storage = new MemoryStorage();
  t.mock.method(globalThis, 'fetch', async (_, options) =>
    options.method === 'POST' ? response({ data: { code: 'action_rejected' } }, 409) : response(payload()),
  );
  const store = new PortalGameStore(connection, { storage });
  await store.refresh();
  await assert.rejects(store.dispatch(character, '', { type: 'use', key: 'spell:1' }, 'de'), /GameSyncFailed/);
  assert.equal(store.pending, null);
  assert.equal(storage.values.size, 0);
  assert.equal(store.read().resources.mana, 9);
});

test('switching language cannot bypass a name-linked portal spell limit', () => {
  const localized = {
    ...character,
    spells: [
      {
        id: 1,
        Name: 'Flame',
        Mana: 4,
        translations: [
          { languages_code: 'de', title: 'Flamme' },
          { languages_code: 'en', title: 'Flame' },
        ],
      },
    ],
  };
  const stored = {
    trackers: [{ key: 'class:fire', label: 'Flamme', used: 1, max: 1, reset: 'long-rest', manaCost: 4 }],
  };
  assert.equal(portalRuntimeState(localized, stored, 'en').configs['spell:1'].used, 1);
  assert.throws(
    () => applyPortalEvent(localized, stored, event({ type: 'use', key: 'spell:1' }, { locale: 'en' })),
    /UsesExhausted/,
  );
});
