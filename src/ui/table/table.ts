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
import { messageTranslator } from '../../i18n/messages';
import type { Lang } from '../../i18n';
import { loadContent } from '../content';
import { assetUrl, cardArt, icon, seatColor, seatIcon, setSeatColors } from './assets';
import { cardFaceById, cardWords, courtCardFace, faceOf, fitCardText, hasKitFace, setFaceSource } from './cardface';
import { loadCardFonts } from './cardfonts';
import { addHit, battleAfter, battleForces, defaultAllocation, emptyAllocation, faceKey, facePicture, hitsLeft } from './battle';
import type { BattlePick } from './battle';
import { BATTLE_VIEW, BattleView3D } from './battleview3d';
import { battleScenario } from './scenario';
import { createBoard3D } from './board3d';
import { gpu } from './gpu';
import type { RoutePreview, ShipGlow } from './board3d';
import type { Allocation, BattleRef } from '../../game/engine';
import { AGENTS_VIEW, CourtAgents3D } from './courtagents3d';

/** How far the agents' view rises over the bottom of the zoomed card, in pixels. */
const AGENTS_OVERLAP = 118;
import { cardPowers, decisionOptions } from './decide';
import type { PowerOption } from './decide';
import type { DecisionOption, DecisionPart } from './decide';
import { parseTip, tipHtml } from './tips';
import { actionCommand, battlePayload, battleProbe, clamp, cutRoute, extendRoute, fitDrops, IDLE, MAX_STEPPER_DICE, movePayload, routeOf, routeStops, setDrop, startAction } from './intent';
import type { Intent, MoveIntent } from './intent';
import { place, REGIONS, setStage, STAGE, placeUp } from './layout';
import { mapSvg } from './mapview';
import {
  actionCard, button, cardLabel, playedCard, playedText, courtPanel, COURT_SORTS, type CourtSort, declareGlyphs, type PreludeCard, esc, handPanel, header, largeCard, localPanel, ownCourtPanel, playerName, preludeTab, rivalPanel, setSeatNames, sidePanel, systemName, systemTag, actionIcon,
} from './render';
import { legal, othersTurn, tableView, whyNot } from './view';
import type { TableView } from './view';

/** The windows that still dim the table: the settings and a card's choice. */
type Modal = { type: 'settings' } | { type: 'decide'; options: DecisionOption[]; chosen?: string[] };

/** A drop-down under its header button: the log or the map help. */
type Drop = 'log' | 'help';

/** Lines of the log the drop-down shows (the latest; it fits under the header with no scroll bar). */
const LOG_LINES = 14;

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
  /**
   * The seat this screen plays: only its commands are sent. null: a hotseat
   * game on one computer, every seat played here in turn (the view follows the
   * active seat, a hand-over screen hides it between players, undo works).
   */
  seat: PlayerId | null;
  /** Saves a new state after a command (or an undo, without one); a rejection shows the error and the shared state comes back. */
  commit: (next: GameState, cmd?: Command) => Promise<void>;
  /** The seats' names and colours (a colour index 0-3 per seat), as chosen when the game was created. */
  seats?: { names?: string[]; colors?: number[] };
}

