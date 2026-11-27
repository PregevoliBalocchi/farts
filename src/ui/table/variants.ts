// The card options of a basic action, found by trying them (production/base-fixes.md #47).
// Several cards change how a Tax, a Build, an Influence or a Secure is done: tax a second
// city of the same owner, take the other resource of a gate city, change a planet's type,
// hit the building to do it again, build a city outside the slots, influence twice, influence
// before or after securing. The engine reads them as optional fields of the action; the table
// does not know which card grants which. Like decide.ts, it tries every field the action has,
// keeps the values the engine accepts, then the combinations of them, and keeps one option per
// distinct outcome. Without such a card nothing passes and no variant is offered.

import { dispatch, RESOURCES } from '../../game/engine';
import type { ActionPayload, ContentIndex, GameState, PlayerId, Resource } from '../../game/engine';
import { actionCommand } from './intent';

/** What a variant adds to the plain action, for its label. */
export type VariantPart =
  | { key: 'city'; n: number }
  | { key: 'resource'; resource: Resource }
  | { key: 'shape'; resource: Resource }
  | { key: 'again'; port?: 'fresh' | 'damaged' }
  | { key: 'ransack'; slot: number; port?: 'fresh' | 'damaged' }
  | { key: 'outside'; resource: Resource }
  | { key: 'twice'; slot: number }
  | { key: 'influence'; slot: number; when: 'before' | 'after' };

/** A legal way of doing the action with a card's option: the fields to add, and what they mean. */
export interface Variant {
  extra: Record<string, unknown>;
  parts: VariantPart[];
}

interface Value {
  extra: Record<string, unknown>;
  part: VariantPart;
}

/** Most combinations tried per action (the menu stays quick to open). */
const MAX_COMBOS = 120;

/** The optional fields `a` can take, each as a list of values to try. */
function dimensions(s: GameState, me: PlayerId, a: ActionPayload): Value[][] {
  const pl = s.players[me];
  const court = s.court.map((_, i) => i);
  const held = pl.resources.flatMap((r, i) => (r ? [{ r, i }] : []));
  const again: Value[] = [{ extra: { again: {} }, part: { key: 'again' } }, ...court.map((i): Value => ({ extra: { again: { ransack: i } }, part: { key: 'ransack', slot: i } }))];
  if (a.kind === 'tax') {
    const owner = a.cityOwner ?? me;
    const n = s.map[a.system]?.buildings.filter((b) => b.type === 'city' && b.owner === owner).length ?? 0;
    return [
      a.emptySlot ? [] : Array.from({ length: n }, (_, i): Value => ({ extra: { city: i }, part: { key: 'city', n: i } })),
      RESOURCES.map((r): Value => ({ extra: { resource: r }, part: { key: 'resource', resource: r } })),
      [...held.map(({ r, i }): Value => ({ extra: { shape: i }, part: { key: 'shape', resource: r } })), ...RESOURCES.map((r): Value => ({ extra: { shape: { cartel: r } }, part: { key: 'shape', resource: r } }))],
      a.emptySlot ? [] : again,
    ];
  }
  if (a.kind === 'build' && a.what === 'ship') {
    // The starport hit to build again (leader-10): it matters only when one is fresh and another damaged
    // (the damaged one is destroyed). Then each option names the one it hits.
    const ports = s.map[a.system]?.buildings.filter((b) => b.type === 'starport' && b.owner === me) ?? [];
    if (ports.every((b) => b.damaged === ports[0].damaged)) return [again];
    return [ports.flatMap((b, i) => again.map((v): Value => ({ extra: { ...v.extra, port: i }, part: { ...v.part, port: b.damaged ? 'damaged' : 'fresh' } as VariantPart })))];
  }
  if (a.kind === 'build' && a.what === 'city') return [held.map(({ r, i }): Value => ({ extra: { outside: true, pay: i }, part: { key: 'outside', resource: r } }))];
  if (a.kind === 'influence') return [court.map((i): Value => ({ extra: { twice: i }, part: { key: 'twice', slot: i } }))];
  if (a.kind === 'secure') {
    return [court.flatMap((i) => (['before', 'after'] as const).map((when): Value => ({ extra: { influence: { courtSlot: i, when } }, part: { key: 'influence', slot: i, when } })))];
  }
  return [];
}

/**
 * The card options of action `a` that player `me` can use now, as extra fields of the action
 * (spending `prelude` when given). Each leads to a different outcome from the plain action and
 * from the others; options described the same way are one. Simplest first; empty when no card
 * the player holds changes this action.
 */
export function actionVariants(ix: ContentIndex, s: GameState, me: PlayerId, a: ActionPayload, prelude?: Resource): Variant[] {
  const run = (p: ActionPayload): string | null => {
    try {
      return JSON.stringify(dispatch(ix, s, actionCommand(me, p, prelude)));
    } catch {
      return null;
    }
  };
  const dims = dimensions(s, me, a)
    .map((vals) => vals.filter((v) => run({ ...a, ...v.extra } as ActionPayload) !== null))
    .filter((vals) => vals.length > 0);
  if (!dims.length) return [];
  let combos: Value[][] = [[]];
  for (const vals of dims) {
    const next: Value[][] = [];
    for (const c of combos) {
      next.push(c);
      for (const v of vals) if (next.length < MAX_COMBOS) next.push([...c, v]);
    }
    combos = next;
  }
  const plain = run(a);
  const seen = new Set<string>(plain ? [plain] : []);
  const said = new Set<string>();
  const out: Variant[] = [];
  for (const c of combos.filter((x) => x.length > 0).sort((x, y) => x.length - y.length)) {
    const extra = Object.assign({}, ...c.map((v) => v.extra)) as Record<string, unknown>;
    const key = run({ ...a, ...extra } as ActionPayload);
    const label = JSON.stringify(c.map((v) => v.part));
    if (key === null || seen.has(key) || said.has(label)) continue;
    seen.add(key);
    said.add(label);
    out.push({ extra, parts: c.map((v) => v.part) });
  }
  return out;
}
