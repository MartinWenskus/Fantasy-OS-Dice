import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDiceFormula,
  getFoundryMessageMode,
  normalizeVisibilityMode,
  toBoundedInteger,
} from "../scripts/dice-formula.js";
import {
  buildCharacterApiUrl,
  getCharacterAttributeTotal,
  parseCharacterShareUrl,
  readCharacterApiPayload,
} from "../scripts/character-api.js";

test("buildDiceFormula creates standard Foundry formulas", () => {
  assert.equal(buildDiceFormula({ count: 1, sides: 20, modifier: 0 }), "1d20");
  assert.equal(buildDiceFormula({ count: 3, sides: 6, modifier: 4 }), "3d6 + 4");
  assert.equal(buildDiceFormula({ count: 2, sides: 8, modifier: -3 }), "2d8 - 3");
});

test("buildDiceFormula constrains values to safe UI ranges", () => {
  assert.equal(buildDiceFormula({ count: 0, sides: 1, modifier: 5000 }), "1d2 + 999");
  assert.equal(buildDiceFormula({ count: 1000, sides: 5000, modifier: -5000 }), "100d1000 - 999");
});

test("toBoundedInteger uses its fallback for invalid values", () => {
  assert.equal(toBoundedInteger("not-a-number", { min: 1, max: 10, fallback: 4 }), 4);
});

test("visibility modes map to Foundry V13 and V14", () => {
  assert.equal(getFoundryMessageMode("gm", 13), "gmroll");
  assert.equal(getFoundryMessageMode("blind", 14), "blind");
  assert.equal(normalizeVisibilityMode("unknown"), "public");
});

test("Fantasy-OS share links resolve to the versioned Foundry API", () => {
  const connection = parseCharacterShareUrl(
    "https://fantasy-os.com/character/12345?key=0123456789abcdef0123456789abcdef",
  );

  assert.equal(connection.characterId, "12345");
  assert.equal(
    buildCharacterApiUrl(connection),
    "https://fantasy-os.com/api/foundry/v1/characters/12345",
  );
});

test("share links reject unknown hosts and malformed keys", () => {
  assert.throws(
    () => parseCharacterShareUrl("https://example.com/character/123?key=0123456789abcdef0123456789abcdef"),
    /INVALID_SHARE_HOST/,
  );
  assert.throws(
    () => parseCharacterShareUrl("https://fantasy-os.com/character/123?key=short"),
    /INVALID_SHARE_URL/,
  );
});

test("character API payloads and attribute totals are normalized", () => {
  const character = readCharacterApiPayload({
    apiVersion: 1,
    character: { id: "123", name: "Aria", str: 3, str_bonus: 2, str_mod: -1 },
  });

  assert.equal(character.name, "Aria");
  assert.equal(getCharacterAttributeTotal(character, "str"), 4);
  assert.equal(getCharacterAttributeTotal(character, "unknown"), 0);
});
