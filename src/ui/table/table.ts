// The table screen (docs/ui/UI_SPEC.md): a fixed 1920×1080 stage scaled to the
// window, the map behind, HUD regions on top. It shows one seat's view and
// turns clicks into engine Commands; every rule check is the engine's
// (dispatch, or a trial dispatch through view.legal). Until the remote server
// exists the game runs locally and the view can follow the active seat.

import './table.css';
import { activePlayer, AMBITIONS, dispatch, effectOf, indexContent, newGame } from '../../game/engine';
import type { ActionKind, ActionPayload, AmbitionId, Command, GameContent, GameState, PlayerCount, PlayerId, RaidTake, Resource } from '../../game/engine';
import { BASE_EFFECTS } from '../../game/cards/base';
import { LANGS, pickLang, translator } from '../../i18n';
import type { Lang } from '../../i18n';
import { loadContent } from '../content';
import { assetUrl, icon } from './assets';
import { defaultAllocation } from './battle';
import { createBoard3D } from './board3d';
import { cardPowers, decisionOptions } from './decide';
import type { PowerOption } from './decide';
import type { DecisionOption, DecisionPart } from './decide';
import { detailHtml } from './details';
import type { DetailTarget } from './details';
import { actionCommand, battlePayload, clamp, IDLE, movePayload, startAction } from './intent';
import type { Intent } from './intent';
import { place, REGIONS, STAGE, placeUp } from './layout';
import { mapSvg } from './mapview';
import {
  ambitionsStrip, button, cardLabel, playedText, cardPicker, courtFace, courtPanel, declareGlyphs, esc, handPanel, header, largeCard, localPanel, ownedPanel, PICKER_PAGE, playerName, rivalPanel,
} from './render';
import type { PickerGroup, PickerState } from './render';
import { legal, othersTurn, tableView } from './view';
import type { TableView } from './view';

type CourtPick = { kind: 'influence' | 'secure'; prelude?: Resource };

type Modal =
  | { type: 'picker'; picker: PickerState; court?: CourtPick }
  | { type: 'log' }
  | { type: 'settings' }
  | { type: 'detail'; target: DetailTarget }
  | { type: 'decide'; args: string; options: DecisionOption[] }
  | { type: 'powers'; options: PowerOption[] };

/** Handle returned to main.ts (and window.game for automated checks). */
export interface TableHandle {
  readonly state: GameState;
  send(cmd: Command): boolean;
  newGame(fields: Record<string, string>): void;
  /** Online: shows a state saved by another screen. */
  load(next: GameState): void;
}

/**
 * Online use (docs/online-play.md): one player's screen on a shared game.
 * Without it the table is the local one, where the view follows the active seat.
 */
export interface TableOnline {
  /** The game content (read from the database, not bundled). */
  content: GameContent;
  /** The shared game state to show first. */
  state: GameState;
  /** The seat this screen plays: only its commands are sent. */
  seat: PlayerId;
  /** Saves a new state after a command; a rejection shows the error and the shared state comes back. */
  commit: (next: GameState, cmd: Command) => Promise<void>;
}

