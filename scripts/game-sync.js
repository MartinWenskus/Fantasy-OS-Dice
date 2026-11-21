import { actionsFor, applyCommand, initialState, labelKey, numericCost, plainText } from './gameplay.js';

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
export const EVENT_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
export const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const MUTATIONS = new Set(['resource', 'configure', 'add', 'remove', 'use', 'refund', 'rest']);
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const fail = () => {
  throw new Error('InvalidGameEvent');
};

export function parseGameEvent(input) {
  if (!object(input) || JSON.stringify(input).length > 64_000 || !EVENT_PATTERN.test(input.eventId ?? '')) fail();
  if (!['public', 'gm', 'blind', 'self'].includes(input.visibility)) fail();
  if (!object(input.command) || ![...MUTATIONS, 'roll'].includes(input.command.type)) fail();
  const command = Object.fromEntries(
    Object.entries(input.command).filter(([key]) =>
      ['type', 'key', 'resource', 'delta', 'value', 'rule', 'label', 'period', 'target', 'amount'].includes(key),
    ),
  );
  if (command.key != null && (typeof command.key !== 'string' || command.key.length > 300)) fail();
  if (command.rule != null && (!object(command.rule) || JSON.stringify(command.rule).length > 12_000)) fail();
  if (command.label != null && (typeof command.label !== 'string' || command.label.length > 200)) fail();
  for (const key of ['amount', 'delta', 'value'])
    if (
      command[key] != null &&
      (typeof command[key] !== 'number' || !Number.isFinite(command[key]) || Math.abs(command[key]) > 1_000_000)
    )
      fail();
  if (!Array.isArray(input.rolls) || input.rolls.length > 10) fail();
  const rolls = input.rolls.map((roll) => {
    if (
      !object(roll) ||
      typeof roll.formula !== 'string' ||
      !roll.formula.trim() ||
      roll.formula.length > 200 ||
      typeof roll.total !== 'number' ||
      !Number.isFinite(roll.total) ||
      Math.abs(roll.total) > 1_000_000
    )
      fail();
    const dice = roll.dice ?? [];
    if (!Array.isArray(dice) || dice.length > 100) fail();
    return {
      formula: roll.formula.trim(),
      total: roll.total,
      dice: dice.map((die) => {
        if (
          !object(die) ||
          !Number.isInteger(die.faces) ||
          die.faces < 2 ||
          die.faces > 1000 ||
          !Array.isArray(die.results) ||
          die.results.length > 100 ||
          die.results.some((v) => !Number.isInteger(v) || v < 1 || v > die.faces)
        )
          fail();
        return { faces: die.faces, results: die.results };
      }),
    };
  });
  if (command.type === 'roll' && !rolls.length) fail();
  if (
    command.type === 'rest' &&
    command.amount != null &&
    (rolls.length !== 1 || Math.max(0, rolls[0].total) !== command.amount)
  )
    fail();
  return {
    eventId: input.eventId,
    visibility: input.visibility,
    locale: input.locale === 'en' ? 'en' : 'de',
    label: plainText(input.label ?? '').slice(0, 500),
    command,
    rolls,
  };
}

/** Only the actual character owner can grant access; party metadata alone never authorizes private reads. */
export function canControlGameCharacter(uid, room, character, characterId) {
  if (!uid || !room || !character) return false;
  const owner = character.user;
  const member = room.user === uid || room.members?.includes(uid);
  const entry = room.characters?.find((item) => item.characterId === characterId);
  return Boolean(member && entry && entry.user === owner && owner === uid);
}

export function eventReaders(room, uid, visibility) {
  if (visibility === 'self') return [uid];
  if (visibility === 'blind') return [room.user];
  if (visibility === 'gm') return [...new Set([uid, room.user])];
  return [...new Set([uid, room.user, ...(room.members ?? [])])].filter(Boolean);
}

function runtimeKey(tracker, character, locale, trackers = []) {
  const spells = character.spells ?? [];
  if (
    tracker.spellId != null &&
    trackers.filter((entry) => entry.spellId === tracker.spellId).length <= 1 &&
    spells.some((spell) => Number(spell.id) === tracker.spellId)
  )
    return `spell:${tracker.spellId}`;
  if (
    tracker.spellId == null &&
    trackers.filter((entry) => labelKey(entry.label) === labelKey(tracker.label)).length <= 1
  ) {
    const candidates = spells.filter((spell) =>
      [spell.Name, ...(spell.translations ?? []).map((entry) => entry.title)].some(
        (label) => label && labelKey(label) === labelKey(tracker.label),
      ),
    );
    if (candidates.length === 1) return `spell:${candidates[0].id}`;
  }
  return tracker.key;
}

