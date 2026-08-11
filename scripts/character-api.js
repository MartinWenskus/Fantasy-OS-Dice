const CHARACTER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SHARE_KEY_PATTERN = /^[a-f0-9]{32}$/i;

export const CHARACTER_ATTRIBUTES = Object.freeze([
  Object.freeze({ key: "str", label: "STR" }),
  Object.freeze({ key: "dex", label: "DEX" }),
  Object.freeze({ key: "con", label: "CON" }),
  Object.freeze({ key: "wil", label: "WIL" }),
  Object.freeze({ key: "int", label: "INT" }),
  Object.freeze({ key: "soc", label: "SOC" }),
]);

function isAllowedPortalUrl(url) {
  const isFantasyOS = url.protocol === "https:"
    && (url.hostname === "fantasy-os.com" || url.hostname.endsWith(".fantasy-os.com"));
  const isLocalDevelopment = ["localhost", "127.0.0.1"].includes(url.hostname)
    && ["http:", "https:"].includes(url.protocol);

  return isFantasyOS || isLocalDevelopment;
}

export function parseCharacterShareUrl(value) {
  let url;
  try {
    url = new URL(String(value).trim());
  } catch {
    throw new TypeError("INVALID_SHARE_URL");
  }

  if (!isAllowedPortalUrl(url)) {
    throw new TypeError("INVALID_SHARE_HOST");
  }

  const pathMatch = url.pathname.match(/^\/character\/([^/]+)\/?$/);
  const characterId = pathMatch ? decodeURIComponent(pathMatch[1]) : "";
  const shareKey = url.searchParams.get("key") ?? "";

  if (!CHARACTER_ID_PATTERN.test(characterId) || !SHARE_KEY_PATTERN.test(shareKey)) {
    throw new TypeError("INVALID_SHARE_URL");
  }

  const canonicalUrl = new URL(`/character/${encodeURIComponent(characterId)}`, url.origin);
  canonicalUrl.searchParams.set("key", shareKey);

  return Object.freeze({
    origin: url.origin,
    characterId,
    shareKey,
    canonicalUrl: canonicalUrl.toString(),
  });
}

export function buildCharacterApiUrl(connection) {
  return new URL(
    `/api/foundry/v1/characters/${encodeURIComponent(connection.characterId)}`,
    connection.origin,
  ).toString();
}

export function readCharacterApiPayload(payload) {
  if (!payload || typeof payload !== "object" || payload.apiVersion !== 1) {
    throw new TypeError("UNSUPPORTED_API_RESPONSE");
  }

  const character = payload.character;
  if (!character || typeof character !== "object" || Array.isArray(character)) {
    throw new TypeError("INVALID_CHARACTER_RESPONSE");
  }

  if (!CHARACTER_ID_PATTERN.test(String(character.id ?? ""))) {
    throw new TypeError("INVALID_CHARACTER_RESPONSE");
  }

  return Object.freeze({ ...character });
}

export function getCharacterAttributeTotal(character, key) {
  if (!CHARACTER_ATTRIBUTES.some((attribute) => attribute.key === key)) return 0;

  return [character?.[key], character?.[`${key}_bonus`], character?.[`${key}_mod`]]
    .map(Number)
    .filter(Number.isFinite)
    .reduce((total, part) => total + part, 0);
}