/** Mounts the table into `root`. */
export function mountTable(root: HTMLElement, online?: TableOnline): TableHandle {
  const params = new URLSearchParams(location.search);
  let lang: Lang = pickLang(location.search, navigator.language);
  let t = translator(lang);
  const { content, source } = online ? { content: online.content, source: 'owner' as const } : loadContent();
  const ix = indexContent(content, BASE_EFFECTS);

  let players = Number(params.get('players') ?? 3) as PlayerCount;
  let seed = Number(params.get('seed') ?? 1) || 1;
  let state: GameState = online ? online.state : newGame(ix, { playerCount: players, seed, variant: 'base' });
  let history: GameState[] = [];
  // Online the seat is fixed; locally the view follows the active seat unless ?seat= pins it.
  let follow = online ? false : params.get('seat') === null;
  let seatChoice: PlayerId = online ? online.seat : follow ? 0 : Number(params.get('seat')) || 0;

  let selected: string | null = null;
  /** Following: the second card discarded to seize the initiative, and whether the next hand click picks it. */
  let seizeWith: string | null = null;
  let seizePick = false;
  /** Allocating: what the rolled keys steal, in order. */
  let raid: RaidTake[] = [];
  let intent: Intent = IDLE;
  /** The move being Catapulted further, kept while the next system is picked. */
  let pendingMove: Extract<Intent, { step: 'move' }> | null = null;
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

  let scale = 1;
  function fit(): void {
    const s = Math.min(window.innerWidth / STAGE.w, window.innerHeight / STAGE.h);
    scale = s;
    const x = (window.innerWidth - STAGE.w * s) / 2;
    const y = (window.innerHeight - STAGE.h * s) / 2;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    // The 3D map fills the window; it is centred on the area the panels leave free.
    const m = REGIONS.map;
    board3d?.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio, { x: x + m.x * s, y: y + m.y * s, w: m.w * s, h: m.h * s });
  }
  window.addEventListener('resize', fit);

  // ---- 3D map (default; ?map=2d or no WebGL keeps the 2D map) ----
  /** Calibration of the owner's board picture (?debug=calibrate): systems to click, in order, and the clicks so far. */
  const calibrating = params.get('debug') === 'calibrate';
  const calib = { order: [] as string[], i: 0, points: {} as Record<string, { x: number; y: number }> };
  const board3d = params.get('map') === '2d'
    ? null
    : createBoard3D(ix, {
        motion: params.get('motion') !== 'off',
        onPick: (id) => pickSystem(id),
        ...(calibrating
          ? {
              onCalibrate: (fx: number, fy: number) => {
                const id = calib.order[calib.i];
                if (!id || !board3d) return;
                const size = board3d.pictureSize();
                calib.points[id] = { x: Math.round(fx * size.width), y: Math.round(fy * size.height) };
                calib.i++;
                render();
              },
            }
          : {}),
      });
  if (board3d) {
    // Behind the stage, as large as the window: the interface is drawn in front of it.
    shell.classList.add('has-3d');
    shell.insertBefore(board3d.canvas, stage);
  }
  calib.order = ix.content.map.systems.map((x) => x.id);
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
      // Online, a screen only plays its own seat.
      if (online && cmd.player !== online.seat) throw new Error(t('online.notYours'));
      const next = dispatch(ix, state, cmd);
      if (!online) history.push(state);
      state = next;
      resetChoices();
      if (modal?.type === 'picker' && modal.court) modal = null;
      render();
      if (online)
        online.commit(next, cmd).catch((e: Error) => {
          showToast(t('error', { msg: e.message }));
          render();
        });
      return true;
    } catch (e) {
      showToast(t('error', { msg: (e as Error).message }));
      render();
      return false;
    }
  }

  /** Clears every half-made choice (after a command, an undo or a new game). */
  function resetChoices(): void {
    selected = null;
    seizeWith = null;
    seizePick = false;
    raid = [];
    pendingMove = null;
    intent = IDLE;
  }

  function restart(): void {
    state = newGame(ix, { playerCount: players, seed, variant: 'base' });
    history = [];
    resetChoices();
    modal = null;
  }

  /** The follow command for the selected card, with the seize card when one is chosen. */
  function followCmd(card: string, mode: 'surpass' | 'pivot' | 'copy'): Command {
    return { type: 'follow', player: local(), card, mode, ...(seizeWith && seizeWith !== card ? { seizeWith } : {}) };
  }

  /** The proposed allocation for the pending battle, with the chosen raid. */
  function allocation() {
    if (state.phase.type !== 'allocate') return null;
    return { ...defaultAllocation(state, state.phase.battle), raid: [...raid] };
  }

  /** A part of a Decision answer as text. */
  /** Whether the local player holds a card with a power usable in the current phase (the list itself is built on click). */
  function hasPowers(v: TableView): boolean {
    if (v.phase !== 'actions' && v.phase !== 'allocate') return false;
    const pl = state.players[local()];
    return [...pl.court, ...pl.lore, ...(pl.leader ? [pl.leader] : [])].some((c) => {
      const e = effectOf(ix, c);
      return v.phase === 'actions' ? !!(e?.prelude || e?.actions) : !!e?.reroll;
    });
  }

  function partText(p: DecisionPart): string {
    const label = t(`decide.key.${p.key}`);
    const v = p.value;
    const value =
      p.kind === 'player' ? playerName(t, v as number)
      : p.kind === 'resource' ? t(`resource.${v}`)
      : p.kind === 'ambition' ? t(`ambition.${v}`)
      : p.kind === 'court' ? (Array.isArray(v) ? v : [v]).map((i) => state.court[i as number]?.card ?? '?').join(', ')
      : p.kind === 'cards' ? (v as string[]).join(', ')
      : p.kind === 'index' ? `#${(v as number) + 1}`
      : p.kind === 'ships' ? (v as { from: string; ships: number }[]).map((m) => t('decide.shipsFrom', { n: m.ships, from: m.from })).join(', ')
      : p.kind === 'flag' ? ''
      : p.kind === 'slot' ? `#${(v as number) + 1}`
      : p.kind === 'resources' ? (v as string[]).map((r) => t(`resource.${r}`)).join(', ')
      : p.kind === 'dice' ? t('powers.dice', { n: (v as number[]).length })
      : String(v);
    return value ? `${label}: ${value}` : label;
  }

  /** Systems the moving ships may enter next, Catapulting through `via`. */
  function moveTargets(v: TableView, from: string, via: string[], prelude?: Resource): Set<string> {
    const out = new Set<string>();
    const mine = v.systems.find((s) => s.id === from)?.ships.find((x) => x.player === local());
    const fresh = mine && mine.fresh > 0 ? 1 : 0;
    for (const s of v.systems) {
      if (!s.inPlay || s.id === from || via.includes(s.id)) continue;
      const payload: ActionPayload = { kind: 'move', from, to: s.id, ships: fresh, ...(fresh ? {} : { damaged: 1 }), ...(via.length ? { via } : {}) };
      if (can(act(payload, prelude))) out.add(s.id);
    }
    return out;
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
      for (const id of moveTargets(v, i.from, i.via, i.prelude)) out.add(id);
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

  function kindButtons(kinds: ActionKind[], prelude: Resource | undefined, enabled: boolean): string {
    return kinds
      .map((k) => button('kind', t(`action.${k}`), { args: { kind: k, ...(prelude ? { prelude } : {}) }, cls: 'kind-btn', disabled: !enabled }))
      .join('');
  }

  /** The button opening the powers of the local player's cards, when one can be used in this phase. */
  function powersButton(v: TableView): string {
    return myTurn() && hasPowers(v) ? button('powers-open', t('powers.open'), { cls: 'powers-btn', title: t('powers.title') }) : '';
  }

  function stepper(name: string, label: string, value: number): string {
    return `<span class="stepper"><span>${esc(label)}</span>${button('step', '−', { args: { name, d: -1 } })}<span class="num">${value}</span>${button('step', '+', { args: { name, d: 1 } })}</span>`;
  }

  /** While another seat plays: who, what they are doing (live), who is next, what you can look at. */
  function othersPanel(v: TableView): string {
    const o = othersTurn(state, 3);
    if (!o) return `<div class="hint">${esc(prompt(v))}</div>`;
    const who = playerName(t, o.player);
    const played = playedText(v, t, o.player);
    const doing = o.phase === 'actions' ? (played ? t('others.doing', { what: played }) : t('others.acting'))
      : o.phase === 'decide' ? t('others.deciding')
      : o.phase === 'allocate' ? t('others.allocating')
      : o.phase === 'lead' ? t('others.leading')
      : t('others.following');
    const facts = [
      o.remaining !== null ? t('others.remaining', { n: o.remaining }) : '',
      o.next === null ? t('others.lastInRound') : o.next === local() ? t('others.nextYou') : t('others.next', { name: playerName(t, o.next) }),
    ].filter(Boolean).join(' · ');
    // Engine log lines name seats P0, P1…; show them with the table's seat names.
    const live = o.live.map((l) => `<li>${esc(l.replace(/\bP(\d)\b/g, (_, n) => playerName(t, Number(n))))}</li>`).join('');
    return `<div class="live-head s-${o.player % 4}"><span class="live-dot" aria-hidden="true"></span>${esc(t('others.title', { name: who }))}</div>
      <div class="hint">${esc(doing)}</div>
      ${live ? `<ol class="live-list" aria-live="polite">${live}</ol>` : ''}
      <div class="hint">${esc(facts)}</div>
      <div class="btn-grid wait"><span class="wait-label">${esc(t('others.whileWaiting'))}</span>${button('court-view', t('court'))}${button('log', t('btn.log'))}</div>`;
  }

  function actionsPanel(v: TableView): string {
    const me = local();
    const cancel = button('cancel', t('btn.cancel'));
    if (v.phase === 'gameOver') return `<div class="hint">${esc(prompt(v))}</div>`;
    if (!myTurn()) return othersPanel(v);

    if (v.phase === 'lead' || v.phase === 'follow') {
      // No box until a card is picked from the hand: then how to play it.
      const card = selected;
      const chosenCard = card ? v.hand.find((x) => x.card === card) : undefined;
      if (!card || !chosenCard) return '';
      const close = button('deselect', '', { cls: 'icon x', title: t('btn.cancel'), html: icon('close') });
      let h = `<div class="ctx-head"><span class="ctx-title">${esc(cardLabel(t, chosenCard))}</span>${close}</div><div class="btn-grid play-modes">`;
      if (v.phase === 'lead') {
        const decl = content.declareByNumber[String(chosenCard.number)];
        h += button('lead', t('play.lead'), { cls: 'primary', disabled: !can({ type: 'lead', player: me, card }) });
        if (decl === 'any') {
          for (const a of AMBITIONS) {
            const glyphs = declareGlyphs(ix, Number(Object.entries(content.declareByNumber).find(([, x]) => x === a)?.[0] ?? 0)).map((g) => icon(g)).join('');
            h += button('lead-declare', t('play.leadDeclare'), { args: { ambition: a }, title: `${t('play.leadDeclare')}: ${t(`ambition.${a}`)}`, html: `${esc(t('play.declareShort'))} ${glyphs}`, disabled: !can({ type: 'lead', player: me, card, declare: true, ambition: a }) });
          }
        } else if (decl) {
          const glyphs = declareGlyphs(ix, chosenCard.number).map((g) => icon(g)).join('');
          h += button('lead-declare', t('play.leadDeclare'), { title: `${t('play.leadDeclare')}: ${t(`ambition.${decl}`)}`, html: `${esc(t('play.leadDeclare'))} ${glyphs}`, disabled: !can({ type: 'lead', player: me, card, declare: true }) });
        }
      } else {
        for (const mode of ['surpass', 'copy', 'pivot'] as const) {
          h += button('follow', t(`play.${mode}`), { args: { mode }, cls: mode === 'surpass' ? 'primary' : '', disabled: !can(followCmd(card, mode)) });
        }
        // Seizing: discard a second card. Offered while nobody has seized this round.
        if (v.seizedBy === null && v.hand.length > 1) {
          const label = seizePick ? t('play.seizePick') : seizeWith ? t('play.seizeWith', { card: seizeWith }) : t('play.seize');
          h += button('seize', label, { cls: seizeWith || seizePick ? 'on' : '' });
        }
      }
      return h + '</div>';
    }

    if (v.phase === 'allocate' && v.battle) {
      const b = v.battle;
      const summary = t('battle.summary', { hit: b.totals.hit, buildingHit: b.totals.buildingHit, selfHit: b.totals.selfHit, intercept: b.interceptHits, key: b.totals.key });
      const al = allocation();
      const ok = al !== null && can({ type: 'allocate', player: me, allocation: al });
      let takes = '';
      if (b.totals.key > 0) {
        const def = state.players[b.target];
        const on = (x: RaidTake) => raid.some((r) => ('resource' in r && 'resource' in x && r.resource === x.resource) || ('card' in r && 'card' in x && r.card === x.card));
        const res = def.resources
          .map((r, i) => (r ? button('raid', `${t(`resource.${r}`)} · ${t('card.keys', { n: content.playerBoard.slotKeys[i] ?? 1 })}`, { args: { res: i }, cls: on({ resource: i }) ? 'on' : '' }) : ''))
          .join('');
        const cards = def.court
          .filter((c) => ix.courtCards.get(c)?.kind === 'faction')
          .map((c) => button('raid', `${c} · ${t('card.keys', { n: ix.courtCards.get(c)?.keys ?? 1 })}`, { args: { card: c }, cls: on({ card: c }) ? 'on' : '' }))
          .join('');
        takes = `<div class="hint">${esc(t('battle.raid', { n: b.totals.key }))}</div><div class="opt-row wrap">${res}${cards}</div>`;
      }
      return `<div class="ctx-head"><span class="ctx-title">${esc(`${b.system}: ${playerName(t, b.attacker)} → ${playerName(t, b.target)}`)}</span></div><div class="hint">${esc(summary)}</div>${takes}<div class="btn-grid">${button('allocate', t('battle.assign'), { cls: 'primary', disabled: !ok })}${powersButton(v)}</div>`;
    }

    if (v.phase === 'decide' && v.decision) {
      const declinable = can({ type: 'decide', player: me, args: {} });
      return `<div class="hint">${esc(t('decide.what', { card: v.decision.card, effect: t(`decide.effect.${v.decision.effect}`) }))}</div><div class="btn-grid two">${button('decide-open', t('decide.choose'), { cls: 'primary' })}${declinable ? button('decline', t('decide.decline')) : ''}</div>`;
    }

    if (v.phase !== 'actions' || !v.budget) return `<div class="hint">${esc(prompt(v))}</div>`;
    const b = v.budget;
    const i = intent;
    switch (i.step) {
      case 'idle': {
        // Actions left as stars; the suit's actions as buttons; prelude by clicking a resource on the board.
        const stars = `<span class="ctx-pips" title="${esc(t('prompt.actions', { n: b.remaining }))}">${Array.from({ length: b.remaining }, () => icon('pip')).join('') || '0'}</span>`;
        const prelude = b.preludeOpen && v.players[me].slots.some((s) => s.resource && !s.locked) ? `<div class="hint small">${esc(t('play.preludeShort'))}</div>` : '';
        const canEnd = can({ type: 'endTurn', player: me });
        const end = button('end-turn', t('play.endTurn'), { cls: `primary end${b.remaining === 0 ? ' pulse' : ''}`, title: t('play.endTurn'), html: `${icon('confirm')}<span>${esc(t('play.endTurn'))}</span>`, disabled: !canEnd });
        return `<div class="ctx-head">${stars}${prelude}</div><div class="btn-grid kind-row">${kindButtons(b.kinds, undefined, b.remaining > 0)}</div><div class="ctx-foot">${powersButton(v)}${end}</div>`;
      }
      case 'choose':
        return `<div class="ctx-head"><span class="ctx-title">${esc(t('play.preludeWith', { res: t(`resource.${i.prelude}`) }))}</span></div><div class="btn-grid kind-row">${kindButtons(i.kinds, i.prelude, true)}${cancel}</div>`;
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
        const path = [i.from, ...i.via, i.to].join(' → ');
        const drops = i.via.map((at) => stepper(`drop:${at}`, t('move.drop', { at }), i.drop[at] ?? 0)).join('');
        const further = moveTargets(v, i.from, [...i.via, i.to], i.prelude).size > 0;
        return `<div class="hint">${esc(`${t('action.move')} · ${path}`)}</div>
          <div class="opt-row wrap">${stepper('ships', t('move.ships'), i.ships)}${stepper('damaged', t('move.damaged'), i.damaged)}${drops}</div>
          <div class="btn-grid">${button('do-move', t('btn.confirm'), { cls: 'primary', disabled: !ok })}${further ? button('catapult', t('move.further')) : ''}${cancel}</div>`;
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
    else if (modal.type === 'detail') {
      const html = detailHtml(ix, v, modal.target, t);
      if (html === null) {
        modal = null;
        return '';
      }
      inner = html;
    } else if (modal.type === 'log') {
      const items = state.log.slice(-120).reverse().map((l) => `<li>[${l.chapter}] ${esc(l.text)}</li>`).join('');
      inner = `<h2 id="modal-title">${esc(t('log.title'))}</h2><div></div><div class="modal-body"><ol class="log-list" reversed>${items}</ol></div><div class="modal-foot">${button('close-modal', t('btn.back'))}</div>`;
    } else if (modal.type === 'settings') {
      const seatOpts = v.players.map((p) => `<option value="${p.id}"${seatChoice === p.id ? ' selected' : ''}>${esc(playerName(t, p.id))}</option>`).join('');
      const countOpts = [2, 3, 4].map((n) => `<option${players === n ? ' selected' : ''}>${n}</option>`).join('');
      const langOpts = LANGS.map((l) => `<option${lang === l ? ' selected' : ''}>${l}</option>`).join('');
      // Online the seat, players and seed belong to the shared game: only the language can change.
      inner = online
        ? `<h2 id="modal-title">${esc(t('settings.title'))}</h2><div></div>
        <div class="settings-grid">
          <label for="set-lang">${esc(t('settings.lang'))}</label><select id="set-lang" data-set="lang">${langOpts}</select>
        </div>
        <div class="modal-foot">${button('close-modal', t('btn.back'))}</div>`
        : `<h2 id="modal-title">${esc(t('settings.title'))}</h2><div></div>
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
      const opts = modal.options
        .map((o, i) => (o.parts.length ? button('decide-pick', o.parts.map(partText).join(' · '), { args: { i }, cls: 'decide-opt' }) : ''))
        .join('');
      const declinable = modal.options.some((o) => !o.parts.length);
      inner = `<h2 id="modal-title">${esc(t('decide.title'))}</h2><div></div>
        <div class="modal-body">
          <p class="hint">${esc(t('decide.what', { card: v.decision.card, effect: t(`decide.effect.${v.decision.effect}`) }))}</p>
          <div class="decide-list">${opts || `<p class="hint">${esc(t('decide.none'))}</p>`}</div>
          <details class="decide-adv"><summary>${esc(t('decide.advanced'))}</summary>
            <pre>${esc(JSON.stringify(v.decision, null, 1))}</pre><p>${esc(t('decide.args'))}</p><textarea data-set="decide-args">${esc(modal.args)}</textarea>
            <div>${button('decide-send', t('decide.send'))}</div>
          </details>
        </div>
        <div class="modal-foot">${button('close-modal', t('btn.back'))}${declinable ? button('decline', t('decide.decline')) : ''}</div>`;
    }
    if (modal.type === 'powers') {
      const groups = new Map<string, { i: number; o: PowerOption }[]>();
      modal.options.forEach((o, i) => groups.set(o.card, [...(groups.get(o.card) ?? []), { i, o }]));
      const rows = [...groups.entries()]
        .map(([card, list]) => {
          const d = ix.courtCards.get(card);
          const face = courtFace({ card, kind: d?.kind ?? null, resource: d?.resource ?? null, keys: d?.keys ?? 0 }, t);
          const byAbility = new Map<string, { i: number; o: PowerOption }[]>();
          for (const x of list) byAbility.set(x.o.ability, [...(byAbility.get(x.o.ability) ?? []), x]);
          const abilities = [...byAbility.entries()]
            .map(([ability, xs]) => {
              const kind = xs[0].o.kind;
              const name = t(`power.${ability}`) === `power.${ability}` ? ability : t(`power.${ability}`);
              const btns = xs.map(({ i, o }) => button('power-pick', o.parts.length ? o.parts.map(partText).join(' · ') : t('powers.use'), { args: { i }, cls: 'decide-opt' })).join('');
              return `<div class="power-ab"><div class="power-name"><span class="tag">${esc(t(`powers.kind.${kind}`))}</span> ${esc(name)}</div><div class="decide-list">${btns}</div></div>`;
            })
            .join('');
          return `<div class="power-card"><span class="court-face" data-zoom="${esc(card)}">${face}</span><div class="power-abs"><b>${esc(card)}</b>${abilities}</div></div>`;
        })
        .join('');
      inner = `<h2 id="modal-title">${esc(t('powers.title'))}</h2><div></div>
        <div class="modal-body"><p class="hint">${esc(t('powers.hint'))}</p>${rows || `<p class="hint">${esc(t('powers.none'))}</p>`}</div>
        <div class="modal-foot">${button('close-modal', t('btn.back'))}</div>`;
    }
    const box = modal.type === 'detail'
      ? `left:${REGIONS.detail.x}px;top:${REGIONS.detail.y}px;width:${REGIONS.detail.w}px;max-height:${REGIONS.detail.h}px`
      : place(REGIONS.modal);
    return `<div class="overlay" data-act="close-modal"></div><div class="glass modal${modal.type === 'detail' ? ' detail' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title" style="${box}">${inner}</div>`;
  }

  /**
   * What sits over the 3D canvas: a keyboard and screen-reader list of the
   * systems (the canvas itself is not focusable), the camera hint, and in
   * calibration mode the system to click next.
   */
  function map3dOverlay(v: TableView, valid: ReadonlySet<string>): string {
    const keys = v.systems
      .filter((s) => s.inPlay)
      .map((s) => {
        const label = `${s.id}${s.resource ? ' · ' + t(`resource.${s.resource}`) : ''}`;
        return `<span role="button" tabindex="0" class="sys-key${valid.has(s.id) ? ' valid' : ''}" data-sys="${esc(s.id)}" aria-label="${esc(label)}">${esc(s.id)}</span>`;
      })
      .join('');
    let cal = '';
    if (calibrating) {
      const next = calib.order[calib.i];
      cal = `<div class="calib glass">
        <div>${esc(next ? t('calib.next', { id: next, n: calib.i + 1, total: calib.order.length }) : t('calib.done'))}</div>
        <div class="btn-grid">${button('calib-skip', t('calib.skip'), { disabled: !next })}${button('calib-back', t('calib.back'), { disabled: calib.i === 0 })}${button('calib-save', t('calib.save'), { cls: 'primary' })}</div>
      </div>`;
    }
    return `<div class="sys-keys" aria-label="${esc(t('map3d.systems'))}">${keys}</div>${cal}`;
  }

  /** Saves the calibration as board.json (the owner moves it to assets/ui/map/). */
  function saveCalibration(): void {
    if (!board3d) return;
    const size = board3d.pictureSize();
    const json = JSON.stringify({ width: size.width, height: size.height, systems: calib.points }, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'board.json';
    a.click();
    URL.revokeObjectURL(a.href);
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
    if (intent.step === 'to' || intent.step === 'move') {
      chosen.add(intent.from);
      for (const id of intent.via) chosen.add(id);
    }
    if (intent.step === 'move') chosen.add(intent.to);
    if (intent.step === 'build' || intent.step === 'repair' || intent.step === 'tax' || intent.step === 'battle') chosen.add(intent.system);

    const rivals = v.rivals.map((r) => rivalPanel(ix, v, v.players[r], t)).join('');
    const undo = online ? '' : button('undo', '', { cls: 'icon', title: t('btn.undo'), html: icon('undo'), disabled: history.length === 0 });
    // Choosing a card: passing and redrawing the first hand sit by the hand's title.
    const choosing = myTurn() && (v.phase === 'lead' || v.phase === 'follow');
    const handTools = myTurn() && v.phase === 'lead'
      ? `${v.canMulligan ? button('mulligan', t('play.mulligan'), { cls: 'small' }) : ''}${button('pass', t('play.pass'), { cls: 'small', disabled: !can({ type: 'pass', player: me }) })}`
      : '';
    // The context box: only when there is something to choose (a picked card, the actions, a step, a battle).
    const ctx = actionsPanel(v);

    stage.innerHTML = `<div class="tbl-stars"></div>
      <div class="region header" data-region="header" style="${place(REGIONS.header)}">${header(v, t, source === 'example', courtPanel(v, t, courtPickable(intent)), ambitionsStrip(ix, v, t), undo)}</div>
      <div class="map-area${board3d ? '' : ' glass'}" data-region="map" style="${place(REGIONS.map)}">${board3d ? map3dOverlay(v, valid) : mapSvg(ix, v, valid, chosen, t)}</div>
      <div class="region rivals" data-region="rivals" style="${place(REGIONS.rivals)}">${rivals}</div>
      <div class="region" data-region="local" style="${place(REGIONS.local)}">${localPanel(v.players[me], t, spendableSlots(v), null)}</div>
      <div class="region glass hand" data-region="hand" style="${place(REGIONS.hand)}">${handPanel(ix, v, t, selected, choosing, seizeWith, handTools)}</div>
      <div class="region glass owned${v.players[me].court.length ? '' : ' empty'}" data-region="owned" style="${place(REGIONS.owned)};--w:${REGIONS.owned.w}px">${ownedPanel(ix, v.players[me], t)}</div>
      ${ctx ? `<div class="region glass actions${myTurn() ? ' mine' : ''}" data-region="actions" role="group" aria-label="${esc(prompt(v))}" style="${placeUp(REGIONS.actions)}"><div class="actions-body">${ctx}</div></div>` : ''}
      <div class="sr-only" role="status" aria-live="polite">${esc(prompt(v))}</div>
      ${modalHtml(v)}
      ${toast ? `<div class="toast" role="alert">${esc(toast)}</div>` : ''}
      <div class="card-zoom" aria-hidden="true" hidden></div>`;
    board3d?.update(v, valid, chosen);
    restoreFocus(key);
    const dialog = stage.querySelector('.modal');
    if (dialog && !dialog.contains(document.activeElement)) {
      dialog.querySelector<HTMLElement>('button:not(:disabled), select, input, textarea')?.focus();
    }
  }

  // ---- input ----
  function pickSystem(id: string): void {
    const v = tableView(ix, state, local());
    if (!validSystems(v).has(id)) {
      // Not a choice for the current step: outside a step, the click opens the system's details.
      if (intent.step === 'idle' && !modal) {
        modal = { type: 'detail', target: { kind: 'system', id } };
        render();
      }
      return;
    }
    const i = intent;
    if (i.step === 'system') {
      if (i.kind === 'battle') {
        intent = { step: 'battle', system: id, target: rivalsIn(v, id)[0] ?? null, dice: { skirmish: 0, assault: 0, raid: 0 }, prelude: i.prelude };
      } else if (i.kind === 'tax') {
        const owners = [...new Set(v.systems.find((s) => s.id === id)?.buildings.filter((b) => b.type === 'city').map((b) => b.owner))];
        if (owners.length === 1) return void send(act({ kind: 'tax', system: id, cityOwner: owners[0] }, i.prelude));
        intent = { step: 'tax', system: id, prelude: i.prelude };
      } else intent = { step: i.kind, system: id, prelude: i.prelude };
    } else if (i.step === 'from') {
      pendingMove = null;
      intent = { step: 'to', from: id, via: [], prelude: i.prelude };
    }
    else if (i.step === 'to') {
      const mine = v.systems.find((s) => s.id === i.from)?.ships.find((x) => x.player === local());
      // Catapulting on keeps the counts chosen so far; a first pick moves every ship there.
      const prev = pendingMove;
      pendingMove = null;
      intent = prev && prev.from === i.from
        ? { ...prev, via: i.via, to: id }
        : { step: 'move', from: i.from, via: i.via, to: id, ships: mine?.fresh ?? 0, damaged: mine && mine.fresh === 0 ? mine.damaged : 0, drop: {}, prelude: i.prelude };
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
      case 'deselect':
        selected = null;
        seizeWith = null;
        seizePick = false;
        break;
      case 'hand':
        if (seizePick && d.card !== selected) {
          seizeWith = d.card!;
          seizePick = false;
        } else {
          selected = selected === d.card ? null : d.card!;
          if (seizeWith === selected) seizeWith = null;
        }
        break;
      case 'seize':
        if (seizeWith || seizePick) {
          seizeWith = null;
          seizePick = false;
        } else seizePick = true;
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
        if (selected) send(followCmd(selected, d.mode as 'surpass' | 'pivot' | 'copy'));
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
        pendingMove = null;
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
        if (intent.step === 'move' && d.name?.startsWith('drop:')) {
          const at = d.name.slice(5);
          intent = { ...intent, drop: { ...intent.drop, [at]: clamp((intent.drop[at] ?? 0) + n, intent.ships) } };
        } else if (intent.step === 'move') {
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
      case 'catapult':
        if (intent.step === 'move') {
          pendingMove = intent;
          intent = { step: 'to', from: intent.from, via: [...intent.via, intent.to], prelude: intent.prelude };
        }
        break;
      case 'raid': {
        const take: RaidTake = d.card !== undefined ? { card: d.card } : { resource: Number(d.res) };
        const same = (r: RaidTake) => ('card' in r && 'card' in take && r.card === take.card) || ('resource' in r && 'resource' in take && r.resource === take.resource);
        raid = raid.some(same) ? raid.filter((r) => !same(r)) : [...raid, take];
        break;
      }
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
        {
          const al = allocation();
          if (al) send({ type: 'allocate', player: me, allocation: al });
        }
        return;
      case 'powers-open':
        modal = { type: 'powers', options: cardPowers(ix, state, me) };
        break;
      case 'power-pick':
        if (modal?.type === 'powers') {
          const o = modal.options[Number(d.i)];
          modal = null;
          if (o) send(o.cmd);
        }
        return;
      case 'decide-open':
        modal = { type: 'decide', args: '{}', options: decisionOptions(ix, state, me) };
        break;
      case 'decide-pick':
        if (modal?.type === 'decide') {
          const o = modal.options[Number(d.i)];
          modal = null;
          if (o) send({ type: 'decide', player: me, args: o.args });
        }
        return;
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
        if (online) return;
        const prev = history.pop();
        if (prev) state = prev;
        resetChoices();
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
      case 'seat-detail':
        modal = { type: 'detail', target: { kind: 'seat', player: Number(d.player) } };
        break;
      case 'detail-system':
        modal = { type: 'detail', target: { kind: 'system', id: d.id! } };
        break;
      case 'amb-detail':
        modal = { type: 'detail', target: { kind: 'ambition', id: d.id! } };
        break;
      case 'supply-detail':
        modal = { type: 'detail', target: { kind: 'supply' } };
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
      case 'help':
        showToast(t('map3d.hint'));
        break;
      case 'log':
        modal = { type: 'log' };
        break;
      case 'calib-skip':
        calib.i = Math.min(calib.order.length, calib.i + 1);
        break;
      case 'calib-back':
        calib.i = Math.max(0, calib.i - 1);
        delete calib.points[calib.order[calib.i]];
        break;
      case 'calib-save':
        saveCalibration();
        return;
      case 'settings':
        modal = { type: 'settings' };
        break;
      case 'new-game':
        if (online) return;
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

  // ---- card zoom: hovering or focusing any [data-zoom] card shows it large beside it ----
  function showZoom(el: HTMLElement): void {
    const zoom = stage.querySelector<HTMLElement>('.card-zoom');
    const id = el.dataset.zoom;
    if (!zoom || !id) return;
    const d = ix.courtCards.get(id);
    zoom.innerHTML = largeCard({ card: id, kind: d?.kind ?? null, resource: d?.resource ?? null, keys: d?.keys ?? 0 }, t, { selected: false, disabled: false });
    const r = el.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const x = (r.left - s.left) / scale;
    const y = (r.top - s.top) / scale;
    const w = r.width / scale;
    const ZW = 300, ZH = 416, GAP = 14;
    const left = x + w / 2 > STAGE.w / 2 ? x - ZW - GAP : x + w + GAP;
    const top = Math.max(8, Math.min(STAGE.h - ZH - 8, y + (r.height / scale) / 2 - ZH / 2));
    zoom.style.left = `${left}px`;
    zoom.style.top = `${top}px`;
    zoom.hidden = false;
  }
  function hideZoom(): void {
    const zoom = stage.querySelector<HTMLElement>('.card-zoom');
    if (zoom) zoom.hidden = true;
  }
  const zoomTarget = (e: Event) => (e.target as Element).closest<HTMLElement>('[data-zoom]');
  stage.addEventListener('mouseover', (e) => {
    const el = zoomTarget(e);
    if (el) showZoom(el);
  });
  stage.addEventListener('mouseout', (e) => {
    if (zoomTarget(e)) hideZoom();
  });
  stage.addEventListener('focusin', (e) => {
    const el = zoomTarget(e);
    if (el) showZoom(el);
  });
  stage.addEventListener('focusout', (e) => {
    if (zoomTarget(e)) hideZoom();
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
      if (online) return;
      if (fields['g-players']) players = Number(fields['g-players']) as PlayerCount;
      if (fields['g-seed']) seed = Number(fields['g-seed']) || 1;
      restart();
      render();
    },
    load(next: GameState) {
      state = next;
      history = [];
      resetChoices();
      if (modal?.type !== 'log' && modal?.type !== 'settings') modal = null;
      render();
    },
  };
}
