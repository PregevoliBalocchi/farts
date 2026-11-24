// A first proposal for assigning a rolled battle's hits, which the attacker
// confirms (design/gdd/core-loop.md §3.5). The engine checks it on `allocate`.
// Same order the debug page proposes: fresh ships take a hit before damaged
// ones, buildings only once the defender has no ships left.

import { ransackable } from '../../game/engine';
import type { Allocation, BattleRef, DieFace, DieType, GameState, HitTarget, ShipHit } from '../../game/engine';

/** Proposed allocation for battle `b` in state `s` (no raid; ransack the first eligible Court slots). */
export function defaultAllocation(s: GameState, b: BattleRef): Allocation {
  const sys = s.map[b.system];
  const att = { ...(sys.ships[b.attacker] ?? { fresh: 0, damaged: 0 }) };
  // Campaign defenders (the Empire, the Free States, the Blight) are drawn from M2's battle screen; here only a player's ships.
  const def = { ...((typeof b.target === 'number' ? sys.ships[b.target] : undefined) ?? { fresh: 0, damaged: 0 }) };
  const blds = sys.buildings.map((x, i) => ({ i, owner: x.owner, type: x.type, dmg: x.damaged, gone: false }));
  const shipHit = (st: { fresh: number; damaged: number }) => {
    if (st.fresh > 0) {
      st.fresh--;
      st.damaged++;
      return 'fresh' as const;
    }
    if (st.damaged > 0) {
      st.damaged--;
      return 'damaged' as const;
    }
    return null;
  };
  let destroyedCities = 0;
  const bldHit = () => {
    const t = blds.find((x) => x.owner === b.target && !x.gone && !x.dmg) ?? blds.find((x) => x.owner === b.target && !x.gone);
    if (!t) return null;
    if (!t.dmg) t.dmg = true;
    else {
      t.gone = true;
      if (t.type === 'city') destroyedCities++;
    }
    return t.i;
  };
  const selfHits: Allocation['selfHits'] = [];
  for (let i = 0; i < b.totals.selfHit + b.interceptHits; i++) {
    const h = shipHit(att);
    if (h) selfHits.push(h);
  }
  const hits: Allocation['hits'] = [];
  for (let i = 0; i < b.totals.hit; i++) {
    const h = shipHit(def);
    if (h) hits.push(h);
    else {
      const bi = bldHit();
      if (bi !== null) hits.push({ building: bi });
    }
  }
  const buildingHits: number[] = [];
  for (let i = 0; i < b.totals.buildingHit; i++) {
    const bi = bldHit();
    if (bi !== null) buildingHits.push(bi);
  }
  const eligible = typeof b.target === 'number' ? ransackable(s, b.target) : [];
  const ransack = destroyedCities && eligible.length ? eligible.slice(0, Math.min(destroyedCities, eligible.length)) : [];
  return { selfHits, hits, buildingHits, raid: [], ...(ransack.length ? { ransack } : {}) };
}

// ---- the battle view: dice faces, and assigning hits one click at a time ----


/** The official dice pictures (assets/ui/dice/<key>.png), by the symbols on the face. */
const FACE_PICTURES: Record<DieType, Record<string, string>> = {
  skirmish: { hit1: 'skirmish-1-3', '': 'skirmish-4-5' },
  assault: { 'hit1|intercept1': 'assault-1', 'hit1|selfHit1': 'assault-2-5', 'hit2|selfHit1': 'assault-3', hit2: 'assault-4', '': 'assault-6' },
  raid: { 'intercept1|key2': 'raid-1', 'key1|selfHit1': 'raid-2', 'buildingHit1|selfHit1': 'raid-3-4', 'buildingHit1|key1': 'raid-5', intercept1: 'raid-6' },
};

/** A face's symbols as a stable key ("hit1|selfHit1"; '' for a blank face). */
export function faceKey(face: DieFace): string {
  return Object.entries(face)
    .filter(([, n]) => typeof n === 'number' && n > 0)
    .map(([k, n]) => `${k}${n}`)
    .sort()
    .join('|');
}

/** Asset key of the official picture of a die face ("dice.assault-3"), or null when there is none for it. */
export function facePicture(type: DieType, face: DieFace): string | null {
  const name = FACE_PICTURES[type]?.[faceKey(face)];
  return name ? `dice.${name}` : null;
}

/** Which of a die's faces (index into its face list) shows `face`. */
export function faceIndex(faces: readonly DieFace[], face: DieFace): number {
  const k = faceKey(face);
  return Math.max(0, faces.findIndex((f) => faceKey(f) === k));
}

