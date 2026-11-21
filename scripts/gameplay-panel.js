import {
  RESOURCES,
  RESET_PERIODS,
  actionsFor,
  inventory,
  plainText,
  resourceMax,
  shortRestFormula,
  signed,
  skillRolls,
} from './gameplay.js';
import { GameplayStore, MODULE_ID } from './gameplay-store.js';
import { serializeGameRoll } from './game-api.js';
import { postFoundryChat } from './foundry-chat.js';

const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
const disabled = (value) => (value ? 'disabled' : '');

export class GameplayPanel {
  constructor(tray, host) {
    this.tray = tray;
    this.host = host;
    this.store = new GameplayStore(game.user);
    this.character = null;
    this.key = null;
    this.busy = false;
    this.tab = 'actions';
    this.search = '';
    this.restTarget = 'hp';
    this.host.addEventListener('click', (event) => this.onClick(event));
    this.host.addEventListener('input', (event) => {
      if (event.target.matches('[data-game-search]')) {
        this.search = event.target.value;
        this.filterActions();
      }
    });
    this.host.addEventListener('change', (event) => {
      if (event.target.matches('[data-rest-target]')) this.restTarget = event.target.value;
    });
    foundry.helpers.Hooks.on('updateUser', (user) => {
      if (user.id === game.user.id && this.character && !this.busy) this.render();
    });
  }

  t(key) {
    return game.i18n.localize(`FOSDice.${key}`);
  }
  get locale() {
    return game.i18n.lang || 'de';
  }
  get state() {
    return this.store.read(this.character, this.key);
  }
  get actions() {
    return actionsFor(this.character, this.state, this.locale);
  }
  getAction(key) {
    return this.actions.find((action) => action.key === key);
  }
  button(action, text, attrs = '') {
    return `<button type="button" data-game-action="${action}" ${attrs}>${text}</button>`;
  }

  async setCharacter(character, origin, store = null) {
    if (this.busy) throw new Error('ActionBusy');
    this.editor?.close();
    this.character = character;
    this.store = store ?? new GameplayStore(game.user);
    this.key = character ? await this.store.keyFor(origin, character.id) : null;
    this.render();
  }

  availability(action) {
    if (action.reason === 'configure') return this.t('ConfigureFirst');
    if (action.reason === 'exhausted') return this.t('UsesExhausted');
    if (action.reason === 'mana') return `${this.t('ManaMissing')}: ${action.cost - this.state.resources.mana}`;
    return action.uses == null ? this.t('AlwaysAvailable') : `${action.uses} × ${this.t('Available')}`;
  }

  filterActions() {
    for (const row of this.host.querySelectorAll('[data-search-text]')) {
      row.hidden = !row.dataset.searchText.toLocaleLowerCase().includes(this.search.toLocaleLowerCase());
    }
    const empty = this.host.querySelector('[data-search-empty]');
    if (empty) empty.hidden = [...this.host.querySelectorAll('[data-search-text]')].some((row) => !row.hidden);
  }

