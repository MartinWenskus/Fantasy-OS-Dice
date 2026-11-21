import { initialState, applyCommand } from './gameplay.js';

export const MODULE_ID = 'fantasy-os-dice';

/** Foundry User flags are world-local, persistent, and writable by their owner. */
export class GameplayStore {
  constructor(user) {
    this.user = user;
    this.tail = Promise.resolve();
  }

  async keyFor(origin, characterId) {
    const bytes = new TextEncoder().encode(`${origin}\0${characterId}`);
    // Lossless and safe for Foundry flag paths, including worlds served over LAN HTTP.
    // No share key enters this identifier. SubtleCrypto would require HTTPS.
    return `play-${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')}`;
  }

  read(character, key) {
    const saved = this.user.getFlag(MODULE_ID, key);
    // Fail closed on malformed/newer data instead of silently replenishing resources.
    return initialState(character, saved ? JSON.parse(saved) : null);
  }

  dispatch(character, key, command, locale) {
    const execute = async () => {
      const current = this.read(character, key);
      const next = applyCommand(character, current, command, locale);
      // String storage replaces the whole state, including removed counters.
      await this.user.setFlag(MODULE_ID, key, JSON.stringify(next));
      return next;
    };
    const result = this.tail.then(execute);
    this.tail = result.catch(() => {});
    return result;
  }
}
