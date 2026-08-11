import {
  buildDiceFormula,
  DICE_LIMITS,
  DICE_SIDES,
  getFoundryMessageMode,
  normalizeVisibilityMode,
} from "./dice-formula.js";
import {
  buildCharacterApiUrl,
  CHARACTER_ATTRIBUTES,
  getCharacterAttributeTotal,
  parseCharacterShareUrl,
  readCharacterApiPayload,
} from "./character-api.js";

const MODULE_ID = "fantasy-os-dice";
const ROOT_ID = "fantasy-os-dice-root";
const MAX_CUSTOM_FORMULA_LENGTH = 200;
const CHARACTER_SETTING = "characterShareUrl";
const CHARACTER_REQUEST_TIMEOUT = 10_000;

function localize(key) {
  return game.i18n.localize(`FOSDice.${key}`);
}

function getRollClass() {
  return globalThis.foundry?.dice?.Roll ?? globalThis.Roll;
}

function getChatMessageClass() {
  return globalThis.foundry?.documents?.ChatMessage ?? globalThis.ChatMessage;
}

function getFoundryGeneration() {
  return Number(game.release?.generation ?? game.version?.split(".")[0] ?? 13);
}

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = String(value);
  return element.innerHTML;
}

function registerSettings() {
  game.settings.register(MODULE_ID, CHARACTER_SETTING, {
    name: "FOSDice.CharacterSettingName",
    hint: "FOSDice.CharacterSettingHint",
    scope: "client",
    config: false,
    type: String,
    default: "",
  });
}

class FantasyOSDiceTray {
  constructor() {
    this.root = null;
    this.launcher = null;
    this.panel = null;
    this.countInput = null;
    this.modifierInput = null;
    this.visibilitySelect = null;
    this.preview = null;
    this.customFormulaInput = null;
    this.characterShareUrlInput = null;
    this.characterSummary = null;
    this.characterConnectForm = null;
    this.characterStatus = null;
    this.characterError = null;
    this.character = null;
    this.isConnecting = false;
    this.isRolling = false;
    this.handleKeydown = this.handleKeydown.bind(this);
  }

  mount() {
    document.getElementById(ROOT_ID)?.remove();

    this.root = document.createElement("div");
    this.root.id = ROOT_ID;
    this.root.className = "fos-dice";
    this.root.innerHTML = this.renderMarkup();
    document.body.append(this.root);

    this.launcher = this.root.querySelector("[data-action='toggle']");
    this.panel = this.root.querySelector("[data-part='panel']");
    this.countInput = this.root.querySelector("[name='dice-count']");
    this.modifierInput = this.root.querySelector("[name='dice-modifier']");
    this.visibilitySelect = this.root.querySelector("[name='visibility']");
    this.preview = this.root.querySelector("[data-part='preview']");
    this.customFormulaInput = this.root.querySelector("[name='custom-formula']");
    this.characterShareUrlInput = this.root.querySelector("[name='character-share-url']");
    this.characterSummary = this.root.querySelector("[data-part='character-summary']");
    this.characterConnectForm = this.root.querySelector("[data-form='character-connect']");
    this.characterStatus = this.root.querySelector("[data-part='character-status']");
    this.characterError = this.root.querySelector("[data-part='character-error']");

    this.bindEvents();
    this.updatePreview();
    document.addEventListener("keydown", this.handleKeydown);
  }