  render() {
    this.host.hidden = !this.character;
    if (!this.character) {
      this.host.replaceChildren();
      return;
    }
    let state;
    try {
      state = this.state;
    } catch {
      this.host.innerHTML = `<p role="alert">${escape(this.t('StateLoadFailed'))}</p>`;
      return;
    }
    const opened = new Set([...this.host.querySelectorAll('details[open]')].map((node) => node.dataset.key));
    const resources = RESOURCES.filter(
      (key) => this.character[key] != null || resourceMax(this.character, key) != null,
    );
    const stats = ['spell_attack', 'spell_dc', 'speed', 'initiative'].filter((key) => this.character[key] != null);
    const actions = this.actions;
    const locked = this.busy || this.tray.isRolling || this.tray.isConnecting || Boolean(this.store.pending);
    this.host.innerHTML = `
      <section class="fos-play__resources" aria-label="${escape(this.t('Resources'))}">
        ${resources
          .map((key) => {
            const max = resourceMax(this.character, key),
              current = state.resources[key];
            return `<div class="fos-play__resource">
            <span class="fos-play__resource-label">${escape(this.t(`Resource_${key}`))}</span>
            <div>${this.button('resource', '−', `data-resource="${key}" data-delta="-1" aria-label="${escape(this.t(`Resource_${key}`))} −1" ${disabled(locked || current <= 0)}`)}
              <strong>${current}<small> / ${max ?? '—'}</small></strong>
              ${this.button('resource', '+', `data-resource="${key}" data-delta="1" aria-label="${escape(this.t(`Resource_${key}`))} +1" ${disabled(locked || (max != null && current >= max))}`)}
            </div>
            <progress max="${max || Math.max(1, current)}" value="${current}" aria-label="${escape(this.t(`Resource_${key}`))}"></progress>
            ${this.button('set-resource', escape(this.t('SetValue')), `data-resource="${key}" ${disabled(locked)}`)}
          </div>`;
          })
          .join('')}
      </section>
      <p class="fos-play__scope">${escape(this.store.remote ? `${this.t('GameStateScope')} ${this.store.game?.name ?? ''}` : this.t('StateScope'))}</p>
      ${this.store.pending ? `<p class="fos-play__notice" role="alert">${escape(this.t('PendingGameAction'))} ${this.button('retry-game', escape(this.t('RetryGameAction')), disabled(this.busy))}</p>` : ''}
      <div class="fos-play__stats">${stats
        .map((key) =>
          key === 'initiative'
            ? this.button(
                'initiative',
                `<i class="fa-solid fa-dice-d20" aria-hidden="true"></i> ${escape(this.t('Stat_initiative'))}: <b>${escape(this.character.initiative)}</b>`,
                `title="${escape(this.t('RollInitiative'))}" aria-label="${escape(this.t('RollInitiative'))}" ${disabled(locked || this.tray.isRolling)}`,
              )
            : `<span>${escape(this.t(`Stat_${key}`))}: <b>${escape(this.character[key])}</b></span>`,
        )
        .join('')}</div>
      <nav class="fos-play__tabs" aria-label="${escape(this.t('CharacterSections'))}">
        ${['actions', 'skills', 'items'].map((tab) => this.button('tab', escape(this.t(`Tab_${tab}`)), `data-tab="${tab}" aria-pressed="${this.tab === tab}"`)).join('')}
      </nav>
      <section ${this.tab === 'actions' ? '' : 'hidden'}>
        <label class="fos-play__search">${escape(this.t('SearchActions'))}<input data-game-search type="search" value="${escape(this.search)}"></label>
        ${!this.character.foundryGameplay?.catalogComplete ? `<p class="fos-play__notice">${escape(this.t('CatalogIncomplete'))}</p>` : ''}
        <div class="fos-play__actions">
          ${actions.map((action) => this.renderAction(action, opened.has(action.key))).join('')}
        </div>
        <p data-search-empty ${actions.length ? 'hidden' : ''}>${escape(this.t('NoActions'))}</p>
        ${this.button('add', `+ ${escape(this.t('AddAction'))}`, disabled(locked))}
      </section>
      <section class="fos-play__skills" ${this.tab === 'skills' ? '' : 'hidden'}>
        ${skillRolls(this.character, this.locale)
          .map((skill) =>
            this.button(
              'skill',
              `<span>${escape(skill.label)}</span><b>${signed(skill.value)}</b>`,
              `data-skill="${skill.key}" ${disabled(locked || this.tray.isRolling)}`,
            ),
          )
          .join('')}
      </section>
      <section ${this.tab === 'items' ? '' : 'hidden'}>
        ${
          inventory(this.character, this.locale)
            .map(
              (
                item,
              ) => `<details class="fos-play__item"><summary>${escape(item.label)} <span>× ${item.quantity}</span></summary>
          <p>${escape(item.description)}</p><p>${escape([item.damage, item.range, item.requirement].filter(Boolean).join(' · '))}</p></details>`,
            )
            .join('') || `<p>${escape(this.t('NoItems'))}</p>`
        }
        ${[
          'combat_skills',
          'species_features',
          'class_features',
          'special_abilities',
          'usable_items',
          'magical_items',
          'more_items',
        ]
          .filter((field) => this.character[field])
          .map(
            (field) =>
              `<details class="fos-play__item"><summary>${escape(this.t(`Notes_${field}`))}</summary><p>${escape(plainText(this.character[field]))}</p></details>`,
          )
          .join('')}
      </section>
      <section class="fos-play__rests" aria-label="${escape(this.t('Rests'))}">
        <label>${escape(this.t('RestTarget'))}<select data-rest-target>
          ${['hp', 'mana'].map((key) => `<option value="${key}" ${this.restTarget === key ? 'selected' : ''}>${escape(this.t(`Resource_${key}`))}</option>`).join('')}
        </select></label>
        <div>${this.button('short-rest', escape(this.t('ShortRest')), disabled(locked))}
          ${this.button('short-rest-no-roll', escape(this.t('WithoutRoll')), disabled(locked))}</div>
        <small>${escape(shortRestFormula(this.character))} · ${escape(this.t('RestRule'))}</small>
        <div>${this.button('long-rest', escape(this.t('LongRest')), disabled(locked))}
          ${this.button('session', escape(this.t('NewSession')), disabled(locked))}</div>
      </section>`;
    this.filterActions();
  }

