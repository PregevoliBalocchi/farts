// A first proposal for assigning a rolled battle's hits, which the attacker
// confirms (design/gdd/core-loop.md §3.5). The engine checks it on `allocate`.
// Same order the debug page proposes: fresh ships take a hit before damaged
// ones, buildings only once the defender has no ships left.

import type { Allocation, BattleRef, GameState } from '../../game/engine';

/** Proposed allocation for battle `b` in state `s` (no raid; ransack the first eligible Court slots). */
export function defaultAllocation(s: GameState, b: BattleRef): Allocation {
  const sys = s.map[b.system];
  const att = { ...(sys.ships[b.attacker] ?? { fresh: 0, damaged: 0 }) };
  const def = { ...(sys.ships[b.target] ?? { fresh: 0, damaged: 0 }) };
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
  const eligible = s.court.map((c, i) => ((c.agents[b.target] ?? 0) > 0 ? i : -1)).filter((i) => i >= 0);
  const ransack = destroyedCities && eligible.length ? eligible.slice(0, Math.min(destroyedCities, eligible.length)) : [];
  return { selfHits, hits, buildingHits, raid: [], ...(ransack.length ? { ransack } : {}) };
}