/** Portal room state is the source of truth; old Foundry-world counters are never uploaded. */
export function portalRuntimeState(character, stored = {}, locale = 'de') {
  const state = initialState(character);
  for (const resource of ['hp', 'mana', 'dp', 'ap'])
    if (typeof stored[resource] === 'number') state.resources[resource] = stored[resource];
  const known = new Set(actionsFor(character, state, locale).map((action) => action.key));
  for (const [spellId, manaCost] of Object.entries(stored.spellManaCosts ?? {})) {
    if (numericCost(manaCost) != null && known.has(`spell:${spellId}`)) {
      state.configs[`spell:${spellId}`] = { manaCost, unlimited: true, max: 1, used: 0, reset: 'never', outcomes: [] };
    }
  }
  for (const tracker of stored.trackers ?? []) {
    const key = runtimeKey(tracker, character, locale, stored.trackers);
    // Never collapse two unrelated portal trackers with the same display name.
    const target = state.configs[key] && state.custom.some((entry) => entry.key === key) ? tracker.key : key;
    state.configs[target] = {
      ...tracker,
      manaCost: numericCost(tracker.manaCost) ?? 0,
      unlimited: tracker.unlimited === true,
    };
    if (!known.has(target)) {
      state.custom.push({ key: target, label: tracker.label, description: tracker.note ?? '' });
      known.add(target);
    }
  }
  return initialState(character, state);
}

export function applyPortalEvent(character, stored, event) {
  const before = portalRuntimeState(character, stored, event.locale);
  const oldActions = actionsFor(character, before, event.locale);
  const action = oldActions.find((entry) => entry.key === event.command.key);
  const next = event.command.type === 'roll' ? before : applyCommand(character, before, event.command, event.locale);
  if (Object.keys(next.configs).length > 250 || next.custom.length > 250) throw new Error('TooManyGameActions');
  const actions = actionsFor(character, next, event.locale);
  const trackers = Object.entries(next.configs).map(([key, config]) => {
    const original = (stored.trackers ?? []).find(
      (tracker) => runtimeKey(tracker, character, event.locale, stored.trackers) === key,
    );
    const entry = actions.find((candidate) => candidate.key === key);
    const spellId = key.startsWith('spell:') ? Number(key.slice(6)) : original?.spellId;
    return {
      key: original?.key ?? key,
      label: entry?.label ?? original?.label ?? key,
      source: original?.source ?? (['race', 'class', 'item'].includes(entry?.source) ? entry.source : 'custom'),
      max: config.max,
      used: config.used ?? 0,
      unlimited: config.unlimited === true,
      reset: config.reset,
      manaCost: config.manaCost ?? 0,
      note: config.note ?? '',
      die: config.die ?? '',
      outcomes: config.outcomes ?? [],
      ...(Number.isFinite(spellId) ? { spellId } : {}),
    };
  });
  const spellManaCosts = Object.fromEntries(
    trackers.filter((tracker) => tracker.spellId != null).map((tracker) => [String(tracker.spellId), tracker.manaCost]),
  );
  const changes = Object.fromEntries(
    Object.entries(next.resources)
      .filter(([key, value]) => before.resources[key] !== value)
      .map(([key, value]) => [key, { before: before.resources[key], after: value }]),
  );
  const de = event.locale === 'de';
  const verbs = de
    ? {
        use: 'Verwendet',
        refund: 'Anwendung zurückgegeben',
        configure: 'Einstellungen geändert',
        add: 'Aktion hinzugefügt',
        remove: 'Aktion entfernt',
        resource: 'Spielwert geändert',
        rest: 'Rast',
        roll: 'Wurf',
      }
    : {
        use: 'Uses',
        refund: 'Use refunded',
        configure: 'Settings changed',
        add: 'Action added',
        remove: 'Action removed',
        resource: 'Resource changed',
        rest: 'Rest',
        roll: 'Roll',
      };
  const rest = de
    ? { 'short-rest': 'Kurze Rast', 'long-rest': 'Lange Rast', session: 'Neue Sitzung' }
    : { 'short-rest': 'Short rest', 'long-rest': 'Long rest', session: 'New session' };
  const label = event.command.type === 'roll' ? event.label : (action?.label ?? event.command.label ?? '');
  let text =
    event.command.type === 'rest'
      ? rest[event.command.period]
      : `${verbs[event.command.type]}${label ? `: ${label}` : ''}`;
  for (const [key, change] of Object.entries(changes))
    text += ` · ${{ hp: de ? 'LP' : 'HP', mana: 'Mana', dp: de ? 'VP' : 'DP', ap: 'AP' }[key]} ${change.before} → ${change.after}`;
  if (event.rolls.length) text += ` · ${event.rolls.map((roll) => `${roll.formula} = ${roll.total}`).join(' · ')}`;
  if (action?.rule.outcomes?.length && event.rolls[0]) {
    const outcome = action.rule.outcomes.find(
      (row) => event.rolls[0].total >= row.from && event.rolls[0].total <= row.to,
    );
    if (outcome) text += ` · ${outcome.label}`;
  }
  return {
    state: next,
    roomState: { ...next.resources, trackers, spellManaCosts },
    text: text.slice(0, 4000),
    type: event.command.type === 'roll' ? 'roll' : 'action',
    data: {
      source: 'foundry',
      eventId: event.eventId,
      command: event.command,
      rolls: event.rolls,
      changes,
      visibility: event.visibility,
    },
  };
}