  renderAction(action, open) {
    const locked = this.busy || this.tray.isRolling || this.tray.isConnecting || Boolean(this.store.pending);
    const attrs = `data-key="${escape(action.key)}"`;
    const spell = action.spell;
    const info = spell
      ? [
          spell.Level ? `${this.t('Level')} ${spell.Level}` : '',
          spell.Element,
          spell.AP ? `${spell.AP} AP` : '',
          spell.Range ? `${this.t('Range')}: ${spell.Range}` : '',
          spell.Radius ? `${this.t('Radius')}: ${spell.Radius}` : '',
          spell.Duration ? `${this.t('Duration')}: ${spell.Duration}` : '',
        ].filter(Boolean)
      : [];
    return `<details class="fos-play__action" ${attrs} data-search-text="${escape(`${action.label} ${action.description} ${info.join(' ')}`)}" ${open ? 'open' : ''}>
      <summary><span>${escape(action.label)}</span><small class="${action.ready ? 'is-ready' : ''}">${escape(this.availability(action))}</small></summary>
      <div class="fos-play__action-body">
        <div class="fos-play__badges">${info.map((value) => `<span>${escape(value)}</span>`).join('')}</div>
        <p class="fos-play__description">${escape(action.description || this.t('NoDescription'))}</p>
        ${action.rule.note ? `<p>${escape(action.rule.note)}</p>` : ''}
        <p><b>${action.cost == null ? this.t('UnknownManaCost') : `${action.cost} ${this.t('Resource_mana')}`}</b> ·
          ${escape(action.rule.unlimited ? this.t('Unlimited') : `${action.remaining}/${action.rule.max} · ${this.t(`Reset_${action.rule.reset}`)}`)}</p>
        ${action.rule.outcomes?.length ? `<table><caption>${escape(this.t('Outcomes'))}</caption><tbody>${action.rule.outcomes.map((row) => `<tr><th>${row.from}${row.to === row.from ? '' : `–${row.to}`}</th><td>${escape(row.label)}</td></tr>`).join('')}</tbody></table>` : ''}
        <div class="fos-play__buttons">
          ${this.button('use', escape(this.t(spell ? 'Cast' : 'Use')), `${attrs} class="fos-play__primary" ${disabled(locked || !action.ready)}`)}
          ${this.button('configure', escape(this.t('Configure')), `${attrs} ${disabled(locked)}`)}
          ${!action.rule.unlimited ? this.button('refund', escape(this.t('RefundUse')), `${attrs} ${disabled(locked || action.rule.used <= 0)}`) : ''}
        </div>
        ${!action.rule.die && action.rolls?.length ? `<div class="fos-play__effects">${action.rolls.map((roll, index) => this.button('effect', `${escape(this.t(`Effect_${roll.effect}`))}: ${escape(roll.formula)}`, `${attrs} data-roll-index="${index}" ${disabled(locked || this.tray.isRolling)}`)).join('')}<small>${escape(this.t('EffectOnlyHint'))}</small></div>` : ''}
      </div>
    </details>`;
  }