/** The pieces in a battle: each side's ships, and the system's buildings (by index, as the engine numbers them). */
export interface BattleForces {
  attacker: { fresh: number; damaged: number };
  defender: { fresh: number; damaged: number };
  buildings: { owner: number; type: 'city' | 'starport'; damaged: boolean }[];
}

/** The pieces of battle `b` in state `s`, before any hit. */
export function battleForces(s: GameState, b: BattleRef): BattleForces {
  const sys = s.map[b.system];
  return {
    attacker: { ...(sys.ships[b.attacker] ?? { fresh: 0, damaged: 0 }) },
    defender: { ...((typeof b.target === 'number' ? sys.ships[b.target] : undefined) ?? { fresh: 0, damaged: 0 }) },
    buildings: sys.buildings.flatMap((x) => (typeof x.owner === 'number' ? [{ owner: x.owner, type: x.type, damaged: x.damaged }] : [])),
  };
}

/** A side's ships after the hits chosen so far: still fresh, damaged, and destroyed. */
export interface ShipsAfter {
  fresh: number;
  damaged: number;
  destroyed: number;
}

/** What the battle will leave once `al` is applied (as far as chosen): ships by side, each building's state. */
export interface BattleAfter {
  attacker: ShipsAfter;
  defender: ShipsAfter;
  buildings: ('ok' | 'damaged' | 'destroyed')[];
}

function hitShips(st: ShipsAfter, h: ShipHit): void {
  if (h === 'fresh' && st.fresh > 0) {
    st.fresh--;
    st.damaged++;
  } else if (h === 'damaged' && st.damaged > 0) {
    st.damaged--;
    st.destroyed++;
  }
}

/** Applies the hits of `al` to `f`, in rule order, for showing them. */
export function battleAfter(f: BattleForces, al: Pick<Allocation, 'selfHits' | 'hits' | 'buildingHits'>): BattleAfter {
  const attacker = { ...f.attacker, destroyed: 0 };
  const defender = { ...f.defender, destroyed: 0 };
  const buildings = f.buildings.map((b) => (b.damaged ? 'damaged' : 'ok') as 'ok' | 'damaged' | 'destroyed');
  const hitBuilding = (i: number) => {
    if (buildings[i] === 'ok') buildings[i] = 'damaged';
    else if (buildings[i] === 'damaged') buildings[i] = 'destroyed';
  };
  for (const h of al.selfHits) if (typeof h === 'string') hitShips(attacker, h);
  for (const h of al.hits) {
    if (typeof h === 'string') hitShips(defender, h);
    else if ('building' in h) hitBuilding(h.building);
  }
  for (const i of al.buildingHits) hitBuilding(i);
  return { attacker, defender, buildings };
}

/** Hits still to place: on the defender, on the defender's buildings, on the attacker's own ships. */
export function hitsLeft(b: BattleRef, al: Pick<Allocation, 'selfHits' | 'hits' | 'buildingHits'>): { hits: number; buildingHits: number; selfHits: number } {
  return {
    hits: Math.max(0, b.totals.hit - al.hits.length),
    buildingHits: Math.max(0, b.totals.buildingHit - al.buildingHits.length),
    selfHits: Math.max(0, b.totals.selfHit + b.interceptHits - al.selfHits.length),
  };
}

/** A piece clicked in the battle view: a ship of one side (fresh or damaged), or a building by index. */
export type BattlePick = { side: 'attacker' | 'defender'; ship: ShipHit } | { building: number };

/**
 * The allocation with one more hit on `pick`, or null when that piece cannot
 * take a hit now: no hit of that kind is left, no such piece remains, a
 * building is hit with ordinary hits while defending ships remain, or it is
 * not the defender's.
 */
export function addHit(f: BattleForces, b: BattleRef, al: Allocation, pick: BattlePick): Allocation | null {
  const left = hitsLeft(b, al);
  const now = battleAfter(f, al);
  if ('building' in pick) {
    const bld = f.buildings[pick.building];
    if (!bld || bld.owner !== b.target || now.buildings[pick.building] === 'destroyed') return null;
    if (left.buildingHits > 0) return { ...al, buildingHits: [...al.buildingHits, pick.building] };
    if (left.hits > 0 && now.defender.fresh + now.defender.damaged === 0) return { ...al, hits: [...al.hits, { building: pick.building } as HitTarget] };
    return null;
  }
  const st = pick.side === 'attacker' ? now.attacker : now.defender;
  if ((pick.ship === 'fresh' ? st.fresh : st.damaged) === 0) return null;
  if (pick.side === 'attacker') return left.selfHits > 0 ? { ...al, selfHits: [...al.selfHits, pick.ship] } : null;
  return left.hits > 0 ? { ...al, hits: [...al.hits, pick.ship] } : null;
}

