// The table screen (docs/ui/UI_SPEC.md): a fixed 1920×1080 stage scaled to the
// window, the map behind, HUD regions on top. It shows one seat's view and
// turns clicks into engine Commands; every rule check is the engine's
// (dispatch, or a trial dispatch through view.legal). Until the remote server
// exists the game runs locally and the view can follow the active seat.

import './table.css';
import { activePlayer, AMBITIONS, dispatch, indexContent, newGame } from '../../game/engine';
import type { ActionKind, ActionPayload, AmbitionId, Command, GameState, PlayerCount, PlayerId, Resource } from '../../game/engine';
import { BASE_EFFECTS } from '../../game/cards/base';
import { LANGS, pickLang, translator } from '../../i18n';
import type { Lang } from '../../i18n';
import { loadContent } from '../content';
import { assetUrl, icon } from './assets';
import { defaultAllocation } from './battle';
import { actionCommand, battlePayload, clamp, IDLE, movePayload, startAction } from './intent';
import type { Intent } from './intent';
import { place, REGIONS, STAGE } from './layout';
import { mapSvg } from './mapview';
import {
  ambitionsPanel, button, cardLabel, cardPicker, courtPanel, esc, handPanel, header, localPanel, PICKER_PAGE, playerName, promptBar, recentPanel, rivalPanel,
} from './render';
import type { PickerGroup, PickerState } from './render';
import { legal, tableView } from './view';
import type { TableView } from './view';

type CourtPick = { kind: 'influence' | 'secure'; prelude?: Resource };

type Modal =
  | { type: 'picker'; picker: PickerState; court?: CourtPick }
  | { type: 'log' }
  | { type: 'settings' }
  | { type: 'decide'; args: string };

/** Handle returned to main.ts (and window.game for automated checks). */
export interface TableHandle {
  readonly state: GameState;
  send(cmd: Command): boolean;
  newGame(fields: Record<string, string>): void;
}