  renderMarkup() {
    const diceButtons = DICE_SIDES.map((sides) => `
      <button class="fos-dice__die" type="button" data-action="quick-roll" data-sides="${sides}" aria-label="${localize("RollD")}${sides}">
        <span class="fos-dice__die-shape" aria-hidden="true">${sides}</span>
        <span>d${sides}</span>
      </button>
    `).join("");
    const attributeButtons = CHARACTER_ATTRIBUTES.map((attribute) => `
      <button class="fos-dice__attribute" type="button" data-action="attribute-roll" data-attribute="${attribute.key}" disabled>
        <span>${attribute.label}</span>
        <strong data-attribute-value="${attribute.key}">—</strong>
      </button>
    `).join("");

    return `
      <button
        class="fos-dice__launcher"
        type="button"
        data-action="toggle"
        aria-controls="fos-dice-panel"
        aria-expanded="false"
        title="${localize("OpenTray")}">
        <i class="fa-solid fa-dice-d20" aria-hidden="true"></i>
        <span>${localize("Launcher")}</span>
      </button>

      <section
        class="fos-dice__panel"
        id="fos-dice-panel"
        data-part="panel"
        aria-labelledby="fos-dice-title"
        hidden>
        <header class="fos-dice__header">
          <div>
            <p class="fos-dice__eyebrow">Fantasy-OS</p>
            <h2 id="fos-dice-title">${localize("Title")}</h2>
          </div>
          <button class="fos-dice__icon-button" type="button" data-action="close" aria-label="${localize("Close")}" title="${localize("Close")}">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </header>

        <div class="fos-dice__body">
          <section class="fos-dice__character" aria-labelledby="fos-dice-character-title">
            <div class="fos-dice__section-heading">
              <div>
                <p class="fos-dice__eyebrow">fantasy-os.com</p>
                <h3 id="fos-dice-character-title">${localize("CharacterConnection")}</h3>
              </div>
              <span class="fos-dice__connection-status" data-part="character-status" data-state="idle">
                ${localize("NotConnected")}
              </span>
            </div>

            <form class="fos-dice__connect-form" data-form="character-connect">
              <label for="fos-dice-character-url">${localize("CharacterShareUrl")}</label>
              <div class="fos-dice__formula-row">
                <input
                  id="fos-dice-character-url"
                  name="character-share-url"
                  type="url"
                  inputmode="url"
                  placeholder="https://fantasy-os.com/character/…?key=…"
                  autocomplete="off"
                  spellcheck="false">
                <button type="submit" data-action="connect-character">
                  <i class="fa-solid fa-link" aria-hidden="true"></i>
                  <span>${localize("Connect")}</span>
                </button>
              </div>
              <p>${localize("CharacterShareHelp")}</p>
              <p class="fos-dice__error" data-part="character-error" role="alert" hidden></p>
            </form>

            <div class="fos-dice__character-summary" data-part="character-summary" hidden>
              <div class="fos-dice__character-heading">
                <div>
                  <strong data-part="character-name">—</strong>
                  <span data-part="character-meta">—</span>
                </div>
                <div class="fos-dice__character-actions">
                  <button class="fos-dice__icon-button" type="button" data-action="sync-character" aria-label="${localize("SyncCharacter")}" title="${localize("SyncCharacter")}">
                    <i class="fa-solid fa-rotate" aria-hidden="true"></i>
                  </button>
                  <button class="fos-dice__icon-button" type="button" data-action="disconnect-character" aria-label="${localize("Disconnect")}" title="${localize("Disconnect")}">
                    <i class="fa-solid fa-link-slash" aria-hidden="true"></i>
                  </button>
                </div>
              </div>
              <div class="fos-dice__attributes" aria-label="${localize("AttributeRolls")}">
                ${attributeButtons}
              </div>
            </div>
          </section>

          <div class="fos-dice__controls">
            <label>
              <span>${localize("Count")}</span>
              <input name="dice-count" type="number" min="${DICE_LIMITS.count.min}" max="${DICE_LIMITS.count.max}" value="1" inputmode="numeric">
            </label>
            <label>
              <span>${localize("Modifier")}</span>
              <input name="dice-modifier" type="number" min="${DICE_LIMITS.modifier.min}" max="${DICE_LIMITS.modifier.max}" value="0" inputmode="numeric">
            </label>
          </div>

          <div class="fos-dice__preview" aria-live="polite">
            <span>${localize("NextRoll")}</span>
            <strong data-part="preview">1d20</strong>
          </div>

          <fieldset class="fos-dice__fieldset">
            <legend>${localize("QuickDice")}</legend>
            <div class="fos-dice__grid">${diceButtons}</div>
          </fieldset>

          <label class="fos-dice__visibility">
            <span>${localize("Visibility")}</span>
            <select name="visibility">
              <option value="public">${localize("VisibilityPublic")}</option>
              <option value="gm">${localize("VisibilityGM")}</option>
              <option value="blind">${localize("VisibilityBlind")}</option>
              <option value="self">${localize("VisibilitySelf")}</option>
            </select>
          </label>

          <form class="fos-dice__custom" data-form="custom-roll">
            <label for="fos-dice-custom-formula">${localize("CustomFormula")}</label>
            <div class="fos-dice__formula-row">
              <input
                id="fos-dice-custom-formula"
                name="custom-formula"
                type="text"
                maxlength="${MAX_CUSTOM_FORMULA_LENGTH}"
                placeholder="${localize("FormulaPlaceholder")}" 
                autocomplete="off"
                spellcheck="false">
              <button type="submit">
                <i class="fa-solid fa-dice" aria-hidden="true"></i>
                <span>${localize("Roll")}</span>
              </button>
            </div>
            <p>${localize("FormulaHelp")}</p>
          </form>
        </div>
      </section>
    `;
  }