/** The allocation with every hit taken back (raid and ransack choices kept). */
export function emptyAllocation(al: Allocation): Allocation {
  return { ...al, selfHits: [], hits: [], buildingHits: [] };
}

// ---- the battle's animation: shots from the rolled dice, explosions from the hits placed ----

/** A weapon drawn in the battle view: a laser bolt, a missile, or a tractor beam (keys: no explosion). */
export type Weapon = 'laser' | 'missile' | 'tractor';

/** One shot of the opening volley: when (seconds after the roll), who fires, what with, at what, and whether it lands. */
export interface Shot {
  delay: number;
  die: number;
  from: 'attacker' | 'defender';
  weapon: Weapon;
  at: 'ship' | 'building';
  hit: boolean;
}

/** Timing of the opening volley: first shot, gap between dice, gap between one die's shots (seconds). */
export const VOLLEY = { start: 0.25, dieGap: 0.32, shotGap: 0.12 } as const;

/**
 * The opening volley for the rolled dice, one die after the other: each hit is
 * a shot at the defender's ships (lasers from skirmish dice, missiles from
 * assault dice), each building hit a missile at a building, each key a tractor
 * beam, each self-hit or intercept return fire at the attacker; a blank face
 * is one shot that misses.
 */
export function volleyPlan(dice: readonly { type: DieType; face: DieFace }[]): Shot[] {
  const shots: Shot[] = [];
  dice.forEach((d, die) => {
    const t0 = VOLLEY.start + die * VOLLEY.dieGap;
    let k = 0;
    const add = (n: number, s: Omit<Shot, 'delay' | 'die'>) => {
      for (let j = 0; j < n; j++) shots.push({ ...s, delay: t0 + k++ * VOLLEY.shotGap, die });
    };
    const f = d.face;
    const gun: Weapon = d.type === 'skirmish' ? 'laser' : 'missile';
    add(f.hit ?? 0, { from: 'attacker', weapon: gun, at: 'ship', hit: true });
    add(f.buildingHit ?? 0, { from: 'attacker', weapon: 'missile', at: 'building', hit: true });
    add(f.key ?? 0, { from: 'attacker', weapon: 'tractor', at: 'building', hit: false });
    add((f.selfHit ?? 0) + (f.intercept ?? 0), { from: 'defender', weapon: 'laser', at: 'ship', hit: true });
    if (k === 0) add(1, { from: 'attacker', weapon: gun, at: 'ship', hit: false });
  });
  return shots;
}

/**
 * A piece hit by the latest placed hits, and what it became. A damaged ship is
 * found by its index among its side's damaged ships after the hits; a destroyed
 * one by `was` and its index among that kind of ship before them (it is gone
 * after). A building by its index.
 */
export interface HitEvent {
  piece: 'attacker' | 'defender' | 'building';
  index: number;
  to: 'damaged' | 'destroyed';
  was?: 'fresh' | 'damaged';
}

/** What changed from `prev` to `next` as more hits were placed; nothing when hits were taken back. */
export function hitEvents(prev: BattleAfter, next: BattleAfter): HitEvent[] {
  const out: HitEvent[] = [];
  for (const side of ['attacker', 'defender'] as const) {
    const a = prev[side];
    const b = next[side];
    if (b.destroyed < a.destroyed || b.fresh > a.fresh) return [];
    const lost = b.destroyed - a.destroyed;
    // Destroyed ships were damaged ones first; past those, fresh ships hit twice.
    for (let j = 0; j < lost; j++)
      out.push(j < a.damaged ? { piece: side, index: a.damaged - 1 - j, to: 'destroyed', was: 'damaged' } : { piece: side, index: a.fresh - 1 - (j - a.damaged), to: 'destroyed', was: 'fresh' });
    const twice = Math.max(0, lost - a.damaged);
    for (let j = 0; j < a.fresh - b.fresh - twice; j++) out.push({ piece: side, index: b.damaged - 1 - j, to: 'damaged' });
  }
  const rank = { ok: 0, damaged: 1, destroyed: 2 } as const;
  for (let i = 0; i < next.buildings.length; i++) {
    const was = prev.buildings[i] ?? 'ok';
    const now = next.buildings[i];
    if (rank[now] < rank[was]) return [];
    if (now !== was) out.push({ piece: 'building', index: i, to: now === 'destroyed' ? 'destroyed' : 'damaged' });
  }
  return out;
}
