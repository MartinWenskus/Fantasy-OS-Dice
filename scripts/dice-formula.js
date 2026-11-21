export const DICE_LIMITS = Object.freeze({
  count: Object.freeze({ min: 1, max: 100, fallback: 1 }),
  modifier: Object.freeze({ min: -999, max: 999, fallback: 0 }),
  sides: Object.freeze({ min: 2, max: 1000, fallback: 20 }),
});

export const DICE_SIDES = Object.freeze([4, 6, 8, 10, 12, 20, 100]);

export const VISIBILITY_MODES = Object.freeze(['public', 'gm', 'blind', 'self']);

export function toBoundedInteger(value, limits) {
  const parsed = Number.parseInt(String(value), 10);
  const safeValue = Number.isFinite(parsed) ? parsed : limits.fallback;
  return Math.min(limits.max, Math.max(limits.min, safeValue));
}

export function buildDiceFormula({ count, sides, modifier }) {
  const safeCount = toBoundedInteger(count, DICE_LIMITS.count);
  const safeSides = toBoundedInteger(sides, DICE_LIMITS.sides);
  const safeModifier = toBoundedInteger(modifier, DICE_LIMITS.modifier);
  const modifierTerm = safeModifier === 0 ? '' : ` ${safeModifier > 0 ? '+' : '-'} ${Math.abs(safeModifier)}`;

  return `${safeCount}d${safeSides}${modifierTerm}`;
}

export function normalizeVisibilityMode(mode) {
  return VISIBILITY_MODES.includes(mode) ? mode : 'public';
}

export function getFoundryMessageMode(mode, generation) {
  const normalized = normalizeVisibilityMode(mode);

  if (Number(generation) >= 14) {
    return normalized;
  }

  return {
    public: 'publicroll',
    gm: 'gmroll',
    blind: 'blindroll',
    self: 'selfroll',
  }[normalized];
}