  bindEvents() {
    this.launcher.addEventListener("click", () => this.toggle());
    this.root.querySelector("[data-action='close']").addEventListener("click", () => this.close());
    this.countInput.addEventListener("input", () => this.updatePreview());
    this.modifierInput.addEventListener("input", () => this.updatePreview());
    this.characterConnectForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.connectCharacter(this.characterShareUrlInput.value);
    });
    this.root.querySelector("[data-action='sync-character']").addEventListener("click", () => {
      this.connectCharacter(this.characterShareUrlInput.value);
    });
    this.root.querySelector("[data-action='disconnect-character']").addEventListener("click", () => {
      this.disconnectCharacter();
    });

    for (const button of this.root.querySelectorAll("[data-action='attribute-roll']")) {
      button.addEventListener("click", () => this.rollCharacterAttribute(button.dataset.attribute));
    }

    for (const button of this.root.querySelectorAll("[data-action='quick-roll']")) {
      button.addEventListener("mouseenter", () => this.updatePreview(button.dataset.sides));
      button.addEventListener("focus", () => this.updatePreview(button.dataset.sides));
      button.addEventListener("mouseleave", () => this.updatePreview());
      button.addEventListener("blur", () => this.updatePreview());
      button.addEventListener("click", () => this.rollQuick(button.dataset.sides));
    }

    this.root.querySelector("[data-form='custom-roll']").addEventListener("submit", (event) => {
      event.preventDefault();
      this.rollCustom();
    });
  }

  handleKeydown(event) {
    if (event.key === "Escape" && !this.panel.hidden) {
      this.close();
    }
  }

  open() {
    this.panel.hidden = false;
    this.launcher.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => this.panel.classList.add("is-open"));
    this.countInput.focus({ preventScroll: true });
  }

  close() {
    this.panel.classList.remove("is-open");
    this.panel.hidden = true;
    this.launcher.setAttribute("aria-expanded", "false");
    this.launcher.focus({ preventScroll: true });
  }

  toggle() {
    this.panel.hidden ? this.open() : this.close();
  }

  updatePreview(sides = 20) {
    if (!this.preview) return;

    this.preview.textContent = buildDiceFormula({
      count: this.countInput.value,
      sides,
      modifier: this.modifierInput.value,
    });
  }

  async rollQuick(sides) {
    const formula = buildDiceFormula({
      count: this.countInput.value,
      sides,
      modifier: this.modifierInput.value,
    });

    await this.roll(formula);
  }

  async rollCustom() {
    const formula = this.customFormulaInput.value.trim();

    if (!formula) {
      ui.notifications.warn(localize("FormulaRequired"));
      this.customFormulaInput.focus();
      return;
    }

    await this.roll(formula);
  }

  async restoreCharacterConnection() {
    const shareUrl = game.settings.get(MODULE_ID, CHARACTER_SETTING);
    if (typeof shareUrl !== "string" || !shareUrl.trim()) return;

    this.characterShareUrlInput.value = shareUrl;
    await this.connectCharacter(shareUrl, { persist: false, silent: true });
  }

  async connectCharacter(shareUrl, { persist = true, silent = false } = {}) {
    if (this.isConnecting) return null;

    let connection;
    try {
      connection = parseCharacterShareUrl(shareUrl);
    } catch (error) {
      const message = error.message === "INVALID_SHARE_HOST"
        ? localize("InvalidShareHost")
        : localize("InvalidShareUrl");
      this.setCharacterState("error", message);
      return null;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CHARACTER_REQUEST_TIMEOUT);
    this.isConnecting = true;
    this.setCharacterState("loading");
    this.updateConnectButtons();

    try {
      const response = await fetch(buildCharacterApiUrl(connection), {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${connection.shareKey}`,
        },
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = response.status === 401 || response.status === 404
          ? localize("CharacterNotFound")
          : localize("CharacterServiceUnavailable");
        throw new Error(message);
      }

      const payload = await response.json();
      this.character = readCharacterApiPayload(payload);
      this.characterShareUrlInput.value = connection.canonicalUrl;
      if (persist) {
        await game.settings.set(MODULE_ID, CHARACTER_SETTING, connection.canonicalUrl);
      }

      this.renderCharacter();
      this.setCharacterState("connected");
      if (!silent) ui.notifications.info(localize("CharacterConnected"));
      return this.character;
    } catch (error) {
      const message = error.name === "AbortError"
        ? localize("CharacterRequestTimeout")
        : error.message || localize("CharacterServiceUnavailable");
      this.character = null;
      this.renderCharacter();
      this.setCharacterState("error", message);
      if (!silent) ui.notifications.error(message);
      return null;
    } finally {
      window.clearTimeout(timeout);
      this.isConnecting = false;
      this.updateConnectButtons();
    }
  }

  async disconnectCharacter() {
    await game.settings.set(MODULE_ID, CHARACTER_SETTING, "");
    this.character = null;
    this.characterShareUrlInput.value = "";
    this.renderCharacter();
    this.setCharacterState("idle");
    ui.notifications.info(localize("CharacterDisconnected"));
  }

  setCharacterState(state, errorMessage = "") {
    const labels = {
      idle: localize("NotConnected"),
      loading: localize("Connecting"),
      connected: localize("Connected"),
      error: localize("ConnectionFailed"),
    };

    this.characterStatus.dataset.state = state;
    this.characterStatus.textContent = labels[state] ?? labels.idle;
    this.characterError.textContent = errorMessage;
    this.characterError.hidden = !errorMessage;
  }

  updateConnectButtons() {
    for (const button of this.root.querySelectorAll("[data-action='connect-character'], [data-action='sync-character']")) {
      button.disabled = this.isConnecting;
    }
  }

  renderCharacter() {
    const hasCharacter = Boolean(this.character);
    this.characterSummary.hidden = !hasCharacter;
    this.characterConnectForm.classList.toggle("is-compact", hasCharacter);

    if (!hasCharacter) {
      for (const button of this.root.querySelectorAll("[data-action='attribute-roll']")) {
        button.disabled = true;
        button.querySelector("strong").textContent = "—";
      }
      return;
    }

    const characterName = this.character.name || localize("UnnamedCharacter");
    const meta = [
      this.character.level ? `${localize("Level")} ${this.character.level}` : null,
      this.character.species,
      this.character.char_class,
    ].filter(Boolean).join(" · ");

    this.root.querySelector("[data-part='character-name']").textContent = characterName;
    this.root.querySelector("[data-part='character-meta']").textContent = meta || localize("CharacterConnected");

    for (const button of this.root.querySelectorAll("[data-action='attribute-roll']")) {
      const total = getCharacterAttributeTotal(this.character, button.dataset.attribute);
      button.disabled = false;
      button.querySelector("strong").textContent = `${total >= 0 ? "+" : ""}${total}`;
    }
  }

  async rollCharacterAttribute(key) {
    if (!this.character) return;

    const attribute = CHARACTER_ATTRIBUTES.find((entry) => entry.key === key);
    if (!attribute) return;

    const modifier = getCharacterAttributeTotal(this.character, key);
    const formula = buildDiceFormula({ count: 1, sides: 20, modifier });
    const characterName = this.character.name || localize("UnnamedCharacter");
    const flavor = `${escapeHtml(characterName)} · ${attribute.label}`;
    await this.roll(formula, flavor);
  }

  async roll(formula, flavor = localize("ChatFlavor")) {
    if (this.isRolling) return;

    const normalizedFormula = String(formula).trim();

    if (!normalizedFormula || normalizedFormula.length > MAX_CUSTOM_FORMULA_LENGTH) {
      ui.notifications.error(localize("InvalidFormula"));
      return;
    }

    const RollClass = getRollClass();
    const ChatMessageClass = getChatMessageClass();

    if (!RollClass || !ChatMessageClass) {
      ui.notifications.error(localize("ApiUnavailable"));
      return;
    }

    try {
      if (typeof RollClass.validate === "function" && !RollClass.validate(normalizedFormula)) {
        throw new Error(localize("InvalidFormula"));
      }

      this.setRolling(true);

      const roll = typeof RollClass.create === "function"
        ? RollClass.create(normalizedFormula)
        : new RollClass(normalizedFormula);

      await roll.evaluate();

      const generation = getFoundryGeneration();
      const mode = getFoundryMessageMode(
        normalizeVisibilityMode(this.visibilitySelect.value),
        generation,
      );
      const messageOptions = generation >= 14
        ? { messageMode: mode }
        : { rollMode: mode };

      await roll.toMessage({
        flavor,
        speaker: ChatMessageClass.getSpeaker(),
      }, messageOptions);
    } catch (error) {
      console.error(`${MODULE_ID} | Dice roll failed`, error);
      ui.notifications.error(`${localize("RollFailed")} ${error.message ?? ""}`.trim());
    } finally {
      this.setRolling(false);
    }
  }

  setRolling(isRolling) {
    this.isRolling = isRolling;
    this.root.classList.toggle("is-rolling", isRolling);

    for (const button of this.root.querySelectorAll("[data-action='quick-roll'], [data-form='custom-roll'] button")) {
      button.disabled = isRolling;
    }

    for (const button of this.root.querySelectorAll("[data-action='attribute-roll']")) {
      button.disabled = isRolling || !this.character;
    }
  }
}

Hooks.once("init", registerSettings);

Hooks.once("ready", () => {
  const tray = new FantasyOSDiceTray();
  tray.mount();
  tray.restoreCharacterConnection();

  const module = game.modules.get(MODULE_ID);
  if (module) {
    module.api = {
      open: () => tray.open(),
      close: () => tray.close(),
      roll: (formula, visibility = "public") => {
        tray.visibilitySelect.value = normalizeVisibilityMode(visibility);
        return tray.roll(String(formula));
      },
      connectCharacter: (shareUrl) => tray.connectCharacter(String(shareUrl)),
      syncCharacter: () => tray.connectCharacter(tray.characterShareUrlInput.value),
      disconnectCharacter: () => tray.disconnectCharacter(),
      getCharacter: () => tray.character,
      rollCharacterAttribute: (attribute, visibility = "public") => {
        tray.visibilitySelect.value = normalizeVisibilityMode(visibility);
        return tray.rollCharacterAttribute(String(attribute).toLowerCase());
      },
    };
  }

  console.info(`${MODULE_ID} | Ready`);
});