  async onClick(event) {
    const button = event.target.closest('[data-game-action]');
    if (!button || button.disabled || !this.character) return;
    const action = button.dataset.gameAction,
      key = button.dataset.key;
    if (action === 'tab') {
      this.tab = button.dataset.tab;
      this.render();
      return;
    }
    if (this.busy || this.tray.isRolling || this.tray.isConnecting) return;
    if (action === 'retry-game') {
      await this.run(async () => {
        const visibility = this.store.pending.visibility;
        const result = await this.store.retry();
        await this.chat(result.text, [], '', null, visibility);
      }, true);
      return;
    }
    if (this.store.pending) {
      ui.notifications.warn(this.t('PendingGameAction'));
      return;
    }
    if (action === 'configure' || action === 'add') {
      this.openEditor(key);
      return;
    }
    if (action === 'set-resource') {
      this.openResourceEditor(button.dataset.resource);
      return;
    }
    if (action === 'long-rest' || action === 'session') {
      this.confirm(this.t(action === 'long-rest' ? 'ConfirmLongRest' : 'ConfirmSession'), () =>
        this.performRest(action),
      );
      return;
    }
    await this.run(async () => {
      if (action === 'resource')
        await this.dispatch({
          type: 'resource',
          resource: button.dataset.resource,
          delta: Number(button.dataset.delta),
        });
      else if (action === 'refund') {
        const entry = this.getAction(key);
        await this.dispatch({ type: 'refund', key });
        await this.chat(`${this.t('RefundUse')}: ${entry.label}`);
      } else if (action === 'use') await this.useAction(key);
      else if (action === 'initiative') {
        const value = Number(this.character.initiative);
        const modifier = Number.isFinite(value) ? value : 0;
        await this.tray.roll(
          `1d20 ${modifier >= 0 ? '+' : '-'} ${Math.abs(modifier)}`,
          escape(`${this.character.name} · ${this.t('Stat_initiative')}`),
          true,
        );
      } else if (action === 'skill') {
        const skill = skillRolls(this.character, this.locale).find((entry) => entry.key === button.dataset.skill);
        if (skill)
          await this.tray.roll(
            `1d20 ${skill.value >= 0 ? '+' : '-'} ${Math.abs(skill.value)}`,
            escape(`${this.character.name} · ${skill.label}`),
            true,
          );
      } else if (action === 'effect') {
        const entry = this.getAction(key),
          roll = entry?.rolls[Number(button.dataset.rollIndex)];
        if (roll)
          await this.tray.roll(
            roll.formula,
            escape(`${this.character.name} · ${entry.label} · ${this.t(`Effect_${roll.effect}`)}`),
            true,
          );
      } else if (action === 'short-rest' || action === 'short-rest-no-roll')
        await this.shortRest(action === 'short-rest');
    });
  }

  async run(fn, retry = false) {
    if (this.busy || this.tray.isConnecting || this.tray.isRolling) return;
    this.busy = true;
    this.tray.updateConnectButtons();
    this.render();
    try {
      if (this.store.remote && !retry) {
        if (this.store.pending) throw new Error('PendingGameAction');
        await this.store.refresh();
        this.character = this.store.character;
        this.tray.character = this.character;
        this.tray.renderCharacter();
      }
      await fn();
    } catch (error) {
      const key = `FOSDice.${error.message}`;
      ui.notifications.error(game.i18n.has(key) ? game.i18n.localize(key) : this.t('ActionFailed'));
      console.error(`${MODULE_ID} | Gameplay operation failed`, error);
    } finally {
      this.busy = false;
      this.tray.updateConnectButtons();
      this.render();
    }
  }

  async dispatch(command, rolls = [], label = '') {
    return this.store.dispatch(this.character, this.key, command, this.locale, {
      visibility: this.tray.visibilitySelect.value,
      label,
      rolls: rolls.map(serializeGameRoll),
    });
  }