/** Mounts the table into `root`. */
export function mountTable(root: HTMLElement, online?: TableOnline): TableHandle {
  const params = new URLSearchParams(location.search);
  let lang: Lang = pickLang(location.search, navigator.language);
  let t = translator(lang);
  const { content, source } = online ? { content: online.content, source: 'owner' as const } : loadContent();
  const ix = indexContent(content, BASE_EFFECTS);
  // Every panel draws a card by id the same way: from the kit, in the table's language.
  setFaceSource((id) => faceOf(ix, id, lang));
  /** The engine's sentences (log, errors) in the table's language, players and ids by name. */
  const engineSay = () =>
    messageTranslator(lang, {
      player: (n) => playerName(t, n),
      word: (w) => {
        const sys = ix.content.map.systems.find((s) => s.id === w);
        if (sys) return systemName(sys, t);
        const court = ix.courtCards.get(w);
        if (court) return cardWords(court, lang).name;
        const action = ix.actionCards.get(w);
        if (action) return cardLabel(t, action);
        for (const k of ['resource', 'ambition', 'suit', 'action', 'piece', 'battle.dice', 'word']) {
          const v = t(`${k}.${w}`);
          if (v !== `${k}.${w}`) return v;
        }
        return undefined;
      },
    });
  let say = engineSay();
  /** The view with its recent log lines translated. */
  const withSay = (v: TableView): TableView => ({ ...v, recent: v.recent.map((l) => say(l)) });

  // Seat names and colours: from the game online, or locally from ?names=Anna,Bruno&colors=3,1,0.
  const list = (k: string) => (params.get(k) ?? '').split(',').filter((x) => x !== '');
  setSeatNames(online ? (online.seats?.names ?? []) : list('names'));
  setSeatColors(online ? (online.seats?.colors ?? []) : list('colors').map(Number));

  let players = Number(params.get('players') ?? 3) as PlayerCount;
  let seed = Number(params.get('seed') ?? 1) || 1;
  /** Locally, ?variant=leaders starts the Leaders & Lore variant (with its draft). */
  const variant = params.get('variant') === 'leaders' ? 'leaders' : 'base';
  let state: GameState = online ? online.state : newGame(ix, { playerCount: players, seed, variant });
  /** Locally, ?scenario=battle sets up a battle for the first seat to lead (applied once per game). */
  const scenario = online ? null : params.get('scenario');
  let scenarioDone = false;
  let history: GameState[] = [];
  // Online the seat is fixed; locally the view follows the active seat unless ?seat= pins it.
  // Hotseat: a shared game whose seat is null, or locally ?hotseat=1 (to try the hand-over screen).
  const hotseat = online ? online.seat === null : params.get('hotseat') === '1';
  let follow = online ? hotseat : params.get('seat') === null;
  let seatChoice: PlayerId = online?.seat ?? (follow ? 0 : Number(params.get('seat')) || 0);
  /** Hotseat: the seat the screen last showed, and the seat the hand-over screen is waiting for (null: none). */
  let shownSeat: PlayerId | null = null;
  let curtainFor: PlayerId | null = null;

  let selected: string | null = null;
  /** Following: the second card discarded to seize the initiative, and whether the next hand click picks it. */
  let seizeWith: string | null = null;
  let seizePick = false;
  /** Allocating: what the rolled keys steal, in order. */
  let raid: RaidTake[] = [];
  /** The hits the attacker has placed so far in the battle view, for the battle `battleKey`. */
  let placed: Allocation | null = null;
  let battleKey = '';
  let intent: Intent = IDLE;
  /**
   * The menu beside a system on the map: what the local player can do there,
   * limited to `kinds` (the card's, a prelude's, or the one action picked first).
   */
  let sysMenu: { system: string; kinds: ActionKind[]; prelude?: Resource } | null = null;
  /** The system the map was last panned to show, so it is not pulled back while the player looks elsewhere. */
  let shownSystem: string | null = null;
  let modal: Modal | null = null;
  /** The drop-down open under the header (log or help), and the choices of a card power open over its card. */
  let drop: Drop | null = null;
  let powerMenu: { card: string; options: PowerOption[] } | null = null;
  /** The map's control layer (who controls each sector) is on; remembered in this browser. */
  let controlLayer = false;
  /** How the local player's own Court cards are ordered in the bar. */
  let courtSort: CourtSort = 'got';
  try {
    controlLayer = localStorage.getItem('arcs.controlLayer') === '1';
  } catch {
    /* no storage: off */
  }
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

  // Card faces keep their text inside the paper: refit whenever cards are drawn or shown, and once the card fonts are in.
  let fitQueued = false;
  const queueFit = () => {
    if (fitQueued) return;
    fitQueued = true;
    requestAnimationFrame(() => {
      fitQueued = false;
      fitCardText(stage);
    });
  };
  new MutationObserver(queueFit).observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  void loadCardFonts().then(() => fitCardText(stage, true));

  let scale = 1;
  let mounted = false;
  /** Stretches the stage to the window's shape (panels follow the edges) and scales it to fit. */
  function fit(): void {
    const before = `${STAGE.w}x${STAGE.h}`;
    const s = setStage(window.innerWidth, window.innerHeight);
    scale = s;
    stage.style.width = `${STAGE.w}px`;
    stage.style.height = `${STAGE.h}px`;
    const x = (window.innerWidth - STAGE.w * s) / 2;
    const y = (window.innerHeight - STAGE.h * s) / 2;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    if (mounted && before !== `${STAGE.w}x${STAGE.h}`) render();
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
        picture: params.get('map') === 'picture',
        showSpots: params.get('debug') === 'spots',
        onPick: (id, shipOf) => pickSystem(id, shipOf),
        onHover: (id, x, y) => (id ? showTip(`sys:${id}`, { x, y }) : hideTip()),
        onView: () => placeMenu(),
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
    board3d.setSectorMode(controlLayer ? 'control' : 'resource');
    // Behind the stage, as large as the window: the interface is drawn in front of it.
    shell.classList.add('has-3d');
    shell.insertBefore(board3d.canvas, stage);
    // No graphics card in use: the map draws lighter, and the player learns how to get it back.
    if (gpu.software) window.setTimeout(() => showToast(t('gpu.software')), 1500);
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
      if (online && online.seat !== null && cmd.player !== online.seat) throw new Error(t('online.notYours'));
      const next = dispatch(ix, state, cmd);
      if (!online || hotseat) history.push(state);
      state = next;
      resetChoices();
      render();
      if (online)
        online.commit(next, cmd).catch((e: Error) => {
          showToast(t('error', { msg: say(e.message) }));
          render();
        });
      return true;
    } catch (e) {
      showToast(t('error', { msg: say((e as Error).message) }));
      render();
      return false;
    }
  }

  /** Clears every half-made choice (after a command, an undo or a new game). */
  function resetChoices(): void {
    sysMenu = null;
    selected = null;
    seizeWith = null;
    seizePick = false;
    raid = [];
    placed = null;
    battleKey = '';
    intent = IDLE;
  }

  function restart(): void {
    state = newGame(ix, { playerCount: players, seed, variant });
    scenarioDone = false;
    history = [];
    resetChoices();
    modal = null;
    drop = null;
  }

  /** The follow command for the selected card, with the seize card when one is chosen. */
  function followCmd(card: string, mode: 'surpass' | 'pivot' | 'copy'): Command {
    return { type: 'follow', player: local(), card, mode, ...(seizeWith && seizeWith !== card ? { seizeWith } : {}) };
  }

  /** Identity of the pending battle's roll: a new battle or a reroll changes it (and throws the dice again). */
  function rollKeyOf(b: BattleRef): string {
    return `${b.system}:${b.attacker}:${b.target}:${JSON.stringify(b.faces ?? [])}:${(b.rerolls ?? []).join(',')}`;
  }

  /**
   * The allocation for the pending battle: with the 3D battle view, the hits
   * placed one click at a time (none to start with); else the proposal. The
   * chosen raid either way.
   */
  function allocation(): Allocation | null {
    if (state.phase.type !== 'allocate') return null;
    const b = state.phase.battle;
    const proposal = defaultAllocation(state, b);
    if (!board3d) return { ...proposal, raid: [...raid] };
    const key = rollKeyOf(b);
    if (key !== battleKey || !placed) {
      battleKey = key;
      placed = emptyAllocation(proposal);
    }
    return { ...placed, raid: [...raid] };
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

  /**
   * The local cards with a prelude power or a new action, for the board's
   * prelude tab; lit when the power can be used in this phase on our turn.
   */
  function preludeCards(v: TableView): PreludeCard[] {
    const pl = state.players[local()];
    // Lit: the card has a use the engine accepts right now.
    const usable = new Set(hasPowers(v) ? powersNow().map((o) => o.card) : []);
    return [...pl.court, ...pl.lore, ...(pl.leader ? [pl.leader] : [])]
      .filter((c) => {
        const e = effectOf(ix, c);
        return !!(e?.prelude || e?.actions || e?.reroll);
      })
      .map((card) => ({ card, lit: usable.has(card) }));
  }

  function partText(p: DecisionPart): string {
    const label = t(`decide.key.${p.key}`);
    const v = p.value;
    const sys = (id: string) => systemName(ix.content.map.systems.find((x) => x.id === id), t, id);
    const value =
      p.kind === 'player' ? playerName(t, v as number)
      : p.kind === 'system' ? sys(v as string)
      : p.kind === 'resource' ? t(`resource.${v}`)
      : p.kind === 'ambition' ? t(`ambition.${v}`)
      : p.kind === 'court' ? (Array.isArray(v) ? v : [v]).map((i) => cardName(state.court[i as number]?.card ?? '?')).join(', ')
      : p.kind === 'cards' ? (v as string[]).map(cardName).join(', ')
      : p.kind === 'index' ? `#${(v as number) + 1}`
      : p.kind === 'ships' ? (v as { from: string; ships: number }[]).map((m) => t('decide.shipsFrom', { n: m.ships, from: sys(m.from) })).join(', ')
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

  function validSystems(v: TableView, i: Intent = intent): Set<string> {
    const out = new Set<string>();
    if (!myTurn()) return out;
    const me = local();
    const live = v.systems.filter((s) => s.inPlay);
    if (i.step === 'system') {
      for (const s of live) {
        const ok =
          i.kind === 'tax' ? s.buildings.some((b) => b.type === 'city') && [...new Set(s.buildings.map((b) => b.owner))].some((o) => can(act({ kind: 'tax', system: s.id, cityOwner: o }, i.prelude)))
          : i.kind === 'build' ? (['ship', 'city', 'starport'] as const).some((what) => can(act({ kind: 'build', system: s.id, what }, i.prelude)))
          : i.kind === 'repair' ? (['ship', 'building'] as const).some((target) => can(act({ kind: 'repair', system: s.id, target }, i.prelude)))
          : s.ships.some((x) => x.player === me) && rivalsIn(v, s.id).some((r) => battleProbe((dice) => can(act({ kind: 'battle', system: s.id, target: r, dice }, i.prelude))) !== null);
        if (ok) out.add(s.id);
      }
    } else if (i.step === 'from') {
      for (const s of live) if (s.ships.some((x) => x.player === me)) out.add(s.id);
    } else if (i.step === 'to') {
      for (const id of moveTargets(v, i.from, i.via, i.prelude)) out.add(id);
    } else if (i.step === 'move') {
      // A planned route goes on to any system the ships may still enter (a Catapult).
      for (const id of moveTargets(v, i.from, [...i.via, i.to], i.prelude)) out.add(id);
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
    if (sysMenu) return t('prompt.pick.menu', { system: systemLabel(v, sysMenu.system) });
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
      case 'actions': {
        const n = v.budget?.remaining ?? 0;
        return n === 0 ? t('prompt.actionsDone') : n === 1 ? t('prompt.actionsOne') : t('prompt.actions', { n });
      }
      case 'allocate':
        return t('prompt.allocate');
      case 'decide':
        return t('prompt.decide');
      default:
        return myTurn() ? t('draft.yoursShort') : t('prompt.draft');
    }
  }

  /** Why action `kind` has nothing to act on now, or null when it has. */
  function kindReason(v: TableView, kind: ActionKind, prelude?: Resource): string | null {
    const start = startAction(kind, prelude);
    const some = start.step === 'court' ? courtPickable(start).size > 0
      : start.step === 'from' ? v.systems.some((s) => s.inPlay && s.ships.some((x) => x.player === local()) && moveTargets(v, s.id, [], prelude).size > 0)
      : validSystems(v, start).size > 0;
    return some ? null : t(`why.${kind}`);
  }

  /** The action kinds as buttons: glyph above the name; one with nothing to act on is off and says why. */
  function kindButtons(v: TableView, kinds: ActionKind[], prelude: Resource | undefined, enabled: boolean): string {
    return kinds
      .map((k) => {
        const why = enabled ? kindReason(v, k, prelude) : null;
        const html = `${actionIcon(k)}<span class="kb-name">${esc(t(`action.${k}`))}</span>${why ? `<span class="kb-why">${esc(why)}</span>` : ''}`;
        return button('kind', t(`action.${k}`), { args: { kind: k, ...(prelude ? { prelude } : {}) }, cls: 'kind-btn', disabled: !enabled || !!why, html, title: why ?? t(`action.${k}`) });
      })
      .join('');
  }

  /** One thing the map menu offers: a piece picture, a label, and the command (or why it cannot be done). */
  interface MenuOption {
    kind: ActionKind;
    label: string;
    pic: string;
    why: string | null;
    args: Record<string, string | number>;
  }

  /** What the local player can do in system `id`, by action kind (only kinds with something possible there). */
  function menuOptions(v: TableView, id: string, kinds: readonly ActionKind[], prelude?: Resource): MenuOption[][] {
    const s = v.systems.find((x) => x.id === id);
    if (!s || !s.inPlay || !myTurn()) return [];
    const me = local();
    const pic = (kind: string, seat: number) => {
      const url = assetUrl(`piece.${kind}-${seatColor(seat)}`);
      return url ? `<img src="${esc(url)}" alt="">` : icon(kind as 'ship');
    };
    const why = (payload: ActionPayload) => {
      const w = whyNot(ix, state, act(payload, prelude));
      return w === null ? null : say(w);
    };
    const out: MenuOption[][] = [];
    for (const kind of kinds) {
      let opts: MenuOption[] = [];
      if (kind === 'build') {
        opts = (['ship', 'city', 'starport'] as const).map((what) => ({ kind, label: t(`build.${what}`), pic: pic(what, me), why: why({ kind: 'build', system: id, what }), args: { what } }));
      } else if (kind === 'repair') {
        const dmgBuilding = s.buildings.find((b) => b.owner === me && b.damaged);
        opts = (['ship', 'building'] as const).map((target) => ({ kind, label: t(`repair.${target}`), pic: pic(target === 'ship' ? 'ship' : (dmgBuilding?.type ?? 'city'), me), why: why({ kind: 'repair', system: id, target }), args: { target } }));
      } else if (kind === 'tax') {
        const owners = [...new Set(s.buildings.filter((b) => b.type === 'city').map((b) => b.owner))];
        opts = owners.map((o) => ({ kind, label: o === me ? t('menu.taxOwn') : t('menu.taxRival', { name: playerName(t, o) }), pic: pic('city', o), why: why({ kind: 'tax', system: id, cityOwner: o }), args: { owner: o } }));
      } else if (kind === 'battle') {
        opts = rivalsIn(v, id).map((r) => ({ kind, label: playerName(t, r), pic: pic('ship', r), why: why({ kind: 'battle', system: id, target: r, dice: battleProbe((dice) => can(act({ kind: 'battle', system: id, target: r, dice }, prelude))) ?? { skirmish: 1 } }), args: { target: r } }));
      } else if (kind === 'move' && s.ships.some((x) => x.player === me) && moveTargets(v, id, [], prelude).size > 0) {
        opts = [{ kind, label: t('menu.moveFrom'), pic: pic('ship', me), why: null, args: {} }];
      }
      if (opts.some((o) => o.why === null)) out.push(opts);
    }
    return out;
  }

  /** Systems where the menu has something to do now (outside a step, with actions left). */
  function actionable(v: TableView): Set<string> {
    const out = new Set<string>();
    if (intent.step !== 'idle' || modal || !myTurn() || v.phase !== 'actions' || !v.budget || v.budget.remaining < 1) return out;
    const kinds = v.budget.kinds.filter((k) => k !== 'move' && k !== 'influence' && k !== 'secure');
    for (const s of v.systems) if (s.inPlay && menuOptions(v, s.id, kinds).length) out.add(s.id);
    return out;
  }

  /** The menu beside the chosen system ('' when none). */
  function sysMenuHtml(v: TableView): string {
    const m = sysMenu;
    if (!m) return '';
    const sections = menuOptions(v, m.system, m.kinds, m.prelude);
    if (!sections.length) return '';
    const s = v.systems.find((x) => x.id === m.system);
    const body = sections
      .map((opts) => {
        const kind = opts[0].kind;
        const tiles = opts
          .map((o) => button('menu-do', o.label, { args: { kind, ...o.args }, cls: 'menu-opt', disabled: o.why !== null, title: o.why ?? o.label, html: `<span class="mo-pic">${o.pic}</span><span class="mo-name">${esc(o.label)}</span>${o.why ? `<span class="mo-why">${esc(o.why)}</span>` : ''}` }))
          .join('');
        return `<div class="menu-sec"><div class="menu-kind">${actionIcon(kind)}<span>${esc(t(`action.${kind}`))}</span></div><div class="menu-opts">${tiles}</div></div>`;
      })
      .join('');
    const close = button('menu-close', '', { cls: 'icon x', title: t('btn.cancel'), html: icon('close') });
    return `<div class="sys-menu s-${seatColor(local())}" role="dialog" aria-label="${esc(systemName(s, t, m.system))}"><div class="menu-head">${systemTag(s, t)}${close}</div>${body}</div>`;
  }

  /** Puts the map menu beside its system, following the view (called after each render and when the map moves). */
  function placeMenu(): void {
    const el = stage.querySelector<HTMLElement>('.sys-menu');
    if (!el || !sysMenu) return;
    const at = board3d?.screenOf(sysMenu.system);
    const r = stage.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const x = at ? (at.x - r.left) / scale : REGIONS.map.x + REGIONS.map.w / 2;
    const y = at ? (at.y - r.top) / scale : REGIONS.map.y + REGIONS.map.h / 2;
    // To the right of the system, or to its left when there is no room.
    const right = x + 70 + w < REGIONS.map.x + REGIONS.map.w + 40;
    const left = right ? x + 70 : x - 70 - w;
    const top = Math.max(REGIONS.map.y, Math.min(REGIONS.map.y + REGIONS.map.h - h, y - h / 2));
    el.style.left = `${Math.max(8, left)}px`;
    el.style.top = `${top}px`;
  }

  /** The local cards whose power can be used now, as lit round buttons (a battle window or box without the prelude row). */
  function powersRow(v: TableView): string {
    return preludeTab(preludeCards(v).filter((c) => c.lit), t, true);
  }

  /** What the rolled keys can steal from the defender (resources and Guild cards), as toggles; '' without keys. */
  function raidChoices(b: BattleRef): string {
    if (b.totals.key <= 0) return '';
    const def = state.players[b.target];
    const on = (x: RaidTake) => raid.some((r) => ('resource' in r && 'resource' in x && r.resource === x.resource) || ('card' in r && 'card' in x && r.card === x.card));
    const res = def.resources
      .map((r, i) => (r ? button('raid', `${t(`resource.${r}`)} · ${t('card.keys', { n: content.playerBoard.slotKeys[i] ?? 1 })}`, { args: { res: i }, cls: on({ resource: i }) ? 'on' : '' }) : ''))
      .join('');
    const cards = def.court
      .filter((c) => ix.courtCards.get(c)?.kind === 'faction')
      .map((c) => button('raid', `${c} · ${t('card.keys', { n: ix.courtCards.get(c)?.keys ?? 1 })}`, { args: { card: c }, cls: on({ card: c }) ? 'on' : '' }))
      .join('');
    return `<div class="hint">${esc(t('battle.raid', { n: b.totals.key }))}</div><div class="opt-row wrap">${res}${cards}</div>`;
  }

  /**
   * The battle window (3D map only): who fights where, the 3D scene (filled in
   * after rendering), the hits still to place, the raid, and the buttons.
   * Watchers see it without the controls.
   */
  function battleWindow(v: TableView): string {
    if (!board3d || v.phase !== 'allocate' || !v.battle) return '';
    const b = v.battle;
    const me = local();
    const mine = myTurn() && b.attacker === me;
    const al = allocation();
    const left = al ? hitsLeft(b, al) : { hits: 0, buildingHits: 0, selfHits: 0 };
    const ok = mine && al !== null && can({ type: 'allocate', player: me, allocation: al });
    const chip = (key: string, n: number, total: number) => (total > 0 ? `<span class="b-chip${n === 0 ? ' done' : ''}">${esc(t(key, { n, total }))}</span>` : '');
    const counts = `${chip('battle.left.hits', left.hits, b.totals.hit)}${chip('battle.left.building', left.buildingHits, b.totals.buildingHit)}${chip('battle.left.self', left.selfHits, b.totals.selfHit + b.interceptHits)}`;
    const controls = mine
      ? `<div class="b-foot">${raidChoices(b)}<div class="btn-grid">${button('battle-auto', t('battle.auto'))}${button('battle-reset', t('battle.reset'))}${button('allocate', t('battle.confirm'), { cls: 'primary', disabled: !ok })}</div></div>`
      : `<div class="b-foot"><div class="hint">${esc(t('battle.watching', { who: playerName(t, b.attacker) }))}</div></div>`;
    const title = t('battle.title', { system: systemName(ix.content.map.systems.find((s) => s.id === b.system), t, b.system), a: playerName(t, b.attacker), d: playerName(t, b.target) });
    return `<div class="battle-win glass" role="dialog" aria-label="${esc(title)}">
      <div class="b-head"><span class="ctx-title">${esc(title)}</span><span class="b-counts">${counts || esc(t('battle.noHits'))}</span></div>
      ${diceStrip(b)}
      <div class="battle-slot" style="width:${BATTLE_VIEW.w}px;height:${BATTLE_VIEW.h}px"></div>
      ${mine ? `<div class="hint small">${esc(t('battle.howTo'))}</div>` : ''}
      ${controls}
    </div>`;
  }

  /** The roll the dice strip last showed: a new roll (or reroll) tumbles the dice in again, other renders keep them still. */
  let diceShown = '';
  /**
   * The rolled dice as the official face pictures, in the order they fire in
   * the battle view (each one lands as its volley starts).
   */
  function diceStrip(b: BattleRef): string {
    const faces = b.faces ?? [];
    if (!faces.length) return '';
    const key = rollKeyOf(b);
    const roll = key !== diceShown && params.get('motion') !== 'off';
    diceShown = key;
    const dice = faces
      .map((f, i) => {
        const pic = facePicture(f.type, f.face);
        const label = `${t(`battle.dice.${f.type}`)}: ${faceKey(f.face) || '—'}`;
        const inner = pic ? `<img src="${esc(assetUrl(pic))}" alt="">` : `<span>${esc(faceKey(f.face) || '·')}</span>`;
        return `<span class="b-die d-${f.type}" style="--i:${i}" title="${esc(label)}">${inner}</span>`;
      })
      .join('');
    return `<div class="b-dice${roll ? ' rolling' : ''}" aria-label="${esc(t('battle.diceRolled'))}">${dice}</div>`;
  }

  /** A decision that asks to keep some of the cards drawn (its data lists them), or null. */
  function keepChoice(dec: { data?: Record<string, unknown> }): { cards: string[]; keep: number } | null {
    const cards = dec.data?.cards;
    const keep = dec.data?.keep;
    return Array.isArray(cards) && typeof keep === 'number' && keep > 0 ? { cards: cards as string[], keep: Math.min(keep, cards.length) } : null;
  }

  /** A card's printed name in the table's language (its id when the content has none). */
  function cardName(id: string): string {
    return faceOf(ix, id, lang).name ?? id;
  }

  /** A Lore, Leader or Court card at full size: drawn from the kit when it can be, else its picture, else its id. */
  function drawnCard(id: string): { face: string; kind: string } {
    const f = faceOf(ix, id, lang);
    if (hasKitFace(f)) return { face: courtCardFace(f), kind: f.kind ?? 'card' };
    const art = cardArt(id);
    return { face: art ? `<img src="${esc(art)}" alt="">` : `<span class="dr-ph">${esc(id)}</span>`, kind: f.kind ?? 'card' };
  }

  /**
   * The Leaders & Lore draft window: the face-up leaders and lore cards (hover
   * zooms, a click takes one when it is your pick), who picks now and after,
   * and what each seat has taken so far. Watchers see it without the clicks.
   */
  function draftWindow(): string {
    const d = state.draft;
    if (state.phase.type !== 'draft' || !d) return '';
    const me = local();
    const mine = myTurn();
    const card = (id: string) => {
      const ok = mine && can({ type: 'draft', player: me, card: id });
      const { face, kind } = drawnCard(id);
      return ok
        ? `<button type="button" class="dr-card pickable k-${kind}" data-act="draft-pick" data-card="${esc(id)}" data-zoom="${esc(id)}" aria-label="${esc(t('draft.take', { card: id }))}">${face}</button>`
        : `<span class="dr-card k-${kind}" data-zoom="${esc(id)}">${face}</span>`;
    };
    const order = d.order
      .slice(0, 8)
      .map((p, i) => `<span class="dr-turn s-${seatColor(p)}${i === 0 ? ' now' : ''}" title="${esc(playerName(t, p))}">${icon(seatIcon(p))}</span>`)
      .join('');
    const taken = state.players
      .map((p) => {
        const got = [p.leader, ...p.lore].filter((x): x is string => !!x).map((id) => {
          return `<span class="dr-mini" data-zoom="${esc(id)}">${cardFaceById(id)}</span>`;
        });
        return `<div class="dr-seat s-${seatColor(p.id)}"><span class="seat-c">${icon(seatIcon(p.id))}</span><span class="nm">${esc(playerName(t, p.id))}</span>${got.join('') || `<span class="dr-none">${esc(t('draft.none'))}</span>`}</div>`;
      })
      .join('');
    const now = d.order[0];
    const head = mine ? t('draft.yours', { n: d.lorePerPlayer }) : t('draft.waiting', { name: playerName(t, now) });
    return `<div class="draft-win" role="dialog" aria-labelledby="draft-title">
      <div class="dr-head"><h2 id="draft-title">${esc(t('draft.title'))}</h2><span class="dr-order" aria-label="${esc(t('draft.order'))}">${order}</span></div>
      <p class="dr-hint">${esc(head)}</p>
      <div class="dr-label">${esc(t('draft.leaders'))}</div>
      <div class="dr-row">${d.leaders.map(card).join('')}</div>
      ${d.lore.length || d.lorePerPlayer ? `<div class="dr-label">${esc(t('draft.lore'))}</div><div class="dr-row">${d.lore.map(card).join('')}</div>` : ''}
      <div class="dr-taken">${taken}</div>
    </div>`;
  }

  /** The planet a battle in `system` is fought over, or null at a gate. */
  function battlePlanet(system: string): { id: string; resource: string | undefined } | null {
    const sys = ix.content.map.systems.find((s) => s.id === system);
    return sys?.kind === 'planet' ? { id: sys.id, resource: sys.resource ?? undefined } : null;
  }

  /** Puts the 3D battle scene into the battle window, or stops it when there is no battle. */
  let battle3d: BattleView3D | null | undefined;
  function mountBattle(): void {
    const slot = stage.querySelector<HTMLElement>('.battle-slot');
    if (!slot || state.phase.type !== 'allocate') {
      battle3d?.hide();
      return;
    }
    if (battle3d === undefined) {
      try {
        battle3d = new BattleView3D(params.get('motion') !== 'off');
      } catch {
        battle3d = null;
      }
    }
    if (!battle3d) return;
    const pb = state.phase.battle;
    const forces = battleForces(state, pb);
    const al = allocation()!;
    const mine = myTurn() && pb.attacker === local();
    slot.appendChild(battle3d.canvas);
    battle3d.onPick = (p: BattlePick) => {
      const next = addHit(forces, pb, allocation()!, p);
      if (!next) return;
      placed = { ...next, raid: [] };
      render();
    };
    battle3d.update({
      attackerSeat: pb.attacker,
      defenderSeat: pb.target,
      after: battleAfter(forces, al),
      buildings: forces.buildings.map((x) => ({ owner: x.owner, type: x.type })),
      dice: (pb.faces ?? []).map((f) => ({ type: f.type, face: f.face })),
      rollKey: rollKeyOf(pb),
      canPick: mine ? (p) => addHit(forces, pb, al, p) !== null : null,
      planet: battlePlanet(pb.system),
    });
  }

  /** A system as the move panel names it: its resource and cluster number, or "Gate n". */
  function systemLabel(v: TableView, id: string): string {
    return systemName(v.systems.find((x) => x.id === id), t, id);
  }

  /** Why a planned route cannot go on from its end. */
  function stopReason(v: TableView, i: MoveIntent): string {
    const end = v.systems.find((s) => s.id === i.to);
    if (end?.kind === 'planet') return t('move.stopPlanet');
    if (end && end.controller !== null && end.controller !== local()) return t('move.stopRival');
    return i.via.length ? t('move.stopHere') : t('move.oneStep');
  }

  /**
   * A row of ship pips, one per ship that could go: the first `value` lit.
   * Clicking pip k sets the count to k (clicking the last lit one takes it back by one).
   */
  function pips(name: string, value: number, max: number, lying = false): string {
    const url = assetUrl(`piece.ship-${seatColor(local())}`);
    const pic = url ? `<img src="${esc(url)}" alt="" aria-hidden="true">` : icon('ship');
    return Array.from({ length: max }, (_, k) =>
      button('pip', '', { cls: `pip${k < value ? ' on' : ''}${lying ? ' lying' : ''}`, args: { name, n: k + 1 === value ? k : k + 1 }, html: pic, title: String(k + 1) }),
    ).join('');
  }

  /**
   * The planned move: the route (each system as a step), the ships leaving and
   * where each is left on the way, where the rest arrive; then confirm, back or cancel.
   * The route itself is drawn on the map (arrow and holograms) and extended there.
   */
  function movePanel(v: TableView, i: MoveIntent): string {
    const me = local();
    const ok = can(act(movePayload(i), i.prelude));
    const src = v.systems.find((s) => s.id === i.from)?.ships.find((x) => x.player === me);
    const open = moveTargets(v, i.from, [...i.via, i.to], i.prelude).size > 0;
    const stops = routeStops(i);
    const close = button('cancel', '', { cls: 'icon x', title: t('btn.cancel'), html: icon('close') });
    const head = `<div class="ctx-head mv-head"><span class="ctx-title">${esc(t('action.move'))}</span><span class="mv-count">${i.ships + i.damaged}</span>${close}</div>`;
    const step = (cls: string, id: string, label: string, body: string) =>
      `<li class="mv-step ${cls}"><span class="mv-dot" aria-hidden="true"></span><div class="mv-body"><div class="mv-line"><span class="mv-sys">${esc(systemLabel(v, id))}</span><span class="mv-lbl">${esc(label)}</span></div>${body ? `<div class="mv-pips">${body}</div>` : ''}</div></li>`;
    // Ships still moving when the route reaches each system passed through.
    let fresh = i.ships;
    let damaged = i.damaged;
    const passes = i.via.map((at) => {
      const row = pips(`drop:${at}`, i.drop[at] ?? 0, fresh) + (damaged ? pips(`dropd:${at}`, i.dropDamaged?.[at] ?? 0, damaged, true) : '');
      fresh -= Math.min(fresh, i.drop[at] ?? 0);
      damaged -= Math.min(damaged, i.dropDamaged?.[at] ?? 0);
      return step('pass', at, t('move.dropHere'), row);
    });
    const end = stops[stops.length - 1];
    const arrive = t('move.arrive', { n: end.fresh }) + (end.damaged ? ` · ${t('move.arriveDamaged', { n: end.damaged })}` : '');
    const leave = pips('ships', i.ships, src?.fresh ?? 0) + pips('damaged', i.damaged, src?.damaged ?? 0, true);
    const note = open ? t('move.goOn') : stopReason(v, i);
    const back = i.via.length ? button('route-back', t('move.back')) : '';
    return `<div class="mv-plan s-${seatColor(me)}">${head}<ol class="mv-route">
        ${step('from', i.from, t('move.leave'), leave)}
        ${passes.join('')}
        ${step(`end${open ? '' : ' stop'}`, i.to, arrive, '')}
      </ol>
      <div class="mv-note${open ? ' open' : ''}">${esc(note)}</div>
      <div class="btn-grid mv-btns">${button('do-move', t('btn.confirm'), { cls: 'primary', disabled: !ok })}${back}</div></div>`;
  }

  /** The planned route for the 3D map: arrow, holograms at each stop, where it may go on. */
  function routePreview(v: TableView): RoutePreview | null {
    if (intent.step !== 'move') return null;
    const targets = moveTargets(v, intent.from, [...intent.via, intent.to], intent.prelude);
    return { seat: local(), path: routeOf(intent), stops: routeStops(intent), open: targets.size > 0, targets };
  }

  /** Whether the local player may start a move now (Move is one of the card's actions and one is left). */
  function canStartMove(v: TableView): boolean {
    return myTurn() && v.phase === 'actions' && !!v.budget && v.budget.remaining > 0 && v.budget.kinds.includes('move');
  }

  /** Systems holding local ships that can go somewhere now. */
  function movableFrom(v: TableView): Set<string> {
    const me = local();
    return new Set(v.systems.filter((s) => s.inPlay && s.ships.some((x) => x.player === me) && moveTargets(v, s.id, []).size > 0).map((s) => s.id));
  }

  /** The local ship groups to light up on the 3D map: the ones that can move, or the ones moving. */
  function shipGlow(v: TableView, valid: ReadonlySet<string>): ShipGlow | null {
    const me = local();
    if (intent.step === 'to' || intent.step === 'move') return { player: me, systems: new Set([intent.from]), chosen: intent.from };
    if (intent.step === 'from') return { player: me, systems: valid };
    if (intent.step === 'idle' && canStartMove(v)) return { player: me, systems: movableFrom(v) };
    return null;
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
    const live = o.live.map((l) => `<li>${esc(say(l))}</li>`).join('');
    return `<div class="live-head s-${seatColor(o.player)}"><span class="live-dot" aria-hidden="true"></span>${esc(t('others.title', { name: who }))}</div>
      <div class="hint">${esc(doing)}</div>
      ${live ? `<ol class="live-list" aria-live="polite">${live}</ol>` : ''}
      <div class="hint">${esc(facts)}</div>
      <div class="btn-grid wait"><span class="wait-label">${esc(t('others.whileWaiting'))}</span>${button('log', t('btn.log'))}</div>`;
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
            h += button('lead-declare', t('play.leadDeclare'), { args: { ambition: a }, cls: 'declare', title: `${t('play.leadDeclare')}: ${t(`ambition.${a}`)}`, html: `<span class="dg">${glyphs}</span><span>${esc(t('play.declareAmb', { amb: t(`ambition.${a}`) }))}</span>`, disabled: !can({ type: 'lead', player: me, card, declare: true, ambition: a }) });
          }
        } else if (decl) {
          const glyphs = declareGlyphs(ix, chosenCard.number).map((g) => icon(g)).join('');
          h += button('lead-declare', t('play.leadDeclare'), { cls: 'declare', title: `${t('play.leadDeclare')}: ${t(`ambition.${decl}`)}`, html: `<span class="dg">${glyphs}</span><span>${esc(t('play.declareAmb', { amb: t(`ambition.${decl}`) }))}</span>`, disabled: !can({ type: 'lead', player: me, card, declare: true }) });
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

    if (v.phase === 'allocate' && v.battle && board3d) return '';
    if (v.phase === 'allocate' && v.battle) {
      const b = v.battle;
      const summary = t('battle.summary', { hit: b.totals.hit, buildingHit: b.totals.buildingHit, selfHit: b.totals.selfHit, intercept: b.interceptHits, key: b.totals.key });
      const al = allocation();
      const ok = al !== null && can({ type: 'allocate', player: me, allocation: al });
      return `<div class="ctx-head"><span class="ctx-title">${esc(`${systemLabel(v, b.system)}: ${playerName(t, b.attacker)} → ${playerName(t, b.target)}`)}</span></div><div class="hint">${esc(summary)}</div>${raidChoices(b)}<div class="btn-grid">${button('allocate', t('battle.assign'), { cls: 'primary', disabled: !ok })}</div>${powersRow(v)}`;
    }

    if (v.phase === 'decide' && v.decision) {
      const declinable = can({ type: 'decide', player: me, args: {} });
      return `<div class="hint">${esc(t('decide.what', { card: cardName(v.decision.card), effect: t(`decide.effect.${v.decision.effect}`) }))}</div><div class="btn-grid two">${button('decide-open', t('decide.choose'), { cls: 'primary' })}${declinable ? button('decline', t('decide.decline')) : ''}</div>`;
    }

    if (v.phase !== 'actions' || !v.budget) return `<div class="hint">${esc(prompt(v))}</div>`;
    const b = v.budget;
    const i = intent;
    switch (i.step) {
      case 'idle': {
        if (b.remaining === 0) {
          // Nothing left to do with the card: the turn ends here (a lit card power, in the row under, may still be used first).
          return `<div class="ctx-head"><span class="ctx-title">${esc(t('play.actionsDone'))}</span></div>
            <div class="btn-grid one">${button('end-turn', t('play.endTurn'), { cls: 'primary end-big', disabled: !can({ type: 'endTurn', player: me }) })}</div>`;
        }
        // Actions left as stars; the suit's actions as buttons; prelude by clicking a resource on the board.
        const stars = `<span class="ctx-pips" title="${esc(prompt(v))}">${Array.from({ length: b.remaining }, () => icon('pip')).join('')}</span>`;
        const prelude = b.preludeOpen && v.players[me].slots.some((s) => s.resource && !s.locked) ? `<div class="hint small">${esc(t('play.preludeShort'))}</div>` : '';
        // Ending the turn is the confirm button in the bottom-right corner; card powers are the lit row under the buttons.
        return `<div class="ctx-head">${stars}${prelude}</div><div class="btn-grid kind-row">${kindButtons(v, b.kinds, undefined, b.remaining > 0)}</div>`;
      }
      case 'choose':
        return `<div class="ctx-head"><span class="ctx-title">${esc(t('play.preludeWith', { res: t(`resource.${i.prelude}`) }))}</span></div><div class="btn-grid kind-row">${kindButtons(v, i.kinds, i.prelude, true)}${cancel}</div>`;
      case 'system':
      case 'from':
      case 'to':
      case 'court':
        // The instruction is at the top of the screen; here only the way back.
        return `<div class="btn-grid one">${cancel}</div>`;
      case 'move':
        return movePanel(v, i);
      case 'battle': {
        const targets = rivalsIn(v, i.system)
          .map((r) => button('target', playerName(t, r), { args: { player: r }, cls: i.target === r ? 'on' : '' }))
          .join('');
        const payload = battlePayload(i);
        const ok = payload !== null && can(act(payload, i.prelude));
        return `<div class="hint">${esc(`${t('action.battle')} · ${systemLabel(v, i.system)} · ${t('battle.target')}`)}</div>
          <div class="opt-row">${targets}</div>
          <div class="opt-row">${(['skirmish', 'assault', 'raid'] as const).map((d) => stepper(d, t(`battle.dice.${d}`), i.dice[d])).join('')}</div>
          <div class="btn-grid two">${button('do-battle', t('battle.go'), { cls: 'primary', disabled: !ok })}${cancel}</div>`;
      }
    }
  }

  // ---- windows, drop-downs and hover cards ----
  /** Card powers usable now, worked out once per game state (trying every use is costly). */
  let powersCache: { state: GameState; seat: PlayerId; options: PowerOption[] } | null = null;
  function powersNow(): PowerOption[] {
    const me = local();
    if (!myTurn()) return [];
    if (powersCache?.state !== state || powersCache.seat !== me) powersCache = { state, seat: me, options: cardPowers(ix, state, me) };
    return powersCache.options;
  }

  /** The log or the map help, dropped under its header button; a click anywhere else closes it. */
  function dropHtml(): string {
    if (!drop) return '';
    const lines = state.log
      .slice(-LOG_LINES)
      .reverse()
      .map((l) => `<li><span class="num">${l.chapter}</span>${esc(say(l.text))}</li>`)
      .join('');
    const body = drop === 'log' ? `<ol class="drop-log">${lines || `<li>${esc(t('empty'))}</li>`}</ol>` : `<p class="drop-help">${esc(t('map3d.hint'))}</p>`;
    const title = drop === 'log' ? t('log.title') : t('btn.help');
    return `<div class="drop-shade" data-act="drop-close"></div><div class="drop-win d-${drop}" role="dialog" aria-label="${esc(title)}"><div class="drop-title">${esc(title)}</div>${body}</div>`;
  }

  /** The choices of a lit card power with more than one use, beside the card. */
  function powerMenuHtml(): string {
    if (!powerMenu) return '';
    const name = cardName(powerMenu.card);
    const opts = powerMenu.options
      .map((o, i) => {
        const ability = t(`power.${o.ability}`) === `power.${o.ability}` ? o.ability : t(`power.${o.ability}`);
        const what = o.parts.length ? o.parts.map(partText).join(' · ') : t('powers.use');
        return button('power-pick', what, { args: { i }, cls: 'menu-line', html: `<span class="ml-k">${esc(ability)}</span><span>${esc(what)}</span>` });
      })
      .join('');
    const close = button('power-close', '', { cls: 'icon x', title: t('btn.cancel'), html: icon('close') });
    return `<div class="sys-menu power-menu" role="dialog" aria-label="${esc(name)}"><div class="menu-head"><span>${esc(name)}</span>${close}</div><div class="menu-lines">${opts}</div></div>`;
  }

  /** Puts the power menu over the card it belongs to. */
  function placePowerMenu(): void {
    const el = stage.querySelector<HTMLElement>('.power-menu');
    if (!el || !powerMenu) return;
    const card = stage.querySelector<HTMLElement>(`[data-act="power-card"][data-card="${CSS.escape(powerMenu.card)}"]`);
    const r = stage.getBoundingClientRect();
    const c = card?.getBoundingClientRect();
    const x = c ? (c.left + c.width / 2 - r.left) / scale : STAGE.w / 2;
    // Over the card, and never down over the bar.
    const y = Math.min(c ? (c.top - r.top) / scale : REGIONS.bar.y, REGIONS.bar.y);
    el.style.left = `${Math.max(8, Math.min(STAGE.w - el.offsetWidth - 8, x - el.offsetWidth / 2))}px`;
    el.style.top = `${Math.max(8, y - el.offsetHeight - 12)}px`;
  }

  function modalHtml(v: TableView): string {
    if (!modal) return '';
    let inner = '';
    let size = 's';
    if (modal.type === 'settings') {
      const seatOpts = v.players.map((p) => `<option value="${p.id}"${seatChoice === p.id ? ' selected' : ''}>${esc(playerName(t, p.id))}</option>`).join('');
      const countOpts = [2, 3, 4].map((n) => `<option${players === n ? ' selected' : ''}>${n}</option>`).join('');
      const langOpts = LANGS.map((l) => `<option${lang === l ? ' selected' : ''}>${l}</option>`).join('');
      // Online the seat, players and seed belong to the shared game: only the language can change.
      inner = online
        ? `<h2 id="modal-title">${esc(t('settings.title'))}</h2>
        <div class="settings-grid">
          <label for="set-lang">${esc(t('settings.lang'))}</label><select id="set-lang" data-set="lang">${langOpts}</select>
        </div>
        <div class="modal-foot">${button('close-modal', t('btn.back'))}</div>`
        : `<h2 id="modal-title">${esc(t('settings.title'))}</h2>
        <div class="settings-grid">
          <label for="set-follow">${esc(t('settings.follow'))}</label><input id="set-follow" type="checkbox" class="sw" data-set="follow"${follow ? ' checked' : ''}>
          <label for="set-seat">${esc(t('settings.view'))}</label><select id="set-seat" data-set="seat"${follow ? ' disabled' : ''}>${seatOpts}</select>
          <label for="set-lang">${esc(t('settings.lang'))}</label><select id="set-lang" data-set="lang">${langOpts}</select>
          <label for="set-players">${esc(t('settings.players'))}</label><select id="set-players" data-set="players">${countOpts}</select>
          <label for="set-seed">${esc(t('settings.seed'))}</label><input id="set-seed" type="number" min="1" value="${seed}" data-set="seed">
        </div>
        <div class="modal-foot">${button('close-modal', t('btn.back'))}${button('new-game', t('settings.newGame'), { cls: 'primary' })}</div>`;
    } else if (modal.type === 'decide' && v.decision && keepChoice(v.decision)) {
      // Keep N of the cards drawn: the cards themselves, clicked to choose.
      const { cards, keep } = keepChoice(v.decision)!;
      const chosen = modal.chosen ?? [];
      const faces = cards
        .map((id) => {
          const on = chosen.includes(id);
          const { face, kind } = drawnCard(id);
          return `<button type="button" class="dr-card pickable k-${kind}${on ? ' chosen' : ''}" data-act="keep-toggle" data-card="${esc(id)}" data-zoom="${esc(id)}" aria-pressed="${on}" aria-label="${esc(id)}">${face}</button>`;
        })
        .join('');
      size = 'l';
      inner = `<h2 id="modal-title">${esc(t('keep.title', { n: keep }))}</h2>
        <div class="modal-body keep-cards">
          <p class="hint">${esc(t('keep.hint', { n: keep, card: cardName(v.decision.card) }))}</p>
          <div class="dr-row">${faces}</div>
          <p class="keep-count">${esc(t('keep.count', { n: chosen.length, of: keep }))}</p>
        </div>
        <div class="modal-foot">${button('close-modal', t('btn.back'))}${chosen.length === keep ? button('keep-confirm', t('btn.confirm'), { cls: 'primary' }) : ''}</div>`;
    } else if (modal.type === 'decide' && v.decision) {
      const opts = modal.options
        .map((o, i) => (o.parts.length ? button('decide-pick', o.parts.map(partText).join(' · '), { args: { i }, cls: 'decide-opt' }) : ''))
        .join('');
      const declinable = modal.options.some((o) => !o.parts.length);
      size = 'm';
      inner = `<h2 id="modal-title">${esc(t('decide.title'))}</h2>
        <div class="modal-body">
          <p class="hint">${esc(t('decide.what', { card: cardName(v.decision.card), effect: t(`decide.effect.${v.decision.effect}`) }))}</p>
          <div class="decide-list">${opts || `<p class="hint">${esc(t('decide.none'))}</p>`}</div>
        </div>
        <div class="modal-foot">${button('close-modal', t('btn.back'))}${declinable ? button('decline', t('decide.decline')) : ''}</div>`;
    } else {
      modal = null;
      return '';
    }
    // Centred and as tall as its content (the content is sized to fit the screen: no scroll bar).
    return `<div class="overlay" data-act="close-modal"></div><div class="glass modal fit m-${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title" style="max-height:${STAGE.h - 80}px">${inner}</div>`;
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
        const label = systemName(s, t);
        return `<span role="button" tabindex="0" class="sys-key${valid.has(s.id) ? ' valid' : ''}" data-sys="${esc(s.id)}" data-tip="sys:${esc(s.id)}" aria-label="${esc(label)}">${esc(s.id)}</span>`;
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

  /** The hotseat hand-over screen: whose turn it is, and a button to show their view. */
  function handOver(seat: PlayerId): string {
    const name = playerName(t, seat);
    return `<div class="hs-curtain" role="dialog" aria-modal="true" aria-labelledby="hs-title"><div class="hs-box s-${seatColor(seat)}">
      <span class="hs-seat seat-c">${icon(seatIcon(seat))}</span>
      <h2 id="hs-title">${esc(t('hotseat.turn', { name }))}</h2>
      <p>${esc(t('hotseat.pass', { name }))}</p>
      ${button('hs-ready', t('hotseat.ready'), { cls: 'primary' })}
    </div></div>`;
  }

  /** Whether the hand was slid away at the last render (to animate only the change). */
  let lastHandAway = false;
  function render(): void {
    if (scenario === 'battle' && !scenarioDone && state.phase.type === 'lead') {
      state = battleScenario(ix, state);
      scenarioDone = true;
    }
    const key = focusKey();
    const me = local();
    const v = withSay(tableView(ix, state, me, lang));
    const valid = validSystems(v);
    const chosen = new Set<string>();
    if (intent.step === 'to' || intent.step === 'move') {
      chosen.add(intent.from);
      for (const id of intent.via) chosen.add(id);
    }
    if (intent.step === 'move') chosen.add(intent.to);
    if (intent.step === 'battle') chosen.add(intent.system);
    if (sysMenu) chosen.add(sysMenu.system);

    const rivals = v.rivals.map((r) => rivalPanel(ix, v, v.players[r], t)).join('');
    const ending = myTurn() && v.phase === 'actions' && intent.step === 'idle';
    const choosing = myTurn() && (v.phase === 'lead' || v.phase === 'follow');
    // The turn's buttons, always at the right end of the bar: pass or redraw (leading), undo, end turn.
    const turnButtons = [
      myTurn() && v.phase === 'lead' && v.canMulligan ? button('mulligan', t('play.mulligan'), { cls: 'bar-btn' }) : '',
      myTurn() && v.phase === 'lead' ? button('pass', t('play.pass'), { cls: 'bar-btn', disabled: !can({ type: 'pass', player: me }) }) : '',
      !online || hotseat ? button('undo', t('btn.undo'), { cls: 'bar-btn ghost', html: `${icon('undo')}<span>${esc(t('btn.undo'))}</span>`, disabled: history.length === 0 }) : '',
      // With no actions left the box offers the end of the turn itself; before that, ending early is here.
      ending && (v.budget?.remaining ?? 0) > 0 ? button('end-turn', t('play.endTurn'), { cls: 'bar-btn primary end', disabled: !can({ type: 'endTurn', player: me }) }) : '',
    ].join('');
    // The hand held in a fan: the cards overlap a little, more when they would not fit.
    const handW = REGIONS.hand.w - 60;
    const nCards = v.hand.length;
    const handGap = nCards > 1 ? Math.min(-22, (handW - nCards * 100) / (nCards - 1)) : 0;
    // The context box: only when there is something to choose (a picked card, the actions, a step, a battle).
    const ctx = actionsPanel(v);
    // Hotseat: when the screen turns to another seat, hide it until that player is ready.
    if (hotseat && v.phase !== 'gameOver' && me !== shownSeat) curtainFor = me;
    shownSeat = me;
    // The action box rises in when it appears.
    const boxShown = !!ctx;
    const handMoved = boxShown !== lastHandAway;
    lastHandAway = boxShown;
    // The card played this turn (or the one picked to play), beside the board.
    const picked = selected ? v.hand.find((h) => h.card === selected) : undefined;
    const ownPlay = v.plays.some((x) => x.player === me) || !(picked && ctx) ? playedCard(ix, v, t, me) : `<div class="play picking">${actionCard(ix, picked, t)}</div>`;
    const preludes = preludeCards(v);

    stage.innerHTML = `<div class="tbl-stars"></div>
      <div class="region header" data-region="header" style="${place(REGIONS.header)}">${header(v, t, source === 'example', prompt(v), board3d?.hasInfoLayer ? controlLayer : null, drop)}</div>
      <div class="map-area${board3d ? '' : ' glass'}" data-region="map" style="${place(REGIONS.map)}">${board3d ? map3dOverlay(v, valid) : mapSvg(ix, v, valid, chosen, t)}</div>
      <div class="region rivals" data-region="rivals" style="${place(REGIONS.rivals)}">${rivals}</div>
      <div class="region court" data-region="court" style="${place(REGIONS.court)}">${courtPanel(v, t, courtPickable(intent))}</div>
      <div class="region side" data-region="side" style="${place(REGIONS.side)}">${sidePanel(ix, v, t)}</div>
      <div class="region bar" aria-hidden="true" style="${place(REGIONS.bar)}"></div>
      <div class="region" data-region="local" style="${place(REGIONS.local)}">${localPanel(v.players[me], t, spendableSlots(v), null, [], true)}</div>
      <div class="region played" data-region="played" style="${place(REGIONS.played)}">${ownPlay}</div>
      <div class="region mine" data-region="mine" style="${place(REGIONS.mine)}">${ownCourtPanel(v.players[me], t, courtSort, (id) => faceOf(ix, id, lang), REGIONS.mine.w - 26, new Set(preludes.filter((c) => c.lit).map((c) => c.card)))}</div>
      <div class="region hand" data-region="hand" style="${place(REGIONS.hand)};--gap:${handGap.toFixed(1)}px">${handPanel(ix, v, t, selected, choosing, seizeWith, '')}</div>
      <div class="region confirm" data-region="confirm" style="${place(REGIONS.confirm)}">${turnButtons}</div>
      ${ctx ? `<div class="region actions${myTurn() ? ' mine' : ''}${handMoved ? ' slide-up' : ''}" data-region="actions" role="group" aria-label="${esc(prompt(v))}" style="${placeUp(REGIONS.actions)}"><div class="actions-body">${ctx}</div>${preludeTab(preludes, t, true)}</div>` : ''}
      <div class="sr-only" role="status" aria-live="polite">${esc(prompt(v))}</div>
      ${modalHtml(v)}
      ${dropHtml()}
      ${curtainFor !== null ? handOver(curtainFor) : ''}
      ${toast ? `<div class="toast" role="alert">${esc(toast)}</div>` : ''}
      <div class="card-zoom" aria-hidden="true" hidden></div>
      <div class="hover-tip" aria-hidden="true" hidden></div>`;
    board3d?.update(v, valid, chosen, shipGlow(v, valid), routePreview(v), actionable(v));
    const menu = sysMenuHtml(v);
    if (menu) stage.insertAdjacentHTML('beforeend', menu);
    // The system being acted on stays in the free part of the screen (the map pans if a panel would hide it).
    const focus = sysMenu?.system ?? (intent.step === 'move' ? intent.to : intent.step === 'battle' ? intent.system : null);
    if (focus !== shownSystem) {
      shownSystem = focus;
      if (focus) board3d?.ensureVisible(focus);
    }
    placeMenu();
    const powers = powerMenuHtml();
    if (powers) stage.insertAdjacentHTML('beforeend', powers);
    placePowerMenu();
    const war = battleWindow(v);
    if (war) stage.insertAdjacentHTML('beforeend', war);
    const pick = draftWindow();
    if (pick) stage.insertAdjacentHTML('beforeend', pick);
    mountBattle();
    restoreFocus(key);
    const dialog = stage.querySelector('.modal');
    if (dialog && !dialog.contains(document.activeElement)) {
      dialog.querySelector<HTMLElement>('button:not(:disabled), select, input, textarea')?.focus();
    }
  }

  // ---- input ----
  function pickSystem(id: string, shipOf?: number): void {
    const v = withSay(tableView(ix, state, local(), lang));
    // Clicking your own ships while you may move starts a move from there.
    if (intent.step === 'idle' && !modal && shipOf === local() && canStartMove(v) && movableFrom(v).has(id)) {
      sysMenu = null;
      intent = { step: 'to', from: id, via: [] };
      render();
      return;
    }
    // Outside a step, with actions left: the menu of what can be done in that system.
    if (intent.step === 'idle' && !modal && v.phase === 'actions' && v.budget && v.budget.remaining > 0 && myTurn()) {
      const kinds = v.budget.kinds.filter((k) => k !== 'influence' && k !== 'secure');
      if (menuOptions(v, id, kinds).length) {
        sysMenu = { system: id, kinds };
        render();
        return;
      }
    }
    if (sysMenu) {
      // A click elsewhere on the map closes the menu (and opens another one where the step allows it below).
      sysMenu = intent.step === 'system' ? sysMenu : null;
      if (!sysMenu) return void render();
    }
    // Planning a route: a system it passes through ends it there; its start drops the plan.
    if (intent.step === 'move') {
      const cut = cutRoute(intent, id);
      if (cut || id === intent.from) {
        intent = cut ?? { step: 'to', from: intent.from, via: [], prelude: intent.prelude };
        render();
        return;
      }
    }
    // Not a choice for the current step: nothing to do (hovering the system shows what is in it).
    if (!validSystems(v).has(id)) return;
    const i = intent;
    if (i.step === 'system') {
      // The action was picked first: its choices in the menu beside the system.
      sysMenu = { system: id, kinds: [i.kind], prelude: i.prelude };
    } else if (i.step === 'from') {
      intent = { step: 'to', from: id, via: [], prelude: i.prelude };
    } else if (i.step === 'to') {
      // The first step of the route: every ship there goes (fresh ones; damaged ones when there are no fresh).
      const mine = v.systems.find((s) => s.id === i.from)?.ships.find((x) => x.player === local());
      intent = { step: 'move', from: i.from, via: i.via, to: id, ships: mine?.fresh ?? 0, damaged: mine && mine.fresh === 0 ? mine.damaged : 0, drop: {}, prelude: i.prelude };
    } else if (i.step === 'move') {
      // The route goes on (a Catapult), keeping the ships chosen and those left so far.
      intent = extendRoute(i, id);
    }
    render();
  }

  function onAct(el: HTMLElement): void {
    const d = el.dataset;
    const me = local();
    const v = withSay(tableView(ix, state, me, lang));
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
        // Influence and Secure: the Court cards that can be picked light up in the Court column.
        intent = next;
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
        sysMenu = null;
        break;
      case 'menu-close':
        sysMenu = null;
        if (intent.step === 'system') intent = IDLE;
        break;
      case 'menu-do': {
        // One choice of the map menu: done at once, except a battle (dice to choose) and a move (route to plan).
        const m = sysMenu;
        if (!m) break;
        const system = m.system;
        const pre = m.prelude;
        sysMenu = null;
        if (d.kind === 'build') return void send(act({ kind: 'build', system, what: d.what as 'ship' | 'city' | 'starport' }, pre));
        if (d.kind === 'repair') return void send(act({ kind: 'repair', system, target: d.target as 'ship' | 'building' }, pre));
        if (d.kind === 'tax') return void send(act({ kind: 'tax', system, cityOwner: Number(d.owner) }, pre));
        if (d.kind === 'battle') intent = { step: 'battle', system, target: Number(d.target), dice: { skirmish: 0, assault: 0, raid: 0 }, prelude: pre };
        else if (d.kind === 'move') intent = { step: 'to', from: system, via: [], prelude: pre };
        break;
      }
      case 'step': {
        const n = Number(d.d);
        if (intent.step === 'battle') {
          const die = d.name as 'skirmish' | 'assault' | 'raid';
          intent = { ...intent, dice: { ...intent.dice, [die]: clamp(intent.dice[die] + n, MAX_STEPPER_DICE) } };
        }
        break;
      }
      case 'target':
        if (intent.step === 'battle') intent = { ...intent, target: Number(d.player) };
        break;
      case 'pip':
        // A ship pip of the move panel: how many leave, or are left at a system on the way.
        if (intent.step === 'move' && d.name) {
          const n = Number(d.n);
          const from = intent.from;
          const mine = v.systems.find((s) => s.id === from)?.ships.find((x) => x.player === me);
          if (d.name === 'ships') intent = fitDrops({ ...intent, ships: clamp(n, mine?.fresh ?? 0) });
          else if (d.name === 'damaged') intent = fitDrops({ ...intent, damaged: clamp(n, mine?.damaged ?? 0) });
          else if (d.name.startsWith('drop:')) intent = setDrop(intent, d.name.slice(5), n);
          else if (d.name.startsWith('dropd:')) intent = setDrop(intent, d.name.slice(6), n, true);
        }
        break;
      case 'route-back':
        // One step back: the route ends at the last system it passed through.
        if (intent.step === 'move' && intent.via.length) intent = cutRoute(intent, intent.via[intent.via.length - 1]) ?? intent;
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
      case 'draft-pick':
        if (d.card) send({ type: 'draft', player: me, card: d.card });
        return;
      case 'battle-auto':
        if (state.phase.type === 'allocate') placed = { ...defaultAllocation(state, state.phase.battle), raid: [] };
        break;
      case 'battle-reset':
        if (placed) placed = emptyAllocation(placed);
        break;
      case 'allocate':
        {
          const al = allocation();
          if (al) send({ type: 'allocate', player: me, allocation: al });
        }
        return;
      case 'power-card': {
        // A lit card: its one use at once, or its choices beside it.
        const options = powersNow().filter((o) => o.card === d.card);
        if (options.length === 1) return void send(options[0].cmd);
        powerMenu = options.length ? { card: d.card!, options } : null;
        break;
      }
      case 'power-pick': {
        const o = powerMenu?.options[Number(d.i)];
        powerMenu = null;
        if (o) return void send(o.cmd);
        break;
      }
      case 'power-close':
        powerMenu = null;
        break;
      case 'decide-open':
        modal = { type: 'decide', options: decisionOptions(ix, state, me) };
        break;
      case 'keep-toggle':
        if (modal?.type === 'decide' && d.card && state.phase.type === 'decide') {
          const keep = keepChoice(state.phase.decision)?.keep ?? 0;
          const chosen = modal.chosen ?? [];
          modal.chosen = chosen.includes(d.card) ? chosen.filter((c) => c !== d.card) : chosen.length < keep ? [...chosen, d.card] : chosen;
        }
        break;
      case 'keep-confirm':
        if (modal?.type === 'decide' && modal.chosen) {
          const keep = modal.chosen;
          modal = null;
          send({ type: 'decide', player: me, args: { keep } });
        }
        return;
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
      case 'end-turn':
        send({ type: 'endTurn', player: me });
        return;
      case 'hs-ready':
        curtainFor = null;
        break;
      case 'undo': {
        if (online && !hotseat) return;
        const prev = history.pop();
        if (prev) state = prev;
        if (prev && online && hotseat) online.commit(prev).catch((e: Error) => showToast(t('error', { msg: say(e.message) })));
        resetChoices();
        modal = null;
        break;
      }
      case 'court': {
        const slot = Number(d.slot);
        // A Court card acts only while Influence or Secure picks one; hovering shows it large.
        if (courtPickable(intent).has(slot) && intent.step === 'court') return void send(act({ kind: intent.kind, courtSlot: slot }, intent.prelude));
        return;
      }
      case 'court-sort':
        courtSort = COURT_SORTS.includes(el.dataset.sort as CourtSort) ? (el.dataset.sort as CourtSort) : 'got';
        break;
      case 'map-control':
        controlLayer = !controlLayer;
        try {
          localStorage.setItem('arcs.controlLayer', controlLayer ? '1' : '0');
        } catch {
          /* not remembered */
        }
        board3d?.setSectorMode(controlLayer ? 'control' : 'resource');
        break;
      case 'help':
      case 'log':
        drop = drop === d.act ? null : (d.act as Drop);
        break;
      case 'drop-close':
        drop = null;
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
  // A Court card in the row also shows the agents on it, standing in 3D in front of it.
  let agents3d: CourtAgents3D | null | undefined;
  function agentsView(): CourtAgents3D | null {
    if (agents3d === undefined) {
      try {
        agents3d = new CourtAgents3D(params.get('motion') !== 'off');
      } catch {
        agents3d = null;
      }
    }
    return agents3d;
  }
  function showZoom(el: HTMLElement): void {
    const zoom = stage.querySelector<HTMLElement>('.card-zoom');
    const id = el.dataset.zoom;
    if (!zoom || !id) return;
    const face = faceOf(ix, id, lang);
    zoom.innerHTML = largeCard(face, t, { selected: false, disabled: false });
    const onCard = (el.dataset.agents ?? '')
      .split(',')
      .filter(Boolean)
      .map((x) => x.split(':').map(Number))
      .map(([player, count]) => ({ player, count }));
    const view = onCard.length ? agentsView() : null;
    if (view) {
      zoom.appendChild(view.canvas);
      view.show(onCard);
    } else agents3d?.hide();
    const r = el.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const x = (r.left - s.left) / scale;
    const y = (r.top - s.top) / scale;
    const w = r.width / scale;
    // A leader card is tarot size: taller than the others at the same width.
    const ZW = 300, ZH = (face.kind === 'leader' ? Math.round((ZW * 672) / 377) : 416) + (view ? AGENTS_VIEW.h - AGENTS_OVERLAP : 0), GAP = 14;
    const left = x + w / 2 > STAGE.w / 2 ? x - ZW - GAP : x + w + GAP;
    const top = Math.max(8, Math.min(STAGE.h - ZH - 8, y + (r.height / scale) / 2 - ZH / 2));
    zoom.style.left = `${left}px`;
    zoom.style.top = `${top}px`;
    zoom.hidden = false;
  }
  function hideZoom(): void {
    const zoom = stage.querySelector<HTMLElement>('.card-zoom');
    if (zoom) zoom.hidden = true;
    agents3d?.hide();
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

  // ---- hover cards: a rival's board, an ambition row, a map system ----
  /** Shows the hover card for `raw` ("seat:1", "amb:tyrant", "sys:c2-p1") beside the element or the point. */
  function showTip(raw: string, at: HTMLElement | { x: number; y: number }): void {
    const tip = stage.querySelector<HTMLElement>('.hover-tip');
    const target = parseTip(raw);
    if (!tip || !target) return;
    // Nothing over an open menu, window or drop-down.
    if (sysMenu || modal || drop || powerMenu) return hideTip();
    const key = `${raw}|${state.log.length}`;
    if (tip.dataset.key !== key) {
      const html = tipHtml(ix, withSay(tableView(ix, state, local(), lang)), target, t);
      if (!html) return hideTip();
      tip.innerHTML = html;
      tip.dataset.key = key;
    }
    tip.hidden = false;
    const s = stage.getBoundingClientRect();
    const r = at instanceof HTMLElement ? at.getBoundingClientRect() : { left: at.x, top: at.y, width: 0, height: 0 };
    const x = (r.left - s.left) / scale;
    const y = (r.top - s.top) / scale;
    const w = r.width / scale;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const GAP = at instanceof HTMLElement ? 12 : 24;
    // Beside it, on the side with room; kept inside the screen.
    const left = x + w / 2 > STAGE.w / 2 ? x - tw - GAP : x + w + GAP;
    tip.style.left = `${Math.max(8, Math.min(STAGE.w - tw - 8, left))}px`;
    tip.style.top = `${Math.max(8, Math.min(STAGE.h - th - 8, y + (r.height / scale) / 2 - th / 2))}px`;
  }
  function hideTip(): void {
    const tip = stage.querySelector<HTMLElement>('.hover-tip');
    if (tip) tip.hidden = true;
  }
  const tipTarget = (e: Event) => {
    const el = e.target as Element;
    // A card inside the element shows itself large instead.
    return el.closest('[data-zoom]') ? null : el.closest<HTMLElement>('[data-tip]');
  };
  stage.addEventListener('mouseover', (e) => {
    const el = tipTarget(e);
    if (el) showTip(el.dataset.tip!, el);
    else if (!(e.target as Element).closest('canvas')) hideTip();
  });
  stage.addEventListener('focusin', (e) => {
    const el = tipTarget(e);
    if (el) showTip(el.dataset.tip!, el);
  });
  stage.addEventListener('focusout', () => hideTip());

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
        say = engineSay();
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

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (powerMenu) powerMenu = null;
      else if (drop) drop = null;
      else if (sysMenu) {
        sysMenu = null;
        if (intent.step === 'system') intent = IDLE;
      } else if (modal) modal = null;
      else if (intent.step !== 'idle') intent = IDLE;
      else selected = null;
      render();
    }
  });

  render();
  mounted = true;

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
      if (modal?.type !== 'settings') modal = null;
      powerMenu = null;
      render();
    },
  };
}
