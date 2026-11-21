/** System-independent game rules. No Foundry globals and no portal writes. */
export const RESOURCES = Object.freeze(['hp', 'mana', 'dp', 'ap']);
export const RESET_PERIODS = Object.freeze(['short-rest', 'long-rest', 'session', 'never']);
const SIDES = new Set([4, 6, 8, 10, 12, 20, 100]);
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
export const signed = (value) => `${value >= 0 ? '+' : '−'}${Math.abs(value)}`;
export const labelKey = (value) =>
  String(value ?? '')
    .trim()
    .replace(/^\d+\s*AP\s*/i, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();

export function translation(entries, locale = 'de') {
  const lang = (value) =>
    String(value?.code ?? value ?? '')
      .toLowerCase()
      .split('-')[0];
  return (entries ?? []).find((entry) => lang(entry.languages_code) === lang(locale)) ?? entries?.[0] ?? {};
}

export function plainText(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function numericCost(value) {
  if (value == null || typeof value === 'boolean' || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export const SKILLS = Object.freeze([
  ['animal_handling', 'Tierkunde (SOZ)', 'Animal Handling (SOC)'],
  ['arcana', 'Arkanes Wissen (INT)', 'Arcana (INT)'],
  ['arts', 'Kunst (SOZ)', 'Arts (SOC)'],
  ['awareness', 'Aufmerksamkeit (INT)', 'Awareness (INT)'],
  ['body_control_dex', 'Körperkontrolle (GES)', 'Body Control (DEX)'],
  ['body_control_str', 'Körperkontrolle (STÄ)', 'Body Control (STR)'],
  ['craft', 'Handwerk (GES)', 'Craft (DEX)'],
  ['deception', 'Täuschen (SOZ)', 'Deception (SOC)'],
  ['eloquence', 'Redegewandtheit (SOZ)', 'Eloquence (SOC)'],
  ['general_knowledge', 'Allgemeinwissen (INT)', 'General Knowledge (INT)'],
  ['insight', 'Menschenkenntnis (SOZ)', 'Insight (SOC)'],
  ['intimidation', 'Einschüchtern (WIL)', 'Intimidation (WIL)'],
  ['manual_dexterity', 'Fingerfertigkeit (GES)', 'Manual Dexterity (DEX)'],
  ['medicine', 'Heilkunde (INT)', 'Medicine (INT)'],
  ['nature', 'Naturkunde (INT)', 'Nature (INT)'],
  ['stealth', 'Heimlichkeit (GES)', 'Stealth (DEX)'],
]);

export function skillRolls(character, locale) {
  const rows = SKILLS.map(([key, de, en]) => ({
    key,
    label: locale?.startsWith('de') ? de : en,
    value: finite(character[`${key}_number`]),
  }));
  for (let n = 1; n <= 4; n++) {
    const key = `extra_${n}`;
    if (character[`${key}_label`]?.trim())
      rows.push({ key, label: character[`${key}_label`], value: finite(character[`${key}_number`]) });
  }
  return rows;
}

export function resourceMax(character, resource) {
  return numericCost(character[`max_${resource}`]);
}
export function boundResource(character, resource, value) {
  const max = resourceMax(character, resource);
  return Math.max(0, Math.min(finite(value), max ?? Infinity));
}

export function initialState(character, saved) {
  const state = { schemaVersion: 1, resources: {}, configs: {}, custom: [], ...structuredClone(saved ?? {}) };
  if (state.schemaVersion !== 1) throw new Error('StateVersionUnsupported');
  for (const resource of RESOURCES) {
    state.resources[resource] = boundResource(
      character,
      resource,
      state.resources[resource] ?? character[resource] ?? resourceMax(character, resource) ?? 0,
    );
  }
  return state;
}

export function spellRolls(spell, character, locale) {
  const power = finite(character.spell_attack);
  if (spell.dice?.length)
    return spell.dice
      .filter((die) => die.actor !== 'summon')
      .filter((die) => Number.isInteger(die.count) && die.count > 0 && die.count <= 100 && SIDES.has(Number(die.sides)))
      .map((die, i) => ({
        key: `field:${i}`,
        effect: die.effect ?? 'other',
        formula: `${die.count}d${die.sides}${modifierTerm(die.modifier === 'SP' ? power : finite(die.modifier))}`,
        note: die.note ?? '',
      }));
  const text = plainText(translation(spell.translations, locale).content);
  const rolls = new Map();
  for (const match of text.matchAll(/(\d+)\s*[wWdD](\d+)(?:\s*\+\s*(SP|ZK|\d+))?/g)) {
    const count = Number(match[1]),
      sides = Number(match[2]);
    if (!count || count > 100 || !SIDES.has(sides)) continue;
    const context = text.slice(Math.max(0, match.index - 90), match.index + 110);
    if (/\bit (has|rolls)\b|\bes (hat|würfelt)\b/i.test(context)) continue;
    const modifier = ['SP', 'ZK'].includes(match[3]) ? power : finite(match[3]);
    const formula = `${count}d${sides}${modifierTerm(modifier)}`;
    const effect = /heal|heilt|geheilt|regenerat/i.test(context)
      ? 'healing'
      : /damage|deals?|schaden|verursach/i.test(context)
        ? 'damage'
        : /roll|check|würfel|probe/i.test(context)
          ? 'check'
          : 'other';
    rolls.set(formula, { key: formula, formula, effect, note: match[0] });
  }
  return [...rolls.values()];
}
export function modifierTerm(value) {
  return value ? ` ${value > 0 ? '+' : '-'} ${Math.abs(value)}` : '';
}

export function inventory(character, locale) {
  return (character.items ?? []).flatMap((entry) => {
    const item = entry.item?.[0];
    if (!item) return [];
    const text = translation(item.translations, locale);
    return [
      {
        key: `item:${item.id ?? item.slug}`,
        source: 'item',
        label: text.name || item.slug || 'Item',
        description: plainText(text.description),
        quantity: finite(entry.quantity),
        damage: plainText(text.damage),
        range: item.range ?? item.Items_id?.range ?? '',
        requirement: plainText(text.requirement),
      },
    ];
  });
}

/** Same spell is listed once even when granted by a race/class as well. */
export function actionsFor(character, state, locale) {
  const abilities = (character.foundryGameplay?.abilities ?? []).map((ability) => {
    const text = translation(ability.translations, locale);
    return { ...ability, label: text.title ?? '', description: plainText(text.content) };
  });
  const matchedAbilities = new Set();
  const spells = [...new Map((character.spells ?? []).map((spell) => [String(spell.id), spell])).values()];
  const actions = spells.map((spell) => {
    const text = translation(spell.translations, locale),
      label = text.title || spell.Name || `#${spell.id}`;
    const ability = abilities.find((entry) => labelKey(entry.label) === labelKey(label));
    if (ability) matchedAbilities.add(ability.key);
    return {
      key: `spell:${spell.id}`,
      source: 'spell',
      label,
      description: plainText(text.content) || ability?.description || '',
      spell,
      rolls: spellRolls(spell, character, locale),
      manaCost: numericCost(spell.Mana),
      needsConfiguration: !!ability,
    };
  });
  for (const ability of abilities)
    if (!matchedAbilities.has(ability.key)) actions.push({ ...ability, needsConfiguration: true, rolls: [] });
  for (const item of inventory(character, locale)) actions.push({ ...item, needsConfiguration: true, rolls: [] });
  for (const custom of state.custom ?? [])
    actions.push({ ...custom, source: 'custom', rolls: [], needsConfiguration: true });
  return actions
    .map((action) => {
      const config = state.configs[action.key];
      const configured = !!config || (!action.needsConfiguration && action.manaCost != null);
      const rule = { manaCost: action.manaCost ?? null, unlimited: true, max: 1, used: 0, reset: 'never', ...config };
      const cost = numericCost(rule.manaCost);
      const remaining = rule.unlimited ? null : Math.max(0, finite(rule.max) - finite(rule.used));
      const manaUses = cost > 0 ? Math.floor(state.resources.mana / cost) : null;
      const uses = remaining == null ? manaUses : manaUses == null ? remaining : Math.min(remaining, manaUses);
      const reason =
        !configured || cost == null ? 'configure' : remaining === 0 ? 'exhausted' : manaUses === 0 ? 'mana' : null;
      return { ...action, rule, cost, remaining, uses, ready: reason == null, reason };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function normalizeDie(value) {
  const formula = String(value ?? '')
    .replace(/\s+/g, '')
    .replace(/w/gi, 'd');
  if (!formula) return '';
  const match = /^(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?$/.exec(formula);
  if (!match || +match[1] < 1 || +match[1] > 100 || !SIDES.has(+match[2]) || +(match[4] ?? 0) > 999)
    throw new Error('InvalidFormula');
  return `${+match[1]}d${+match[2]}${match[3] ? ` ${match[3]} ${+match[4]}` : ''}`;
}

export function parseOutcomes(input) {
  return String(input ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d+)(?:\s*[-–]\s*(\d+))?\s*[=:]\s*(.+)$/.exec(line);
      if (!match || Number(match[2] ?? match[1]) < Number(match[1])) throw new Error('InvalidOutcomes');
      const followUp = /\((\d+\s*[wd]\s*\d+(?:\s*[+-]\s*\d+)?)\)/i.exec(match[3])?.[1];
      return {
        from: +match[1],
        to: +(match[2] ?? match[1]),
        label: match[3],
        followUp: followUp ? normalizeDie(followUp) : null,
      };
    });
}

export function validateRule(rule) {
  const cost = numericCost(rule.manaCost),
    max = Number(rule.max);
  if (cost == null || !RESET_PERIODS.includes(rule.reset) || !Number.isInteger(max) || max < 1 || max > 9999)
    throw new Error('InvalidAction');
  return {
    manaCost: cost,
    max,
    unlimited: rule.unlimited === true,
    reset: rule.reset,
    die: normalizeDie(rule.die),
    note: String(rule.note ?? '').slice(0, 5000),
    outcomes: parseOutcomes(rule.outcomesText),
  };
}

/** Apply a command to a fresh copy; rejected commands cannot spend any resources. */
export function applyCommand(character, current, command, locale = 'de') {
  const next = initialState(character, current);
  const findAction = () => {
    const action = actionsFor(character, next, locale).find((entry) => entry.key === command.key);
    if (!action) throw new Error('ActionMissing');
    return action;
  };
  switch (command.type) {
    case 'resource': {
      if (!RESOURCES.includes(command.resource) || !Number.isFinite(command.delta ?? command.value))
        throw new Error('InvalidAction');
      next.resources[command.resource] = boundResource(
        character,
        command.resource,
        command.value ?? next.resources[command.resource] + command.delta,
      );
      break;
    }
    case 'configure': {
      findAction();
      const rule = validateRule(command.rule),
        used = next.configs[command.key]?.used ?? 0;
      next.configs[command.key] = { ...rule, used: Math.min(used, rule.max) };
      break;
    }
    case 'add': {
      if (!/^custom:[a-zA-Z0-9-]{1,100}$/.test(command.key) || !String(command.label ?? '').trim())
        throw new Error('InvalidAction');
      if (next.custom.some((entry) => entry.key === command.key)) throw new Error('InvalidAction');
      next.custom.push({ key: command.key, label: command.label.trim().slice(0, 200), description: '' });
      next.configs[command.key] = { ...validateRule(command.rule), used: 0 };
      break;
    }
    case 'remove':
      findAction();
      next.custom = next.custom.filter((entry) => entry.key !== command.key);
      delete next.configs[command.key];
      break;
    case 'use': {
      const action = findAction();
      if (!action.ready)
        throw new Error(
          { configure: 'ConfigureFirst', exhausted: 'UsesExhausted', mana: 'NotEnoughMana' }[action.reason],
        );
      next.resources.mana -= action.cost;
      if (!action.rule.unlimited) next.configs[action.key] = { ...action.rule, used: finite(action.rule.used) + 1 };
      break;
    }
    case 'refund': {
      const action = findAction();
      if (!action.rule.unlimited && action.rule.used > 0)
        next.configs[action.key] = { ...action.rule, used: action.rule.used - 1 };
      break;
    }
    case 'rest': {
      if (!['short-rest', 'long-rest', 'session'].includes(command.period)) throw new Error('InvalidAction');
      const periods = command.period === 'long-rest' ? ['short-rest', 'long-rest'] : [command.period];
      for (const config of Object.values(next.configs)) if (periods.includes(config.reset)) config.used = 0;
      if (command.period === 'long-rest') {
        for (const resource of RESOURCES)
          if (resourceMax(character, resource) != null) next.resources[resource] = resourceMax(character, resource);
      } else if (command.period === 'short-rest') {
        if (resourceMax(character, 'dp') != null) next.resources.dp = resourceMax(character, 'dp');
        if (command.amount != null) {
          if (!['hp', 'mana'].includes(command.target) || !Number.isFinite(command.amount))
            throw new Error('InvalidAction');
          next.resources[command.target] = boundResource(
            character,
            command.target,
            next.resources[command.target] + Math.max(0, command.amount),
          );
        }
      }
      next.lastRest = { period: command.period, at: Date.now() };
      break;
    }
    default:
      throw new Error('InvalidAction');
  }
  return next;
}

export function shortRestFormula(character) {
  const level = Math.max(1, Math.min(100, Math.trunc(finite(character.level, 1))));
  return `${level}d10${modifierTerm(finite(character.con) * level)}`;
}
