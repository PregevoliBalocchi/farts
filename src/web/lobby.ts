// The entrance page's games list and new-game screen (online/index.html), in
// the table's look. Rendering only: the page (src/web/online.ts) or the local
// preview (?view=lobby, src/main.ts) supply the games and the create step.

import './lobby.css';
import { activePlayer } from '../game/engine';
import type { GameState } from '../game/engine';
import { addSeat, COLORS, moveSeat, newDraft, problems, removeSeat, seatLabel, setColor, setMode, setWho, toSetup } from '../online/newgame';
import type { GameDraft, GameSetup, Mode, Variant } from '../online/newgame';

const GLYPHS = [
  '<circle cx="12" cy="12" r="8" fill="currentColor"/>',
  '<rect x="4.5" y="4.5" width="15" height="15" rx="2" fill="currentColor"/>',
  '<path d="M12 3 21 20H3z" fill="currentColor"/>',
  '<path d="M12 2 22 12 12 22 2 12z" fill="currentColor"/>',
];
const COLOR_NAME = ['giallo', 'blu', 'rosso', 'bianco'];
const VARIANT_NAME: Record<Variant, string> = { base: 'Base', leaders: 'Leader e Lore' };
const MODE_NAME: Record<Mode, string> = { online: 'Online', hotseat: 'Su questo computer' };

const ICONS = {
  online: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>',
  hotseat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/></svg>',
  base: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="5"/><ellipse cx="12" cy="12" rx="10" ry="3.5" transform="rotate(-20 12 12)"/></svg>',
  leaders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 17 3 7l5 4 4-6 4 6 5-4-1 10z"/><path d="M4 20h16"/></svg>',
  up: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 15 6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>',
  remove: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
};

/** The seat glyph (circle, square, triangle, diamond) in its colour. */
export function glyph(color: number): string {
  return `<svg class="glyph s-${color}" viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[color] ?? GLYPHS[0]}</svg>`;
}

function esc(v: unknown): string {
  return String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// ---------- games list ----------

/** A game in "your games". */
export interface GameItem {
  /** Id for the page's delete step. */
  key: string;
  href: string;
  seats: { name: string; color: number }[];
  variant: Variant;
  state: GameState;
  startedAt: number;
  /** Your seat online; null in a hotseat game (every seat is yours). */
  mySeat: number | null;
  /** Saved in this browser (hotseat). */
  local: boolean;
  canDelete: boolean;
}

/** Fills `list` with the games, the ones waiting for you first. */
export function renderGames(list: HTMLElement, items: GameItem[], onDelete: (item: GameItem) => void): void {
  const turnOf = (g: GameItem) => (g.state.phase.type === 'gameOver' ? null : activePlayer(g.state));
  const waiting = (g: GameItem) => g.mySeat !== null && turnOf(g) === g.mySeat;
  const sorted = [...items].sort((a, b) => Number(waiting(b)) - Number(waiting(a)) || Number(b.local) - Number(a.local) || b.startedAt - a.startedAt);
  if (!sorted.length) {
    list.innerHTML = '<li class="empty">Nessuna partita: creane una qui sotto.</li>';
    return;
  }
  list.innerHTML = sorted
    .map((g, i) => {
      const turn = turnOf(g);
      const over = g.state.phase.type === 'gameOver';
      const seats = g.seats
        .map((s, j) => `<span class="g-seat${j === turn ? ' turn' : ''}">${glyph(s.color)}${esc(s.name)}${j === g.mySeat ? ' <small class="muted">(tu)</small>' : ''}</span>`)
        .join('');
      const who = over
        ? '<span class="tag over">Finita</span>'
        : turn === null
          ? ''
          : waiting(g)
            ? '<span><b>Tocca a te</b></span>'
            : `<span>Tocca a <b>${esc(g.seats[turn]?.name ?? '')}</b></span>`;
      const draft = g.state.phase.type === 'draft' ? ' · scelta di leader e lore' : '';
      return `<li class="game${waiting(g) ? ' mine' : ''}">
        <div class="g-seats">${seats}</div>
        <div class="g-meta">${g.local ? '<span class="tag hot">Su questo computer</span>' : ''}<span class="tag">${VARIANT_NAME[g.variant]}</span><span>Capitolo ${g.state.chapter}${draft}</span>${who}<span>iniziata il ${new Date(g.startedAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
        <div class="g-actions"><a class="btn primary" href="${esc(g.href)}">${over ? 'Rivedi' : 'Riprendi'}</a>${g.canDelete ? `<button type="button" class="btn icon danger" data-del="${i}" title="Elimina la partita" aria-label="Elimina la partita">${ICONS.trash}</button>` : ''}</div>
      </li>`;
    })
    .join('');
  list.onclick = (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-del]');
    if (b) onDelete(sorted[Number(b.dataset.del)]);
  };
}

// ---------- new game ----------

