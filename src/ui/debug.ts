// Debug UI: plays a full game on the rules engine with plain HTML controls.
// Display only — every change goes through engine `dispatch` commands.
// Text lives in the T table below so it can be swapped or translated in one place.

import {
  activePlayer,
  AMBITIONS,
  dispatch,
  heldResources,
  indexContent,
  newGame,
  openSlots,
  ransackable,
} from '../game/engine';
import type { Allocation, Command, ContentIndex, GameContent, GameState, PendingBattle, PlayerCount, PlayerId } from '../game/engine';
import { loadContent } from './content';
import { BASE_EFFECTS } from '../game/cards/base';
import { drawMap, playerColor } from './map';

const T = {
  title: 'Prototipo — debug',
  players: 'Giocatori',
  variant: 'Variante',
  base: 'Base',
  leaders: 'Leaders & Lore',
  seed: 'Seed',
  setup: 'Carta setup',
  random: 'casuale',
  newGame: 'Nuova partita',
  undo: 'Annulla',
  exportJson: 'Esporta stato',
  importJson: 'Importa stato',
  chapter: 'Capitolo',
  phase: 'Fase',
  turnOf: 'Tocca a',
  contentOwner: 'contenuti: i tuoi (data/content.json)',
  contentExample: 'contenuti: esempio segnaposto',
  rawCommand: 'Comando JSON',
  send: 'Invia',
  selected: 'Sistema selezionato',
  none: 'nessuno',
};

const AMB_LABEL: Record<string, string> = { wealth: 'Tycoon', captives: 'Tyrant', trophies: 'Warlord', relics: 'Keeper', psionics: 'Empath' };

interface Ui {
  selected: string | null;
  fields: Record<string, string>;
  message: { kind: 'error' | 'info'; text: string } | null;
}

/**
 * Online use (docs/online-play.md): one player's screen on a shared game.
 * Without it the page is the local debug table where anyone plays any seat.
 */
export interface OnlineOptions {
  /** The game content (loaded from the database, not bundled). */
  content: GameContent;
  /** The shared game state to show first. */
  state: GameState;
  /** The seat this screen plays: only its commands are sent, only its hand is shown. */
  seat: PlayerId;
  /** Seat labels (e.g. the players' addresses). */
  names: string[];
  /** Saves a new state after a command; a rejection shows the error and keeps the shared state. */
  commit: (next: GameState, cmd: Command) => Promise<void>;
}

