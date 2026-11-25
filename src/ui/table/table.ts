// The table screen (docs/ui/UI_SPEC.md): a fixed 1920×1080 stage scaled to the
// window, the map behind, HUD regions on top. It shows one seat's view and
// turns clicks into engine Commands; every rule check is the engine's
// (dispatch, or a trial dispatch through view.legal). Until the remote server
// exists the game runs locally and the view can follow the active seat.

import './table.css';
import { actionKindOf, activePlayer, adjacent, allSlotKeys, AMBITIONS, decisionAsk, dispatch, effectOf, hasPassive, indexContent, newGame, ownedEffects, RESOURCES, slotKeys } from '../../game/engine';
import type { ActionKind, ActionPayload, AmbitionId, Command, DeclareGift, MovePayload, GameContent, GameState, PlayerCount, PlayerId, RaidTake, Resource } from '../../game/engine';
import { BASE_EFFECTS } from '../../game/cards/base';
import { LANGS, pickLang, translator } from '../../i18n';
import { messageTranslator } from '../../i18n/messages';
import type { Lang } from '../../i18n';
import { loadContent } from '../content';
import { assetUrl, cardArt, icon, seatColor, seatIcon, setSeatColors } from './assets';
import { cardFaceById, cardWords, courtCardFace, faceOf, fitCardText, hasKitFace, setActionFaceSource, setFaceSource } from './cardface';
import { loadCardFonts } from './cardfonts';
import { addHit, battleAfter, battleForces, defaultAllocation, emptyAllocation, faceIndex, faceKey, facePicture, hitsLeft } from './battle';
import type { BattlePick } from './battle';
import { BATTLE_VIEW, BattleView3D } from './battleview3d';
import { battleScenario } from './scenario';
import { createBoard3D } from './board3d';
import { gpu } from './gpu';
import type { Graphics, PickWhat, RoutePreview, ShipGlow } from './board3d';
import type { Allocation, BattleRef, ChapterScoring } from '../../game/engine';
import { AGENTS_VIEW, CourtAgents3D } from './courtagents3d';

/** How far the agents' view rises over the bottom of the zoomed card, in pixels. */
const AGENTS_OVERLAP = 118;
import { cardPowers, decisionOptions } from './decide';
import { actionVariants } from './variants';
import type { VariantPart } from './variants';
import type { PowerOption } from './decide';
import type { DecisionOption, DecisionPart } from './decide';
import { parseTip, tipHtml } from './tips';
import { actionCommand, arrivedFresh, battlePayload, battleProbe, clamp, cutRoute, extendRoute, fitDrops, IDLE, MAX_STEPPER_DICE, movePayload, routeOf, routeStops, setDrop, startAction } from './intent';
import type { Intent, MoveIntent } from './intent';
import { place, placeDown, REGIONS, setSideShut, setStage, STAGE, placeUp } from './layout';
import { mapSvg } from './mapview';
import { patchChildren } from './patch';
import {
  actionCard, button, cardLabel, slotHtml, sizeAvatars, playedCard, playedText, courtPanel, pilesPanel, COURT_SORTS, type CourtSort, type PreludeCard, esc, handPanel, header, largeCard, localPanel, ownCourtPanel, playerName, rivalPanel, setSeatNames, sidePanel, systemName, systemTag, actionIcon, resIcon, suitName,
} from './render';
import { actionCardView, legal, othersTurn, tableView, whyNot } from './view';
import type { HandCardView, TableView } from './view';

/** The windows that still dim the table: the settings and a card's choice. */
/** `gift`: which Guild card to give, and to whom, to declare `ambition` (the Feastbringer, leader-07; base-fixes #48). */
type Modal = { type: 'settings' } | { type: 'confirm-pass' } | { type: 'scoring' } | { type: 'decide'; options: DecisionOption[]; chosen?: string[] } | { type: 'gift'; ambition?: AmbitionId; gifts: DeclareGift[] };

/** A drop-down under its header button: the log or the map help. */
type Drop = 'log' | 'help' | 'piles';

/** Lines of the log the drop-down shows (the latest; it fits under the header with no scroll bar). */
const LOG_LINES = 14;
/** How long the "My pieces" button lights the own pieces. */
const FIND_MINE_MS = 6000;
/** The prompt line's height, under the hand (production/base-fixes.md #17). */
const PROMPT_H = 34;
/** How long a system's card, opened by a click, stays open. */
const SYSTEM_TIP_MS = 4500;
/** How long a hover card waits before closing once the mouse leaves what it is about (time to reach the card). */
const TIP_LINGER_MS = 260;

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
  /** Where "Leave the game" in the settings window goes (the lobby), and the line about this game shown above it. */
  exit?: { href: string; about: () => string };
}

/** The system a card power's use targets (its `system` argument), or null when it targets none. */
function targetSystem(o: PowerOption): string | null {
  const c = o.cmd;
  const args = c.type === 'action' && c.action.kind === 'card' ? c.action.args : c.type === 'ability' ? c.args : undefined;
  return typeof args?.system === 'string' ? args.system : null;
}

/** True when going from `a` to `b` rolled dice, shuffled or drew from a deck: online it cannot be undone. */
function revealsHidden(a: GameState, b: GameState): boolean {
  return a.rngState !== b.rngState || a.deck.length !== b.deck.length || a.courtDeck.length !== b.courtDeck.length;
}

/** The text size chosen in the settings. */
type TextSize = 'auto' | 'normal' | 'large';
/** In automatic text size, the stage scale below which the larger text is used (1366×768 shows at 0.71). */
const AUTO_LARGE_BELOW = 0.85;