/** Mounts the table into `root`. */
export function mountTable(root: HTMLElement): TableHandle {
  const params = new URLSearchParams(location.search);
  let lang: Lang = pickLang(location.search, navigator.language);
  let t = translator(lang);
  const { content, source } = loadContent();
  const ix = indexContent(content, BASE_EFFECTS);

  let players = Number(params.get('players') ?? 3) as PlayerCount;
  let seed = Number(params.get('seed') ?? 1) || 1;
  let state: GameState = newGame(ix, { playerCount: players, seed, variant: 'base' });
  let history: GameState[] = [];
  let follow = params.get('seat') === null;
  let seatChoice: PlayerId = follow ? 0 : Number(params.get('seat')) || 0;

  let selected: string | null = null;
  let intent: Intent = IDLE;
  let modal: Modal | null = null;
  let toast: string | null = null;
  let toastTimer = 0;

  // ---- stage ----
  root.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'tbl';
  if (params.get('debug') === 'layout') shell.classList.add('debug-layout');
  if (params.get('motion') === 'off') shell.classList.add('no-motion');
  if (params.get('text') === 'large') shell.classList.add('large-text');
  const stage = document.createElement('div');
  stage.className = 'tbl-stage';
  const bg = assetUrl('map.background');
  if (bg) {
    stage.classList.add('has-bg');
    stage.style.backgroundImage = `url("${bg}")`;
  }
  shell.appendChild(stage);
  root.appendChild(shell);

  function fit(): void {
    const s = Math.min(window.innerWidth / STAGE.w, window.innerHeight / STAGE.h);
    const x = (window.innerWidth - STAGE.w * s) / 2;
    const y = (window.innerHeight - STAGE.h * s) / 2;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  }
  window.addEventListener('resize', fit);
  fit();

  // ---- helpers ----
  const local = (): PlayerId => (follow ? (activePlayer(state) ?? seatChoice) : Math.min(seatChoice, state.playerCount - 1));
  const myTurn = () => activePlayer(state) === local();
  const can = (cmd: Command) => legal(ix, state, cmd);
  const act = (payload: ActionPayload, prelude?: Resource): Command => actionCommand(local(), payload, prelude);

  function showToast(text: string): void {
    toast = text;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast = null;
      render();
    }, 3500);
  }

  function send(cmd: Command): boolean {
    try {
      const next = dispatch(ix, state, cmd);
      history.push(state);
      state = next;
      selected = null;
      intent = IDLE;
      if (modal?.type === 'picker' && modal.court) modal = null;
      render();
      return true;
    } catch (e) {
      showToast(t('error', { msg: (e as Error).message }));
      render();
      return false;
    }
  }

  function restart(): void {
    state = newGame(ix, { playerCount: players, seed, variant: 'base' });
    history = [];
    selected = null;
    intent = IDLE;
    modal = null;
  }

  // ---- what the current step accepts ----
  function rivalsIn(v: TableView, system: string): PlayerId[] {
    const s = v.systems.find((x) => x.id === system);
    if (!s) return [];
    const me = local();
    return [...new Set([...s.ships.map((x) => x.player), ...s.buildings.map((b) => b.owner)])].filter((p) => p !== me);
  }

  function validSystems(v: TableView): Set<string> {
    const out = new Set<string>();
    if (!myTurn()) return out;
    const me = local();
    const live = v.systems.filter((s) => s.inPlay);
    const i = intent;
    if (i.step === 'system') {
      for (const s of live) {
        const ok =
          i.kind === 'tax' ? s.buildings.some((b) => b.type === 'city') && [...new Set(s.buildings.map((b) => b.owner))].some((o) => can(act({ kind: 'tax', system: s.id, cityOwner: o }, i.prelude)))
          : i.kind === 'build' ? (['ship', 'city', 'starport'] as const).some((what) => can(act({ kind: 'build', system: s.id, what }, i.prelude)))
          : i.kind === 'repair' ? (['ship', 'building'] as const).some((target) => can(act({ kind: 'repair', system: s.id, target }, i.prelude)))
          : s.ships.some((x) => x.player === me) && rivalsIn(v, s.id).some((r) => can(act({ kind: 'battle', system: s.id, target: r, dice: { skirmish: 1 } }, i.prelude)));
        if (ok) out.add(s.id);
      }
    } else if (i.step === 'from') {
      for (const s of live) if (s.ships.some((x) => x.player === me)) out.add(s.id);
    } else if (i.step === 'to') {
      const mine = v.systems.find((s) => s.id === i.from)?.ships.find((x) => x.player === me);
      const fresh = mine && mine.fresh > 0 ? 1 : 0;
      for (const s of live) {
        if (can(act({ kind: 'move', from: i.from, to: s.id, ships: fresh, ...(fresh ? {} : { damaged: 1 }) }, i.prelude))) out.add(s.id);
      }
    }
    return out;
  }

  function courtPickable(i: Intent): Set<number> {
    const out = new Set<number>();
    if (i.step !== 'court' || !myTurn()) return out;
    state.court.forEach((_, slot) => {
      if (can(act({ kind: i.kind, courtSlot: slot }, i.prelude))) out.add(slot);
    });
    return out;
  }

  function spendableSlots(v: TableView): Set<number> {
    const out = new Set<number>();
    if (!myTurn() || !v.budget?.preludeOpen || intent.step !== 'idle') return out;
    for (const s of v.players[local()].slots) if (s.resource && !s.locked) out.add(s.index);
    return out;
  }

  // ---- prompt and action panel ----
  function prompt(v: TableView): string {
    if (v.phase === 'gameOver') return t('prompt.gameOver', { list: v.winners.map((w) => playerName(t, w)).join(', ') });
    if (!myTurn() && v.active !== null) return t('prompt.waiting', { name: playerName(t, v.active) });
    switch (intent.step) {
      case 'system':
        return t('prompt.pick.system');
      case 'from':
        return t('prompt.pick.from');
      case 'to':
        return t('prompt.pick.to');
      case 'court':
        return t('prompt.pick.court');
    }
    switch (v.phase) {
      case 'lead':
        return t('prompt.lead');
      case 'follow':
        return t('prompt.follow');
      case 'actions':
        return t('prompt.actions', { n: v.budget?.remaining ?? 0 });
      case 'allocate':
        return t('prompt.allocate');
      case 'decide':
        return t('prompt.decide');
      default:
        return t('prompt.draft');
    }
  }

  /** The explanation under the prompt: the selected card, or what this step means. */
  function promptSub(v: TableView): string {
    if (v.phase === 'gameOver') return '';
    if (!myTurn()) return t('sub.waiting');
    const card = selected ? v.hand.find((h) => h.card === selected) : undefined;
    if (card && (v.phase === 'lead' || v.phase === 'follow')) {
      return `${t('sub.card', { card: cardLabel(t, card), pips: card.pips, kinds: card.kinds.map((k) => t(`action.${k}`)).join(', ') })} — ${t(v.phase === 'lead' ? 'sub.lead' : 'sub.follow')}`;
    }
    if (v.phase === 'lead') return t('sub.lead');
    if (v.phase === 'follow') return t('sub.follow');
    if (v.phase === 'actions' && intent.step === 'idle') return t('sub.actions');
    return '';
  }

  function kindButtons(kinds: ActionKind[], prelude: Resource | undefined, enabled: boolean): string {
    return kinds.map((k) => button('kind', t(`action.${k}`), { args: { kind: k, ...(prelude ? { prelude } : {}) }, disabled: !enabled })).join('');
  }

  function stepper(name: string, label: string, value: number): string {
    return `<span class="stepper"><span>${esc(label)}</span>${button('step', '−', { args: { name, d: -1 } })}<span class="num">${value}</span>${button('step', '+', { args: { name, d: 1 } })}</span>`;
  }

  function actionsPanel(v: TableView): string {
    const me = local();
    const cancel = button('cancel', t('btn.cancel'));
    if (v.phase === 'gameOver' || !myTurn()) return `<div class="hint">${esc(prompt(v))}</div>`;

    if (v.phase === 'lead' || v.phase === 'follow') {
      const card = selected;
      const chosenCard = card ? v.hand.find((x) => x.card === card) : undefined;
      let h = `<div class="hint">${esc(chosenCard ? cardLabel(t, chosenCard) : t('play.selectCard'))}</div><div class="btn-grid">`;
      if (v.phase === 'lead') {
        const def = card ? ix.actionCards.get(card) : undefined;
        const decl = def ? content.declareByNumber[String(def.number)] : undefined;
        h += button('lead', t('play.lead'), { cls: 'primary', disabled: !card || !can({ type: 'lead', player: me, card }) });
        if (decl === 'any') {
          for (const a of AMBITIONS) {
            h += button('lead-declare', `${t('play.leadDeclare')}: ${t(`ambition.${a}`)}`, { args: { ambition: a }, disabled: !card || !can({ type: 'lead', player: me, card, declare: true, ambition: a }) });
          }
        } else {
          h += button('lead-declare', t('play.leadDeclare'), { disabled: !card || !can({ type: 'lead', player: me, card, declare: true }) });
        }
        h += button('pass', t('play.pass'), { disabled: !can({ type: 'pass', player: me }) });
        if (v.canMulligan) h += button('mulligan', t('play.mulligan'));
      } else {
        for (const mode of ['surpass', 'pivot', 'copy'] as const) {
          h += button('follow', t(`play.${mode}`), { args: { mode }, cls: mode === 'surpass' ? 'primary' : '', disabled: !card || !can({ type: 'follow', player: me, card, mode }) });
        }
      }
      return h + '</div>';
    }

    if (v.phase === 'allocate' && v.battle) {
      const b = v.battle;
      const summary = t('battle.summary', { hit: b.totals.hit, buildingHit: b.totals.buildingHit, selfHit: b.totals.selfHit, intercept: b.interceptHits, key: b.totals.key });
      return `<div class="hint">${esc(`${b.system}: ${playerName(t, b.attacker)} → ${playerName(t, b.target)}`)}</div><div class="hint">${esc(summary)}</div><div>${button('allocate', t('battle.assign'), { cls: 'primary' })}</div>`;
    }

    if (v.phase === 'decide' && v.decision) {
      return `<div class="hint">${esc(`${v.decision.card} · ${v.decision.effect}`)}</div><div class="btn-grid two">${button('decide-open', t('decide.title'), { cls: 'primary' })}${button('decline', t('decide.decline'))}</div>`;
    }

    if (v.phase !== 'actions' || !v.budget) return `<div class="hint">${esc(prompt(v))}</div>`;
    const b = v.budget;
    const i = intent;
    switch (i.step) {
      case 'idle':
        return `<div class="hint">${esc(b.preludeOpen ? t('play.preludeHint') : t('prompt.actions', { n: b.remaining }))}</div><div class="btn-grid">${kindButtons(b.kinds, undefined, b.remaining > 0)}</div>`;
      case 'choose':
        return `<div class="hint">${esc(t('play.preludeWith', { res: t(`resource.${i.prelude}`) }))}</div><div class="btn-grid">${kindButtons(i.kinds, i.prelude, true)}${cancel}</div>`;
      case 'system':
      case 'from':
      case 'to':
      case 'court':
        return `<div class="hint">${esc(prompt(v))}</div><div class="btn-grid">${cancel}</div>`;
      case 'build': {
        const opts = (['ship', 'city', 'starport'] as const)
          .map((what) => button('build', t(`build.${what}`), { args: { what }, disabled: !can(act({ kind: 'build', system: i.system, what }, i.prelude)) }))
          .join('');
        return `<div class="hint">${esc(`${t('action.build')} · ${i.system}`)}</div><div class="btn-grid">${opts}${cancel}</div>`;
      }
      case 'repair': {
        const opts = (['ship', 'building'] as const)
          .map((target) => button('repair', t(`repair.${target}`), { args: { target }, disabled: !can(act({ kind: 'repair', system: i.system, target }, i.prelude)) }))
          .join('');
        return `<div class="hint">${esc(`${t('action.repair')} · ${i.system}`)}</div><div class="btn-grid">${opts}${cancel}</div>`;
      }
      case 'tax': {
        const owners = [...new Set(v.systems.find((s) => s.id === i.system)?.buildings.filter((x) => x.type === 'city').map((x) => x.owner) ?? [])];
        const opts = owners
          .map((o) => button('tax', playerName(t, o), { args: { owner: o }, disabled: !can(act({ kind: 'tax', system: i.system, cityOwner: o }, i.prelude)) }))
          .join('');
        return `<div class="hint">${esc(`${t('action.tax')} · ${i.system}`)}</div><div class="btn-grid">${opts}${cancel}</div>`;
      }
      case 'move': {
        const ok = can(act(movePayload(i), i.prelude));
        return `<div class="hint">${esc(`${t('action.move')} · ${i.from} → ${i.to}`)}</div>
          <div class="opt-row">${stepper('ships', t('move.ships'), i.ships)}${stepper('damaged', t('move.damaged'), i.damaged)}</div>
          <div class="btn-grid two">${button('do-move', t('btn.confirm'), { cls: 'primary', disabled: !ok })}${cancel}</div>`;
      }
      case 'battle': {
        const targets = rivalsIn(v, i.system)
          .map((r) => button('target', playerName(t, r), { args: { player: r }, cls: i.target === r ? 'on' : '' }))
          .join('');
        const payload = battlePayload(i);
        const ok = payload !== null && can(act(payload, i.prelude));
        return `<div class="hint">${esc(`${t('action.battle')} · ${i.system} · ${t('battle.target')}`)}</div>
          <div class="opt-row">${targets}</div>
          <div class="opt-row">${(['skirmish', 'assault', 'raid'] as const).map((d) => stepper(d, t(`battle.dice.${d}`), i.dice[d])).join('')}</div>
          <div class="btn-grid two">${button('do-battle', t('battle.go'), { cls: 'primary', disabled: !ok })}${cancel}</div>`;
      }
    }
  }

  // ---- modals ----
  function courtGroups(v: TableView): PickerGroup[] {
    const def = (id: string) => {
      const d = ix.courtCards.get(id);
      return { card: id, kind: d?.kind ?? null, resource: d?.resource ?? null, keys: d?.keys ?? 0 };
    };
    return [
      { owner: null, label: t('court'), cards: v.court.map((c) => def(c.card)) },
      ...v.players.map((p) => ({ owner: p.id, label: playerName(t, p.id), cards: p.court.map(def) })),
    ];
  }

  function openPicker(v: TableView, title: string, active: number, opts: Partial<PickerState> = {}, court?: CourtPick): void {
    modal = {
      type: 'picker',
      court,
      picker: { title, actor: null, groups: courtGroups(v), active, page: 0, selectable: null, selected: null, allowDiscard: false, ...opts },
    };
  }

  function modalHtml(v: TableView): string {
    if (!modal) return '';
    let inner = '';
    if (modal.type === 'picker') inner = cardPicker(modal.picker, t);
    else if (modal.type === 'log') {
      const items = state.log.slice(-120).reverse().map((l) => `<li>[${l.chapter}] ${esc(l.text)}</li>`).join('');
      inner = `<h2 id="modal-title">${esc(t('log.title'))}</h2><div></div><div class="modal-body"><ol class="log-list" reversed>${items}</ol></div><div class="modal-foot">${button('close-modal', t('btn.back'))}</div>`;
    } else if (modal.type === 'settings') {
      const seatOpts = v.players.map((p) => `<option value="${p.id}"${seatChoice === p.id ? ' selected' : ''}>${esc(playerName(t, p.id))}</option>`).join('');
      const countOpts = [2, 3, 4].map((n) => `<option${players === n ? ' selected' : ''}>${n}</option>`).join('');
      const langOpts = LANGS.map((l) => `<option${lang === l ? ' selected' : ''}>${l}</option>`).join('');
      inner = `<h2 id="modal-title">${esc(t('settings.title'))}</h2><div></div>
        <div class="settings-grid">
          <label for="set-follow">${esc(t('settings.follow'))}</label><input id="set-follow" type="checkbox" data-set="follow"${follow ? ' checked' : ''}>
          <label for="set-seat">${esc(t('settings.view'))}</label><select id="set-seat" data-set="seat"${follow ? ' disabled' : ''}>${seatOpts}</select>
          <label for="set-lang">${esc(t('settings.lang'))}</label><select id="set-lang" data-set="lang">${langOpts}</select>
          <label for="set-players">${esc(t('settings.players'))}</label><select id="set-players" data-set="players">${countOpts}</select>
          <label for="set-seed">${esc(t('settings.seed'))}</label><input id="set-seed" type="number" min="1" value="${seed}" data-set="seed">
          <span></span><span>${button('new-game', t('settings.newGame'), { cls: 'primary' })}</span>
          <span></span><a href="?">${esc(t('settings.debug'))}</a>
        </div>
        <div class="modal-foot">${button('close-modal', t('btn.back'))}</div>`;
    } else if (modal.type === 'decide' && v.decision) {
      inner = `<h2 id="modal-title">${esc(t('decide.title'))}</h2><div></div>
        <div class="modal-body"><pre>${esc(JSON.stringify(v.decision, null, 1))}</pre><p>${esc(t('decide.args'))}</p><textarea data-set="decide-args">${esc(modal.args)}</textarea></div>
        <div class="modal-foot">${button('close-modal', t('btn.back'))}${button('decline', t('decide.decline'))}${button('decide-send', t('decide.send'), { cls: 'primary' })}</div>`;
    }
    return `<div class="overlay" data-act="close-modal"></div><div class="glass modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" style="${place(REGIONS.modal)}">${inner}</div>`;
  }

  // ---- render ----
  function focusKey(): string | null {
    const el = document.activeElement as HTMLElement | null;
    if (!el || !stage.contains(el)) return null;
    const d = el.dataset;
    return d.act ? JSON.stringify(d) : d.sys ? `sys:${d.sys}` : d.set ? `set:${d.set}` : null;
  }

  function restoreFocus(key: string | null): void {
    if (!key) return;
    let el: HTMLElement | null = null;
    if (key.startsWith('sys:')) el = stage.querySelector(`[data-sys="${CSS.escape(key.slice(4))}"]`);
    else if (key.startsWith('set:')) el = stage.querySelector(`[data-set="${CSS.escape(key.slice(4))}"]`);
    else el = [...stage.querySelectorAll<HTMLElement>('[data-act]')].find((x) => JSON.stringify(x.dataset) === key) ?? null;
    el?.focus();
  }

  function render(): void {
    const key = focusKey();
    const me = local();
    const v = tableView(ix, state, me);
    const valid = validSystems(v);
    const chosen = new Set<string>();
    if (intent.step === 'to' || intent.step === 'move') chosen.add(intent.from);
    if (intent.step === 'move') chosen.add(intent.to);
    if (intent.step === 'build' || intent.step === 'repair' || intent.step === 'tax' || intent.step === 'battle') chosen.add(intent.system);

    const rivals = v.rivals.map((r) => rivalPanel(v, v.players[r], t)).join('');
    const canEnd = myTurn() && v.phase === 'actions' && intent.step === 'idle' && can({ type: 'endTurn', player: me });
    const confirmRow = `<div class="confirm-row">
        ${button('undo', '', { cls: 'icon', title: t('btn.undo'), html: icon('undo'), disabled: history.length === 0 })}
        ${button('end-turn', t('play.endTurn'), { cls: 'primary end', title: t('play.endTurn'), html: `${icon('confirm')}<span>${esc(t('play.endTurn'))}</span>`, disabled: !canEnd })}
      </div>`;

    stage.innerHTML = `<div class="tbl-stars"></div>
      <div class="region header" data-region="header" style="${place(REGIONS.header)}">${header(v, t, source === 'example')}</div>
      <div class="region prompt-wrap" data-region="prompt" style="${place(REGIONS.prompt)}">${promptBar(prompt(v), promptSub(v), myTurn())}</div>
      <div class="map-area glass" data-region="map" style="${place(REGIONS.map)}">${mapSvg(ix, v, valid, chosen, t)}</div>
      <div class="region rivals" data-region="rivals" style="${place(REGIONS.rivals)}">${rivals}</div>
      <div class="region glass ambitions" data-region="ambitions" style="${place(REGIONS.ambitions)}">${ambitionsPanel(v, t)}</div>
      <div class="region glass court" data-region="court" style="${place(REGIONS.court)}">${courtPanel(v, t, courtPickable(intent))}</div>
      <div class="region glass recent" data-region="recent" style="${place(REGIONS.recent)}">${recentPanel(v, t)}</div>
      <div class="region" data-region="local" style="${place(REGIONS.local)}">${localPanel(v.players[me], t, spendableSlots(v), null)}</div>
      <div class="region glass hand" data-region="hand" style="${place(REGIONS.hand)}">${handPanel(ix, v, t, selected, myTurn())}</div>
      <div class="region glass actions${myTurn() ? ' mine' : ''}" data-region="actions" style="${place(REGIONS.actions)}"><div class="actions-body">${actionsPanel(v)}</div>${confirmRow}</div>
      ${modalHtml(v)}
      ${toast ? `<div class="toast" role="alert">${esc(toast)}</div>` : ''}`;
    restoreFocus(key);
    const dialog = stage.querySelector('.modal');
    if (dialog && !dialog.contains(document.activeElement)) {
      dialog.querySelector<HTMLElement>('button:not(:disabled), select, input, textarea')?.focus();
    }
  }

  // ---- input ----
  function pickSystem(id: string): void {
    const v = tableView(ix, state, local());
    if (!validSystems(v).has(id)) return;
    const i = intent;
    if (i.step === 'system') {
      if (i.kind === 'battle') {
        intent = { step: 'battle', system: id, target: rivalsIn(v, id)[0] ?? null, dice: { skirmish: 0, assault: 0, raid: 0 }, prelude: i.prelude };
      } else if (i.kind === 'tax') {
        const owners = [...new Set(v.systems.find((s) => s.id === id)?.buildings.filter((b) => b.type === 'city').map((b) => b.owner))];
        if (owners.length === 1) return void send(act({ kind: 'tax', system: id, cityOwner: owners[0] }, i.prelude));
        intent = { step: 'tax', system: id, prelude: i.prelude };
      } else intent = { step: i.kind, system: id, prelude: i.prelude };
    } else if (i.step === 'from') intent = { step: 'to', from: id, prelude: i.prelude };
    else if (i.step === 'to') {
      const mine = v.systems.find((s) => s.id === i.from)?.ships.find((x) => x.player === local());
      intent = { step: 'move', from: i.from, to: id, ships: mine?.fresh ?? 0, damaged: mine && mine.fresh === 0 ? mine.damaged : 0, prelude: i.prelude };
    }
    render();
  }

  /** Moves the picker by `dir` pages, staying within the active tab's pages. */
  function turnPage(dir: number): void {
    if (modal?.type !== 'picker') return;
    const m = modal.picker;
    const last = Math.max(0, Math.ceil(m.groups[m.active].cards.length / PICKER_PAGE) - 1);
    modal.picker = { ...m, page: Math.max(0, Math.min(last, m.page + dir)) };
  }

  function confirmPick(): void {
    if (modal?.type !== 'picker' || !modal.court || !modal.picker.selected) return;
    const card = modal.picker.selected;
    const { kind, prelude } = modal.court;
    modal = null;
    const slot = state.court.findIndex((c) => c.card === card);
    if (slot >= 0) send(act({ kind, courtSlot: slot }, prelude));
    else render();
  }

  function onAct(el: HTMLElement): void {
    const d = el.dataset;
    const me = local();
    const v = tableView(ix, state, me);
    switch (d.act) {
      case 'hand':
        selected = selected === d.card ? null : d.card!;
        break;
      case 'lead':
        if (selected) send({ type: 'lead', player: me, card: selected });
        return;
      case 'lead-declare':
        if (selected) send({ type: 'lead', player: me, card: selected, declare: true, ...(d.ambition ? { ambition: d.ambition as AmbitionId } : {}) });
        return;
      case 'pass':
        send({ type: 'pass', player: me });
        return;
      case 'mulligan':
        send({ type: 'mulligan', player: me });
        return;
      case 'follow':
        if (selected) send({ type: 'follow', player: me, card: selected, mode: d.mode as 'surpass' | 'pivot' | 'copy' });
        return;
      case 'kind': {
        const next = startAction(d.kind as ActionKind, d.prelude as Resource | undefined);
        intent = next;
        if (next.step === 'court') {
          const ok = courtPickable(next);
          openPicker(v, t('prompt.pick.court'), 0, { actor: me, selectable: new Set(v.court.filter((c) => ok.has(c.slot)).map((c) => c.card)) }, { kind: next.kind, prelude: next.prelude });
        }
        break;
      }
      case 'spend': {
        const slot = v.players[me].slots[Number(d.slot)];
        if (!slot?.resource) return;
        const rule = content.resourceActions[slot.resource];
        if ('grantKind' in rule) return void send({ type: 'prelude', player: me, resource: slot.resource });
        const kinds = 'actions' in rule ? rule.actions : (v.lead?.kinds ?? []);
        intent = { step: 'choose', prelude: slot.resource, kinds };
        break;
      }
      case 'cancel':
        intent = IDLE;
        if (modal?.type === 'picker' && modal.court) modal = null;
        break;
      case 'build':
        if (intent.step === 'build') send(act({ kind: 'build', system: intent.system, what: d.what as 'ship' | 'city' | 'starport' }, intent.prelude));
        return;
      case 'repair':
        if (intent.step === 'repair') send(act({ kind: 'repair', system: intent.system, target: d.target as 'ship' | 'building' }, intent.prelude));
        return;
      case 'tax':
        if (intent.step === 'tax') send(act({ kind: 'tax', system: intent.system, cityOwner: Number(d.owner) }, intent.prelude));
        return;
      case 'step': {
        const n = Number(d.d);
        if (intent.step === 'move') {
          const from = intent.from;
          const mine = v.systems.find((s) => s.id === from)?.ships.find((x) => x.player === me);
          intent = d.name === 'ships'
            ? { ...intent, ships: clamp(intent.ships + n, mine?.fresh ?? 0) }
            : { ...intent, damaged: clamp(intent.damaged + n, mine?.damaged ?? 0) };
        } else if (intent.step === 'battle') {
          const die = d.name as 'skirmish' | 'assault' | 'raid';
          intent = { ...intent, dice: { ...intent.dice, [die]: clamp(intent.dice[die] + n, 9) } };
        }
        break;
      }
      case 'target':
        if (intent.step === 'battle') intent = { ...intent, target: Number(d.player) };
        break;
      case 'do-move':
        if (intent.step === 'move') send(act(movePayload(intent), intent.prelude));
        return;
      case 'do-battle':
        if (intent.step === 'battle') {
          const p = battlePayload(intent);
          if (p) send(act(p, intent.prelude));
        }
        return;
      case 'allocate':
        if (state.phase.type === 'allocate') send({ type: 'allocate', player: me, allocation: defaultAllocation(state, state.phase.battle) });
        return;
      case 'decide-open':
        modal = { type: 'decide', args: '{}' };
        break;
      case 'decline':
        modal = null;
        send({ type: 'decide', player: me, args: {} });
        return;
      case 'decide-send':
        if (modal?.type === 'decide') {
          try {
            const args = JSON.parse(modal.args) as Record<string, unknown>;
            modal = null;
            send({ type: 'decide', player: me, args });
          } catch (e) {
            showToast(t('error', { msg: (e as Error).message }));
            render();
          }
        }
        return;
      case 'end-turn':
        send({ type: 'endTurn', player: me });
        return;
      case 'undo': {
        const prev = history.pop();
        if (prev) state = prev;
        selected = null;
        intent = IDLE;
        modal = null;
        break;
      }
      case 'court': {
        const slot = Number(d.slot);
        if (courtPickable(intent).has(slot) && intent.step === 'court') return void send(act({ kind: intent.kind, courtSlot: slot }, intent.prelude));
        openPicker(v, t('modal.courtTitle'), 0, { page: Math.floor(slot / PICKER_PAGE) });
        break;
      }
      case 'court-view':
        openPicker(v, t('modal.courtTitle'), 0);
        break;
      case 'seat-cards':
        openPicker(v, t('modal.ownedTitle'), 1 + Number(d.player));
        break;
      case 'tab':
        if (modal?.type === 'picker') modal.picker = { ...modal.picker, active: Number(d.tab), page: 0 };
        break;
      case 'page':
        turnPage(Number(d.dir));
        break;
      case 'pick':
        if (modal?.type === 'picker' && modal.picker.selectable?.has(d.card!)) {
          const again = modal.picker.selected === d.card;
          modal.picker = { ...modal.picker, selected: d.card! };
          if (again) return confirmPick();
        }
        break;
      case 'pick-confirm':
        return confirmPick();
      case 'log':
        modal = { type: 'log' };
        break;
      case 'settings':
        modal = { type: 'settings' };
        break;
      case 'new-game':
        restart();
        break;
      case 'close-modal':
        if (modal?.type === 'picker' && modal.court) intent = IDLE;
        modal = null;
        break;
      default:
        return;
    }
    render();
  }

  stage.addEventListener('click', (e) => {
    const target = e.target as Element;
    const sys = target.closest('[data-sys]') as HTMLElement | null;
    if (sys) return pickSystem(sys.dataset.sys!);
    const el = target.closest('[data-act]') as HTMLElement | null;
    if (el && !(el as HTMLButtonElement).disabled) onAct(el);
  });

  stage.addEventListener('keydown', (e) => {
    const el = e.target as HTMLElement;
    if ((e.key === 'Enter' || e.key === ' ') && el.dataset.sys) {
      e.preventDefault();
      pickSystem(el.dataset.sys);
    }
  });

  stage.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    switch (el.dataset.set) {
      case 'follow':
        follow = el.checked;
        break;
      case 'seat':
        seatChoice = Number(el.value);
        break;
      case 'lang':
        lang = el.value as Lang;
        t = translator(lang);
        break;
      case 'players':
        players = Number(el.value) as PlayerCount;
        break;
      case 'seed':
        seed = Number(el.value) || 1;
        break;
      default:
        return;
    }
    render();
  });

  stage.addEventListener('input', (e) => {
    const el = e.target as HTMLTextAreaElement;
    if (el.dataset.set === 'decide-args' && modal?.type === 'decide') modal.args = el.value;
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modal) {
        if (modal.type === 'picker' && modal.court) intent = IDLE;
        modal = null;
      } else if (intent.step !== 'idle') intent = IDLE;
      else selected = null;
      render();
    } else if (modal?.type === 'picker' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      turnPage(e.key === 'ArrowLeft' ? -1 : 1);
      render();
    }
  });

  stage.addEventListener('wheel', (e) => {
    if (modal?.type !== 'picker') return;
    turnPage(e.deltaY > 0 ? 1 : -1);
    render();
  }, { passive: true });

  render();

  return {
    get state() {
      return state;
    },
    send,
    newGame(fields: Record<string, string>) {
      if (fields['g-players']) players = Number(fields['g-players']) as PlayerCount;
      if (fields['g-seed']) seed = Number(fields['g-seed']) || 1;
      restart();
      render();
    },
  };
}