/** What the new-game screen needs from the page. */
export interface NewGameDeps {
  /** Your address (your seat online). */
  me: string;
  /** Creates the game and opens it; a rejection is shown under the button. */
  create: (setup: GameSetup) => Promise<void>;
}

/** Mounts the new-game screen: mode, variant, seats and colours, who starts, and a summary with the start button. */
export function mountNewGame(root: HTMLElement, deps: NewGameDeps): void {
  let d: GameDraft = newDraft('online', deps.me);
  /** Seats whose field was left once: their problems show under them. */
  let touched = new Set<number>();
  let tried = false;
  let busy = false;
  let note = { text: '', cls: 'muted' };

  const tile = (group: string, value: string, on: boolean, icon: string, title: string, sub: string) =>
    `<button type="button" class="tile" role="radio" aria-checked="${on}" data-${group}="${value}"><span class="t-ic">${icon}</span><b>${title}</b><span class="t-sub">${sub}</span></button>`;

  function seatRow(i: number): string {
    const s = d.seats[i];
    const mine = d.mode === 'online' && i === 0;
    const swatches = COLORS.map(
      (c) => `<button type="button" class="sw s-${c}" role="radio" aria-checked="${s.color === c}" data-color="${c}" data-seat="${i}" title="${COLOR_NAME[c]}" aria-label="Colore ${COLOR_NAME[c]}">${glyph(c)}</button>`,
    ).join('');
    const field = mine
      ? `<span class="me-seat">${esc(s.who)}<small>tu</small></span>`
      : `<input type="${d.mode === 'online' ? 'email' : 'text'}" data-who="${i}" value="${esc(s.who)}" autocomplete="off" spellcheck="false"
          placeholder="${d.mode === 'online' ? 'indirizzo Google del giocatore' : `Giocatore ${i + 1}`}" aria-label="${d.mode === 'online' ? 'Indirizzo' : 'Nome'} del giocatore ${i + 1}">`;
    const canRemove = d.seats.length > 2 && !mine;
    const tools = `<button type="button" class="btn icon" data-move="${i}" data-by="-1" ${i === 0 ? 'disabled' : ''} title="Sposta su" aria-label="Sposta su">${ICONS.up}</button>
      <button type="button" class="btn icon" data-move="${i}" data-by="1" ${i === d.seats.length - 1 ? 'disabled' : ''} title="Sposta giù" aria-label="Sposta giù">${ICONS.down}</button>
      <button type="button" class="btn icon danger" data-remove="${i}" ${canRemove ? '' : 'disabled'} title="Togli" aria-label="Togli il giocatore ${i + 1}">${ICONS.remove}</button>`;
    return `<li class="seat s-${s.color}"><span class="n">${i + 1}</span><span class="swatches" role="radiogroup" aria-label="Colore del giocatore ${i + 1}">${swatches}</span>${field}<span class="s-tools">${tools}</span><span class="s-err" data-err="${i}" role="status"></span></li>`;
  }

  function render(): void {
    const firstChips = [`<button type="button" class="chip" role="radio" aria-checked="${d.first === null}" data-first="">A caso</button>`]
      .concat(d.seats.map((s, i) => `<button type="button" class="chip" role="radio" aria-checked="${d.first === i}" data-first="${i}">${glyph(s.color)}<span data-name="${i}">${esc(seatLabel(s.who, i))}</span></button>`))
      .join('');
    root.innerHTML = `<div class="ng">
      <div class="ng-steps">
        <section><h3>1 · Come giocate</h3><div class="tiles" role="radiogroup" aria-label="Modalità">
          ${tile('mode', 'online', d.mode === 'online', ICONS.online, 'Online', 'Ognuno dal proprio dispositivo: gli altri trovano la partita nella loro pagina.')}
          ${tile('mode', 'hotseat', d.mode === 'hotseat', ICONS.hotseat, 'Su questo computer', 'A turno sullo stesso schermo, che si copre tra un giocatore e l’altro.')}
        </div></section>
        <section><h3>2 · Variante</h3><div class="tiles" role="radiogroup" aria-label="Variante">
          ${tile('variant', 'base', d.variant === 'base', ICONS.base, 'Base', 'La partita base.')}
          ${tile('variant', 'leaders', d.variant === 'leaders', ICONS.leaders, 'Leader e Lore', 'Prima di iniziare ognuno sceglie un leader e una lore.')}
        </div></section>
        <section><h3>3 · Giocatori e colori</h3>
          <p class="note">L’ordine dell’elenco è l’ordine di gioco intorno al tavolo.${d.mode === 'online' ? ' Tutti devono essere stati invitati.' : ' I nomi sono facoltativi.'}</p>
          <ul class="seats" style="margin-top:10px">${d.seats.map((_, i) => seatRow(i)).join('')}</ul>
          ${d.seats.length < 4 ? '<button type="button" class="btn add" data-add>+ Aggiungi giocatore</button>' : ''}
        </section>
        <section><h3>4 · Chi inizia</h3><div class="first" role="radiogroup" aria-label="Chi ha l’iniziativa">${firstChips}</div></section>
      </div>
      <aside class="summary frame" aria-label="Riepilogo"><h2>Riepilogo</h2><div class="summary" style="position:static" data-summary></div>
        <button type="button" class="btn primary big" data-start>Inizia la partita</button><p class="note" data-note role="status"></p></aside>
    </div>`;
    renderSide();
  }

  /** The parts that change while typing: summary, per-seat problems and names on the chips. */
  function renderSide(): void {
    const list = problems(d);
    for (const el of root.querySelectorAll<HTMLElement>('[data-err]')) {
      const i = Number(el.dataset.err);
      const p = list.find((x) => x.seat === i);
      const show = !!p && (tried || touched.has(i));
      el.textContent = show ? p.text : '';
      el.hidden = !show;
      root.querySelector(`[data-who="${i}"]`)?.setAttribute('aria-invalid', String(show));
    }
    for (const el of root.querySelectorAll<HTMLElement>('[data-name]')) el.textContent = seatLabel(d.seats[Number(el.dataset.name)]?.who ?? '', Number(el.dataset.name));
    const seats = d.seats
      .map((s, i) => `<li class="s-${s.color}">${glyph(s.color)}<span class="nm">${esc(seatLabel(s.who, i))}</span>${d.first === i ? '<span class="starts">inizia</span>' : ''}</li>`)
      .join('');
    const issues = list.length ? `<ul class="issues${tried || touched.size ? '' : ' soft'}">${list.map((p) => `<li>${p.seat === null ? '' : `Giocatore ${p.seat + 1}: `}${esc(p.text)}</li>`).join('')}</ul>` : '';
    root.querySelector('[data-summary]')!.innerHTML = `
      <dl><dt>Modalità</dt><dd>${MODE_NAME[d.mode]}</dd><dt>Variante</dt><dd>${VARIANT_NAME[d.variant]}</dd><dt>Inizia</dt><dd>${d.first === null ? 'a caso' : esc(seatLabel(d.seats[d.first].who, d.first))}</dd></dl>
      <ul class="sum-seats">${seats}</ul>
      ${issues}`;
    // The button stays the same element: leaving a field redraws the summary between mouse down and up.
    const go = root.querySelector<HTMLButtonElement>('[data-start]')!;
    go.disabled = list.length > 0 || busy;
    go.textContent = busy ? 'Preparo la partita…' : 'Inizia la partita';
    const msg = root.querySelector<HTMLElement>('[data-note]')!;
    msg.className = `note ${note.cls}`;
    msg.textContent = note.text;
  }

  async function start(): Promise<void> {
    tried = true;
    let setup: GameSetup;
    try {
      setup = toSetup(d);
    } catch (e) {
      note = { text: (e as Error).message, cls: 'err' };
      return renderSide();
    }
    busy = true;
    note = { text: '', cls: 'muted' };
    renderSide();
    try {
      await deps.create(setup);
    } catch (e) {
      note = { text: (e as Error).message, cls: 'err' };
    }
    busy = false;
    renderSide();
  }

  root.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('button');
    if (!el || (el as HTMLButtonElement).disabled) return;
    const k = el.dataset;
    if (k.start !== undefined) return void start();
    const before = d;
    if (k.mode) {
      d = setMode(d, k.mode as Mode, deps.me);
      touched = new Set();
    } else if (k.variant) d = { ...d, variant: k.variant as Variant };
    else if (k.color !== undefined) d = setColor(d, Number(k.seat), Number(k.color));
    else if (k.move !== undefined) d = moveSeat(d, Number(k.move), Number(k.by) as -1 | 1);
    else if (k.remove !== undefined) d = removeSeat(d, Number(k.remove));
    else if (k.add !== undefined) d = addSeat(d);
    else if (k.first !== undefined) d = { ...d, first: k.first === '' ? null : Number(k.first) };
    if (d === before) return;
    note = { text: '', cls: 'muted' };
    // The screen is drawn again: keep the focus on the control just used.
    const key = Object.entries(k).map(([a, b]) => `[data-${a.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}="${b}"]`).join('');
    render();
    (root.querySelector<HTMLElement>(key) ?? root.querySelector<HTMLElement>('[data-add], [data-start]'))?.focus();
  });
  root.addEventListener('input', (ev) => {
    const el = ev.target as HTMLInputElement;
    if (el.dataset.who === undefined) return;
    d = setWho(d, Number(el.dataset.who), el.value);
    renderSide();
  });
  root.addEventListener('focusout', (ev) => {
    const el = ev.target as HTMLElement;
    if (el.dataset.who === undefined) return;
    touched.add(Number(el.dataset.who));
    renderSide();
  });
  root.addEventListener('keydown', (ev) => {
    const el = ev.target as HTMLElement;
    if (ev.key === 'Enter' && el.dataset.who !== undefined) {
      ev.preventDefault();
      void start();
    }
  });
  render();
}