/** Mounts the debug UI into `root`. Returns a handle for automated checks (and `load` for online updates). */
export function mountDebug(root: HTMLElement, online?: OnlineOptions) {
  const { content, source } = online ? { content: online.content, source: 'owner' as const } : loadContent();
  const ix: ContentIndex = indexContent(content, BASE_EFFECTS);
  const ui: Ui = { selected: null, fields: {}, message: null };
  let history: GameState[] = [];
  let state: GameState = online ? online.state : start();
  const seatName = (p: PlayerId) => (online ? `P${p} ${online.names[p] ?? ''}`.trim() : `P${p}`);

  function start(): GameState {
    const n = Number(ui.fields['g-players'] ?? 3) as PlayerCount;
    const setupCardId = ui.fields['g-setup'] || undefined;
    return newGame(ix, {
      playerCount: n,
      seed: Number(ui.fields['g-seed'] ?? 1) || 1,
      variant: (ui.fields['g-variant'] as 'base' | 'leaders') ?? 'base',
      setupCardId: setupCardId && ix.content.setupCards.find((c) => c.id === setupCardId)?.playerCount === n ? setupCardId : undefined,
    });
  }

  function send(cmd: Command): boolean {
    try {
      if (online && cmd.player !== online.seat) throw new Error(`Non tocca a te: ora agisce ${seatName(cmd.player)}`);
      const next = dispatch(ix, state, cmd);
      history.push(state);
      state = next;
      ui.message = null;
      render();
      if (online)
        online.commit(next, cmd).catch((e: Error) => {
          ui.message = { kind: 'error', text: `Non salvato: ${e.message}` };
          render();
        });
      return true;
    } catch (e) {
      ui.message = { kind: 'error', text: (e as Error).message };
      render();
      return false;
    }
  }

  // ---------- field helpers (values survive re-renders) ----------
  const esc = (v: unknown) => String(v).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
  const fv = (id: string, def: string) => ui.fields[id] ?? def;
  const sel = (id: string, opts: { v: string; l: string }[], def = opts[0]?.v ?? '') => {
    // Keep the shown choice and the stored value the same: store defaults, drop stale values.
    let cur = fv(id, def);
    if (!opts.some((o) => o.v === cur)) cur = opts.some((o) => o.v === def) ? def : (opts[0]?.v ?? '');
    ui.fields[id] = cur;
    return `<select data-f="${id}" id="${id}">${opts.map((o) => `<option value="${esc(o.v)}"${o.v === cur ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`;
  };
  const num = (id: string, def: number, min = 0) => (ui.fields[id] ??= String(def), `<input type="number" min="${min}" data-f="${id}" id="${id}" value="${esc(fv(id, String(def)))}">`);
  const txt = (id: string, def = '', ph = '') => `<input type="text" data-f="${id}" id="${id}" value="${esc(fv(id, def))}" placeholder="${esc(ph)}">`;
  const label = (l: string, ctl: string) => `<label>${esc(l)} ${ctl}</label>`;
  const btn = (act: string, l: string, extra = '') => `<button type="button" data-act="${act}" ${extra}>${esc(l)}</button>`;

  const inPlaySystems = () => ix.content.map.systems.filter((x) => state.map[x.id].inPlay).map((x) => ({ v: x.id, l: x.id }));
  const sysSel = (id: string, filter?: (sid: string) => boolean) => {
    const opts = inPlaySystems().filter((o) => !filter || filter(o.v));
    const def = ui.selected && opts.some((o) => o.v === ui.selected) ? ui.selected : (opts[0]?.v ?? '');
    if (ui.selected && opts.some((o) => o.v === ui.selected) && ui.fields[`${id}__sel`] !== ui.selected) {
      ui.fields[id] = ui.selected;
      ui.fields[`${id}__sel`] = ui.selected;
    }
    return sel(id, opts, def);
  };
  const playerOpts = (exclude?: number) => state.players.filter((p) => p.id !== exclude).map((p) => ({ v: String(p.id), l: `P${p.id}` }));
  const cardOpts = (ids: string[]) => ids.map((id) => {
    const d = ix.actionCards.get(id);
    return { v: id, l: d ? `${d.suit} ${d.number} (${d.pips}◆)` : id };
  });

  // ---------- action payload form ----------
  function actionFields(prefix: string, kinds: string[]): string {
    const kind = fv(`${prefix}-kind`, kinds[0]);
    const k = kinds.includes(kind) ? kind : kinds[0];
    ui.fields[`${prefix}-kind`] = k;
    let f = label('Azione', sel(`${prefix}-kind`, kinds.map((x) => ({ v: x, l: x })), k));
    const me = activePlayer(state) ?? 0;
    switch (k) {
      case 'tax':
        f += label('Sistema', sysSel(`${prefix}-sys`)) + label('Città di', sel(`${prefix}-owner`, playerOpts(), String(me)));
        break;
      case 'build':
        f += label('Sistema', sysSel(`${prefix}-sys`)) + label('Cosa', sel(`${prefix}-what`, ['ship', 'city', 'starport'].map((v) => ({ v, l: v }))));
        break;
      case 'repair':
        f += label('Sistema', sysSel(`${prefix}-sys`)) + label('Pezzo', sel(`${prefix}-target`, ['ship', 'building'].map((v) => ({ v, l: v }))));
        break;
      case 'move':
        f += label('Da', sysSel(`${prefix}-from`)) + label('A', sel(`${prefix}-to`, inPlaySystems())) + label('Integre', num(`${prefix}-ships`, 1)) + label('Danneggiate', num(`${prefix}-dmg`, 0));
        f += label('Catapult via', txt(`${prefix}-via`, '', 'c1-gate,c2-gate')) + label('Lascia', txt(`${prefix}-drop`, '', 'c1-gate:1'));
        break;
      case 'battle':
        f += label('Sistema', sysSel(`${prefix}-sys`)) + label('Difensore', sel(`${prefix}-target`, playerOpts(me)));
        f += label('Skirmish', num(`${prefix}-sk`, 0)) + label('Assault', num(`${prefix}-as`, 0)) + label('Raid', num(`${prefix}-ra`, 0));
        break;
      case 'influence':
      case 'secure':
        f += label('Carta corte', sel(`${prefix}-slot`, state.court.map((c, i) => ({ v: String(i), l: `${i}: ${c.card}` }))));
        break;
    }
    return f;
  }

  function readAction(prefix: string): Record<string, unknown> {
    const k = fv(`${prefix}-kind`, '');
    const n = (id: string) => Number(fv(`${prefix}-${id}`, '0')) || 0;
    const t = (id: string) => fv(`${prefix}-${id}`, '');
    switch (k) {
      case 'tax':
        return { kind: k, system: t('sys'), cityOwner: Number(t('owner')) };
      case 'build':
        return { kind: k, system: t('sys'), what: t('what') || 'ship' };
      case 'repair':
        return { kind: k, system: t('sys'), target: t('target') || 'ship' };
      case 'move': {
        const via = t('via').split(',').map((x) => x.trim()).filter(Boolean);
        const drop = t('drop').split(',').map((x) => x.trim()).filter(Boolean).map((d) => {
          const [at, ships, damaged] = d.split(':');
          return { at, ships: Number(ships) || 0, damaged: Number(damaged) || 0 };
        });
        return { kind: k, from: t('from'), to: t('to') || inPlaySystems()[0]?.v, ships: n('ships'), damaged: n('dmg'), ...(via.length ? { via } : {}), ...(drop.length ? { drop } : {}) };
      }
      case 'battle':
        return { kind: k, system: t('sys'), target: Number(t('target') || playerOpts(activePlayer(state) ?? 0)[0]?.v), dice: { skirmish: n('sk'), assault: n('as'), raid: n('ra') } };
      default:
        return { kind: k, courtSlot: Number(t('slot')) || 0 };
    }
  }

  // ---------- default battle allocation (attacker's choices, editable) ----------
  function defaultAllocation(b: PendingBattle): Allocation {
    const sys = state.map[b.system];
    const att = { ...(sys.ships[b.attacker] ?? { fresh: 0, damaged: 0 }) };
    const def = { ...((typeof b.target === 'number' ? sys.ships[b.target] : undefined) ?? { fresh: 0, damaged: 0 }) };
    const blds = sys.buildings.map((x, i) => ({ i, owner: x.owner, type: x.type, dmg: x.damaged, gone: false }));
    const shipHit = (st: { fresh: number; damaged: number }) => {
      if (st.fresh > 0) { st.fresh--; st.damaged++; return 'fresh' as const; }
      if (st.damaged > 0) { st.damaged--; return 'damaged' as const; }
      return null;
    };
    let destroyedCities = 0;
    const bldHit = () => {
      const t = blds.find((x) => x.owner === b.target && !x.gone && !x.dmg) ?? blds.find((x) => x.owner === b.target && !x.gone);
      if (!t) return null;
      if (!t.dmg) t.dmg = true;
      else { t.gone = true; if (t.type === 'city') destroyedCities++; }
      return t.i;
    };
    const selfHits = [] as ('fresh' | 'damaged')[];
    for (let i = 0; i < b.totals.selfHit + b.interceptHits; i++) { const h = shipHit(att); if (h) selfHits.push(h); }
    const hits: Allocation['hits'] = [];
    for (let i = 0; i < b.totals.hit; i++) {
      const h = shipHit(def);
      if (h) hits.push(h);
      else { const bi = bldHit(); if (bi !== null) hits.push({ building: bi }); }
    }
    const buildingHits: number[] = [];
    for (let i = 0; i < b.totals.buildingHit; i++) { const bi = bldHit(); if (bi !== null) buildingHits.push(bi); }
    const eligible = typeof b.target === 'number' ? ransackable(state, b.target) : [];
    const ransack = destroyedCities && eligible.length ? Array.from({ length: Math.min(destroyedCities, eligible.length) }, (_, i) => eligible[i]) : [];
    return { selfHits, hits, buildingHits, raid: [], ...(ransack.length ? { ransack } : {}) };
  }

  // ---------- command panel ----------
  function commandPanel(): string {
    const ph = state.phase;
    const p = activePlayer(state);
    let h = '';
    if (online && ph.type !== 'gameOver' && p !== online.seat) {
      // Another player's turn: show no one else's options (they would reveal their hand).
      const redraw = state.mulligan === online.seat && ph.type === 'lead' ? `<div class="row">${btn('mulligan', 'Rifai la tua mano')}</div>` : '';
      return `<p>In attesa di <b style="color:${playerColor(p ?? 0)}">${esc(seatName(p ?? 0))}</b>…</p>${redraw}`;
    }
    if (ph.type === 'gameOver') return `<p class="big">Partita finita — vince ${ph.winners.map((w) => `<b style="color:${playerColor(w)}">P${w}</b>`).join(', ')}</p>`;
    if (ph.type === 'draft') {
      const d = state.draft!;
      const pl = state.players[p!];
      h += `<p>P${p} sceglie ${pl.leader ? 'una Lore' : pl.lore.length >= d.lorePerPlayer ? '' : 'un personaggio o una Lore'}</p>`;
      h += `<div class="chips">${d.leaders.map((c) => btn(`draft:${c}`, `👤 ${c}`)).join('')}${d.lore.map((c) => btn(`draft:${c}`, `📜 ${c}`)).join('')}</div>`;
      return h;
    }
    if (ph.type === 'lead') {
      const hand = state.players[p!].hand;
      const lead = fv('lead-card', hand[0] ?? '');
      const num7 = ix.actionCards.get(lead)?.number;
      const fixed = num7 !== undefined ? ix.content.declareByNumber[String(num7)] : undefined;
      h += `<div class="row">${label('Carta', sel('lead-card', cardOpts(hand)))}`;
      h += label('Dichiara', `<input type="checkbox" data-f="lead-declare" id="lead-declare"${fv('lead-declare', '') === 'on' ? ' checked' : ''}>`);
      if (fixed === 'any') h += label('Ambizione', sel('lead-amb', AMBITIONS.map((a) => ({ v: a, l: AMB_LABEL[a] ?? a }))));
      else if (fixed) h += `<span class="hint">→ ${AMB_LABEL[fixed] ?? fixed}</span>`;
      h += `</div><div class="row">${btn('lead', 'Guida il round')} ${btn('pass', "Passa l'initiative")}</div>`;
    }
    if (ph.type === 'follow') {
      const hand = state.players[p!].hand;
      h += `<div class="row">${label('Carta', sel('fol-card', cardOpts(hand)))}${label('Modo', sel('fol-mode', ['surpass', 'pivot', 'copy'].map((v) => ({ v, l: v }))))}`;
      h += label('Seize con', sel('fol-seize', [{ v: '', l: '—' }, ...cardOpts(hand)], ''));
      h += `</div><div class="row">${btn('follow', 'Gioca')}</div>`;
    }
    if (ph.type === 'actions') {
      const b = ph.budget;
      h += `<p>P${b.player}: <b>${b.remaining}</b> azioni (${b.kinds.join(', ')})${b.preludeOver ? '' : ' — <i>prelude aperto</i>'}</p>`;
      h += `<fieldset><legend>Azione con un pip</legend><div class="row">${actionFields('act', b.kinds)}</div>${btn('action', 'Esegui')}</fieldset>`;
      if (!b.preludeOver) {
        const pl = state.players[b.player];
        const res = [...new Set(heldResources(pl))];
        if (res.length) {
          const kindsAll = ['tax', 'build', 'repair', 'move', 'battle', 'influence', 'secure'];
          h += `<fieldset><legend>Prelude: spendi una risorsa</legend><div class="row">${label('Risorsa', sel('pre-res', res.map((r) => ({ v: r, l: r }))))}`;
          h += label('Senza azione (Weapons)', `<input type="checkbox" data-f="pre-noact" id="pre-noact"${fv('pre-noact', '') === 'on' ? ' checked' : ''}>`);
          h += `</div><div class="row">${actionFields('pre', kindsAll)}</div>${btn('prelude', 'Spendi')}</fieldset>`;
        }
      }
      const gates = ix.content.map.systems.filter((x) => x.kind === 'gate' && state.map[x.id].inPlay).map((x) => ({ v: x.id, l: x.id }));
      h += `<div class="row">${btn('endTurn', 'Fine turno')} ${label('Gate di soccorso (solo se eliminato)', sel('rescue', [{ v: '', l: '—' }, ...gates], ''))}</div>`;
    }
    if (ph.type === 'allocate') {
      const bt = ph.battle;
      h += `<p>Battaglia P${bt.attacker} → P${bt.target} in ${bt.system}: colpi ${bt.totals.hit}, colpi edifici ${bt.totals.buildingHit}, fiammelle ${bt.totals.selfHit}, intercept ${bt.interceptHits}, chiavi ${bt.totals.key}</p>`;
      if (ui.fields['alloc-for'] !== JSON.stringify(bt)) {
        ui.fields['alloc'] = JSON.stringify(defaultAllocation(bt as PendingBattle), null, 1);
        ui.fields['alloc-for'] = JSON.stringify(bt);
      }
      h += `<p class="hint">Assegnazione proposta: modificala se vuoi (raid: [{"resource":slot}] o [{"card":"id"}]).</p>`;
      h += `<textarea data-f="alloc" id="alloc" rows="8">${esc(fv('alloc', ''))}</textarea>${btn('allocate', 'Assegna')}`;
    }
    if (ph.type === 'decide') {
      const d = ph.decision;
      h += `<p>Scelta richiesta da <b>${esc(d.card)}</b> (${esc(d.effect)})${d.data ? ` <span class="hint">${esc(JSON.stringify(d.data))}</span>` : ''}</p>`;
      h += `<p class="hint">Scrivi le scelte in JSON (vuoto = rinuncia), vedi design/gdd/card-effects.md.</p>`;
      h += `<textarea data-f="decide-args" id="decide-args" rows="3">${esc(fv('decide-args', '{}'))}</textarea>${btn('decide', 'Conferma')}`;
    }
    if (state.mulligan !== null && ph.type === 'lead') h += `<div class="row">${btn('mulligan', `P${state.mulligan}: rifai la mano`)}</div>`;
    return h;
  }

  // ---------- panels ----------
  function roundPanel(): string {
    const r = state.round;
    const plays = r.plays.map((pl) => {
      const d = pl.card ? ix.actionCards.get(pl.card) : null;
      const shown = pl.faceUp && d ? `${d.suit} ${pl.zeroed ? '0' : d.number}` : pl.mode === 'pass' ? '—' : 'coperta';
      return `<li><b style="color:${playerColor(pl.player)}">P${pl.player}</b> ${pl.mode}: ${shown}${pl.seized ? ' (seize)' : ''}</li>`;
    });
    return `<p>Guida: P${r.leader} · seme: ${r.leadSuit ?? '—'} · seize: ${r.seizedBy ?? '—'}</p><ul>${plays.join('')}</ul>`;
  }

  function ambitionsPanel(): string {
    const rows = AMBITIONS.map((a) => {
      const m = state.ambitions.declared[a];
      const box = state.ambitionBoxes[a];
      return `<li>${AMB_LABEL[a] ?? a}: ${m.length ? m.join(', ') : '—'}${box?.length ? ` <span class="hint">[riquadro: ${box.join(', ')}]</span>` : ''}</li>`;
    });
    return `<ul>${rows.join('')}</ul><p class="hint">Disponibili: ${state.ambitions.available.join(', ') || '—'} · riserva: ${Object.entries(state.resourceSupply).map(([k, v]) => `${k} ${v}`).join(', ')}</p>`;
  }

  function courtPanel(): string {
    return `<ol start="0">${state.court
      .map((c) => {
        const def = ix.courtCards.get(c.card);
        const agents = Object.entries(c.agents).filter(([, v]) => v > 0).map(([k, v]) => `<b style="color:${playerColor(Number(k))}">P${k}×${v}</b>`).join(' ');
        return `<li>${c.card} <span class="hint">${def?.kind}${def?.resource ? ' ' + def.resource : ''}${def?.keys ? ' 🔑' + def.keys : ''}</span> ${agents}</li>`;
      })
      .join('')}</ol><p class="hint">Mazzo: ${state.courtDeck.length} · scarti: ${state.courtDiscard.length}</p>`;
  }

  function playersPanel(): string {
    return state.players
      .map((p) => {
        const slots = openSlots(ix.content, p);
        const res = ix.content.playerBoard.slotKeys.map((_, i) => (slots.includes(i) ? (p.resources[i] ?? '·') : '▒')).join(' ');
        const act = activePlayer(state) === p.id ? ' active' : '';
        return `<div class="player${act}" style="border-color:${playerColor(p.id)}">
          <h3 style="color:${playerColor(p.id)}">${esc(seatName(p.id))}${state.initiative === p.id ? ' ★' : ''} — Potere ${p.power}</h3>
          <p>Slot: <code>${esc(res)}</code>${p.outraged.length ? ` · Outrage: ${p.outraged.join(', ')}` : ''}</p>
          <p>Riserva: navi ${p.supply.ships}, città ${p.supply.cities}, porti ${p.supply.starports}, agenti ${p.supply.agents}</p>
          <p>Trofei ${p.trophies.length} · Prigionieri ${p.captives.length} · Corte: ${p.court.join(', ') || '—'}</p>
          ${p.leader ? `<p>Personaggio: ${p.leader}${p.lore.length ? ' · Lore: ' + p.lore.join(', ') : ''}</p>` : ''}
          <p class="hint">Mano (${p.hand.length})${!online || online.seat === p.id ? `: ${p.hand.join(', ')}` : ''}</p></div>`;
      })
      .join('');
  }

  // ---------- render ----------
  function render(): void {
    const p = activePlayer(state);
    // Turn-scoped fields start fresh whenever the turn or step changes hands.
    const turnKey = `${state.chapter}|${state.phase.type}|${p}|${state.round.plays.length}`;
    if (ui.fields.__turn !== turnKey) {
      for (const k of Object.keys(ui.fields)) if (/^(act|pre|fol|lead|alloc|rescue|decide)/.test(k)) delete ui.fields[k];
      ui.fields.__turn = turnKey;
    }
    const n = String(state.playerCount);
    root.innerHTML = `
      <header>
        <h1>${T.title}</h1>
        ${online ? `<p>Giochi come <b style="color:${playerColor(online.seat)}">${esc(seatName(online.seat))}</b>${p === online.seat ? ' — <b>tocca a te</b>' : ''}</p>` : `<div class="row">
          ${label(T.players, sel('g-players', ['2', '3', '4'].map((v) => ({ v, l: v })), n))}
          ${label(T.variant, sel('g-variant', [{ v: 'base', l: T.base }, { v: 'leaders', l: T.leaders }], state.variant))}
          ${label(T.seed, num('g-seed', state.seed, 1))}
          ${label(T.setup, sel('g-setup', [{ v: '', l: T.random }, ...ix.content.setupCards.filter((c) => String(c.playerCount) === fv('g-players', n)).map((c) => ({ v: c.id, l: c.id }))], ''))}
          ${btn('new', T.newGame)} ${btn('undo', T.undo, history.length ? '' : 'disabled')} ${btn('export', T.exportJson)} ${btn('import', T.importJson)}
        </div>`}
        <p class="status">${T.chapter} <b>${state.chapter}</b> · ${T.phase} <b>${state.phase.type}</b> · ${T.turnOf} ${p === null ? '—' : `<b style="color:${playerColor(p)}">P${p}</b>`} · setup ${state.setupCard} · <span class="hint">${source === 'owner' ? T.contentOwner : T.contentExample}</span></p>
        ${ui.message ? `<p class="msg ${ui.message.kind}" role="alert">${esc(ui.message.text)}</p>` : ''}
      </header>
      <main>
        <section class="map-col">
          <svg id="map" role="group" aria-label="Mappa"></svg>
          <p class="hint">${T.selected}: <b>${ui.selected ?? T.none}</b> — clicca un sistema per usarlo nei comandi. ▲ integre ▼ danneggiate · C città · S porto</p>
        </section>
        <section class="side">
          <div class="panel"><h2>Comandi</h2>${commandPanel()}
            <details><summary>${T.rawCommand}</summary><textarea data-f="raw" id="raw" rows="4">${esc(fv('raw', ''))}</textarea>${btn('raw', T.send)}</details>
            <details><summary>Stato JSON</summary><textarea id="io" data-f="io" rows="6">${esc(fv('io', ''))}</textarea></details>
          </div>
          <div class="panel"><h2>Round</h2>${roundPanel()}</div>
          <div class="panel"><h2>Ambizioni</h2>${ambitionsPanel()}</div>
          <div class="panel"><h2>Corte</h2>${courtPanel()}</div>
        </section>
      </main>
      <section class="players">${playersPanel()}</section>
      <section class="panel log"><h2>Registro</h2><ol reversed>${state.log.slice(-60).reverse().map((l) => `<li>[${l.chapter}] ${esc(l.text)}</li>`).join('')}</ol></section>`;
    drawMap(root.querySelector('#map') as SVGSVGElement, ix, state, ui.selected, (id) => {
      ui.selected = id;
      render();
    });
  }

  // ---------- events ----------
  root.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.dataset.f) return;
    ui.fields[t.dataset.f] = t.type === 'checkbox' ? (t.checked ? 'on' : '') : t.value;
  });
  root.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.dataset.f) return;
    ui.fields[t.dataset.f] = t.type === 'checkbox' ? (t.checked ? 'on' : '') : t.value;
    if (t.tagName === 'SELECT' || t.type === 'checkbox') render();
  });
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!b) return;
    const act = b.dataset.act!;
    const p = activePlayer(state) ?? 0;
    // Online, the shared game cannot be restarted, undone or replaced from one screen.
    if (online && ['new', 'undo', 'import'].includes(act)) return;
    if (act === 'new') {
      try {
        history = [];
        state = start();
        ui.message = { kind: 'info', text: `Nuova partita: ${state.playerCount} giocatori, setup ${state.setupCard}` };
      } catch (err) {
        ui.message = { kind: 'error', text: (err as Error).message };
      }
      render();
    } else if (act === 'undo') {
      const prev = history.pop();
      if (prev) state = prev;
      ui.message = null;
      render();
    } else if (act === 'export') {
      ui.fields['io'] = JSON.stringify(state);
      render();
      const io = root.querySelector('#io') as HTMLTextAreaElement;
      (io.closest('details') as HTMLDetailsElement).open = true;
      io.select();
    } else if (act === 'import') {
      try {
        const next = JSON.parse(fv('io', '')) as GameState;
        history.push(state);
        state = next;
        ui.message = { kind: 'info', text: 'Stato importato' };
      } catch (err) {
        ui.message = { kind: 'error', text: `JSON non valido: ${(err as Error).message}` };
      }
      render();
    } else if (act.startsWith('draft:')) send({ type: 'draft', player: p, card: act.slice(6) });
    else if (act === 'lead') {
      const card = fv('lead-card', state.players[p].hand[0]);
      const declare = fv('lead-declare', '') === 'on';
      const amb = fv('lead-amb', '');
      send({ type: 'lead', player: p, card, ...(declare ? { declare: true } : {}), ...(declare && amb && ix.content.declareByNumber[String(ix.actionCards.get(card)?.number)] === 'any' ? { ambition: amb as never } : {}) });
      ui.fields['lead-declare'] = '';
    } else if (act === 'pass') send({ type: 'pass', player: p });
    else if (act === 'mulligan') send({ type: 'mulligan', player: state.mulligan! });
    // (online: a redraw is sent by the player who may redraw, from their own screen)
    else if (act === 'follow') {
      const hand = state.players[p].hand;
      const seize = fv('fol-seize', '');
      send({ type: 'follow', player: p, card: fv('fol-card', hand[0]), mode: fv('fol-mode', 'surpass') as 'surpass', ...(seize ? { seizeWith: seize } : {}) });
      ui.fields['fol-seize'] = '';
    } else if (act === 'action') send({ type: 'action', player: p, action: readAction('act') as never });
    else if (act === 'prelude') {
      const noact = fv('pre-noact', '') === 'on';
      send({ type: 'prelude', player: p, resource: fv('pre-res', '') as never, ...(noact ? {} : { action: readAction('pre') as never }) });
    } else if (act === 'endTurn') {
      const g = fv('rescue', '');
      send({ type: 'endTurn', player: p, ...(g ? { rescueGate: g } : {}) });
    } else if (act === 'allocate') {
      try {
        send({ type: 'allocate', player: p, allocation: JSON.parse(fv('alloc', '{}')) });
      } catch (err) {
        ui.message = { kind: 'error', text: `JSON non valido: ${(err as Error).message}` };
        render();
      }
    } else if (act === 'decide') {
      try {
        send({ type: 'decide', player: p, args: JSON.parse(fv('decide-args', '{}') || '{}') });
      } catch (err) {
        ui.message = { kind: 'error', text: `JSON non valido: ${(err as Error).message}` };
        render();
      }
    } else if (act === 'raw') {
      try {
        send(JSON.parse(fv('raw', '{}')));
      } catch (err) {
        ui.message = { kind: 'error', text: `JSON non valido: ${(err as Error).message}` };
        render();
      }
    }
  });

  render();
  return {
    get state() {
      return state;
    },
    /** Shows a state saved by another screen (online). */
    load(next: GameState) {
      history = [];
      state = next;
      render();
    },
    send,
    newGame(fields: Record<string, string>) {
      Object.assign(ui.fields, fields);
      history = [];
      state = start();
      render();
    },
  };
}