  async useAction(key) {
    const action = this.getAction(key);
    if (!action) throw new Error('ActionMissing');
    // Validate & evaluate optional dice before charging; publish only after persistence.
    const decision = action.rule.die ? await this.evaluate(action.rule.die) : null;
    const outcome = decision
      ? action.rule.outcomes?.find((row) => decision.total >= row.from && decision.total <= row.to)
      : null;
    const followUp = outcome?.followUp ? await this.evaluate(outcome.followUp) : null;
    await this.dispatch({ type: 'use', key }, [decision, followUp].filter(Boolean));
    const suffix = [`${this.t('SpentMana')}: ${action.cost}`, this.availability(this.getAction(key))].join(' · ');
    await this.chat(
      `${this.t(action.spell ? 'Casts' : 'Uses')} ${action.label} · ${suffix}`,
      [decision, followUp].filter(Boolean),
      outcome?.label ?? '',
      key,
    );
  }

  async evaluate(formula) {
    const Roll = foundry.dice.Roll;
    if (!Roll.validate(formula)) throw new Error('InvalidFormula');
    const roll = Roll.create(formula);
    await roll.evaluate();
    return roll;
  }

  async shortRest(withRoll) {
    const roll = withRoll ? await this.evaluate(shortRestFormula(this.character)) : null;
    await this.dispatch(
      {
        type: 'rest',
        period: 'short-rest',
        target: this.restTarget,
        ...(roll ? { amount: Math.max(0, roll.total) } : {}),
      },
      roll ? [roll] : [],
    );
    await this.chat(
      `${this.t('ShortRest')}${roll ? ` · ${this.t(`Resource_${this.restTarget}`)} +${Math.max(0, roll.total)}` : ''}`,
      roll ? [roll] : [],
    );
  }

  async performRest(type) {
    await this.run(async () => {
      await this.dispatch({ type: 'rest', period: type === 'session' ? 'session' : 'long-rest' });
      await this.chat(this.t(type === 'session' ? 'NewSession' : 'LongRest'));
    });
  }

  async chat(text, rolls = [], outcome = '', actionKey = null, visibility = this.tray.visibilitySelect.value) {
    try {
      const Chat = CONFIG.ChatMessage.documentClass;
      const summary = `<div class="fos-play-chat"><strong>${escape(this.character.name)}</strong><p>${escape(text)}</p>${outcome ? `<p>${escape(outcome)}</p>` : ''}</div>`;
      const data = {
        speaker: { ...Chat.getSpeaker(), alias: this.character.name || this.t('UnnamedCharacter') },
        // Foundry only renders native dice when content has no custom HTML.
        ...(rolls.length ? { rolls, content: '', flavor: summary } : { content: summary }),
        flags: { [MODULE_ID]: { characterId: this.character.id, actionKey } },
      };
      await postFoundryChat(data, visibility);
    } catch {
      ui.notifications.warn(this.t('ChatFailedStateSaved'));
    }
  }