/** Mounts the table into `root`. */
export function mountTable(root: HTMLElement, online?: TableOnline): TableHandle {
  const params = new URLSearchParams(location.search);
  let lang: Lang = pickLang(location.search, navigator.language);
  let t = translator(lang);
  const { content, source } = online ? { content: online.content, source: 'owner' as const } : loadContent();
  const ix = indexContent(content, BASE_EFFECTS);
  // Every panel draws a card by id the same way: from the kit, in the table's language.
  setFaceSource((id) => faceOf(ix, id, lang));
  setActionFaceSource((id) => {
    const c = actionCardView(ix, id);
    return c ? actionCard(ix, c, t) : null;
  });
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
        // Lore and leader cards by their printed name too (piano A1: never an id in the log or its labels).
        if (/^(lore|leader)-\d+$/.test(w)) {
          const name = faceOf(ix, w, lang).name;
          if (name) return name;
        }
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
  let sysMenu: { system: string; kinds: ActionKind[]; prelude?: Resource; only?: string[] } | null = null;
  /** A Court card where both Influence and Secure can be done: its two choices, over the card. */
  /** The menu over a Court card: its actions (`only` those kinds), spending `prelude` when one is spent. */
  let courtMenu: { slot: number; only?: ActionKind[]; prelude?: Resource } | null = null;
  /** The system the map was last panned to show, so it is not pulled back while the player looks elsewhere. */
  let shownSystem: string | null = null;
  /** The lit systems last brought into view (sorted ids), so the map moves only when they change. */
  let shownLit = '';
  let modal: Modal | null = null;
  /** The drop-down open under the header (log or help), and the choices of a card power open over its card. */
  let drop: Drop | null = null;
  let powerMenu: { card: string; options: PowerOption[] } | null = null;
  /**
   * A card power whose uses each target a system (e.g. Living Structures' Prune):
   * its systems light up on the map and a click there picks (production/base-fixes.md #4, #6).
   */
  let powerPick: { card: string; options: PowerOption[] } | null = null;
  /** Until when the own pieces are lit on the map ("My pieces" button, production/base-fixes.md #7). */
  let findMineUntil = 0;
  /** The map system the keyboard is on: the one tab stop of the map, moved with the arrow keys. */
  let mapKey: string | null = null;
  /** The chapter whose scoring window was already shown here (a reload does not show it again). */
  let scoringSeen = state.lastScoring?.chapter ?? 0;
  let findMineTimer = 0;
  /** The map's control layer (who controls each sector) is on; remembered in this browser. */
  let controlLayer = false;
  /** The planets drawn in 2D as on the board (remembered between games). */
  let flatPlanets = false;
  /** How the 3D map draws, chosen in the settings (production/base-fixes.md #1). */
  let graphics: Graphics = 'auto';
  /** How the local player's own Court cards are ordered in the bar. */
  let courtSort: CourtSort = 'kind';
  /** The ambitions column folded to its tab (production/base-fixes.md #36); remembered in this browser. */
  let sideShut = false;
  /** The own Court opened leftwards over the bar, to see all of it. */
  let mineOpen = false;
  /** Battle rerolls (production/base-fixes.md #35): the cards the attacker chose not to use, and the dice picked. */
  let rerollSkip = new Set<string>();
  let rerollPick: number[] = [];
  /** A reroll is being asked in the battle window: the scene takes no hit clicks meanwhile. */
  let rerollOpen = false;
  /** The move ("from>to") whose ships-left-on-the-way counters the player asked to see. */
  let dropsOpen = '';
  try {
    controlLayer = localStorage.getItem('arcs.controlLayer') === '1';
    sideShut = localStorage.getItem('arcs.ambShut') === '1';
    flatPlanets = localStorage.getItem('arcs.planets2d') === '1';
    const g = localStorage.getItem('arcs.graphics');
    if (g === 'lite' || g === 'still') graphics = g;
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
  // Text size (base-fixes #44): large, normal, or automatic (large when the stage shows below 85%, as on a
  // 1366×768 laptop); chosen in the settings and remembered, `?text=large` forces it.
  let textSize: TextSize = 'auto';
  try {
    const saved = localStorage.getItem('arcs.text');
    if (saved === 'normal' || saved === 'large') textSize = saved;
  } catch {
    /* no storage: automatic */
  }
  if (params.get('text') === 'large') textSize = 'large';
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
    applyTextSize();
    if (mounted && before !== `${STAGE.w}x${STAGE.h}`) render();
    // The 3D map fills the window; it is centred on the area the panels leave free.
    const m = REGIONS.map;
    board3d?.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio, { x: x + m.x * s, y: y + m.y * s, w: m.w * s, h: m.h * s });
  }
  window.addEventListener('resize', fit);

  /** Turns the larger text on or off for the current choice and the stage's scale. */
  function applyTextSize(): void {
    shell.classList.toggle('large-text', textSize === 'large' || (textSize === 'auto' && scale < AUTO_LARGE_BELOW));
  }

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
        // A system's card opens on a click (production/base-fixes.md #8), not on hover.
        onPick: (id, shipOf, x, y, what) => pickSystem(id, shipOf, { x, y }, what),
        onStill: () => showToast(t('gpu.still')),
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
    board3d.setPlanetMode(flatPlanets && board3d.hasFlatPlanets ? '2d' : '3d');
    if (graphics !== 'auto') board3d.setGraphics(graphics);
    // Behind the stage, as large as the window: the interface is drawn in front of it.
    shell.classList.add('has-3d');
    shell.insertBefore(board3d.canvas, stage);
    // The map is outside the stage, so the stage never hears the pointer reach it: a hover card (a rival's
    // board, an ambition...) closes once the pointer is on the map; a system's card, opened by a click, stays.
    board3d.canvas.addEventListener('pointerenter', (e) => {
      const tip = stage.querySelector<HTMLElement>('.hover-tip:not(.hover-sub)');
      if (!tip || tip.hidden) return;
      if (tip.dataset.key?.startsWith('seat:')) return; // a rival's board, opened by a click, stays
      if (!tip.dataset.key?.startsWith('sys:')) return hideTipSoon();
      if ((e.relatedTarget as Element | null)?.closest?.('.hover-tip')) {
        clearTimeout(tipTimer);
        tipTimer = window.setTimeout(hideTip, SYSTEM_TIP_MS);
      }
    });
    // ?debug=perf: the map on window.board3d, to time its parts from the console.
    if (params.get('debug') === 'perf') Object.assign(window, { board3d });
    // No graphics card in use: the map draws lighter, and the player learns how to get it back.
    if (gpu.software) window.setTimeout(() => showToast(t('gpu.software')), 1500);
  }
  calib.order = ix.content.map.systems.map((x) => x.id);
  fit();

  // ---- helpers ----
  const local = (): PlayerId => (follow ? (activePlayer(state) ?? seatChoice) : Math.min(seatChoice, state.playerCount - 1));
  const myTurn = () => activePlayer(state) === local();
  const can = (cmd: Command) => legal(ix, state, cmd);
  /**
   * The type the resource being spent counts as, when a card lets it be spent as another (the Loyal Guild
   * cards, court-01/07/15/19/21; base-fixes #49). Only while a prelude spend is being chosen.
   */
  let spendAs: Resource | null = null;
  /** A battle waiting while its tactical move is planned on the map (the Warrior, leader-06; base-fixes #51). */
  let tacticalFor: { battle: Extract<Intent, { step: 'battle' }>; when: 'before' | 'after' } | null = null;
  const act = (payload: ActionPayload, prelude?: Resource): Command => actionCommand(local(), payload, prelude, prelude ? (spendAs ?? undefined) : undefined);

  function showToast(text: string): void {
    toast = text;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast = null;
      render();
    }, 3500);
  }

  /**
   * Takes back the last command of this screen (button or Ctrl+Z); online it
   * saves the earlier state as the shared one. False when there is nothing to undo.
   */
  function undo(): boolean {
    const prev = history.pop();
    if (!prev) return false;
    state = prev;
    if (online) online.commit(prev).catch((e: Error) => showToast(t('error', { msg: say(e.message) })));
    resetChoices();
    powerMenu = null;
    modal = null;
    return true;
  }

  function send(cmd: Command): boolean {
    try {
      // Online, a screen only plays its own seat.
      if (online && online.seat !== null && cmd.player !== online.seat) throw new Error(t('online.notYours'));
      const next = dispatch(ix, state, cmd);
      // Online, a command that rolled dice, shuffled or drew a hidden card cannot be undone (it would show
      // what was hidden, or let a roll be retried): the history before it is dropped.
      if (online && !hotseat && revealsHidden(state, next)) history = [];
      else history.push(state);
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
    powerPick = null;
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

  /**
   * What following with `card` this way gives (rulebook 5.2.2), short for under the button; `long` adds the
   * suit and, for a Surpass while nobody seized, the initiative rule (5.3.1) for its tooltip.
   */
  function followGives(v: TableView, card: HandCardView, mode: 'surpass' | 'pivot' | 'copy', long = false): string {
    const lead = v.lead;
    if (mode === 'copy') return `${t('follow.gives.copy')}${long && lead ? ` (${suitName(t, lead.suit)})` : ''}`;
    if (mode === 'pivot') return `${t('follow.gives.pivot')}${long ? ` (${suitName(t, card.suit)})` : ''}`;
    const acts = t(card.pips === 1 ? 'follow.gives.one' : 'follow.gives.many', { n: card.pips });
    return long && v.seizedBy === null ? `${acts} · ${t('follow.gives.initiative')}` : acts;
  }

  /** Why following with `card` this way is not possible now, in a short phrase. */
  function followWhyNot(v: TableView, card: HandCardView, mode: 'surpass' | 'pivot' | 'copy'): string {
    const lead = v.lead;
    if (lead && mode === 'surpass' && card.suit !== lead.suit) return t('follow.why.suit', { suit: suitName(t, lead.suit) });
    if (lead && mode === 'surpass' && card.number <= lead.number) return t('follow.why.higher', { n: lead.number });
    if (lead && mode === 'pivot' && card.suit === lead.suit) return t('follow.why.sameSuit');
    return t('follow.why.other');
  }

  /** Identity of the pending battle's roll: a new battle or a reroll changes it (and throws the dice again). */
  function rollKeyOf(b: BattleRef): string {
    return `${b.system}:${b.attacker}:${b.target}:${JSON.stringify(b.faces ?? [])}:${(b.rerolls ?? []).join(',')}`;
  }

  /**
   * The allocation for the pending battle: with the 3D battle view, the hits
   * placed one click at a time (none to start with, or all at once with
   * Assign automatically); else the proposal. The
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
      // No hit placed after the roll (production/base-fixes.md #31): the attacker places them one click at a
      // time, or Assign automatically places them in the rules' usual order (fresh ships first, buildings last).
      placed = emptyAllocation({ ...proposal, raid: [] });
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
    const usable = new Set(hasPowers(v) ? powersNow().filter((o) => o.kind !== 'reroll').map((o) => o.card) : []);
    return [...pl.court, ...pl.lore, ...(pl.leader ? [pl.leader] : [])]
      .filter((c) => {
        const e = effectOf(ix, c);
        return !!(e?.prelude || e?.actions || e?.reroll);
      })
      .map((card) => ({ card, lit: usable.has(card) }));
  }

  /** A Guild card given to declare, and to whom when named. */
  function giftText(g: DeclareGift): string {
    return g.to === undefined ? cardName(g.card) : t('decide.gift', { card: cardName(g.card), name: playerName(t, g.to) });
  }

  /** What the Imperial Demand takes from a seat: a resource type, a trophy or a captive. */
  function takenText(what: string): string {
    return what.startsWith('trophy:') ? t('decide.trophy') : what.startsWith('captive:') ? t('decide.captive') : t(`resource.${what}`);
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
      : p.kind === 'slots' ? (v as number[]).map((i) => t(`resource.${state.players[local()].resources[i] ?? ''}`)).join(', ')
      : p.kind === 'fleet' ? Object.entries(v as Record<string, { fresh?: number; damaged?: number }>).map(([k, x]) => t('decide.fleet', { name: playerName(t, Number(k)), fresh: x.fresh ?? 0, damaged: x.damaged ?? 0 })).join(', ')
      : p.kind === 'resources' ? (v as string[]).map((r) => t(`resource.${r}`)).join(', ')
      : p.kind === 'dice' ? t('powers.dice', { n: (v as number[]).length })
      : p.kind === 'players' ? (v as number[]).map((x) => playerName(t, x)).join(', ')
      : p.kind === 'word' ? t(`decide.word.${v}`)
      : p.kind === 'gift' ? giftText(v as DeclareGift)
      : p.kind === 'take' ? Object.entries(v as Record<string, string>).map(([seat, what]) => t('decide.takeFrom', { what: takenText(what), name: playerName(t, Number(seat)) })).join(', ')
      : String(v);
    return value ? `${label}: ${value}` : label;
  }

  /**
   * An answer of a card power or a Decision drawn as what it touches
   * (production/base-fixes.md #4): resource tokens, Court and Guild cards,
   * the seat (a coloured badge on the pictures, or its chip alone); the parts
   * with no picture (a system, a number) stay words beside them.
   */
  function optionHtml(parts: DecisionPart[]): string {
    const who = parts.find((x) => x.kind === 'player' && (x.key === 'from' || x.key === 'rival'));
    const seatOf = (n: number) => `<span class="pp-seat s-${seatColor(n)}"><i class="dot"></i>${esc(playerName(t, n))}</span>`;
    const card = (id: string) => `<span class="pp-card" data-zoom="${esc(id)}">${cardFaceById(id)}</span>`;
    const token = (r: string) => `<span class="pp-token">${resIcon(r as Resource, t, 'pp-res')}</span>`;
    const pics: string[] = [];
    const words: string[] = [];
    for (const x of parts) {
      const v = x.value;
      if (x.kind === 'slot') {
        const owner = (who?.value as number | undefined) ?? local();
        const r = state.players[owner]?.resources[v as number];
        if (r) pics.push(token(r));
        else words.push(partText(x));
      } else if (x.kind === 'resource') pics.push(token(v as string));
      else if (x.kind === 'resources') pics.push(...(v as string[]).map(token));
      else if (x.kind === 'card') pics.push(card(v as string));
      else if (x.kind === 'cards') pics.push(...(v as string[]).map(card));
      else if (x.kind === 'gift') {
        pics.push(card((v as DeclareGift).card));
        if ((v as DeclareGift).to !== undefined) words.push(partText(x));
      }
      else if (x.kind === 'court') pics.push(...(Array.isArray(v) ? v : [v]).map((i) => state.court[i as number]?.card).filter((c): c is string => !!c).map(card));
      else if (x.kind === 'player' && x !== who) pics.push(seatOf(v as number));
      else if (x !== who && x.kind !== 'flag') words.push(partText(x));
      else if (x.kind === 'flag') words.push(partText(x));
    }
    // The seat it is taken from: a badge on the pictures, or its chip when there is nothing else to show.
    if (who) {
      if (pics.length) pics.push(`<span class="pp-from s-${seatColor(who.value as number)}" title="${esc(playerName(t, who.value as number))}"><i class="dot"></i>${esc(playerName(t, who.value as number))}</span>`);
      else pics.push(seatOf(who.value as number));
    }
    return `<span class="pp-pics">${pics.join('')}</span>${words.length ? `<span class="pp-words">${esc(words.join(' · '))}</span>` : ''}`;
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
    if (powerPick) return new Set(powerPick.options.map((o) => targetSystem(o)!));
    const tp = tablePick(v);
    if (tp?.kind === 'system') return new Set(tp.by.keys());
    const me = local();
    const live = v.systems.filter((s) => s.inPlay);
    if (i.step === 'choose') {
      for (const kind of i.kinds) {
        if (kind === 'move') {
          for (const s of live) if (s.ships.some((x) => x.player === me) && moveTargets(v, s.id, [], i.prelude).size > 0) out.add(s.id);
        } else if (kind === 'tax' || kind === 'build' || kind === 'repair' || kind === 'battle') {
          for (const id of validSystems(v, { step: 'system', kind, prelude: i.prelude })) out.add(id);
        }
      }
      return out;
    }
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
    } else if (i.step === 'move' && i.thenPick) {
      return thenTargets(v, i);
    } else if (i.step === 'move') {
      // A planned route goes on to any system the ships may still enter (a Catapult).
      for (const id of moveTargets(v, i.from, [...i.via, i.to], i.prelude)) out.add(id);
    }
    return out;
  }

  function courtPickable(i: Intent): Set<number> {
    const out = new Set<number>();
    const tp = tablePick(withSay(tableView(ix, state, local(), lang)));
    if (tp?.kind === 'court') return new Set([...tp.by.keys()].map(Number));
    // Outside a step with actions left, every card Influence or Secure can take is lit: a click acts.
    if (i.step === 'idle' && myTurn() && !modal && state.phase.type === 'actions') {
      state.court.forEach((_, slot) => {
        if (courtKinds(slot).length) out.add(slot);
      });
      return out;
    }
    if (i.step === 'choose' && myTurn()) {
      state.court.forEach((_, slot) => {
        if (courtKinds(slot, i.kinds, i.prelude).length) out.add(slot);
      });
      return out;
    }
    if (i.step !== 'court' || !myTurn()) return out;
    state.court.forEach((_, slot) => {
      if (can(act({ kind: i.kind, courtSlot: slot }, i.prelude))) out.add(slot);
    });
    return out;
  }

  /** Influence and Secure, whichever can be done now on the Court card in `slot` (outside a step). */
  function courtKinds(slot: number, only?: readonly ActionKind[], prelude?: Resource): ('influence' | 'secure')[] {
    return (['influence', 'secure'] as const).filter((kind) => (!only || only.includes(kind)) && can(act({ kind, courtSlot: slot }, prelude)));
  }

  /** Influence and Secure on the Court card in `slot`, plain and with each card option (base-fixes #47). */
  function courtChoices(slot: number, only?: readonly ActionKind[], prelude?: Resource): { kind: 'influence' | 'secure'; label: string; x: string }[] {
    return courtKinds(slot, only, prelude).flatMap((kind) => [
      { kind, label: t(`action.${kind}`), x: '' },
      ...actionVariants(ix, state, local(), { kind, courtSlot: slot }, prelude).map((v) => ({ kind, label: `${t(`action.${kind}`)} · ${v.parts.map((p) => variantPart(p, kind)).join(' · ')}`, x: JSON.stringify(v.extra) })),
    ]);
  }

  /** The menu over a Court card, when more than one thing can be done there ('' when none). */
  function courtMenuHtml(): string {
    if (!courtMenu) return '';
    const slot = courtMenu.slot;
    const opts = courtChoices(slot, courtMenu.only, courtMenu.prelude)
      .map((o) => button('court-do', o.label, { args: { kind: o.kind, slot, x: o.x }, cls: 'menu-opt', title: o.label, html: `<span class="mo-pic">${actionIcon(o.kind)}</span><span class="mo-name">${esc(o.label)}</span>` }))
      .join('');
    const close = button('court-close', '', { cls: 'icon x', title: t('btn.cancel'), html: icon('close') });
    return `<div class="sys-menu court-menu s-${seatColor(local())}" role="dialog" aria-label="${esc(cardName(state.court[slot]?.card ?? ''))}"><div class="menu-head"><span>${esc(cardName(state.court[slot]?.card ?? ''))}</span>${close}</div><div class="menu-opts">${opts}</div></div>`;
  }

  /** Puts the Court menu under its card. */
  function placeCourtMenu(): void {
    const el = stage.querySelector<HTMLElement>('.court-menu');
    if (!el || !courtMenu) return;
    const card = stage.querySelector<HTMLElement>(`[data-act="court"][data-slot="${courtMenu.slot}"]`);
    const r = stage.getBoundingClientRect();
    const c = card?.getBoundingClientRect();
    const x = c ? (c.left + c.width / 2 - r.left) / scale : STAGE.w / 2;
    const y = c ? (c.bottom - r.top) / scale : 120;
    el.style.left = `${Math.max(8, Math.min(STAGE.w - el.offsetWidth - 8, x - el.offsetWidth / 2))}px`;
    el.style.top = `${y + 8}px`;
  }

  /**
   * A card's choice made on the table instead of in a window (production/base-fixes.md #28): when every answer
   * is one ambition, one Court card, one system or one player, those light up where they are and a click picks.
   * Null when the answers are of another sort (the list window stays).
   */
  let decideCache: { key: string; options: DecisionOption[] } | null = null;
  /** The local player's answers to the Decision now pending (cached until the game moves on). */
  function localOptions(): DecisionOption[] {
    if (state.phase.type !== 'decide') return [];
    const d = state.phase.decision;
    const key = `${state.log.length}|${d.card}|${d.effect}`;
    if (decideCache?.key !== key) decideCache = { key, options: decisionOptions(ix, state, local()) };
    return decideCache.options;
  }

  function tablePick(v: TableView): { kind: 'ambition' | 'court' | 'system' | 'player'; by: Map<string, number>; options: DecisionOption[] } | null {
    if (v.phase !== 'decide' || !v.decision || state.phase.type !== 'decide' || state.phase.decision.player !== local()) return null;
    if (keepChoice(state.phase.decision)) return null;
    const options = localOptions();
    const answers = options.map((o, i) => ({ o, i })).filter((x) => x.o.parts.length);
    if (!answers.length || answers.some((x) => x.o.parts.length !== 1)) return null;
    const kind = answers[0].o.parts[0].kind;
    if (kind !== 'ambition' && kind !== 'court' && kind !== 'system' && kind !== 'player') return null;
    if (answers.some((x) => x.o.parts[0].kind !== kind || typeof x.o.parts[0].value === 'object')) return null;
    return { kind, by: new Map(answers.map((x) => [String(x.o.parts[0].value), x.i])), options };
  }

  /** Lights the table's answers of a card's choice (tablePick) where they are drawn. */
  function markTablePicks(v: TableView): void {
    const tp = tablePick(v);
    if (!tp || tp.kind === 'system') return;
    stage.classList.add('table-pick');
    for (const [value, i] of tp.by) {
      const el =
        tp.kind === 'ambition' ? stage.querySelector<HTMLElement>(`.abox[data-tip="amb:${CSS.escape(value)}"]`)
        : tp.kind === 'court' ? stage.querySelector<HTMLElement>(`.court-tile[data-slot="${CSS.escape(value)}"]`)
        : stage.querySelector<HTMLElement>(`.board[data-tip="seat:${CSS.escape(value)}"]`);
      if (!el) continue;
      el.classList.add('tpick');
      el.dataset.pick = String(i);
    }
  }

  function spendableSlots(v: TableView): Set<number> {
    const out = new Set<number>();
    if (!myTurn() || !v.budget?.preludeOpen || intent.step !== 'idle') return out;
    for (const s of v.players[local()].slots) if (s.resource && !s.locked && spendReason(v, s.resource) === null) out.add(s.index);
    return out;
  }

  // ---- prompt and action panel ----
  function prompt(v: TableView): string {
    if (v.phase === 'gameOver') return t('prompt.gameOver', { list: v.winners.map((w) => playerName(t, w)).join(', ') });
    if (!myTurn() && v.active !== null) return t('prompt.waiting', { name: playerName(t, v.active) });
    if (sysMenu) return t('prompt.pick.menu', { system: systemLabel(v, sysMenu.system) });
    if (powerPick) return t('prompt.pick.power', { card: cardName(powerPick.card) });
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
      case 'decide': {
        if (intent.step === 'battle' && intent.collect) return t('prompt.collectDice');
        const tp = tablePick(v);
        return tp && v.decision ? t(`decide.onTable.${tp.kind}`, { card: cardName(v.decision.card) }) : t('prompt.decide');
      }
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
        // On the button the short reason, whole ("Nessun rivale"); the full sentence is its tooltip (base-fixes #44).
        const html = `${actionIcon(k)}<span class="kb-name">${esc(t(`action.${k}`))}</span>${why ? `<span class="kb-why">${esc(t(`whyShort.${k}`))}</span>` : ''}`;
        return button('kind', t(`action.${k}`), { args: { kind: k, ...(prelude ? { prelude } : {}) }, cls: 'kind-btn', disabled: !enabled || !!why, html, title: why ?? t(`action.${k}`) });
      })
      .join('');
  }

  /** Why a resource cannot be spent in the Prelude now (null: it can). */
  function spendReason(v: TableView, r: Resource): string | null {
    const own = spendReasonAs(v, r, null);
    if (own === null || spendTypes(r).some((x) => spendReasonAs(v, r, x) === null)) return null;
    return own;
  }

  /** The other types a card lets `r` be spent as (the Loyal Guild cards: any resource as theirs). */
  function spendTypes(r: Resource): Resource[] {
    return RESOURCES.filter((x) => x !== r && hasPassive(ix, state, local(), 'spendAs', (y) => y === x));
  }

  /** The actions spending `r` as `as` (its own type when null) can pay for. */
  function spendKinds(v: TableView, as: Resource): ActionKind[] {
    const rule = content.resourceActions[as];
    return 'grantKind' in rule ? [] : 'actions' in rule ? rule.actions : (v.lead?.kinds ?? []);
  }

  /** Why `r` cannot be spent as `as` now (null: it can). */
  function spendReasonAs(v: TableView, r: Resource, as: Resource | null): string | null {
    const me = local();
    const was = spendAs;
    spendAs = as;
    try {
      const rule = content.resourceActions[as ?? r];
      if ('grantKind' in rule) {
        const w = whyNot(ix, state, { type: 'prelude', player: me, resource: r, ...(as ? { as } : {}) });
        return w === null ? null : say(w);
      }
      const reasons = spendKinds(v, as ?? r).map((k) => kindReason(v, k, r));
      return reasons.some((x) => x === null) ? null : (reasons[0] ?? t('prelude.state.none'));
    } finally {
      spendAs = was;
    }
  }

  /** Spends `r` as `as` (its own type when null): at once when it grants a kind, else its actions are chosen. */
  function startSpend(v: TableView, r: Resource, as: Resource | null): void {
    const rule = content.resourceActions[as ?? r];
    spendAs = as;
    if ('grantKind' in rule) {
      intent = IDLE;
      spendAs = null;
      send({ type: 'prelude', player: local(), resource: r, ...(as ? { as } : {}) });
      return;
    }
    intent = { step: 'choose', prelude: r, kinds: spendKinds(v, as ?? r) };
  }

  /** A power's name as the card prints it (its id when there is no text for it). */
  function powerName(ability: string): string {
    const s = t(`power.${ability}`);
    return s === `power.${ability}` ? ability : s;
  }

  /**
   * The band at the bottom where the hand, the own board and the own Court lie (production/base-fixes.md #33):
   * the map under it cannot be clicked, so a dark veil says so; only cards and tokens are used there.
   */
  /**
   * The turn instruction under the hand stays whole on its line: when it is too long for it, its text
   * shrinks a step at a time, down to 75% of its size (base-fixes #44); the tooltip keeps the whole text.
   */
  function fitPrompt(): void {
    const line = stage.querySelector<HTMLElement>('.hd.prompt .pr-text');
    if (!line) return;
    line.style.fontSize = '';
    let size = parseFloat(getComputedStyle(line).fontSize);
    const min = size * 0.75;
    while (line.scrollWidth > line.clientWidth + 1 && size > min) {
      size -= 1;
      line.style.fontSize = `${size}px`;
    }
  }

  /**
   * The command bar and the ambitions' column stay whole when the interface font draws wider than Segoe UI
   * (macOS, Linux, Android: playtest 2026-11-25 on the CI runner). The bar, when its buttons do not fit, shows
   * Undo and Cancel as their icon alone (their name stays in the tooltip and for screen readers); the column,
   * when its rows do not fit, draws its rule notes and pictures smaller, then leaves the notes to the hover card.
   */
  function fitSide(): void {
    const bar = stage.querySelector<HTMLElement>('.cmd-bar');
    if (bar) {
      bar.classList.remove('tight');
      const row = bar.querySelector<HTMLElement>('.cmd-row');
      const spills = () => !!row && [...row.querySelectorAll<HTMLElement>('button')].some((b) => b.scrollWidth > b.clientWidth + 1);
      if (row && (row.scrollWidth > row.clientWidth + 1 || spills())) bar.classList.add('tight');
    }
    // Measured on the rows: the column's frame draws a little outside it, which its own scroll height counts.
    const amb = stage.querySelector<HTMLElement>('.region.side .side-amb');
    const rows = amb?.querySelector<HTMLElement>('.amb-rows');
    if (amb && rows) {
      amb.classList.remove('tight', 'tighter');
      if (rows.scrollHeight > rows.clientHeight + 1) amb.classList.add('tight');
      if (rows.scrollHeight > rows.clientHeight + 1) amb.classList.add('tighter');
    }
  }

  /** A named landmark for a part of the table, for screen readers and the skip links. */
  function zone(name: string): string {
    return ` role="region" aria-label="${esc(t(`zone.${name}`))}"`;
  }

  /**
   * The skip links, first in the Tab order and shown only while focused: they
   * jump straight to the hand, the command bar or another part of the table
   * instead of tabbing through the whole map.
   */
  function skipLinks(bar: boolean): string {
    const to = ['hand', ...(bar ? ['actions'] : []), 'local', 'map', 'court', 'ambitions', 'rivals'];
    return `<nav class="skip-nav" aria-label="${esc(t('zone.skip'))}">${to.map((z) => `<button type="button" class="skip-link" data-act="skip" data-to="${z}">${esc(t(`zone.${z}`))}</button>`).join('')}</nav>`;
  }

  /** Moves the keyboard focus into the part of the table `name` (its first control, else the part itself). */
  function focusZone(name: string): void {
    const box = stage.querySelector<HTMLElement>(`[data-region="${CSS.escape(name)}"]`);
    if (!box) return;
    const first = box.querySelector<HTMLElement>('button:not([disabled]), [tabindex="0"], input, select');
    if (first) return void first.focus();
    box.tabIndex = -1;
    box.focus();
  }

  function handZone(): string {
    const top = Math.min(REGIONS.bar.y, REGIONS.local.y - 40);
    return `<div class="hand-zone" aria-hidden="true" style="left:0;top:${top}px;width:${STAGE.w}px;height:${STAGE.h - top}px"></div>`;
  }

  /** The local player's card actions ("Name (Kind)"), with the action they stand for. */
  function cardActions(): { card: string; name: string; as: ActionKind }[] {
    const pl = state.players[local()];
    return [...pl.court, ...pl.lore, ...(pl.leader ? [pl.leader] : [])].flatMap((card) => Object.entries(effectOf(ix, card)?.actions ?? {}).map(([name, a]) => ({ card, name, as: a.as })));
  }

  /** One thing the map menu offers: a piece picture, a label, and the command (or why it cannot be done). */
  interface MenuOption {
    kind: ActionKind;
    label: string;
    pic: string;
    why: string | null;
    args: Record<string, string | number>;
  }

  /**
   * What the local player can do in system `id`, by action kind (only kinds with something possible there).
   * `rich`: also the card options of each choice (tried one by one: only for the menu on screen).
   */
  function menuOptions(v: TableView, id: string, kinds: readonly ActionKind[], prelude?: Resource, only?: readonly string[], rich = false): MenuOption[][] {
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
        opts = (['ship', 'city', 'starport'] as const).filter((what) => !only || only.includes(what)).flatMap((what) => {
          const plain: MenuOption = { kind, label: t(`build.${what}`), pic: pic(what, me), why: why({ kind: 'build', system: id, what }), args: { what } };
          return rich ? [plain, ...variantOptions({ kind: 'build', system: id, what }, t(`build.${what}`), pic(what, me), { what }, prelude)] : [plain];
        });
      } else if (kind === 'repair') {
        const dmgBuilding = s.buildings.find((b) => b.owner === me && b.damaged);
        opts = (['ship', 'building'] as const).map((target) => ({ kind, label: t(`repair.${target}`), pic: pic(target === 'ship' ? 'ship' : (dmgBuilding?.type ?? 'city'), me), why: why({ kind: 'repair', system: id, target }), args: { target } }));
      } else if (kind === 'tax') {
        const owners = [...new Set(s.buildings.filter((b) => b.type === 'city').map((b) => b.owner))];
        opts = owners.flatMap((o) => {
          const label = o === me ? t('menu.taxOwn') : t('menu.taxRival', { name: playerName(t, o) });
          const payload: ActionPayload = { kind: 'tax', system: id, cityOwner: o };
          return [{ kind, label, pic: pic('city', o), why: why(payload), args: { owner: o } }, ...(rich ? variantOptions(payload, label, pic('city', o), { owner: o }, prelude) : [])];
        });
        // A card that taxes empty building slots where you have ships (the Anarchist, leader-13).
        const slot: ActionPayload = { kind: 'tax', system: id, emptySlot: true };
        if (can(act(slot, prelude))) {
          opts.push({ kind, label: t('menu.taxSlot'), pic: pic('city', me), why: null, args: { owner: me, x: JSON.stringify({ emptySlot: true }) } });
          if (rich) opts.push(...variantOptions(slot, t('menu.taxSlot'), pic('city', me), { owner: me }, prelude).map((o) => ({ ...o, args: { ...o.args, x: JSON.stringify({ emptySlot: true, ...extraOf(o.args) }) } })));
        }
      } else if (kind === 'battle') {
        opts = rivalsIn(v, id).map((r) => ({ kind, label: playerName(t, r), pic: pic('ship', r), why: why({ kind: 'battle', system: id, target: r, dice: battleProbe((dice) => can(act({ kind: 'battle', system: id, target: r, dice }, prelude))) ?? { skirmish: 1 } }), args: { target: r } }));
      } else if (kind === 'move' && s.ships.some((x) => x.player === me) && moveTargets(v, id, [], prelude).size > 0) {
        opts = [{ kind, label: t('menu.moveFrom'), pic: pic('ship', me), why: null, args: {} }];
      }
      if (opts.some((o) => o.why === null)) out.push(opts);
    }
    return out;
  }

  /** One card option of an action, in words (production/base-fixes.md #47). */
  function variantPart(p: VariantPart, kind: ActionKind): string {
    const res = (r: Resource) => t(`resource.${r}`);
    const card = (slot: number) => cardName(state.court[slot]?.card ?? '');
    switch (p.key) {
      case 'city':
        return t('menu.cityN', { n: p.n + 1 });
      case 'resource':
        return t('menu.takeRes', { res: res(p.resource) });
      case 'shape':
        return t('menu.shape', { res: res(p.resource) });
      case 'again':
        return kind === 'tax' ? t('menu.taxAgain') : t('menu.buildAgain');
      case 'ransack':
        return `${kind === 'tax' ? t('menu.taxAgain') : t('menu.buildAgain')} · ${t('menu.ransack', { card: card(p.slot) })}`;
      case 'outside':
        return t('menu.outside', { res: res(p.resource) });
      case 'twice':
        return t('menu.twice', { card: card(p.slot) });
      case 'influence':
        return t(`menu.influence.${p.when}`, { card: card(p.slot) });
    }
  }

  /**
   * The card options of an action as menu choices (the Overseer's "hit it to do it again", leader-10,
   * base-fixes #46; every other card option, #47): one per legal variant, its fields in `x`.
   */
  function variantOptions(payload: ActionPayload, label: string, pic: string, base: Record<string, string | number>, prelude?: Resource): MenuOption[] {
    const kind = actionKindOf(ix, payload);
    return actionVariants(ix, state, local(), payload, prelude).map((v) => ({
      kind,
      label: `${label} · ${v.parts.map((p) => variantPart(p, kind)).join(' · ')}`,
      pic,
      why: null,
      args: { ...base, x: JSON.stringify(v.extra), ...(v.parts.some((p) => p.key === 'again' || p.key === 'ransack') ? { again: 1 } : {}) },
    }));
  }

  /** The card-option fields of a menu choice (`x`, set by variantOptions), or none. */
  function extraOf(a: Record<string, string | number | undefined>): Record<string, unknown> {
    if (typeof a.x !== 'string' || !a.x) return {};
    try {
      const x: unknown = JSON.parse(a.x);
      return x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  /** Systems where the menu has something to do now (outside a step, with actions left). */
  function actionable(v: TableView): Set<string> {
    const out = new Set<string>();
    if (intent.step !== 'idle' || modal || !myTurn() || v.phase !== 'actions' || !v.budget || v.budget.remaining < 1) return out;
    const kinds = v.budget.kinds.filter((k) => k !== 'move' && k !== 'influence' && k !== 'secure');
    for (const s of v.systems) if (s.inPlay && menuOptions(v, s.id, kinds).length) out.add(s.id);
    return out;
  }

  /**
   * One choice of the map menu: done at once (true: sent), except a battle (its dice chosen in the battle window)
   * and a move (its route planned on the map), which open their step (false).
   */
  function menuDo(v: TableView, system: string, pre: Resource | undefined, kind: ActionKind, a: Record<string, string | number | undefined>): boolean {
    const me = local();
    if (kind === 'build' || kind === 'repair' || kind === 'tax') {
      if (kind === 'build') send(act({ ...extraOf(a), kind: 'build', system, what: a.what as 'ship' | 'city' | 'starport' }, pre));
      else if (kind === 'repair') send(act({ kind: 'repair', system, target: a.target as 'ship' | 'building' }, pre));
      else {
        const x = extraOf(a);
        send(act({ ...x, kind: 'tax', system, ...(x.emptySlot ? {} : { cityOwner: Number(a.owner) }) }, pre));
      }
      return true;
    }
    if (kind === 'battle') {
      const target = Number(a.target);
      const here = v.systems.find((s) => s.id === system)?.ships.find((x) => x.player === me);
      let n = Math.min(MAX_STEPPER_DICE, (here?.fresh ?? 0) + (here?.damaged ?? 0));
      while (n > 1 && !can(act({ kind: 'battle', system, target, dice: { skirmish: n } }, pre))) n--;
      intent = { step: 'battle', system, target, dice: { skirmish: n, assault: 0, raid: 0 }, prelude: pre };
    } else if (kind === 'move') intent = { step: 'to', from: system, via: [], prelude: pre };
    return false;
  }

  /** The menu beside the chosen system ('' when none). */
  function sysMenuHtml(v: TableView): string {
    const m = sysMenu;
    if (!m) return '';
    const sections = menuOptions(v, m.system, m.kinds, m.prelude, m.only, true);
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


  /** A battle's defender by name: a player, or (campaign) the Empire, the Free States or the Blight. */
  function defenderName(d: BattleRef['target']): string {
    return typeof d === 'number' ? playerName(t, d) : t(`battle.defender.${d}`);
  }

  /** What the rolled keys can steal from the defender (resources and Guild cards), as toggles; '' without keys. */
  function raidChoices(b: BattleRef): string {
    if (b.totals.key <= 0 || typeof b.target !== 'number') return '';
    const def = state.players[b.target];
    const on = (x: RaidTake) => raid.some((r) => ('resource' in r && 'resource' in x && r.resource === x.resource) || ('card' in r && 'card' in x && r.card === x.card));
    // Every thing to steal as its picture (the resource token, the Guild card), its key cost on it, and its place in
    // the order chosen (production/base-fixes.md #21).
    const order = (x: RaidTake) => raid.findIndex((r) => ('resource' in r && 'resource' in x && r.resource === x.resource) || ('card' in r && 'card' in x && r.card === x.card)) + 1;
    const keys = (n: number | string) => `<span class="rd-keys">${icon('key')}<b class="num">${esc(String(n))}</b></span>`;
    const pick = (take: RaidTake, args: Record<string, string | number>, label: string, pic: string, cost: number | string, cls: string) => {
      const n = order(take);
      return button('raid', label, { args, cls: `rd-pick ${cls}${on(take) ? ' on' : ''}`, title: label, html: `${pic}${keys(cost)}${n ? `<span class="rd-n num">${n}</span>` : ''}` });
    };
    const res = def.resources
      .map((r, i) => (r ? pick({ resource: i }, { res: i }, `${t(`resource.${r}`)} · ${t('card.keys', { n: slotKeys(content, i, def) })}`, resIcon(r, t, 'rd-res'), slotKeys(content, i, def), 'rd-token') : ''))
      .join('');
    const cards = def.court
      .filter((c) => ix.courtCards.get(c)?.kind === 'faction')
      .map((c) => pick({ card: c }, { card: c }, `${cardName(c)} · ${t('card.keys', { n: ix.courtCards.get(c)?.keys ?? 1 })}`, `<span class="rd-card" data-zoom="${esc(c)}">${cardFaceById(c)}</span>`, ix.courtCards.get(c)?.keys ?? 1, 'rd-guild'))
      .join('');
    return `<div class="hint">${esc(t('battle.raid', { n: b.totals.key }))}</div><div class="rd-row">${res}${cards}</div>`;
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
    const ask = mine ? rerollAsk(b) : null;
    rerollOpen = !!ask;
    const ok = mine && !ask && al !== null && can({ type: 'allocate', player: me, allocation: al });
    const hitsDone = left.hits === 0 && left.buildingHits === 0 && left.selfHits === 0;
    const steps = battleSteps(ask ? 2 : !hitsDone || b.totals.key <= 0 ? 3 : 4, { powers: !holdsReroll(), raid: b.totals.key <= 0 });
    const chip = (key: string, n: number, total: number) => (total > 0 ? `<span class="b-chip${n === 0 ? ' done' : ''}">${esc(t(key, { n, total }))}</span>` : '');
    const counts = `${chip('battle.left.hits', left.hits, b.totals.hit)}${chip('battle.left.building', left.buildingHits, b.totals.buildingHit)}${chip('battle.left.self', left.selfHits, b.totals.selfHit + b.interceptHits)}`;
    const controls = mine
      ? `<div class="b-foot">${ask ? '' : raidChoices(b)}<div class="b-btns">${ask ? `<span class="hint small">${esc(t('reroll.first'))}</span>` : ''}${button('battle-auto', t('battle.auto'), { cls: 'b-btn', disabled: !!ask })}${button('battle-reset', t('battle.reset'), { cls: 'b-btn', disabled: !!ask })}${button('allocate', t('battle.confirm'), { cls: 'primary b-btn', disabled: !ok })}</div></div>`
      : `<div class="b-foot"><div class="hint">${esc(t('battle.watching', { who: playerName(t, b.attacker) }))}</div></div>`;
    const title = t('battle.title', { system: systemName(ix.content.map.systems.find((s) => s.id === b.system), t, b.system), a: playerName(t, b.attacker), d: defenderName(b.target) });
    return `<div class="battle-win glass" role="dialog" aria-label="${esc(title)}">
      <div class="b-head"><span class="ctx-title">${esc(title)}</span><span class="b-counts">${counts || esc(t('battle.noHits'))}</span></div>
      ${steps}
      ${diceStrip(b, ask)}
      ${ask ? rerollBox(ask) : ''}
      <div class="battle-slot${ask ? ' short' : ''}" style="width:${BATTLE_VIEW.w}px"></div>
      ${mine && !ask ? `<div class="hint small">${esc(t('battle.howTo'))}</div>` : ''}
      ${controls}
    </div>`;
  }

  /** The battle's steps in a row, `now` lit, the earlier ones ticked, the ones that do not apply here dimmed. */
  function battleSteps(now: number, skip: { powers: boolean; raid: boolean }): string {
    const names = ['dice', 'roll', 'powers', 'hits', 'raid'];
    return `<ol class="b-steps">${names
      .map((n, k) => {
        const off = (n === 'powers' && skip.powers) || (n === 'raid' && skip.raid);
        const cls = off ? 'off' : k < now ? 'done' : k === now ? 'now' : '';
        return `<li class="${cls}"><i>${k < now && !off ? '✓' : k + 1}</i>${esc(t(`battle.step.${n}`))}</li>`;
      })
      .join('')}</ol>`;
  }

  /** The local cards held: Court, Lore and the Leader. */
  function heldCards(): string[] {
    const pl = state.players[local()];
    return [...pl.court, ...pl.lore, ...(pl.leader ? [pl.leader] : [])];
  }

  /** Whether the local attacker holds a card that rerolls battle dice. */
  function holdsReroll(): boolean {
    return heldCards().some((c) => !!effectOf(ix, c)?.reroll);
  }

  /** The extra dice the local cards add in a battle at `system`, each named with its card. */
  function extraDiceNotes(system: string): string {
    const gate = ix.content.map.systems.find((x) => x.id === system)?.kind === 'gate';
    return heldCards()
      .map((c) => ({ c, x: effectOf(ix, c)?.extraDice }))
      .filter(({ x }) => x && (!x.inGate || gate))
      .map(({ c, x }) => `<span class="b-extra">${esc(t('battle.extraDice', { card: cardName(c), n: x!.count }))}${x!.mandatory ? ` · ${esc(t('battle.extraMust'))}` : ''}</span>`)
      .join('');
  }

  /**
   * The reroll the attacker is asked about now: the first card with a reroll usable on this roll and not turned
   * down, the dice it may take, and how many at most.
   */
  function rerollAsk(b: BattleRef): { card: string; die?: string; eligible: number[]; max: number; others: string[] } | null {
    const me = local();
    if (!myTurn() || b.attacker !== me || state.phase.type !== 'allocate') return null;
    const cards = [...new Set(powersNow().filter((o) => o.kind === 'reroll').map((o) => o.card))].filter((c) => !rerollSkip.has(c));
    if (!cards.length) return null;
    const card = cards[0];
    const die = effectOf(ix, card)?.reroll?.die;
    const eligible = (b.faces ?? []).map((f, i) => ({ f, i })).filter((x) => !die || x.f.type === die).map((x) => x.i);
    let max = 0;
    for (let k = 1; k <= eligible.length; k++) if (can({ type: 'reroll', player: me, card, dice: eligible.slice(0, k) })) max = k;
    if (max === 0) return null;
    return { card, die, eligible, max, others: cards.slice(1) };
  }

  /** The reroll ask in the battle window: the card, what it allows, the dice picked, Reroll or Do not use. */
  function rerollBox(ask: NonNullable<ReturnType<typeof rerollAsk>>): string {
    const me = local();
    const pick = rerollPick.filter((i) => ask.eligible.includes(i));
    const ok = pick.length > 0 && can({ type: 'reroll', player: me, card: ask.card, dice: pick });
    const title = ask.die
      ? t('reroll.title', { card: cardName(ask.card), n: ask.max, die: t(`battle.dice.${ask.die}`) })
      : t('reroll.titleAny', { card: cardName(ask.card), n: ask.max });
    const next = ask.others.length ? `<div class="rr-next">${esc(t('reroll.next', { cards: ask.others.map(cardName).join(', ') }))}</div>` : '';
    return `<div class="rr-ask">
      <span class="rr-card" data-zoom="${esc(ask.card)}">${cardFaceById(ask.card)}</span>
      <div class="rr-txt"><div class="rr-title">${esc(title)}</div><div class="rr-how">${esc(t('reroll.how', { k: pick.length }))}</div>${next}</div>
      <div class="rr-btns">${button('reroll-go', t('reroll.go', { n: pick.length }), { cls: 'primary b-btn', disabled: !ok })}${button('reroll-skip', t('reroll.skip'), { cls: 'b-btn' })}</div>
    </div>`;
  }

  /** The picture that stands for each die type while the dice are being chosen (one of its faces). */
  const DIE_PICTURE = { skirmish: 'dice.skirmish-1-3', assault: 'dice.assault-4', raid: 'dice.raid-5' } as const;

  /**
   * The battle window before the roll (3D map only): the two fleets, and the
   * dice to roll as the real dice. A click on a die turns it into the next
   * type (skirmish, assault, raid, none); a free place adds one. Then Roll,
   * and the same window shows the roll and takes the hits.
   */
  /**
   * The attacker collecting dice after the defender reacted (Predictive Sensors, lore-15): the battle window
   * again, with the dice first asked for, so they can be changed now that the defender's ships moved in
   * (rules: dice are collected after the reactions; piano D1). Any other moment leaves the intent as it is.
   */
  function syncCollectIntent(): void {
    const ph = state.phase;
    const b = state.battleSetup;
    const due = ph.type === 'decide' && ph.decision.effect === 'collectDice' && ph.decision.player === local() && !!b && typeof b.target === 'number';
    if (!due) {
      if (intent.step === 'battle' && intent.collect) intent = IDLE;
      return;
    }
    if (intent.step === 'battle' && intent.collect) return;
    intent = { step: 'battle', system: b!.system, target: b!.target as PlayerId, dice: { skirmish: b!.dice.skirmish ?? 0, assault: b!.dice.assault ?? 0, raid: b!.dice.raid ?? 0 }, collect: true };
  }

  function battleSetup(v: TableView): string {
    const i = intent;
    if (!board3d || i.step !== 'battle' || i.target === null || !myTurn()) return '';
    const me = local();
    const target = i.target;
    const total = i.dice.skirmish + i.dice.assault + i.dice.raid;
    // Collecting after the defender reacted (Predictive Sensors): the dice are the Decision's answer (piano D1).
    const collect = !!i.collect;
    const payload = collect ? null : battlePayload(i);
    const why = payload && total > 0 ? whyNot(ix, state, act(payload, i.prelude)) : null;
    const ok = collect ? total > 0 && can({ type: 'decide', player: me, args: { dice: { ...i.dice } } }) : payload !== null && total > 0 && why === null;
    const here = v.systems.find((s) => s.id === i.system)?.ships.find((x) => x.player === me);
    // A die can be added when the pool it makes is legal, or becomes legal with more skirmish dice (a card's
    // mandatory extra dice make the small pools on the way illegal): from none, a die can always be added again.
    const grows = (dice: { skirmish: number; assault: number; raid: number }) => {
      for (let k = 0; dice.skirmish + dice.assault + dice.raid + k <= MAX_STEPPER_DICE; k++) {
        const pool = { ...dice, skirmish: dice.skirmish + k };
        if (collect ? can({ type: 'decide', player: me, args: { dice: pool } }) : can(act({ kind: 'battle', system: i.system, target, dice: pool }, i.prelude))) return true;
      }
      return false;
    };
    const more = total < MAX_STEPPER_DICE && grows({ ...i.dice, skirmish: i.dice.skirmish + 1 });
    const places = Math.min(MAX_STEPPER_DICE, Math.max(total + (more ? 1 : 0), (here?.fresh ?? 0) + (here?.damaged ?? 0)));
    // One tile per die type (production/base-fixes.md #20): the die, what it does, how many, - and +.
    const tiles = (['skirmish', 'assault', 'raid'] as const).map((d) => {
      const url = assetUrl(DIE_PICTURE[d]);
      const plus = total < MAX_STEPPER_DICE && grows({ ...i.dice, [d]: i.dice[d] + 1 });
      const name = t(`battle.dice.${d}`);
      return `<div class="b-type d-${d}${i.dice[d] ? ' used' : ''}">
        <span class="bt-die">${url ? `<img src="${esc(url)}" alt="">` : ''}</span>
        <span class="bt-name">${esc(name)}</span><span class="bt-does">${esc(t(`battle.does.${d}`))}</span>
        <span class="bt-count">${button('die-step', '−', { args: { type: d, d: -1 }, cls: 'bt-step', title: t('battle.lessDie', { type: name }), disabled: i.dice[d] < 1 })}<b class="num">${i.dice[d]}</b>${button('die-step', '+', { args: { type: d, d: 1 }, cls: 'bt-step', title: t('battle.moreDie', { type: name }), disabled: !plus })}</span>
      </div>`;
    }).join('');
    const rivals = rivalsIn(v, i.system);
    const targets = rivals.length > 1 ? `<div class="opt-row b-targets"><span class="hint small">${esc(t('battle.target'))}</span>${rivals.map((r) => button('target', playerName(t, r), { args: { player: r }, cls: target === r ? 'on' : '' })).join('')}</div>` : '';
    const title = t('battle.title', { system: systemLabel(v, i.system), a: playerName(t, me), d: playerName(t, target) });
    const extra = extraDiceNotes(i.system);
    // A move before or after the battle (the Warrior on a Copy or Pivot): planned on the map, then back here.
    let tactical = '';
    if (collect) {
      // The battle is already declared: no move to add.
    } else if (i.tactical) {
      const m = i.tactical.move;
      tactical = `<div class="opt-row b-tactical"><span class="hint small">${esc(t(`battle.tactical.${i.tactical.when}`, { from: systemLabel(v, m.from), to: systemLabel(v, m.to), n: m.ships + (m.damaged ?? 0) }))}</span>${button('tactical-off', t('battle.tacticalOff'), { cls: 'link' })}</div>`;
    } else if (payload && tacticalPossible(v, payload)) {
      tactical = `<div class="opt-row b-tactical"><span class="hint small">${esc(t('battle.tacticalAsk'))}</span>${(['before', 'after'] as const).map((when) => button('tactical', t(`battle.tacticalWhen.${when}`), { args: { when } })).join('')}</div>`;
    }
    // The defender hits first (Railgun Arrays, lore-12): with fresh and damaged ships, which one takes it.
    let preHit = '';
    const theirs = v.systems.find((s) => s.id === i.system)?.ships.find((x) => x.player === target);
    if (!collect && here && here.fresh > 0 && here.damaged > 0 && (theirs?.fresh ?? 0) > 0 && ownedEffects(ix, state, target).some((f) => f.effect.hitAttackerIfFresh)) {
      const on = i.preHit ?? 'fresh';
      preHit = `<div class="opt-row b-prehit"><span class="hint small">${esc(t('battle.preHitAsk'))}</span>${(['fresh', 'damaged'] as const).map((h) => button('pre-hit', t(`battle.preHit.${h}`), { args: { hit: h }, cls: on === h ? 'on' : '' })).join('')}</div>`;
    }
    return `<div class="battle-win glass setup" role="dialog" aria-label="${esc(title)}">
      <div class="b-head"><span class="ctx-title">${esc(title)}</span></div>
      ${battleSteps(0, { powers: !holdsReroll(), raid: false })}
      ${targets}
      <div class="b-types">${tiles}</div>
      <div class="b-info"><span class="hint small">${esc(t('battle.pickDice', { n: total, max: places }))}</span>${extra}</div>
      ${tactical}${preHit}
      <div class="battle-slot" style="width:${BATTLE_VIEW.w}px"></div>
      ${why ? `<div class="hint b-why">${esc(say(why))}</div>` : ''}
      ${collect ? `<div class="hint b-why">${esc(t('battle.collectAfter', { name: playerName(t, target) }))}</div>` : ''}
      <div class="b-foot"><div class="b-btns">${collect ? '' : button('cancel', t('btn.cancel'), { cls: 'b-btn' })}${button('do-battle', t('battle.go'), { cls: 'primary b-btn', disabled: !ok })}</div></div>
    </div>`;
  }

  /**
   * True when a card lets this battle come with a move (the Warrior, leader-06, on a Copy or Pivot): the engine
   * accepts the battle with some legal move of the player's ships kept for after it.
   */
  function tacticalPossible(v: TableView, payload: ActionPayload): boolean {
    if (payload.kind !== 'battle' || !hasPassive(ix, state, local(), 'moveWithBattleOnCopyPivot')) return false;
    const me = local();
    for (const s of v.systems) {
      const mine = s.ships.find((x) => x.player === me);
      if (!s.inPlay || !mine || mine.fresh + mine.damaged < 1) continue;
      for (const to of v.systems) {
        if (!to.inPlay || to.id === s.id || !adjacent(ix, state, s.id, to.id)) continue;
        const move: MovePayload = { kind: 'move', from: s.id, to: to.id, ships: mine.fresh ? 1 : 0, ...(mine.fresh ? {} : { damaged: 1 }) };
        if (can(act({ ...payload, tactical: { when: 'after', move } }))) return true;
      }
    }
    return false;
  }

  /** The roll the dice strip last showed: a new roll (or reroll) tumbles the dice in again, other renders keep them still. */
  let diceShown = '';
  /**
   * The rolled dice as the official face pictures, in the order they fire in
   * the battle view (each one lands as its volley starts).
   */
  function diceStrip(b: BattleRef, ask: ReturnType<typeof rerollAsk> = null): string {
    const faces = b.faces ?? [];
    if (!faces.length) return '';
    const key = rollKeyOf(b);
    const roll = key !== diceShown && params.get('motion') !== 'off';
    diceShown = key;
    // Each die a cube with its six printed faces (production/base-fixes.md #14): it tumbles in and lands with the
    // rolled face towards the player.
    const dice = faces
      .map((f, i) => {
        const pic = facePicture(f.type, f.face);
        const label = `${t(`battle.dice.${f.type}`)}: ${faceKey(f.face) || '—'}`;
        const flat = pic ? `<img src="${esc(assetUrl(pic))}" alt="">` : `<span>${esc(faceKey(f.face) || '·')}</span>`;
        const all = ix.content.dice[f.type] ?? [];
        const pics = all.map((x) => facePicture(f.type, x));
        const may = !!ask && ask.eligible.includes(i);
        const picked = may && rerollPick.includes(i);
        const pickAttr = may ? ` data-act="reroll-die" data-i="${i}" role="button" tabindex="0" aria-pressed="${picked}"` : '';
        const cls = ask ? (picked ? ' rr-pick' : may ? ' rr-can' : ' rr-no') : '';
        if (all.length !== 6 || pics.some((x) => !x)) return `<span class="b-die d-${f.type}${cls}" style="--i:${i}" title="${esc(label)}"${pickAttr}>${flat}</span>`;
        const land = faceIndex(all, f.face);
        const sides = pics.map((x, k) => `<span class="c-face c-${k}"><img src="${esc(assetUrl(x!))}" alt=""></span>`).join('');
        return `<span class="b-die b-cube d-${f.type}${cls}" style="--i:${i}" data-land="${land}" title="${esc(label)}"${pickAttr}><span class="cube">${sides}</span></span>`;
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
  /** The resource slots printed on a held card of the local player (Ancient Holdings), drawn on that card. */
  function heldSlots(v: TableView, card: string): string {
    const p = v.players[local()];
    const on = p.slots.filter((s) => s.card === card);
    return on.map((s) => slotHtml(p, s.index, t, spendableSlots(v), null, v.phase !== 'gameOver' && p.arranging)).join('');
  }

  function cardName(id: string): string {
    // An action card by its suit and number ("Costruzione 2"), never its id.
    const action = actionCardView(ix, id);
    if (action) return cardLabel(t, action);
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
        ? `<button type="button" class="dr-card pickable k-${kind}" data-act="draft-pick" data-card="${esc(id)}" data-zoom="${esc(id)}" aria-label="${esc(t('draft.take', { card: cardName(id) }))}">${face}</button>`
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
    const setup = intent.step === 'battle' && intent.target !== null ? { system: intent.system, target: intent.target } : null;
    if (!slot || (state.phase.type !== 'allocate' && !setup)) {
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
    if (state.phase.type !== 'allocate') {
      // Before the roll: the two fleets as they stand, nothing to pick.
      if (!setup) return;
      const forces = battleForces(state, { system: setup.system, attacker: local(), target: setup.target } as BattleRef);
      slot.appendChild(battle3d.canvas);
      battle3d.onPick = () => undefined;
      battle3d.update({
        attackerSeat: local(),
        defenderSeat: setup.target,
        after: battleAfter(forces, { selfHits: [], hits: [], buildingHits: [] }),
        buildings: forces.buildings.map((x) => ({ owner: x.owner, type: x.type })),
        dice: [],
        rollKey: `setup:${setup.system}:${setup.target}`,
        canPick: null,
        planet: battlePlanet(setup.system),
      });
      return;
    }
    const pb = state.phase.battle;
    const forces = battleForces(state, pb);
    const al = allocation()!;
    const mine = myTurn() && pb.attacker === local();
    slot.appendChild(battle3d.canvas);
    battle3d.onPick = (p: BattlePick) => {
      if (rerollOpen) return;
      const next = addHit(forces, pb, allocation()!, p);
      if (!next) return;
      placed = { ...next, raid: [] };
      render();
    };
    battle3d.update({
      attackerSeat: pb.attacker,
      // Campaign defenders get their own pieces with the campaign battle screen; until then the scene shows a player's.
      defenderSeat: typeof pb.target === 'number' ? pb.target : pb.attacker,
      after: battleAfter(forces, al),
      buildings: forces.buildings.map((x) => ({ owner: x.owner, type: x.type })),
      dice: (pb.faces ?? []).map((f) => ({ type: f.type, face: f.face })),
      rollKey: rollKeyOf(pb),
      canPick: mine && !rerollOpen ? (p) => addHit(forces, pb, al, p) !== null : null,
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


  /** A count with − and + (a `pip` click sets the new value). */
  function counter(name: string, label: string, value: number, max: number): string {
    return `<span class="stepper mv-n"><span>${esc(label)}</span>${button('pip', '−', { args: { name, n: Math.max(0, value - 1) }, disabled: value <= 0 })}<span class="num">${value}</span>${button('pip', '+', { args: { name, n: value + 1 }, disabled: value >= max })}</span>`;
  }

  /**
   * The planned move, in a few lines: from where to where, how many ships go
   * (all the fresh ones to begin with), then confirm. Leaving ships at a
   * system on the way is asked for with its own button. The route itself is
   * drawn on the map (arrow and holograms) and extended there.
   */
  function movePanel(v: TableView, i: MoveIntent): { body: string; buttons: string[] } {
    const me = local();
    const ok = can(act(movePayload(i), i.prelude));
    const src = v.systems.find((s) => s.id === i.from)?.ships.find((x) => x.player === me);
    const open = moveTargets(v, i.from, [...i.via, i.to], i.prelude).size > 0;
    const hasDamaged = (src?.damaged ?? 0) > 0;
    const cap = moveCap();
    const counts = counter('ships', t(hasDamaged ? 'move.ships' : 'move.count'), i.ships, Math.min(src?.fresh ?? 0, cap - i.damaged)) + (hasDamaged ? counter('damaged', t('move.damaged'), i.damaged, Math.min(src?.damaged ?? 0, cap - i.ships)) : '') + (Number.isFinite(cap) ? `<span class="hint small">${esc(t('move.cap', { n: cap }))}</span>` : '');
    // Ships left on the way: only when the route passes through a system, and only once asked for.
    let drops = '';
    if (i.via.length) {
      const shown = dropsOpen === `${i.from}>${i.to}` || i.via.some((at) => (i.drop[at] ?? 0) + (i.dropDamaged?.[at] ?? 0) > 0);
      if (!shown) drops = `<div class="mv-drops">${button('mv-drops', t('move.dropAsk'), { cls: 'link' })}</div>`;
      else {
        let fresh = i.ships;
        let damaged = i.damaged;
        const rows = i.via.map((at) => {
          const row = counter(`drop:${at}`, t('move.dropAt', { system: systemLabel(v, at) }), i.drop[at] ?? 0, fresh) + (damaged ? counter(`dropd:${at}`, t('move.damaged'), i.dropDamaged?.[at] ?? 0, damaged) : '');
          fresh -= Math.min(fresh, i.drop[at] ?? 0);
          damaged -= Math.min(damaged, i.dropDamaged?.[at] ?? 0);
          return `<div class="mv-counts">${row}</div>`;
        });
        drops = `<div class="mv-drops">${rows.join('')}</div>`;
      }
    }
    const note = i.thenPick ? t('move.thenPick') : open ? '' : stopReason(v, i);
    // Ships that arrive moving once more (Sprinter Drives, lore-03): asked for with its own button.
    let then = '';
    if (i.then) {
      then = `<div class="mv-drops"><div class="mv-counts">${counter('then', t('move.thenTo', { system: systemLabel(v, i.then.to) }), i.then.ships, arrivedFresh(i))}</div>${button('mv-then-off', t('move.thenOff'), { cls: 'link' })}</div>`;
    } else if (!i.thenPick && thenTargets(v, i).size) then = `<div class="mv-drops">${button('mv-then', t('move.then'), { cls: 'link' })}</div>`;
    const buttons = [button('do-move', t('btn.confirm'), { cls: 'cmd-btn primary', disabled: !ok || !!i.thenPick })];
    if (i.via.length) buttons.push(button('route-back', t('move.back'), { cls: 'cmd-btn' }));
    return {
      body: `<div class="mv-plan s-${seatColor(me)}"><div class="mv-counts">${counts}</div>${drops}${then}${note ? `<div class="mv-note">${esc(note)}</div>` : ''}</div>`,
      buttons,
    };
  }

  /** Most ships one move may take, by the cards the local player holds (the Rebel, leader-05); Infinity when none limits it. */
  function moveCap(): number {
    return Math.min(...ownedEffects(ix, state, local()).map((f) => f.effect.maxShipsPerMove ?? Infinity));
  }

  /** Systems the fresh ships arriving at the end of `i` may move on to once more (Sprinter Drives, lore-03). */
  function thenTargets(v: TableView, i: MoveIntent): Set<string> {
    const out = new Set<string>();
    if (arrivedFresh(i) < 1) return out;
    const base = movePayload({ ...i, then: undefined });
    if (base.kind !== 'move') return out;
    for (const s of v.systems) {
      if (!s.inPlay || s.id === i.to || !adjacent(ix, state, i.to, s.id)) continue;
      if (can(act({ ...base, then: [{ from: i.to, to: s.id, ships: 1 }] }, i.prelude))) out.add(s.id);
    }
    return out;
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

  /** While another seat plays: who, what they are doing (live), the actions they have left, and the log. */
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
    const facts = o.remaining !== null ? t('others.remaining', { n: o.remaining }) : '';
    // Engine log lines name seats P0, P1…; show them with the table's seat names.
    const live = o.live.map((l) => `<li>${esc(say(l))}</li>`).join('');
    return `<div class="live-head s-${seatColor(o.player)}"><span class="live-dot" aria-hidden="true"></span>${esc(t('others.title', { name: who }))}</div>
      <div class="hint">${esc(doing)}</div>
      ${live ? `<ol class="live-list" aria-live="polite">${live}</ol>` : ''}
      ${facts ? `<div class="hint">${esc(facts)}</div>` : ''}
      <div class="btn-grid wait">${button('log', t('btn.log'))}</div>`;
  }

  /**
   * What the command bar shows (production/base-fixes.md #35): a head line (the card, its pips, what to do), an
   * optional body for a plan (a move's ships), then one row of three groups always in the same places: the
   * actions, the card powers usable now, and the turn's two buttons (Cancel or Undo, then End turn or Pass).
   */
  interface CommandBar {
    title?: string;
    pips?: number;
    text: string;
    /** The X that puts a picked card back. */
    close?: boolean;
    body?: string;
    main: string[];
    powers: string[];
    turn: [string, string];
    /** No card picked yet: no bar, only the turn's buttons in their places (base-fixes #37). */
    bare?: boolean;
  }

  /**
   * The command bar's HTML ('' when there is none: off the local turn the waiting box shows instead). Its
   * instruction is the line under the hand (production/base-fixes.md #36); the head keeps the card, its pips and
   * the X that puts it back.
   */
  function commandBar(b: CommandBar | null): string {
    if (!b) return '';
    const stars = b.pips ? `<span class="cmd-pips" aria-hidden="true">${Array.from({ length: b.pips }, () => icon('pip')).join('')}</span>` : '';
    const close = b.close ? button('deselect', '', { cls: 'icon x cmd-x', title: t('btn.cancel'), html: icon('close') }) : '';
    const head = b.title || close ? `<div class="cmd-head">${b.title ? `<span class="cmd-title">${esc(b.title)}</span>` : ''}${stars}${close}</div>` : '';
    const main = `<div class="cmd-main" style="--n:${Math.max(3, b.main.length)}">${b.main.join('')}</div>`;
    const powers = `<div class="cmd-pow">${b.powers.join('')}</div>`;
    const turn = `<div class="cmd-turn">${b.turn[0] || '<span></span>'}${b.turn[1] || '<span></span>'}</div>`;
    return `${head}${b.body ? `<div class="cmd-body">${b.body}</div>` : ''}<div class="cmd-row">${main}${powers}${turn}</div>`;
  }

  /** The turn's left button: Cancel while a step is open, else Undo. */
  function undoOrCancel(step: boolean): string {
    return step
      ? button('cancel', t('btn.cancel'), { cls: 'cmd-btn', title: t('btn.cancel'), html: `${icon('close')}<span>${esc(t('btn.cancel'))}</span>` })
      : button('undo', t('btn.undo'), { cls: 'cmd-btn', title: t('btn.undoKey'), html: `${icon('undo')}<span>${esc(t('btn.undo'))}</span>`, disabled: history.length === 0 });
  }

  /** End turn, lit when no action is left; off while a step is open. */
  function endTurnButton(v: TableView, step: boolean): string {
    const left = v.budget?.remaining ?? 0;
    return button('end-turn', t('play.endTurn'), { cls: `cmd-btn primary${left === 0 && !step ? ' ready' : ''}`, disabled: step || !can({ type: 'endTurn', player: local() }) });
  }

  /**
   * The card powers usable now as buttons of the bar (each with the card's picture, its name and what the power
   * does), then the card actions standing for an action kind, off when they cannot be done now.
   */
  function powerButtons(): string[] {
    const usable = powersNow().filter((o) => o.kind === 'prelude' || o.kind === 'action');
    const seen = new Set<string>();
    const out: string[] = [];
    const chip = (card: string, ability: string, on: boolean) => {
      const art = cardArt(card);
      const html = `${art ? `<img src="${esc(art)}" alt="">` : ''}<span class="cp-txt"><span class="cp-name">${esc(cardName(card))}</span><small>${esc(powerName(ability))}</small></span>`;
      return `<button type="button" class="btn cmd-power${on ? ' lit' : ''}" data-act="power-card" data-card="${esc(card)}" data-ability="${esc(ability)}" data-zoom="${esc(card)}" title="${esc(`${cardName(card)}: ${powerName(ability)}`)}"${on ? '' : ' disabled'}>${html}</button>`;
    };
    for (const o of usable) {
      const key = `${o.card}|${o.ability}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(chip(o.card, o.ability, true));
    }
    for (const x of cardActions()) {
      const key = `${x.card}|${x.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(chip(x.card, x.name, false));
    }
    return out;
  }

  /** What the bar holds now, or null when it is not shown. */
  function barFor(v: TableView): CommandBar | null {
    const me = local();
    if (v.phase === 'gameOver' || !myTurn()) return null;

    if (v.phase === 'lead' || v.phase === 'follow') {
      const lead = v.phase === 'lead';
      const pass = lead ? button('pass', t('play.pass'), { cls: 'cmd-btn', title: t('play.pass'), html: esc(t('play.pass')), disabled: !can({ type: 'pass', player: me }) }) : '';
      const mull = lead && v.canMulligan ? [button('mulligan', t('play.mulligan'), { cls: 'cmd-btn' })] : [];
      const card = selected ? v.hand.find((x) => x.card === selected) : undefined;
      // No card picked yet: no bar (base-fixes #37), unless there is something to do without a card (pass, mulligan).
      const passable = lead && can({ type: 'pass', player: me });
      if (!card) return mull.length || passable || history.length ? { bare: true, text: prompt(v), main: mull, powers: [], turn: [undoOrCancel(false), pass] } : null;
      const kinds = card.kinds.map((k) => t(`action.${k}`)).join(` ${t('word.or')} `);
      if (lead) {
        // Declaring: the ambitions it may declare light up in their column, a click there leads and declares.
        const declarable = declareTargets(v).length > 0;
        return {
          title: cardLabel(t, card),
          pips: card.pips,
          text: declarable ? `${kinds} · ${t('bar.declareHint')}` : kinds,
          close: true,
          main: [button('lead', t('play.lead'), { cls: 'cmd-btn primary', disabled: !can({ type: 'lead', player: me, card: card.card }) }), ...mull],
          powers: [],
          turn: [undoOrCancel(false), pass],
        };
      }
      // Each way to follow says what it gives, or why it is not possible (piano PR 6, previews).
      const main = (['surpass', 'copy', 'pivot'] as const).map((mode) => {
        const on = can(followCmd(card.card, mode));
        const sub = on ? followGives(v, card, mode) : followWhyNot(v, card, mode);
        const full = on ? followGives(v, card, mode, true) : sub;
        return button('follow', t(`play.${mode}`), { args: { mode }, cls: `cmd-btn two-line${mode === 'surpass' ? ' primary' : ''}`, disabled: !on, title: `${t(`play.${mode}`)}: ${full}`, html: `<span>${esc(t(`play.${mode}`))}</span><small class="cmd-sub">${esc(sub)}</small>` });
      });
      // Seizing: discard a second card. Offered while nobody has seized this round; else the reason it is not.
      const me0 = v.players.find((p) => p.id === me);
      const noSeize = v.seizedBy !== null ? t('seize.why.taken') : me0?.hasInitiative ? t('seize.why.holder') : v.hand.length < 2 ? t('seize.why.noCard') : null;
      if (noSeize === null) {
        const label = seizePick ? t('play.seizePick') : seizeWith ? t('play.seizeWith', { card: seizeWith }) : t('play.seize');
        main.push(button('seize', label, { cls: `cmd-btn two-line${seizeWith || seizePick ? ' on' : ''}`, title: `${label}: ${t('seize.gives')}`, html: `<span>${esc(label)}</span><small class="cmd-sub">${esc(t('seize.gives'))}</small>` }));
      } else {
        main.push(button('seize', t('play.seize'), { cls: 'cmd-btn two-line', disabled: true, title: `${t('play.seize')}: ${noSeize}`, html: `<span>${esc(t('play.seize'))}</span><small class="cmd-sub">${esc(noSeize)}</small>` }));
      }
      return { title: cardLabel(t, card), pips: card.pips, text: declareTargets(v).length ? `${kinds} · ${t('bar.declareHint')}` : kinds, close: true, main, powers: [], turn: [undoOrCancel(false), ''] };
    }

    if (v.phase === 'allocate' && v.battle && board3d) return null;
    if (v.phase === 'allocate' && v.battle) {
      const b = v.battle;
      const summary = t('battle.summary', { hit: b.totals.hit, buildingHit: b.totals.buildingHit, selfHit: b.totals.selfHit, intercept: b.interceptHits, key: b.totals.key });
      const al = allocation();
      const ok = al !== null && can({ type: 'allocate', player: me, allocation: al });
      return { title: `${systemLabel(v, b.system)}: ${playerName(t, b.attacker)} → ${defenderName(b.target)}`, text: summary, body: raidChoices(b) || undefined, main: [button('allocate', t('battle.assign'), { cls: 'cmd-btn primary', disabled: !ok })], powers: [], turn: [undoOrCancel(false), ''] };
    }

    // Collecting dice after the defender reacted: the battle window asks (syncCollectIntent).
    if (v.phase === 'decide' && v.decision && intent.step === 'battle' && intent.collect && board3d) return null;
    if (v.phase === 'decide' && v.decision) {
      if (v.decision.effect === 'swap' && state.phase.type === 'decide' && state.phase.decision.player === me) {
        const name = playerName(t, state.phase.decision.data?.rival as PlayerId);
        return { text: t('swap.ask', { card: cardName(v.decision.card), name }), main: [button('decide-open', t('swap.open'), { cls: 'cmd-btn primary' }), button('decline', t('swap.no'), { cls: 'cmd-btn' })], powers: [], turn: [undoOrCancel(false), ''] };
      }
      // Decline only when the empty answer declines (a campaign event's empty answer takes the rules' default).
      const declinable = decisionAsk(ix, v.decision)?.empty === 'decline' && can({ type: 'decide', player: me, args: {} });
      // Nothing to choose (a saved game, or a choice the engine left open): one Continue, no empty list (piano D2).
      if (state.phase.type === 'decide' && state.phase.decision.player === me && !keepChoice(v.decision) && localOptions().every((o) => !o.parts.length) && can({ type: 'decide', player: me, args: {} }))
        return { text: t('decide.what', { card: cardName(v.decision.card), effect: t('decide.none') }), main: [button('decline', t('decide.default'), { cls: 'cmd-btn primary' })], powers: [], turn: [undoOrCancel(false), ''] };
      const tp = tablePick(v);
      const decline = declinable ? button('decline', t('decide.decline'), { cls: 'cmd-btn' }) : '';
      if (tp) return { text: t(`decide.onTable.${tp.kind}`, { card: cardName(v.decision.card) }), main: [button('decide-open', t('decide.list'), { cls: 'cmd-btn' }), decline].filter(Boolean), powers: [], turn: [undoOrCancel(false), ''] };
      return { text: t('decide.what', { card: cardName(v.decision.card), effect: t(`decide.effect.${v.decision.effect}`) }), main: [button('decide-open', t('decide.choose'), { cls: 'cmd-btn primary' }), decline].filter(Boolean), powers: [], turn: [undoOrCancel(false), ''] };
    }

    if (v.phase !== 'actions' || !v.budget) return { text: prompt(v), main: [], powers: [], turn: [undoOrCancel(false), ''] };
    const b = v.budget;
    const own = v.plays.find((p) => p.player === me)?.card ?? v.lead;
    const title = own ? cardLabel(t, own) : undefined;
    // A card power picking its system on the map: what to do, and a way back.
    if (powerPick) return { title, text: prompt(v), main: [], powers: [], turn: [undoOrCancel(true), endTurnButton(v, true)] };
    const i = intent;
    switch (i.step) {
      case 'idle': {
        const spend = spendableSlots(v).size > 0;
        const text = b.remaining === 0 ? t('play.actionsDone') : [t(b.remaining === 1 ? 'bar.actionsOne' : 'bar.actions', { n: b.remaining }), spend ? t('bar.spend') : ''].filter(Boolean).join(' · ');
        const main = b.remaining > 0 ? b.kinds.map((k) => kindButtons(v, [k], undefined, true)) : [];
        return { title, pips: b.remaining, text, main, powers: powerButtons(), turn: [undoOrCancel(false), endTurnButton(v, false)] };
      }
      case 'choose': {
        // With a Loyal Guild card: spend it as its own type or as another (base-fixes #49).
        const types = spendTypes(i.prelude);
        const asNow = spendAs ?? i.prelude;
        const asButtons = types.length
          ? [i.prelude, ...types].filter((x) => spendReasonAs(v, i.prelude, x === i.prelude ? null : x) === null).map((x) => button('spend-as', t('prelude.as', { res: t(`resource.${x}`) }), { args: { as: x }, cls: `cmd-btn${x === asNow ? ' on' : ''}` }))
          : [];
        const title = spendAs ? t('play.preludeAs', { res: t(`resource.${i.prelude}`), as: t(`resource.${spendAs}`) }) : t('play.preludeWith', { res: t(`resource.${i.prelude}`) });
        return { title, text: t('prelude.chooseOnTable'), main: [...asButtons, ...i.kinds.map((k) => kindButtons(v, [k], i.prelude, true))], powers: [], turn: [undoOrCancel(true), endTurnButton(v, true)] };
      }
      case 'system':
      case 'from':
      case 'to':
      case 'court':
        return { title, pips: b.remaining, text: prompt(v), main: [], powers: [], turn: [undoOrCancel(true), endTurnButton(v, true)] };
      case 'move': {
        const m = movePanel(v, i);
        return { title, pips: b.remaining, text: `${systemLabel(v, i.from)} → ${systemLabel(v, i.to)}`, body: m.body, main: m.buttons, powers: [], turn: [undoOrCancel(true), endTurnButton(v, true)] };
      }
      case 'battle': {
        if (board3d) return null;
        const targets = rivalsIn(v, i.system).map((r) => button('target', playerName(t, r), { args: { player: r }, cls: i.target === r ? 'on' : '' })).join('');
        const payload = battlePayload(i);
        const ok = payload !== null && can(act(payload, i.prelude));
        return {
          title,
          text: `${t('action.battle')} · ${systemLabel(v, i.system)} · ${t('battle.target')}`,
          body: `<div class="opt-row">${targets}</div><div class="opt-row">${(['skirmish', 'assault', 'raid'] as const).map((d) => stepper(d, t(`battle.dice.${d}`), i.dice[d])).join('')}</div>`,
          main: [button('do-battle', t('battle.go'), { cls: 'cmd-btn primary', disabled: !ok })],
          powers: [],
          turn: [undoOrCancel(true), endTurnButton(v, true)],
        };
      }
    }
  }

  /** The ambitions the picked card may lead and declare (production/base-fixes.md #35: picked in their column). */
  /**
   * The command that plays the picked `card` and declares (base-fixes #48): a lead, or a Surpass or Pivot
   * when a card allows declaring then (Galactic Bards, court-25). `give` pays a declare cost (leader-07).
   */
  function declareCmd(card: string, ambition?: AmbitionId, give?: DeclareGift): Command | null {
    const extra = { declare: true, ...(ambition ? { ambition } : {}), ...(give ? { give } : {}) };
    if (state.phase.type === 'lead') return { type: 'lead', player: local(), card, ...extra };
    if (state.phase.type !== 'follow') return null;
    // A Surpass needs the lead suit and a Pivot another one: at most one of them for a card.
    const mode = can(followCmd(card, 'surpass')) ? 'surpass' : 'pivot';
    return { ...followCmd(card, mode), ...extra } as Command;
  }

  /**
   * How declaring `ambition` with `card` can be paid: nothing to pay ([undefined]), or one of the player's
   * Guild cards given to a Rival with the least Power (the Feastbringer, leader-07). Empty: cannot declare.
   */
  function declareGifts(card: string, ambition?: AmbitionId): (DeclareGift | undefined)[] {
    const ok = (g?: DeclareGift) => {
      const cmd = declareCmd(card, ambition, g);
      return !!cmd && can(cmd);
    };
    if (ok()) return [undefined];
    const me = local();
    const rivals = state.players.map((p) => p.id).filter((p) => p !== me);
    return state.players[me].court
      .filter((c) => ix.courtCards.get(c)?.kind === 'faction')
      .flatMap((c) => (ok({ card: c }) ? [{ card: c }] : rivals.map((to) => ({ card: c, to })).filter((g) => ok(g))));
  }

  /** The ambitions the picked card may declare now (leading, or following with a card that allows it). */
  function declareTargets(v: TableView): AmbitionId[] {
    if (!myTurn() || (v.phase !== 'lead' && v.phase !== 'follow') || !selected) return [];
    const card = v.hand.find((x) => x.card === selected);
    if (!card) return [];
    const decl = content.declareByNumber[String(card.number)];
    if (decl === 'any') return AMBITIONS.filter((a) => declareGifts(card.card, a).length > 0);
    if (decl && declareGifts(card.card).length) return [decl as AmbitionId];
    return [];
  }

  /** Lights the ambitions the picked card may declare; a click there leads and declares. */
  function markDeclares(v: TableView): void {
    const list = declareTargets(v);
    if (!list.length) return;
    stage.classList.add('table-pick');
    // The marker a declaration takes: the highest available (rulebook 6.2); the stake is it plus the markers already there.
    const next = [...v.markersLeft].sort((x, y) => y.first - x.first)[0];
    for (const a of list) {
      const el = stage.querySelector<HTMLElement>(`.abox[data-tip="amb:${CSS.escape(a)}"]`);
      if (!el) continue;
      const row = v.ambitions.find((r) => r.id === a);
      const first = (next?.first ?? 0) + (row?.markers.reduce((n, m) => n + m.first, 0) ?? 0);
      const second = (next?.second ?? 0) + (row?.markers.reduce((n, m) => n + m.second, 0) ?? 0);
      const names = (ps: PlayerId[] | undefined) => (ps?.length ? ps.map((p) => playerName(t, p)).join(', ') : t('declare.nobody'));
      const stake = t('declare.stake', { first, second });
      const now = t('declare.now', { first: names(row?.first), second: names(row?.second) });
      el.classList.add('tpick', 'declare');
      el.dataset.act = 'lead-declare';
      el.dataset.ambition = a;
      el.insertAdjacentHTML('beforeend', `<span class="ab-declare">${esc(t('bar.declareTag'))} · ${esc(stake)}</span>`);
      el.setAttribute('role', 'button');
      el.title = `${stake}. ${now}`;
      el.setAttribute('aria-label', `${t('play.leadDeclare')}: ${t(`ambition.${a}`)}. ${stake}. ${now}`);
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
    const body = drop === 'log'
      ? `<ol class="drop-log">${lines || `<li>${esc(t('empty'))}</li>`}</ol>`
      : drop === 'piles'
        ? pilesPanel(ix, tableView(ix, state, local(), lang), t)
        : `<p class="drop-help">${esc(t('map3d.hint'))}</p>`;
    const title = drop === 'log' ? t('log.title') : drop === 'piles' ? t('btn.piles') : t('btn.help');
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
        if (!o.parts.length) return button('power-pick', what, { args: { i }, cls: 'menu-line', html: `<span class="ml-k">${esc(ability)}</span><span>${esc(what)}</span>` });
        return button('power-pick', what, { args: { i }, cls: 'pp-opt', title: `${ability}: ${what}`, html: optionHtml(o.parts) });
      })
      .join('');
    const close = button('power-close', '', { cls: 'icon x', title: t('btn.cancel'), html: icon('close') });
    return `<div class="sys-menu power-menu" role="dialog" aria-label="${esc(name)}"><div class="menu-head"><span>${esc(name)}</span>${close}</div><div class="menu-lines">${opts}</div></div>`;
  }

  /** Puts the power menu over the card it belongs to. */
  function placePowerMenu(): void {
    const el = stage.querySelector<HTMLElement>('.power-menu');
    if (!el || !powerMenu) return;
    const sel = `[data-act="power-card"][data-card="${CSS.escape(powerMenu.card)}"]`;
    const card = stage.querySelector<HTMLElement>(`.cmd-pow ${sel}`) ?? stage.querySelector<HTMLElement>(sel);
    const r = stage.getBoundingClientRect();
    const c = card?.getBoundingClientRect();
    const x = c ? (c.left + c.width / 2 - r.left) / scale : STAGE.w / 2;
    // Over the card, and never down over the bar.
    const y = Math.min(c ? (c.top - r.top) / scale : REGIONS.bar.y, REGIONS.bar.y);
    el.style.left = `${Math.max(8, Math.min(STAGE.w - el.offsetWidth - 8, x - el.offsetWidth / 2))}px`;
    el.style.top = `${Math.max(8, y - el.offsetHeight - 12)}px`;
  }

  /** The settings window's last line: this game, and the way out to the lobby (games opened from it only). */
  function exitRow(): string {
    const exit = online?.exit;
    if (!exit) return '';
    return `<div class="set-exit"><span class="hint small">${esc(exit.about())}</span><a class="btn" href="${esc(exit.href)}">${esc(t('settings.leave'))}</a></div>`;
  }

  /**
   * The end of a chapter (production/base-fixes.md #15): every declared
   * ambition with its markers, who came first and second and with how much
   * (the 2-player ambition box among them, as the count to beat), then each
   * seat's Power gained and its new total.
   */
  function scoringHtml(sc: ChapterScoring): string {
    const n = state.playerCount;
    const who = (p: number) => (p >= n ? `<span class="sc-who box">${esc(t('scoring.box'))}</span>` : `<span class="sc-who s-${seatColor(p)}"><i class="dot"></i>${esc(playerName(t, p))}</span>`);
    const rows = sc.ambitions
      .map((a) => {
        const markers = a.markers.map((m) => `<span class="sc-mk"><b class="num">${m.first}</b>/<i class="num">${m.second}</i></span>`).join('');
        const counts = a.counts
          .map((c, p) => ({ c, p }))
          .filter((x) => x.c > 0)
          .sort((x, y) => y.c - x.c)
          .map((x) => `<span class="sc-count${a.first.includes(x.p) ? ' first' : a.second.includes(x.p) ? ' second' : ''}">${who(x.p)}<b class="num">${x.c}</b>${a.first.includes(x.p) ? '<em>1°</em>' : a.second.includes(x.p) ? '<em>2°</em>' : ''}</span>`)
          .join('');
        return `<div class="sc-amb"><span class="sc-name">${esc(t(`ambition.${a.ambition}`))}</span><span class="sc-mks">${markers}</span><span class="sc-counts">${counts || esc(t('scoring.nobody'))}</span></div>`;
      })
      .join('');
    const totals = sc.gains
      .map((g, p) => `<div class="sc-total s-${seatColor(p)}">${who(p)}<span class="sc-gain num">+${g}</span><span class="sc-power num">${esc(t('scoring.power', { n: sc.power[p] }))}</span></div>`)
      .join('');
    const note = n === 2 ? `<p class="hint small">${esc(t('scoring.boxNote'))}</p>` : '';
    return `<h2 id="modal-title">${esc(t('scoring.title', { n: sc.chapter }))}</h2>
      <div class="sc-ambs">${rows || `<p class="hint">${esc(t('scoring.none'))}</p>`}</div>
      ${note}
      <div class="sc-totals">${totals}</div>
      <div class="modal-foot">${button('close-modal', t('scoring.ok'), { cls: 'primary' })}</div>`;
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
          <label for="set-text">${esc(t('settings.text'))}</label><select id="set-text" data-set="text">${(['auto', 'normal', 'large'] as const).map((x) => `<option value="${x}"${textSize === x ? ' selected' : ''}>${esc(t(`settings.text.${x}`))}</option>`).join('')}</select>
          ${board3d ? `<label for="set-graphics">${esc(t('settings.graphics'))}</label><select id="set-graphics" data-set="graphics">${(['auto', 'lite', 'still'] as const).map((g) => `<option value="${g}"${graphics === g ? ' selected' : ''}>${esc(t(`settings.graphics.${g}`))}</option>`).join('')}</select>` : ''}
        </div>
        ${exitRow()}
        <div class="modal-foot">${button('close-modal', t('btn.back'))}</div>`
        : `<h2 id="modal-title">${esc(t('settings.title'))}</h2>
        <div class="settings-grid">
          <label for="set-follow">${esc(t('settings.follow'))}</label><input id="set-follow" type="checkbox" class="sw" data-set="follow"${follow ? ' checked' : ''}>
          <label for="set-seat">${esc(t('settings.view'))}</label><select id="set-seat" data-set="seat"${follow ? ' disabled' : ''}>${seatOpts}</select>
          <label for="set-lang">${esc(t('settings.lang'))}</label><select id="set-lang" data-set="lang">${langOpts}</select>
          <label for="set-text">${esc(t('settings.text'))}</label><select id="set-text" data-set="text">${(['auto', 'normal', 'large'] as const).map((x) => `<option value="${x}"${textSize === x ? ' selected' : ''}>${esc(t(`settings.text.${x}`))}</option>`).join('')}</select>
          <label for="set-players">${esc(t('settings.players'))}</label><select id="set-players" data-set="players">${countOpts}</select>
          <label for="set-seed">${esc(t('settings.seed'))}</label><input id="set-seed" type="number" min="1" value="${seed}" data-set="seed">
          ${board3d ? `<label for="set-graphics">${esc(t('settings.graphics'))}</label><select id="set-graphics" data-set="graphics">${(['auto', 'lite', 'still'] as const).map((g) => `<option value="${g}"${graphics === g ? ' selected' : ''}>${esc(t(`settings.graphics.${g}`))}</option>`).join('')}</select>` : ''}
        </div>
        ${exitRow()}
        <div class="modal-foot">${button('close-modal', t('btn.back'))}${button('new-game', t('settings.newGame'), { cls: 'primary' })}</div>`;
    } else if (modal.type === 'scoring' && state.lastScoring) {
      inner = scoringHtml(state.lastScoring);
      size = 'l';
    } else if (modal.type === 'gift') {
      // The Guild cards that can pay for declaring, each with the Rival it goes to.
      const picks = modal.gifts
        .map((g, i) => {
          const to = g.to ?? state.players.filter((p) => p.id !== local()).sort((a, b) => a.power - b.power)[0]?.id ?? 0;
          const label = t('gift.option', { card: cardName(g.card), name: playerName(t, to) });
          return `<div class="gift-pick"><button type="button" class="dr-card pickable k-guild" data-act="gift-pick" data-i="${i}" data-zoom="${esc(g.card)}" title="${esc(label)}" aria-label="${esc(label)}">${cardFaceById(g.card)}</button><span class="gift-to s-${seatColor(to)}">${esc(t('gift.to', { name: playerName(t, to) }))}</span></div>`;
        })
        .join('');
      size = 'l';
      inner = `<h2 id="modal-title">${esc(t('gift.title'))}</h2>
        <div class="modal-body keep-cards"><p class="hint">${esc(t('gift.hint'))}</p><div class="dr-row">${picks}</div></div>
        <div class="modal-foot">${button('close-modal', t('btn.cancel'))}</div>`;
    } else if (modal.type === 'confirm-pass') {
      inner = `<h2 id="modal-title">${esc(t('pass.title'))}</h2>
        <p class="hint">${esc(t('pass.sure'))}</p>
        <div class="modal-foot">${button('close-modal', t('btn.cancel'))}${button('pass-confirm', t('play.pass'), { cls: 'primary' })}</div>`;
    } else if (modal.type === 'decide' && v.decision && v.decision.effect === 'swap' && state.phase.type === 'decide') {
      // Farseers' second step (piano D3): the Rival's hand and yours as cards; one of each, or no swap.
      const r = state.phase.decision.data?.rival as PlayerId;
      const [give = '', take = ''] = modal.chosen ?? [];
      const row = (ids: string[], act: string, on: string) =>
        ids.map((id) => `<button type="button" class="dr-card pickable${id === on ? ' chosen' : ''}" data-act="${act}" data-card="${esc(id)}" aria-pressed="${id === on}" aria-label="${esc(cardName(id))}">${cardFaceById(id)}</button>`).join('');
      size = 'l';
      inner = `<h2 id="modal-title">${esc(t('swap.title', { card: cardName(v.decision.card) }))}</h2>
        <div class="modal-body keep-cards swap-cards">
          <p class="hint">${esc(t('swap.theirs', { name: playerName(t, r) }))}</p>
          <div class="dr-row">${row(state.players[r]?.hand ?? [], 'swap-take', take)}</div>
          <p class="hint">${esc(t('swap.mine'))}</p>
          <div class="dr-row">${row(state.players[local()].hand, 'swap-give', give)}</div>
        </div>
        <div class="modal-foot">${button('decline', t('swap.no'))}${button('swap-confirm', t('swap.go'), { cls: 'primary', disabled: !give || !take })}</div>`;
    } else if (modal.type === 'decide' && v.decision && keepChoice(v.decision)) {
      // Keep N of the cards drawn: the cards themselves, clicked to choose.
      const { cards, keep } = keepChoice(v.decision)!;
      const chosen = modal.chosen ?? [];
      const faces = cards
        .map((id) => {
          const on = chosen.includes(id);
          const { face, kind } = drawnCard(id);
          return `<button type="button" class="dr-card pickable k-${kind}${on ? ' chosen' : ''}" data-act="keep-toggle" data-card="${esc(id)}" data-zoom="${esc(id)}" aria-pressed="${on}" aria-label="${esc(cardName(id))}">${face}</button>`;
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
        .map((o, i) => (o.parts.length ? button('decide-pick', o.parts.map(partText).join(' · '), { args: { i }, cls: 'pp-opt', title: o.parts.map(partText).join(' · '), html: optionHtml(o.parts) }) : ''))
        .join('');
      const empty = modal.options.some((o) => !o.parts.length) ? (decisionAsk(ix, v.decision)?.empty ?? 'decline') : null;
      size = 'm';
      inner = `<h2 id="modal-title">${esc(t('decide.title'))}</h2>
        <div class="modal-body">
          <p class="hint">${esc(t('decide.what', { card: cardName(v.decision.card), effect: t(`decide.effect.${v.decision.effect}`) }))}</p>
          <div class="decide-list">${opts || `<p class="hint">${esc(t('decide.none'))}</p>`}</div>
        </div>
        <div class="modal-foot">${button('close-modal', t('btn.back'))}${empty ? button('decline', t(empty === 'default' ? 'decide.default' : 'decide.decline'), { cls: empty === 'default' ? 'primary' : '' }) : ''}</div>`;
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
    const shown = v.systems.filter((s) => s.inPlay);
    // One tab stop for the whole map (the arrow keys move between systems): the system last
    // reached, else the first one that can be picked now, else the first.
    const stop = shown.find((s) => s.id === mapKey)?.id ?? shown.find((s) => valid.has(s.id))?.id ?? shown[0]?.id;
    const keys = shown
      .map((s) => {
        const label = systemName(s, t);
        return `<span role="button" tabindex="${s.id === stop ? 0 : -1}" class="sys-key${valid.has(s.id) ? ' valid' : ''}" data-sys="${esc(s.id)}" data-tip="sys:${esc(s.id)}" aria-label="${esc(label)}">${esc(s.id)}</span>`;
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
    return `<div class="sys-keys" role="group" aria-label="${esc(t('map3d.systems'))}" aria-description="${esc(t('zone.mapKeys'))}">${keys}</div>${cal}`;
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
    syncCollectIntent();
    // A "spent as" type lasts while its spend is being chosen.
    if (intent.step === 'idle') spendAs = null;
    // A tactical move is planned only in the move steps; leaving them otherwise drops it.
    if (intent.step !== 'from' && intent.step !== 'to' && intent.step !== 'move') tacticalFor = null;
    if (scenario === 'battle' && !scenarioDone && state.phase.type === 'lead') {
      state = battleScenario(ix, state);
      scenarioDone = true;
    }
    const key = focusKey();
    const me = local();
    if (state.phase.type !== 'allocate') {
      rerollSkip = new Set();
      rerollPick = [];
    }
    rerollOpen = false;
    // A chapter just scored: its window opens once, for everyone at the table.
    if (state.lastScoring && state.lastScoring.chapter !== scoringSeen) {
      scoringSeen = state.lastScoring.chapter;
      if (!modal) modal = { type: 'scoring' };
    }
    stage.classList.toggle('my-turn', myTurn());
    stage.classList.toggle('bar-on', myTurn() && state.phase.type !== 'gameOver');
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
    const choosing = myTurn() && (v.phase === 'lead' || v.phase === 'follow');
    // The hand held in a fan: the cards overlap a little, more when they would not fit.
    const handW = REGIONS.hand.w - 60;
    const nCards = v.hand.length;
    const handGap = nCards > 1 ? Math.min(-22, (handW - nCards * 100) / (nCards - 1)) : 0;
    // The command bar on the local turn; the live box of the seat playing otherwise. Its instruction is the line
    // under the hand.
    const barNow = barFor(v);
    const bar = commandBar(barNow);
    const ctx = bar || (myTurn() ? '' : othersPanel(v));
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

    // An open hover card outlives the redraw (a state echo or a timer redraws while the pointer rests on it).
    const openTips = [...stage.querySelectorAll<HTMLElement>('.hover-tip')].filter((x) => !x.hidden);
    patchChildren(stage, [
      `<div class="tbl-stars"></div>`,
      skipLinks(!!(bar || ctx)),
      `<div class="region header" data-region="header" style="${place(REGIONS.header)};--pr-x:${REGIONS.hand.x + REGIONS.hand.w / 2}px;--pr-w:${REGIONS.hand.w - 20}px;--pr-y:${REGIONS.hand.y + REGIONS.hand.h - PROMPT_H}px">${header(v, t, source === 'example', barNow?.text ?? prompt(v), board3d?.hasInfoLayer ? controlLayer : null, drop, board3d?.hasFlatPlanets ? flatPlanets : null)}</div>`,
      `<div class="map-area${board3d ? '' : ' glass'}" data-region="map"${zone('map')} style="${place(REGIONS.map)}">${board3d ? map3dOverlay(v, valid) : mapSvg(ix, v, valid, chosen, t)}</div>`,
      `<div class="region rivals" data-region="rivals"${zone('rivals')} style="${place(REGIONS.rivals)}">${rivals}</div>`,
      `<div class="region court" data-region="court"${zone('court')} style="${place(REGIONS.court)}">${courtPanel(v, t, courtPickable(intent), ix)}</div>`,
      `<div class="region side${sideShut ? ' shut' : ''}" data-region="side"${zone('ambitions')} style="${place(REGIONS.side)}">${sidePanel(ix, v, t, sideShut)}</div>`,
      `<div class="region bar" aria-hidden="true" style="${place(REGIONS.bar)}"></div>`,
      handZone(),
      `<div class="region" data-region="local"${zone('local')} style="${place(REGIONS.local)}">${localPanel(v.players[me], t, spendableSlots(v), null, [], true, v.phase !== 'gameOver')}${button('find-mine', t('btn.findMine'), { cls: `find-mine${Date.now() < findMineUntil ? ' on' : ''}`, title: t('btn.findMineTip') })}</div>`,
      `<div class="region played" data-region="played" style="${place(REGIONS.played)}">${ownPlay}</div>`,
      `<div class="region mine${mineOpen ? ' open' : ''}" data-region="mine"${zone('mine')} style="${mineOpen ? `${placeUp(REGIONS.mineOpen)};width:${REGIONS.mineOpen.w}px` : place(REGIONS.mine)}">${ownCourtPanel(v.players[me], t, courtSort, (id) => faceOf(ix, id, lang), REGIONS.mine.w - 50, new Set(preludes.filter((c) => c.lit).map((c) => c.card)), mineOpen, (card) => heldSlots(v, card))}</div>`,
      `<div class="region hand" data-region="hand"${zone('hand')} style="${place(REGIONS.hand)};--gap:${handGap.toFixed(1)}px">${handPanel(ix, v, t, selected, choosing, seizeWith, '')}</div>`,
      bar ? `<div class="region actions cmd-bar${barNow?.bare ? ' bare' : ''}${handMoved ? ' slide-up' : ''}" data-region="actions" role="group" aria-label="${esc(prompt(v))}" style="${placeUp(REGIONS.actions)};width:${REGIONS.actions.w}px">${bar}</div>` : ctx ? `<div class="region actions waiting" data-region="actions" role="group" aria-label="${esc(prompt(v))}" style="${othersTurn(state, 3) ? placeDown(REGIONS.waiting) : placeUp(REGIONS.actions)}"><div class="actions-body">${ctx}</div></div>` : '',
      `<div class="sr-only" role="status" aria-live="polite">${esc(prompt(v))}</div>`,
      modalHtml(v),
      dropHtml(),
      curtainFor !== null ? handOver(curtainFor) : '',
      toast ? `<div class="toast" role="alert">${esc(toast)}</div>` : '',
      `<div class="card-zoom" aria-hidden="true" hidden></div>`,
      `<div class="hover-tip" aria-hidden="true" hidden></div>`,
      `<div class="hover-tip hover-sub" aria-hidden="true" hidden></div>`,
    ]);
    if (Date.now() < findMineUntil) {
      // "My pieces": every system with the local seat's ships or buildings lit, its ships glowing.
      const mine = new Set(v.systems.filter((s) => s.ships.some((x) => x.player === me && x.fresh + x.damaged > 0) || s.buildings.some((b) => b.owner === me)).map((s) => s.id));
      board3d?.update(v, mine, chosen, { player: me, systems: mine }, routePreview(v), new Set());
    } else board3d?.update(v, valid, chosen, shipGlow(v, valid), routePreview(v), actionable(v));
    const menu = sysMenuHtml(v);
    if (menu) stage.insertAdjacentHTML('beforeend', menu);
    // The system being acted on stays in the free part of the screen (the map pans if a panel would hide it).
    const focus = sysMenu?.system ?? (intent.step === 'move' ? intent.to : intent.step === 'battle' ? intent.system : null);
    if (focus !== shownSystem) {
      shownSystem = focus;
      if (focus) board3d?.ensureVisible(focus);
    }
    // The lit systems of a choice come into the free part of the screen, all of them (piano 2.3): only when the
    // set changes, so a map moved by hand is left alone.
    const litKey = focus ? '' : [...valid].sort().join(',');
    if (litKey !== shownLit) {
      shownLit = litKey;
      if (litKey) board3d?.ensureVisibleSet([...valid], stage.querySelector('.cmd-bar')?.getBoundingClientRect().top || Infinity);
    }
    placeMenu();
    const powers = powerMenuHtml();
    if (powers) stage.insertAdjacentHTML('beforeend', powers);
    placePowerMenu();
    if (courtMenu && (intent.step !== 'idle' || !courtKinds(courtMenu.slot, courtMenu.only, courtMenu.prelude).length)) courtMenu = null;
    const cm = courtMenuHtml();
    if (cm) stage.insertAdjacentHTML('beforeend', cm);
    placeCourtMenu();
    stage.classList.remove('table-pick');
    markTablePicks(v);
    markDeclares(v);
    const war = battleWindow(v) || battleSetup(v);
    if (war) stage.insertAdjacentHTML('beforeend', war);
    const pick = draftWindow();
    if (pick) stage.insertAdjacentHTML('beforeend', pick);
    mountBattle();
    keepTips(openTips);
    fitPrompt();
    fitSide();
    sizeAvatars(stage);
    restoreFocus(key);
    const dialog = stage.querySelector('.modal');
    if (dialog && !dialog.contains(document.activeElement)) {
      dialog.querySelector<HTMLElement>('button:not(:disabled), select, input, textarea')?.focus();
    }
  }

  // ---- input ----
  /** A click on system `id` (`at`: where, on the 3D map): a choice for the current step, else its card. */
  /**
   * A click straight on what to act on (production/base-fixes.md #28), outside a step with actions left: your
   * starport builds a ship, an empty building slot builds there (a city or a starport: both possible, the menu
   * offers just those two), a city is taxed, your damaged building repaired, a rival fleet fought. True when the
   * click was used.
   */
  function directPick(v: TableView, id: string, shipOf: number | undefined, what: PickWhat | undefined): boolean {
    if (modal || v.phase !== 'actions' || !v.budget || !myTurn()) return false;
    // Outside a step with actions left: the card's actions. After a resource spent in the Prelude: the actions it
    // grants, paid by it (production/base-fixes.md #34).
    const i = intent;
    if (i.step !== 'choose' && (i.step !== 'idle' || v.budget.remaining < 1)) return false;
    const pre = i.step === 'choose' ? i.prelude : undefined;
    const me = local();
    const kinds = i.step === 'choose' ? i.kinds : v.budget.kinds;
    const s = v.systems.find((x) => x.id === id);
    if (!s) return false;
    const go = (p: ActionPayload) => {
      if (!can(act(p, pre))) return false;
      sysMenu = null;
      intent = IDLE;
      send(act(p, pre));
      return true;
    };
    const bd = what?.building ?? (what?.slot !== undefined && what.slot < s.buildings.length ? { ...s.buildings[what.slot], index: what.slot } : undefined);
    if (bd) {
      if (bd.owner === me && s.buildings[bd.index]?.damaged && kinds.includes('repair') && go({ kind: 'repair', system: id, target: 'building' })) return true;
      // With a card option for this action (tax or build it twice, take the other resource...), the menu asks which.
      const twice = (k: 'tax' | 'build', p: Extract<ActionPayload, { kind: 'tax' | 'build' }>) => {
        if (!kinds.includes(k) || !can(act(p, pre)) || !actionVariants(ix, state, me, p, pre).length) return false;
        sysMenu = { system: id, kinds: [k], ...(k === 'build' ? { only: ['ship'] } : {}), prelude: pre };
        render();
        return true;
      };
      if (bd.type === 'starport' && bd.owner === me && twice('build', { kind: 'build', system: id, what: 'ship' })) return true;
      if (bd.type === 'city' && twice('tax', { kind: 'tax', system: id, cityOwner: bd.owner })) return true;
      if (bd.type === 'starport' && bd.owner === me && kinds.includes('build') && go({ kind: 'build', system: id, what: 'ship' })) return true;
      if (bd.type === 'city' && kinds.includes('tax') && go({ kind: 'tax', system: id, cityOwner: bd.owner })) return true;
      return false;
    }
    // An empty building slot a card lets you tax (the Anarchist, leader-13): the menu offers it with the builds.
    if (what?.slot !== undefined && kinds.includes('tax') && can(act({ kind: 'tax', system: id, emptySlot: true }, pre))) {
      sysMenu = { system: id, kinds: kinds.filter((k) => k === 'tax' || k === 'build'), prelude: pre };
      render();
      return true;
    }
    if (what?.slot !== undefined && kinds.includes('build')) {
      const legal = (['city', 'starport'] as const).filter((w) => can(act({ kind: 'build', system: id, what: w }, pre)));
      if (legal.length === 1) return go({ kind: 'build', system: id, what: legal[0] });
      if (legal.length === 2) {
        sysMenu = { system: id, kinds: ['build'], only: ['city', 'starport'], prelude: pre };
        render();
        return true;
      }
      return false;
    }
    if (shipOf !== undefined && shipOf !== me && kinds.includes('battle') && rivalsIn(v, id).includes(shipOf)) {
      const here = s.ships.find((x) => x.player === me);
      let n = Math.min(MAX_STEPPER_DICE, (here?.fresh ?? 0) + (here?.damaged ?? 0));
      while (n > 1 && !can(act({ kind: 'battle', system: id, target: shipOf, dice: { skirmish: n } }, pre))) n--;
      if (n < 1 || !can(act({ kind: 'battle', system: id, target: shipOf, dice: { skirmish: n } }, pre))) return false;
      sysMenu = null;
      intent = { step: 'battle', system: id, target: shipOf, dice: { skirmish: n, assault: 0, raid: 0 }, prelude: pre };
      render();
      return true;
    }
    return false;
  }

  function pickSystem(id: string, shipOf?: number, at?: { x: number; y: number }, what?: PickWhat): void {
    const v = withSay(tableView(ix, state, local(), lang));
    // A card's choice made on the map (production/base-fixes.md #28).
    const tp = tablePick(v);
    if (tp?.kind === 'system') {
      const i = tp.by.get(id);
      if (i !== undefined) send({ type: 'decide', player: local(), args: tp.options[i].args });
      return;
    }
    if (powerPick) {
      // A card power picking its system: its one use there at once, else its uses there beside the card.
      const here = powerPick.options.filter((o) => targetSystem(o) === id);
      if (!here.length) return;
      const card = powerPick.card;
      powerPick = null;
      if (here.length === 1) return void send(here[0].cmd);
      powerMenu = { card, options: here };
      render();
      return;
    }
    // Clicking your own ships while you may move starts a move from there.
    if (intent.step === 'idle' && !modal && shipOf === local() && canStartMove(v) && movableFrom(v).has(id)) {
      sysMenu = null;
      intent = { step: 'to', from: id, via: [] };
      render();
      return;
    }
    if (intent.step === 'choose' && !modal && shipOf === local() && intent.kinds.includes('move') && moveTargets(v, id, [], intent.prelude).size > 0) {
      sysMenu = null;
      intent = { step: 'to', from: id, via: [], prelude: intent.prelude };
      render();
      return;
    }
    if (directPick(v, id, shipOf, what)) return;
    // After a resource spent, or outside a step with actions left: what can be done in that system. One possible
    // choice is done at once; several are offered in the menu beside it (production/base-fixes.md #35).
    const menuKinds = intent.step === 'choose' ? intent.kinds : intent.step === 'idle' && v.phase === 'actions' && v.budget && v.budget.remaining > 0 && myTurn() ? v.budget.kinds : null;
    if (menuKinds && !modal) {
      const pre = intent.step === 'choose' ? intent.prelude : undefined;
      const kinds = menuKinds.filter((k) => k !== 'influence' && k !== 'secure');
      // With the card options too: a single plain choice that a card can also do another way opens the menu.
      const sections = menuOptions(v, id, kinds, pre, undefined, true);
      const open = sections.flat().filter((o) => o.why === null);
      if (open.length === 1) {
        sysMenu = null;
        intent = IDLE;
        if (menuDo(v, id, pre, open[0].kind, open[0].args)) return;
        render();
        return;
      }
      if (sections.length) {
        sysMenu = { system: id, kinds, prelude: pre };
        render();
        return;
      }
    }
    if (sysMenu) {
      // A click elsewhere on the map closes the menu (and opens another one where the step allows it below).
      sysMenu = intent.step === 'system' ? sysMenu : null;
      if (!sysMenu) return void render();
    }
    // Picking where the arrived ships move once more: a lit system sets it, any other click gives up.
    if (intent.step === 'move' && intent.thenPick) {
      const ok = thenTargets(v, intent).has(id);
      intent = { ...intent, thenPick: false, ...(ok ? { then: { to: id, ships: arrivedFresh(intent) } } : {}) };
      render();
      return;
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
    // Not a choice for the current step: the click opens (or closes) the system's card.
    if (!validSystems(v).has(id)) {
      if (at) toggleSystemTip(id, at);
      return;
    }
    const i = intent;
    if (i.step === 'system') {
      // The action was picked first: one possible choice there is done at once, several are offered beside it.
      const open = menuOptions(v, id, [i.kind], i.prelude, undefined, true).flat().filter((o) => o.why === null);
      if (open.length === 1) {
        intent = IDLE;
        if (menuDo(v, id, i.prelude, open[0].kind, open[0].args)) return;
        render();
        return;
      }
      sysMenu = { system: id, kinds: [i.kind], prelude: i.prelude };
    } else if (i.step === 'from') {
      intent = { step: 'to', from: id, via: [], prelude: i.prelude };
    } else if (i.step === 'to') {
      // The first step of the route: every ship there goes (fresh ones; damaged ones when there are no fresh).
      const mine = v.systems.find((s) => s.id === i.from)?.ships.find((x) => x.player === local());
      // At most as many as a card allows in one move (the Rebel, leader-05: 2).
      const cap = moveCap();
      const ships = Math.min(cap, mine?.fresh ?? 0);
      intent = { step: 'move', from: i.from, via: i.via, to: id, ships, damaged: mine && mine.fresh === 0 ? Math.min(cap, mine.damaged) : 0, drop: {}, prelude: i.prelude };
    } else if (i.step === 'move') {
      // The route goes on (a Catapult), keeping the ships chosen and those left so far (a further move is asked again).
      intent = { ...extendRoute(i, id), then: undefined };
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
      case 'lead-declare': {
        if (!selected) return;
        const amb = d.ambition ? (d.ambition as AmbitionId) : undefined;
        const gifts = declareGifts(selected, amb);
        const cmd = gifts.length === 1 ? declareCmd(selected, amb, gifts[0]) : null;
        if (cmd) return void send(cmd);
        // A Guild card to give first (the Feastbringer): which one, and to whom when several Rivals tie.
        if (gifts.length > 1) modal = { type: 'gift', ...(amb ? { ambition: amb } : {}), gifts: gifts.filter((g): g is DeclareGift => !!g) };
        break;
      }
      case 'gift-pick': {
        const m = modal;
        modal = null;
        const g = m?.type === 'gift' ? m.gifts[Number(d.i)] : undefined;
        const cmd = selected && g && m?.type === 'gift' ? declareCmd(selected, m.ambition, g) : null;
        if (cmd) return void send(cmd);
        break;
      }
      case 'pass':
        modal = { type: 'confirm-pass' };
        break;
      case 'pass-confirm':
        modal = null;
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
        const r = slot.resource;
        // Spent as its own type, or (a Loyal Guild card; when its own type cannot be spent) as another one.
        const as = spendReasonAs(v, r, null) === null ? null : (spendTypes(r).find((x) => spendReasonAs(v, r, x) === null) ?? null);
        // Its own type grants a kind at once: kept for a click in the bar when it could also be spent as another.
        if (as === null && 'grantKind' in content.resourceActions[r] && spendTypes(r).length) {
          intent = { step: 'choose', prelude: r, kinds: [] };
          spendAs = null;
          break;
        }
        startSpend(v, r, as);
        if (intent.step === 'idle') return;
        break;
      }
      case 'spend-as': {
        if (intent.step !== 'choose') break;
        const as = d.as ? (d.as as Resource) : null;
        startSpend(v, intent.prelude, as === intent.prelude ? null : as);
        if ((intent as Intent).step === 'idle') return;
        break;
      }
      case 'cancel':
        // Cancelling a tactical move's plan goes back to its battle.
        intent = tacticalFor ? tacticalFor.battle : IDLE;
        tacticalFor = null;
        sysMenu = null;
        powerPick = null;
        break;
      case 'menu-close':
        sysMenu = null;
        if (intent.step === 'system') intent = IDLE;
        break;
      case 'menu-do': {
        const m = sysMenu;
        if (!m) break;
        sysMenu = null;
        if (menuDo(v, m.system, m.prelude, d.kind as ActionKind, { ...d })) return;
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
          else if (d.name === 'then' && intent.then) intent = { ...intent, then: { ...intent.then, ships: clamp(n, arrivedFresh(intent)) } };
          if (intent.step === 'move' && intent.then) intent = { ...intent, then: { ...intent.then, ships: Math.min(intent.then.ships, arrivedFresh(intent)) } };
        }
        break;
      case 'mv-then':
        if (intent.step === 'move') intent = { ...intent, thenPick: true };
        break;
      case 'mv-then-off':
        if (intent.step === 'move') intent = { ...intent, then: undefined, thenPick: false };
        break;
      case 'mv-drops':
        if (intent.step === 'move') dropsOpen = `${intent.from}>${intent.to}`;
        break;
      case 'die-step': {
        // - / + on a die type's tile of the battle window.
        if (intent.step !== 'battle') break;
        const type = d.type as 'skirmish' | 'assault' | 'raid';
        intent = { ...intent, dice: { ...intent.dice, [type]: Math.max(0, intent.dice[type] + Number(d.d)) } };
        break;
      }
      case 'die': {
        // A die of the battle window: an empty place takes a skirmish die; a die turns into the next type, then leaves.
        if (intent.step !== 'battle') break;
        const dice = { ...intent.dice };
        const type = d.type as 'skirmish' | 'assault' | 'raid' | '';
        if (type === '') dice.skirmish++;
        else {
          dice[type]--;
          if (type === 'skirmish') dice.assault++;
          else if (type === 'assault') dice.raid++;
        }
        intent = { ...intent, dice };
        break;
      }
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
        // The tactical move of a waiting battle goes back to it (sent with the battle); any other is sent.
        if (intent.step === 'move' && tacticalFor) {
          const m = movePayload(intent);
          if (m.kind === 'move') intent = { ...tacticalFor.battle, tactical: { when: tacticalFor.when, move: m } };
          tacticalFor = null;
          break;
        }
        if (intent.step === 'move') send(act(movePayload(intent), intent.prelude));
        return;
      case 'tactical':
        if (intent.step === 'battle') {
          tacticalFor = { battle: intent, when: d.when === 'before' ? 'before' : 'after' };
          intent = { step: 'from' };
        }
        break;
      case 'pre-hit':
        if (intent.step === 'battle') intent = { ...intent, preHit: d.hit === 'damaged' ? 'damaged' : 'fresh' };
        break;
      case 'tactical-off':
        if (intent.step === 'battle') intent = { ...intent, tactical: undefined };
        break;
      case 'do-battle':
        if (intent.step === 'battle' && intent.collect) {
          const dice = { ...intent.dice };
          intent = IDLE;
          send({ type: 'decide', player: me, args: { dice } });
          return;
        }
        if (intent.step === 'battle') {
          const p = battlePayload(intent);
          if (p) send(act(p, intent.prelude));
        }
        return;
      case 'draft-pick':
        if (d.card) send({ type: 'draft', player: me, card: d.card });
        return;
      case 'reroll-die': {
        const n = Number(d.i);
        const ask = v.battle ? rerollAsk(v.battle) : null;
        if (!ask || !ask.eligible.includes(n)) break;
        rerollPick = rerollPick.includes(n) ? rerollPick.filter((x) => x !== n) : rerollPick.length < ask.max ? [...rerollPick, n] : rerollPick;
        break;
      }
      case 'reroll-go': {
        const ask = v.battle ? rerollAsk(v.battle) : null;
        const dice = rerollPick;
        rerollPick = [];
        if (ask && dice.length) return void send({ type: 'reroll', player: me, card: ask.card, dice });
        break;
      }
      case 'reroll-skip': {
        const ask = v.battle ? rerollAsk(v.battle) : null;
        if (ask) rerollSkip.add(ask.card);
        rerollPick = [];
        break;
      }
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
        const options = powersNow().filter((o) => o.card === d.card && (!d.ability || o.ability === d.ability));
        // Uses that each target a system: picked on the map, even when there is only one.
        if (options.length && options.every((o) => targetSystem(o) !== null)) {
          powerPick = { card: d.card!, options };
          powerMenu = null;
          break;
        }
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
      case 'swap-give':
      case 'swap-take':
        if (modal?.type === 'decide' && d.card) {
          const [give = '', take = ''] = modal.chosen ?? [];
          modal.chosen = d.act === 'swap-give' ? [d.card, take] : [give, d.card];
        }
        break;
      case 'swap-confirm':
        if (modal?.type === 'decide' && modal.chosen?.[0] && modal.chosen[1]) {
          const [give, take] = modal.chosen;
          modal = null;
          send({ type: 'decide', player: me, args: { give, take } });
        }
        return;
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
      case 'undo':
        undo();
        break;
      case 'skip':
        return void focusZone(d.to ?? 'hand');
      case 'find-mine':
        // Lights the own pieces on the map for a few seconds (a second click turns it off).
        findMineUntil = Date.now() < findMineUntil ? 0 : Date.now() + FIND_MINE_MS;
        window.clearTimeout(findMineTimer);
        if (findMineUntil) findMineTimer = window.setTimeout(render, FIND_MINE_MS + 50);
        break;
      case 'court': {
        const slot = Number(d.slot);
        // Influence or Secure picked first: that one. Outside a step: the only one possible there at once, or a
        // small menu over the card when both are (production/base-fixes.md #28). Hovering shows it large.
        // With a card option (influence twice, influence before or after securing), the menu asks which.
        const pickOn = (only: readonly ActionKind[] | undefined, pre: Resource | undefined): boolean => {
          const choices = courtChoices(slot, only, pre);
          if (!choices.length) return false;
          intent = IDLE;
          if (choices.length === 1) {
            send(act({ kind: choices[0].kind, courtSlot: slot }, pre));
            return true;
          }
          courtMenu = { slot, ...(only ? { only: [...only] } : {}), ...(pre ? { prelude: pre } : {}) };
          return true;
        };
        if (courtPickable(intent).has(slot) && intent.step === 'court' && pickOn([intent.kind], intent.prelude)) break;
        if (intent.step === 'choose' && courtPickable(intent).has(slot) && pickOn(intent.kinds, intent.prelude)) break;
        if (intent.step === 'idle' && courtPickable(intent).has(slot) && pickOn(undefined, undefined)) break;
        return;
      }
      case 'court-do': {
        const m = courtMenu;
        courtMenu = null;
        return void send(act({ ...extraOf(d), kind: d.kind as 'influence' | 'secure', courtSlot: Number(d.slot) } as ActionPayload, m?.prelude));
      }
      case 'court-close':
        courtMenu = null;
        break;
      case 'court-sort':
        courtSort = COURT_SORTS.includes(el.dataset.sort as CourtSort) ? (el.dataset.sort as CourtSort) : 'kind';
        break;
      case 'amb-toggle':
        sideShut = !sideShut;
        try {
          localStorage.setItem('arcs.ambShut', sideShut ? '1' : '0');
        } catch {
          /* not remembered */
        }
        setSideShut(sideShut);
        fit();
        break;
      case 'mine-open':
        mineOpen = !mineOpen;
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
      case 'map-planets':
        flatPlanets = !flatPlanets;
        try {
          localStorage.setItem('arcs.planets2d', flatPlanets ? '1' : '0');
        } catch {
          /* not remembered */
        }
        board3d?.setPlanetMode(flatPlanets ? '2d' : '3d');
        break;
      case 'help':
      case 'piles':
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

  stage.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element).closest<HTMLElement>('.tpick');
      if (!el || el.dataset.pick === undefined) return;
      const tp = tablePick(withSay(tableView(ix, state, local(), lang)));
      const o = tp?.options[Number(el.dataset.pick)];
      if (!o) return;
      e.stopPropagation();
      e.preventDefault();
      send({ type: 'decide', player: local(), args: o.args });
    },
    true,
  );
  stage.addEventListener('click', (e) => {
    const target = e.target as Element;
    const sys = target.closest('[data-sys]') as HTMLElement | null;
    if (sys) return pickSystem(sys.dataset.sys!);
    const el = target.closest('[data-act]') as HTMLElement | null;
    if (el && !(el as HTMLButtonElement).disabled) return onAct(el);
    // A rival's board opens on a click on its band and closes on a second click (base-fixes #37); a card in the
    // band still zooms by itself.
    const band = target.closest('.hover-tip, [data-zoom]') ? null : target.closest<HTMLElement>('[data-tip^="seat:"]');
    if (band) toggleSeatTip(band);
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
  /**
   * Shows the card large where it covers nothing the player may want next (production/piano-blindatura-
   * tavolo-2026-11-25.md, 2.4-2.5): under the Court row, over the bottom bar for the hand and the own Court,
   * beside a choice window (or not at all when the window leaves no room), beside the card elsewhere. The
   * zoom is a picture: it takes no click (table.css), and any click closes it.
   */
  function showZoom(el: HTMLElement): void {
    const zoom = stage.querySelector<HTMLElement>('.card-zoom');
    const id = el.dataset.zoom;
    if (!zoom || !id) return;
    const face = faceOf(ix, id, lang);
    zoom.innerHTML = largeCard(face, t, { selected: false, disabled: false, still: true });
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
    const s = stage.getBoundingClientRect();
    /** A screen rectangle in stage px. */
    const inStage = (b: DOMRect) => ({ x: (b.left - s.left) / scale, y: (b.top - s.top) / scale, w: b.width / scale, h: b.height / scale });
    const c = inStage(el.getBoundingClientRect());
    // A leader card is tarot size: taller than the others at the same width.
    const ZW = 300, ZH = (face.kind === 'leader' ? Math.round((ZW * 672) / 377) : 416) + (view ? AGENTS_VIEW.h - AGENTS_OVERLAP : 0), GAP = 14;
    const clampX = (x: number) => Math.max(8, Math.min(STAGE.w - ZW - 8, x));
    const clampY = (y: number) => Math.max(8, Math.min(STAGE.h - ZH - 8, y));
    const beside = (b: { x: number; w: number }) => (b.x + b.w / 2 > STAGE.w / 2 ? b.x - ZW - GAP : b.x + b.w + GAP);
    const win = el.closest<HTMLElement>('.modal, [role="dialog"]');
    const region = el.closest<HTMLElement>('[data-region]')?.dataset.region ?? '';
    let left: number, top: number;
    if (win) {
      // In a choice window the other choices stay in sight: beside the window, or no zoom.
      const wr = inStage(win.getBoundingClientRect());
      const room = (wr.x - GAP >= ZW + 8) || (STAGE.w - wr.x - wr.w - GAP >= ZW + 8);
      if (!room) return hideZoom();
      left = wr.x + wr.w / 2 > STAGE.w / 2 && wr.x - GAP >= ZW + 8 ? wr.x - ZW - GAP : wr.x + wr.w + GAP;
      top = clampY(c.y + c.h / 2 - ZH / 2);
    } else if (region === 'court') {
      // The Court row: under the row, so its other cards stay clear.
      const rr = inStage(el.closest('[data-region]')!.getBoundingClientRect());
      left = clampX(c.x + c.w / 2 - ZW / 2);
      top = clampY(rr.y + rr.h + GAP);
    } else if (region === 'hand' || region === 'mine' || region === 'played' || region === 'local') {
      // The bottom bar's cards: over the bar, clear of the row the pointer moves along.
      const rr = inStage(el.closest('[data-region]')!.getBoundingClientRect());
      left = clampX(c.x + c.w / 2 - ZW / 2);
      top = clampY(rr.y - ZH - GAP);
    } else {
      left = beside(c);
      top = clampY(c.y + c.h / 2 - ZH / 2);
    }
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
  // From the keyboard only: the focus a window gives its first card when it opens after a click, or the
  // focus the table gives back after a redraw, is not the player asking to see the card.
  stage.addEventListener('focusin', (e) => {
    const el = zoomTarget(e);
    if (el && el.matches(':focus-visible')) showZoom(el);
  });
  stage.addEventListener('focusout', (e) => {
    if (zoomTarget(e)) hideZoom();
  });
  // Any press closes it: the click goes on to what is under it (a menu, the next card).
  stage.addEventListener('pointerdown', () => hideZoom(), true);

  // ---- rearranging resources: drag a token onto another slot of the local board ----
  /** The place a drag started from ("2": slot 2; "o0": the first token set aside). */
  let dragFrom: string | null = null;
  stage.addEventListener('dragstart', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-drag]');
    if (!el) return;
    dragFrom = el.dataset.drag ?? null;
    e.dataTransfer?.setData('text/plain', dragFrom ?? '');
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    hideTip();
    hideZoom();
  });
  stage.addEventListener('dragover', (e) => {
    const el = dragFrom !== null ? (e.target as Element).closest<HTMLElement>('[data-drop]') : null;
    if (!el) return;
    e.preventDefault();
    for (const x of stage.querySelectorAll('.drag-over')) if (x !== el) x.classList.remove('drag-over');
    el.classList.add('drag-over');
  });
  stage.addEventListener('dragend', () => {
    dragFrom = null;
    for (const x of stage.querySelectorAll('.drag-over')) x.classList.remove('drag-over');
  });
  stage.addEventListener('drop', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-drop]');
    const from = dragFrom;
    dragFrom = null;
    if (!el || from === null) return;
    e.preventDefault();
    const to = el.dataset.drop ?? '';
    if (to === from) return;
    const me = local();
    const pl = state.players[me];
    const slots: (Resource | null)[] = allSlotKeys(content, pl).map((_, i) => pl.resources[i] ?? null);
    const aside = [...(pl.overflow ?? [])];
    const fromAside = from.startsWith('o');
    const token = fromAside ? aside[Number(from.slice(1))] : slots[Number(from)];
    if (!token) return;
    if (to === 'o') {
      // Onto the strip: the token is set aside (the engine refuses it while a slot is free).
      if (fromAside) return;
      slots[Number(from)] = null;
    } else {
      // Onto a slot: the two places swap what they hold.
      const other = slots[Number(to)];
      slots[Number(to)] = token;
      if (!fromAside) slots[Number(from)] = other;
      else if (other) {
        // A token from aside takes the slot: the one it replaces moves to a free open slot when there is one.
        const free = tableView(ix, state, me, lang).players[me].slots.find((x) => !x.locked && !slots[x.index]);
        if (free) slots[free.index] = other;
      }
    }
    send({ type: 'arrange', player: me, slots });
  });

  // ---- hover cards: a rival's board, an ambition row, a map system ----
  /** Shows the hover card for `raw` ("seat:1", "amb:tyrant", "sys:c2-p1") beside the element or the point. */
  function showTip(raw: string, at: HTMLElement | { x: number; y: number }, which = '.hover-tip:not(.hover-sub)'): void {
    const tip = stage.querySelector<HTMLElement>(which);
    const target = parseTip(raw);
    if (!tip || !target) return;
    // Nothing over an open menu, window or drop-down.
    if (sysMenu || modal || drop || powerMenu) return hideTip();
    if (!which.includes('hover-sub')) {
      clearTimeout(tipTimer);
      hideSub();
    }
    const key = `${raw}|${state.log.length}`;
    if (tip.dataset.key !== key) {
      const html = tipHtml(ix, withSay(tableView(ix, state, local(), lang)), target, t);
      if (!html) return hideTip();
      tip.innerHTML = html;
      tip.dataset.key = key;
      sizeAvatars(tip);
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
    const tx = Math.max(8, Math.min(STAGE.w - tw - 8, left));
    let ty = Math.max(8, Math.min(STAGE.h - th - 8, y + (r.height / scale) / 2 - th / 2));
    // Never over the command bar: the pointer crossing the card on its way to a button there would keep the card
    // open over it (playtest 2026-11-25, an ambition's card over "Fine turno"). Above the bar instead.
    const bar = stage.querySelector<HTMLElement>('.cmd-bar')?.getBoundingClientRect();
    if (bar && bar.width) {
      const bx = (bar.left - s.left) / scale;
      const by = (bar.top - s.top) / scale;
      const overlaps = tx < bx + bar.width / scale && tx + tw > bx && ty < by + bar.height / scale && ty + th > by;
      if (overlaps && by - th - 8 >= 8) ty = by - th - 8;
    }
    tip.style.left = `${tx}px`;
    tip.style.top = `${ty}px`;
  }
  /**
   * A system's card, opened by a click on the system: a second click on it
   * closes it, and it closes by itself after SYSTEM_TIP_MS.
   */
  function toggleSystemTip(id: string, at: { x: number; y: number }): void {
    const tip = stage.querySelector<HTMLElement>('.hover-tip:not(.hover-sub)');
    if (tip && !tip.hidden && tip.dataset.key?.startsWith(`sys:${id}|`)) return hideTip();
    showTip(`sys:${id}`, at);
    clearTimeout(tipTimer);
    tipTimer = window.setTimeout(hideTip, SYSTEM_TIP_MS);
  }
  /** A rival's board opened by a click: a second click on the same band closes it. */
  function toggleSeatTip(band: HTMLElement): void {
    const tip = stage.querySelector<HTMLElement>('.hover-tip:not(.hover-sub)');
    if (tip && !tip.hidden && tip.dataset.key?.startsWith(`${band.dataset.tip}|`)) return hideTip();
    showTip(band.dataset.tip!, band);
    // The pointer crossing the band may have set the card to close: opened by a click, it stays.
    clearTimeout(tipTimer);
  }
  /** Whether the open card is a rival's board, opened by a click: it stays until clicked again. */
  function seatTipOpen(): boolean {
    const tip = stage.querySelector<HTMLElement>('.hover-tip:not(.hover-sub)');
    return !!tip && !tip.hidden && !!tip.dataset.key?.startsWith('seat:');
  }
  /** Puts the hover cards that were open before a redraw back in place, their contents brought up to date. */
  function keepTips(open: HTMLElement[]): void {
    if (!open.length) return;
    if (sysMenu || modal || drop || powerMenu) return;
    for (const old of open) {
      const sub = old.classList.contains('hover-sub');
      const fresh = stage.querySelector<HTMLElement>(sub ? '.hover-tip.hover-sub' : '.hover-tip:not(.hover-sub)');
      if (!fresh) continue;
      fresh.replaceWith(old);
      const [raw, at] = (old.dataset.key ?? '').split('|');
      const target = parseTip(raw);
      if (!target || Number(at) === state.log.length) continue;
      const html = tipHtml(ix, withSay(tableView(ix, state, local(), lang)), target, t);
      if (!html) {
        old.hidden = true;
        continue;
      }
      old.innerHTML = html;
      old.dataset.key = `${raw}|${state.log.length}`;
    }
  }
  function hideTip(): void {
    clearTimeout(tipTimer);
    for (const tip of stage.querySelectorAll<HTMLElement>('.hover-tip')) tip.hidden = true;
  }
  function hideSub(): void {
    const sub = stage.querySelector<HTMLElement>('.hover-sub');
    if (sub) sub.hidden = true;
  }
  /**
   * Hides the hover card after a moment, so the mouse can cross the gap onto
   * it: pointing at the card itself keeps it open (and readable, its cards zoomable).
   */
  let tipTimer = 0;
  function hideTipSoon(): void {
    clearTimeout(tipTimer);
    tipTimer = window.setTimeout(hideTip, TIP_LINGER_MS);
  }
  const tipTarget = (e: Event) => {
    const el = e.target as Element;
    // A card inside the element shows itself large instead.
    return el.closest('[data-zoom]') ? null : el.closest<HTMLElement>('[data-tip]');
  };
  stage.addEventListener('mouseover', (e) => {
    // On the open card itself: it stays; what is inside it may show its own small card beside it.
    if ((e.target as Element).closest('.hover-tip')) {
      clearTimeout(tipTimer);
      if ((e.target as Element).closest('.hover-sub')) return;
      const inner = (e.target as Element).closest<HTMLElement>('.hover-tip [data-tip]');
      if (inner) showTip(inner.dataset.tip!, inner, '.hover-sub');
      else hideSub();
      return;
    }
    const el = tipTarget(e);
    // A rival's band does not open on hover: a click opens it (base-fixes #37).
    const seat = !!el?.dataset.tip?.startsWith('seat:');
    if (el && !seat) return showTip(el.dataset.tip!, el);
    if (seatTipOpen()) return;
    const tip = stage.querySelector<HTMLElement>('.hover-tip:not(.hover-sub)');
    const systemCard = !!tip && !tip.hidden && !!tip.dataset.key?.startsWith('sys:');
    if (!(e.target as Element).closest('canvas') || !systemCard) hideTipSoon();
    // A system's card (opened by a click) stays while the pointer is on the map; coming off the card itself, it
    // closes on its own again after a while.
    else if ((e.relatedTarget as Element | null)?.closest?.('.hover-tip')) {
      clearTimeout(tipTimer);
      tipTimer = window.setTimeout(hideTip, SYSTEM_TIP_MS);
    }
  });
  stage.addEventListener('focusin', (e) => {
    const el = tipTarget(e);
    if (el && !el.dataset.tip?.startsWith('seat:')) showTip(el.dataset.tip!, el);
  });
  stage.addEventListener('focusout', () => {
    if (!seatTipOpen()) hideTip();
  });

  stage.addEventListener('keydown', (e) => {
    const el = e.target as HTMLElement;
    // The map is one tab stop: the arrow keys (and Home, End) move between its systems.
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: -Infinity, End: Infinity }[e.key];
    if (step !== undefined && el.dataset.sys) {
      const all = [...stage.querySelectorAll<HTMLElement>('.sys-key')];
      const i = all.indexOf(el);
      const next = all[step === -Infinity ? 0 : step === Infinity ? all.length - 1 : (i + step + all.length) % all.length];
      if (next && next !== el) {
        e.preventDefault();
        el.tabIndex = -1;
        next.tabIndex = 0;
        mapKey = next.dataset.sys ?? null;
        next.focus();
      }
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && el.dataset.sys) {
      e.preventDefault();
      pickSystem(el.dataset.sys);
    }
    // The keyboard opens and closes a rival's board like a click.
    if ((e.key === 'Enter' || e.key === ' ') && el.dataset.tip?.startsWith('seat:')) {
      e.preventDefault();
      toggleSeatTip(el);
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
      case 'text':
        textSize = el.value as TextSize;
        try {
          localStorage.setItem('arcs.text', textSize);
        } catch {
          /* no storage: this session only */
        }
        applyTextSize();
        break;
      case 'graphics':
        graphics = el.value as Graphics;
        board3d?.setGraphics(graphics);
        try {
          localStorage.setItem('arcs.graphics', graphics);
        } catch {
          /* no storage: this session only */
        }
        break;
      default:
        return;
    }
    render();
  });

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !(e.target as Element).closest('input, textarea, select')) {
      // Ctrl+Z (Cmd+Z): undo, as the Undo button.
      e.preventDefault();
      if (undo()) render();
      return;
    }
    if (e.key === 'Escape') {
      if (powerPick) powerPick = null;
      else if (courtMenu) courtMenu = null;
      else if (powerMenu) powerMenu = null;
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
      // The echo of this screen's own move keeps the undo history; anything else (another seat's move) drops it.
      const echo = JSON.stringify(next) === JSON.stringify(state);
      state = next;
      if (!echo) history = [];
      resetChoices();
      if (modal?.type !== 'settings') modal = null;
      powerMenu = null;
      render();
    },
  };
}
