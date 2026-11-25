// The piece ledger (production/piano-blindatura-tavolo-2026-11-25.md, Fase 0): every player's
// ships, agents, cities and starports, counted wherever the rules can put them, and the resource
// tokens in play. Nothing a command does may change these totals: pieces move, they never appear
// or vanish (rulebook "Pieces & Piece Limits"). Read by tests and by the playtest simulator.

import type { GameState, Phase, PlayerId, PlayerState } from './types';

/** One player's pieces, all places together. */
export interface PieceCount {
  ships: number;
  agents: number;
  cities: number;
  starports: number;
}

/** The totals the rules keep constant. */
export interface Ledger {
  /** By player id. */
  pieces: PieceCount[];
  /** Resource tokens of every type: the supply, the boards, set aside, on the 2-player ambition boxes. */
  resources: number;
}

/** The phases under the current one (a decision or a battle resumes the phase it interrupted). */
function phases(p: Phase): Phase[] {
  const out: Phase[] = [];
  for (let x: Phase | undefined = p; x; x = (x as { resume?: Phase }).resume) out.push(x);
  return out;
}

/** Agents covering this player's Outrage icons (a placeholder is not an agent). */
function outrageAgents(pl: PlayerState): number {
  return pl.outraged.length - (pl.outragePlaceholders?.length ?? 0);
}

/** Counts every piece and resource token of the base game in `s`. */
export function pieceLedger(s: GameState): Ledger {
  const pieces = s.players.map(
    (pl): PieceCount => ({
      ships: pl.supply.ships + (pl.removed?.ships ?? 0),
      agents: pl.supply.agents + (pl.removed?.agents ?? 0) + outrageAgents(pl),
      cities: pl.supply.cities + (pl.removed?.cities ?? 0),
      starports: pl.supply.starports + (pl.removed?.starports ?? 0),
    }),
  );
  const of = (id: unknown): PieceCount | undefined => (typeof id === 'number' ? pieces[id as PlayerId] : undefined);
  for (const sys of Object.values(s.map)) {
    for (const [id, st] of Object.entries(sys.ships ?? {})) {
      const c = of(Number(id));
      if (c && st) c.ships += st.fresh + st.damaged;
    }
    for (const b of sys.buildings ?? []) {
      const c = of(b.owner);
      if (c) b.type === 'city' ? c.cities++ : c.starports++;
    }
  }
  for (const slot of s.court) for (const [id, n] of Object.entries(slot.agents ?? {})) {
    const c = of(Number(id));
    if (c) c.agents += n;
  }
  for (const pl of s.players) {
    for (const id of pl.captives) {
      const c = of(id);
      if (c) c.agents++;
    }
    for (const t of pl.trophies) {
      const c = of(t.owner);
      if (!c) continue;
      if (t.piece === 'ship') c.ships++;
      else if (t.piece === 'agent') c.agents++;
      else if (t.piece === 'city') c.cities++;
      else if (t.piece === 'starport') c.starports++;
    }
  }
  let resources = Object.values(s.resourceSupply).reduce((a, b) => a + b, 0);
  for (const pl of s.players) resources += pl.resources.filter(Boolean).length + (pl.overflow?.length ?? 0);
  for (const box of Object.values(s.ambitionBoxes ?? {})) resources += box?.length ?? 0;
  for (const p of phases(s.phase)) resources += (p as { budget?: { spentInPrelude?: unknown[] } }).budget?.spentInPrelude?.length ?? 0;
  return { pieces, resources };
}