  dialog(title, body) {
    this.editor?.remove();
    const dialog = document.createElement('dialog');
    dialog.className = 'fos-play__dialog';
    dialog.setAttribute('aria-label', title);
    dialog.innerHTML = `<form><header><h3>${escape(title)}</h3><button type="button" data-cancel aria-label="${escape(this.t('Close'))}">×</button></header>${body}
      <p data-error role="alert" hidden></p><footer><button type="button" data-cancel>${escape(this.t('Cancel'))}</button><button type="submit">${escape(this.t('Save'))}</button></footer></form>`;
    this.tray.root.append(dialog);
    dialog
      .querySelectorAll('[data-cancel]')
      .forEach((button) => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (this.editor === dialog) this.editor = null;
    });
    dialog.showModal();
    this.editor = dialog;
    return dialog;
  }

  confirm(message, callback) {
    const dialog = this.dialog(this.t('Confirm'), `<p>${escape(message)}</p>`);
    dialog.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      dialog.close();
      callback();
    });
  }

  openResourceEditor(resource) {
    const dialog = this.dialog(
      this.t(`Resource_${resource}`),
      `<label>${escape(this.t('SetValue'))}<input name="value" type="number" min="0" ${resourceMax(this.character, resource) == null ? '' : `max="${resourceMax(this.character, resource)}"`} value="${this.state.resources[resource]}" required autofocus></label>`,
    );
    dialog.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      const value = Number(new FormData(event.target).get('value'));
      dialog.close();
      this.run(() => this.dispatch({ type: 'resource', resource, value }));
    });
  }

  openEditor(key) {
    const action = key ? this.getAction(key) : null;
    const rule = action?.rule ?? { manaCost: 0, unlimited: false, max: 1, reset: 'long-rest', die: '', outcomes: [] };
    const outcomes = (rule.outcomes ?? [])
      .map((row) => `${row.from}${row.to !== row.from ? `-${row.to}` : ''} = ${row.label}`)
      .join('\n');
    const dialog = this.dialog(
      action?.label || this.t('AddAction'),
      `
      ${!action ? `<label>${escape(this.t('ActionName'))}<input name="label" required maxlength="200" autofocus></label>` : ''}
      <label>${escape(this.t('ManaCost'))}<input name="manaCost" type="number" min="0" step="any" value="${rule.manaCost ?? ''}" required></label>
      <label class="fos-play__check"><input name="unlimited" type="checkbox" ${rule.unlimited ? 'checked' : ''}>${escape(this.t('Unlimited'))}</label>
      <div class="fos-play__rule-grid"><label>${escape(this.t('UsesPerPeriod'))}<input name="max" type="number" min="1" max="9999" step="1" value="${rule.max}" required></label>
      <label>${escape(this.t('Reset'))}<select name="reset">${RESET_PERIODS.map((period) => `<option value="${period}" ${rule.reset === period ? 'selected' : ''}>${escape(this.t(`Reset_${period}`))}</option>`).join('')}</select></label></div>
      <label>${escape(this.t('DecisionDie'))}<input name="die" value="${escape(rule.die)}" placeholder="1d6"></label>
      <label>${escape(this.t('Outcomes'))}<textarea name="outcomesText" rows="4" placeholder="1-2 = …&#10;3 = … (1w6)">${escape(outcomes)}</textarea></label>
      <label>${escape(this.t('Notes'))}<textarea name="note" rows="2">${escape(rule.note)}</textarea></label>
      ${action && this.state.configs[key] ? `<button type="button" data-remove>${escape(this.t(action.source === 'custom' ? 'RemoveAction' : 'ResetAction'))}</button>` : ''}
      <p class="fos-play__scope">${escape(this.t('ConfigureHelp'))}</p>`,
    );
    const grid = dialog.querySelector('.fos-play__rule-grid');
    const toggleLimit = () => {
      grid.hidden = dialog.querySelector('[name="unlimited"]').checked;
    };
    dialog.querySelector('[name="unlimited"]').addEventListener('change', toggleLimit);
    toggleLimit();
    dialog.querySelector('[data-remove]')?.addEventListener('click', () => {
      dialog.close();
      this.confirm(this.t('ConfirmRemove'), () => this.run(() => this.dispatch({ type: 'remove', key })));
    });
    dialog.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.target);
      const rule = Object.fromEntries(form);
      rule.unlimited = form.has('unlimited');
      const command = action
        ? { type: 'configure', key, rule }
        : {
            type: 'add',
            key: `custom:${Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')}`,
            label: rule.label,
            rule,
          };
      // Keep the editor open on validation/save failure, preserving the draft.
      const submit = dialog.querySelector('[type="submit"]');
      if (this.busy) return;
      submit.disabled = true;
      this.busy = true;
      this.tray.updateConnectButtons();
      try {
        await this.dispatch(command);
        dialog.close();
        this.render();
      } catch (error) {
        const msg = dialog.querySelector('[data-error]');
        msg.hidden = false;
        msg.textContent = this.t(
          ['InvalidFormula', 'InvalidOutcomes', 'InvalidAction'].includes(error.message)
            ? error.message
            : 'ActionFailed',
        );
      } finally {
        this.busy = false;
        submit.disabled = false;
        this.tray.updateConnectButtons();
        this.render();
      }
    });
  }
}
