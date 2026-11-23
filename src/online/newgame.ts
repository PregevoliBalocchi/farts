// The "new game" form of the entrance page (online/index.html): mode, variant,
// seats with their colours and who starts. Pure functions over a draft, so the
// page only renders it; tested in tests/unit/online/newgame.test.ts.

import { normalizeEmail } from './roles';

/** Online: every player on their own screen. Hotseat: every seat played in turn on this computer. */
export type Mode = 'online' | 'hotseat';
export type Variant = 'base' | 'leaders';

/** One seat of the draft: who sits there (an address online, a name in hotseat) and its colour index (0-3). */
export interface SeatDraft {
  who: string;
  color: number;
}

/** The form's state. Seat order is the play order around the table. */
export interface GameDraft {
  mode: Mode;
  variant: Variant;
  seats: SeatDraft[];
  /** The seat that starts with the initiative, or null for a random one. */
  first: number | null;
}

/** What the page needs to create the game. */
export interface GameSetup {
  mode: Mode;
  variant: Variant;
  /** Online: the players' addresses in seat order. Hotseat: the seat names (blank: default name). */
  players: string[];
  /** Colour index of each seat. */
  colors: number[];
  firstPlayer: number | undefined;
}

export const MIN_SEATS = 2;
export const MAX_SEATS = 4;
/** Colours on offer: indexes into the table's seat colours. */
export const COLORS = [0, 1, 2, 3] as const;
/** Longest hotseat name kept. */
export const NAME_MAX = 24;

/** A new draft: online you and one more player; hotseat three seats. */
export function newDraft(mode: Mode, me: string): GameDraft {
  const seats: SeatDraft[] = mode === 'online' ? [{ who: me, color: 0 }, { who: '', color: 1 }] : [0, 1, 2].map((color) => ({ who: '', color }));
  return { mode, variant: 'base', seats, first: null };
}

/** Switches mode keeping the seats and colours; online the first seat becomes yours. */
export function setMode(d: GameDraft, mode: Mode, me: string): GameDraft {
  if (d.mode === mode) return d;
  const seats = d.seats.map((s, i) => ({ ...s, who: mode === 'online' && i === 0 ? me : '' }));
  return { ...d, mode, seats };
}

/** Adds a seat with the first free colour (no change at four). */
export function addSeat(d: GameDraft): GameDraft {
  if (d.seats.length >= MAX_SEATS) return d;
  const color = COLORS.find((c) => !d.seats.some((s) => s.color === c))!;
  return { ...d, seats: [...d.seats, { who: '', color }] };
}

/** Removes seat `i` (never below two seats, never your own seat online). */
export function removeSeat(d: GameDraft, i: number): GameDraft {
  if (d.seats.length <= MIN_SEATS || !d.seats[i] || (d.mode === 'online' && i === 0)) return d;
  const seats = d.seats.filter((_, j) => j !== i);
  const first = d.first === null || d.first === i ? null : d.first > i ? d.first - 1 : d.first;
  return { ...d, seats, first };
}

/** Moves seat `i` one place up (-1) or down (+1); the starting seat follows its player. */
export function moveSeat(d: GameDraft, i: number, by: -1 | 1): GameDraft {
  const j = i + by;
  if (!d.seats[i] || !d.seats[j]) return d;
  const seats = [...d.seats];
  [seats[i], seats[j]] = [seats[j], seats[i]];
  const first = d.first === i ? j : d.first === j ? i : d.first;
  return { ...d, seats, first };
}

/** Gives seat `i` colour `color`; the seat that had it takes seat i's old colour. */
export function setColor(d: GameDraft, i: number, color: number): GameDraft {
  const seat = d.seats[i];
  if (!seat || !COLORS.includes(color as (typeof COLORS)[number]) || seat.color === color) return d;
  const seats = d.seats.map((s, j) => (j === i ? { ...s, color } : s.color === color ? { ...s, color: seat.color } : s));
  return { ...d, seats };
}

/** Sets who sits at seat `i` (an address online, a name in hotseat); your own seat online stays yours. */
export function setWho(d: GameDraft, i: number, who: string): GameDraft {
  if (!d.seats[i] || (d.mode === 'online' && i === 0)) return d;
  return { ...d, seats: d.seats.map((s, j) => (j === i ? { ...s, who } : s)) };
}

/** Problems that stop the game from being created, at most one per seat, in seat order (empty: ready). */
export function problems(d: GameDraft): { seat: number | null; text: string }[] {
  const out: { seat: number | null; text: string }[] = [];
  if (d.seats.length < MIN_SEATS || d.seats.length > MAX_SEATS) out.push({ seat: null, text: `Servono da ${MIN_SEATS} a ${MAX_SEATS} giocatori` });
  const seen = new Set<string>();
  d.seats.forEach((s, i) => {
    const raw = s.who.trim();
    if (d.mode === 'online') {
      if (!raw) return void out.push({ seat: i, text: 'Manca l’indirizzo' });
      let email: string;
      try {
        email = normalizeEmail(raw);
      } catch {
        return void out.push({ seat: i, text: 'Indirizzo non valido' });
      }
      if (seen.has(email)) return void out.push({ seat: i, text: 'Compare due volte' });
      seen.add(email);
    } else {
      if (raw.length > NAME_MAX) return void out.push({ seat: i, text: `Nome troppo lungo (al massimo ${NAME_MAX} caratteri)` });
      const key = raw.toLowerCase();
      if (raw && seen.has(key)) return void out.push({ seat: i, text: 'Nome già usato' });
      if (raw) seen.add(key);
    }
  });
  if (new Set(d.seats.map((s) => s.color)).size !== d.seats.length) out.push({ seat: null, text: 'Due giocatori hanno lo stesso colore' });
  return out;
}

/** The game to create; throws the first problem when the draft is not ready. */
export function toSetup(d: GameDraft): GameSetup {
  const p = problems(d);
  if (p.length) throw new Error(p[0].seat === null ? p[0].text : `Giocatore ${p[0].seat + 1}: ${p[0].text}`);
  return {
    mode: d.mode,
    variant: d.variant,
    players: d.seats.map((s) => (d.mode === 'online' ? normalizeEmail(s.who) : s.who.trim())),
    colors: d.seats.map((s) => s.color),
    firstPlayer: d.first ?? undefined,
  };
}

/** The display name of a seat: the hotseat name, or the address's part before "@", or "Giocatore N". */
export function seatLabel(who: string, i: number): string {
  const w = who.trim();
  return (w.includes('@') ? w.slice(0, w.indexOf('@')) : w) || `Giocatore ${i + 1}`;
}
