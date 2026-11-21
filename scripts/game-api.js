import { initialState } from './gameplay.js';
import { EVENT_PATTERN, ID_PATTERN, TOKEN_PATTERN, parseGameEvent } from './game-sync.js';

export function parseGameConnection(value) {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw new Error('InvalidGameConnection');
  }
  const local = ['localhost', '127.0.0.1'].includes(url.hostname) && ['http:', 'https:'].includes(url.protocol);
  const portal =
    url.protocol === 'https:' && (url.hostname === 'fantasy-os.com' || url.hostname.endsWith('.fantasy-os.com'));
  const match = url.pathname.match(/^\/api\/foundry\/v1\/games\/([^/]+)\/characters\/([^/]+)\/logs$/);
  const token = new URLSearchParams(url.hash.slice(1)).get('token');
  if (
    (!local && !portal) ||
    url.username ||
    url.password ||
    url.search ||
    !match ||
    !ID_PATTERN.test(match[1]) ||
    !ID_PATTERN.test(match[2]) ||
    !TOKEN_PATTERN.test(token ?? '')
  )
    throw new Error('InvalidGameConnection');
  return {
    origin: url.origin,
    gameId: match[1],
    characterId: match[2],
    token,
    logsUrl: url.origin + url.pathname,
    stateUrl: url.origin + url.pathname.replace(/\/logs$/, '/state'),
    canonicalUrl: url.href,
  };
}

export function serializeGameRoll(roll) {
  return {
    formula: String(roll.formula),
    total: roll.total,
    dice: (roll.dice ?? []).map((die) => ({
      faces: die.faces,
      results: die.results.filter((result) => Number.isInteger(result.result)).map((result) => result.result),
    })),
  };
}
const eventId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');

/** Authoritative game state plus one durable pending event. Never silently replay a click as a new event. */
export class PortalGameStore {
  constructor(connection, { storage = globalThis.localStorage, scope = '' } = {}) {
    this.connection = connection;
    this.storage = storage;
    this.remote = true;
    this.storageKey = `fos-pending:${encodeURIComponent(scope)}:${connection.origin}:${connection.gameId}:${connection.characterId}`;
    this.pending = storage.getItem(this.storageKey)
      ? parseGameEvent(JSON.parse(storage.getItem(this.storageKey)))
      : null;
    this.current = null;
    this.character = null;
    this.game = null;
    this.sending = false;
  }
  async keyFor() {
    return `${this.connection.gameId}:${this.connection.characterId}`;
  }
  read() {
    if (!this.current) throw new Error('GameStateUnavailable');
    return structuredClone(this.current);
  }
  async request(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, {
        ...options,
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.connection.token}`,
        },
      });
      const payload = await response.json();
      if (!response.ok) {
        const error = new Error(
          response.status === 401 || response.status === 403 ? 'GameAccessDenied' : 'GameSyncFailed',
        );
        error.code = payload?.data?.code;
        throw error;
      }
      if (payload.apiVersion !== 1 || !payload.state || payload.state.schemaVersion !== 1)
        throw new Error('GameSyncFailed');
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }
  async refresh() {
    const payload = await this.request(this.connection.stateUrl);
    if (payload.character?.id !== this.connection.characterId || payload.game?.id !== this.connection.gameId)
      throw new Error('GameSyncFailed');
    this.character = payload.character;
    this.game = payload.game;
    this.current = initialState(this.character, payload.state);
    return payload;
  }
  async dispatch(_character, _key, command, locale, metadata = {}) {
    if (this.pending || this.sending) throw new Error('PendingGameAction');
    const entry = parseGameEvent({
      eventId: eventId(),
      command,
      locale,
      visibility: metadata.visibility ?? 'public',
      label: metadata.label ?? '',
      rolls: metadata.rolls ?? [],
    });
    // If local persistence fails, do not send an operation that cannot safely be retried.
    this.storage.setItem(this.storageKey, JSON.stringify(entry));
    this.pending = entry;
    return (await this.retry()).state;
  }
  async retry() {
    if (this.sending) throw new Error('ActionBusy');
    if (!this.pending || !EVENT_PATTERN.test(this.pending.eventId)) throw new Error('GameSyncFailed');
    this.sending = true;
    try {
      const payload = await this.request(this.connection.logsUrl, {
        method: 'POST',
        body: JSON.stringify(this.pending),
      });
      if (payload.eventId !== this.pending.eventId) throw new Error('GameSyncFailed');
      this.current = initialState(this.character, payload.state);
      this.storage.removeItem(this.storageKey);
      this.pending = null;
      return payload;
    } catch (error) {
      // These responses explicitly confirm rejection, before any state/log writes.
      if (['action_rejected', 'invalid_event'].includes(error.code)) {
        this.storage.removeItem(this.storageKey);
        this.pending = null;
        try {
          await this.refresh();
        } catch {
          /* Next synchronization will refresh the display. */
        }
      }
      throw error;
    } finally {
      this.sending = false;
    }
  }
}
