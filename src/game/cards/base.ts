// Effects of the owner's base-game cards, keyed by the content's effect ids
// (data/content.json: Court `court-01`…`court-31`, lore `lore-01`…`lore-28`).
// Mechanics only; the texts stay on the owner's cards. Rulings: design/gdd/card-effects.md.
//
// Suit and resource ids below are the owner's content ids; the effect system
// itself (src/game/engine/effects.ts) knows nothing about them.

import {
  HANDLERS,
  afterDeclare,
  currentBudget,
  payDeclareCost,
  receiveCourtCard,
  adjacent,
  captureAtGates,
  gateGuardsAt,
  ownedEffects,
  rollDice,
  RuleError,
  clearOutrage,
  controlsSystem,
  declareAmbitionMarker,
  gainFromSupply,
  heldResources,
  openSlots,
  placeShips,
  planetType,
  provokeOutrage,
  returnCaptive,
  returnCity,
  returnPiece,
  returnToSupply,
  returnTrophy,
  seize,
  shuffle,
  stackOf,
  stealGuild,
  stealResource,
  stealResourceOfType,
  gainResource,
  toDiscard,
  weaponIcons,
} from '../engine';
import type { AmbitionId, CardEffect, DeclareGift, EffectContext, EffectRegistry, GameState, PlayerId, PreludeAbility, Resource } from '../engine';

// ---------------------------------------------------------------- helpers ---

function fail(msg: string): never {
  throw new RuleError(msg);
}

function argNum(ctx: EffectContext, k: string): number {
  const v = ctx.args[k];
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(`Missing choice '${k}'`);
  return v;
}

function argStr(ctx: EffectContext, k: string): string {
  const v = ctx.args[k];
  if (typeof v !== 'string') fail(`Missing choice '${k}'`);
  return v;
}

function argList<T>(ctx: EffectContext, k: string): T[] {
  const v = ctx.args[k];
  if (!Array.isArray(v)) fail(`Missing choice '${k}'`);
  return v as T[];
}

function rival(ctx: EffectContext, k = 'from'): PlayerId {
  const r = argNum(ctx, k);
  if (r === ctx.player || !ctx.state.players[r]) fail('Choose a Rival');
  return r;
}

function inPlaySystem(s: GameState, id: string) {
  const sys = s.map[id] ?? fail(`Unknown system ${id}`);
  if (!sys.inPlay) fail(`System ${id} is out of play`);
  return sys;
}

/** "Prelude: discard this to clear your X Outrage" (one or more types; at least one must be Outraged). */
function clearsOutrage(...types: Resource[]): PreludeAbility {
  return {
    discardSelf: true,
    run: (ctx) => {
      const pl = ctx.state.players[ctx.player];
      const hit = types.filter((t) => pl.outraged.includes(t));
      if (!hit.length) fail(`No ${types.join('/')} Outrage to clear`);
      hit.forEach((t) => clearOutrage(ctx.state, ctx.player, t));
      return `clears ${hit.join(', ')} Outrage`;
    },
  };
}

/** "Prelude: discard this to place 3 ships in a system you control." */
const threeShips: PreludeAbility = {
  discardSelf: true,
  run: (ctx) => {
    const id = argStr(ctx, 'system');
    const sys = inPlaySystem(ctx.state, id);
    if (!controlsSystem(sys, ctx.player)) fail(`You do not control ${id}`);
    return `places ${placeShips(ctx.state, ctx.player, id, 3)} ships at ${id}`;
  },
};

/** Guild: spend any resource as `r`; ignore Outrage spending `r`; kept when Provoking Outrage. */
function loyalGuild(r: Resource, extra: CardEffect = {}): CardEffect {
  return { spendAs: r, keepOnOutrage: true, ...extra };
}

/** Guild: new action (Build) gain 1 `r`; prelude: discard to gain `r` up to your empty slots, stealing once the supply runs out. */
function producer(r: Resource): CardEffect {
  return {
    actions: {
      gain: {
        as: 'build',
        run: (ctx) => (gainFromSupply(ctx.ix.content, ctx.state, ctx.state.players[ctx.player], r) ? `gains 1 ${r}` : `gains nothing (no ${r} or no room)`),
      },
    },
    prelude: {
      fill: {
        discardSelf: true,
        run: (ctx) => {
          const pl = ctx.state.players[ctx.player];
          const empty = openSlots(ctx.ix.content, pl).filter((i) => !pl.resources[i]).length;
          let gained = 0;
          let stolen = 0;
          const from = ctx.args.from as PlayerId | undefined;
          for (let i = 0; i < empty; i++) {
            if ((ctx.state.resourceSupply[r] ?? 0) > 0) {
              if (gainFromSupply(ctx.ix.content, ctx.state, pl, r)) gained++;
            } else {
              if (from === undefined) fail(`The ${r} supply is empty: choose a Rival to steal from ('from')`);
              if (!stealResourceOfType(ctx.ix, ctx.state, ctx.player, from, r)) break;
              stolen++;
            }
          }
          return `gains ${gained} ${r}${stolen ? `, steals ${stolen}` : ''}`;
        },
      },
    },
  };
}

/** Guild: keeps the `r` supply (counted, not spendable); after scoring Rivals discard `r`; prelude discard to steal 1 `r`. */
function cartel(r: Resource): CardEffect {
  return {
    keepsSupply: r,
    afterScoringRivalsDiscard: r,
    prelude: {
      steal: {
        discardSelf: true,
        run: (ctx) => {
          const from = rival(ctx);
          if (!stealResourceOfType(ctx.ix, ctx.state, ctx.player, from, r)) fail(`P${from} has no ${r}`);
          return `steals 1 ${r} from P${from}`;
        },
      },
    },
  };
}

/** Guild: prelude, place next to a face-up played card of `suit`; at round end take that card into hand. */
function union(suit: string): CardEffect {
  return {
    prelude: {
      attach: {
        run: (ctx) => {
          const s = ctx.state;
          const who = argNum(ctx, 'player');
          const play = s.round.plays.find((pl) => pl.player === who && pl.card && pl.faceUp);
          if (!play || ctx.ix.actionCards.get(play.card!)!.suit !== suit) fail(`P${who} has no face-up ${suit} card played this round`);
          if (s.round.attached?.some((a) => a.actionCard === play.card)) fail('A card is already placed next to it');
          const pl = s.players[ctx.player];
          pl.court.splice(pl.court.indexOf(ctx.card), 1);
          (s.round.attached ??= []).push({ guild: ctx.card, owner: ctx.player, actionCard: play.card! });
          return `places ${ctx.card} next to ${play.card}`;
        },
      },
    },
  };
}

function declared(s: GameState, a: AmbitionId): boolean {
  return s.ambitions.declared[a].length > 0;
}

/** Declares from a card effect: same costs and triggers as any declaration, no zero marker. */
function declareFromEffect(ctx: EffectContext, a: AmbitionId): string {
  const s = ctx.state;
  const cost = payDeclareCost(ctx.ix, s, ctx.player, ctx.args.give as DeclareGift | undefined);
  const was = !declared(s, a);
  const marker = declareAmbitionMarker(s, a);
  const after = afterDeclare(ctx.ix, s, ctx.player, a, was);
  return [cost, `declares ${a} (${marker})`, ...after].filter(Boolean).join('; ');
}

/** "When scoring X, no Power for second place; first place gains the second-place Power." */
const justScoring = (a: AmbitionId): CardEffect => ({ scoringSecondOnFirst: [a] });

// ---------------------------------------------------------------- registry ---

/** Base-game Court, lore and leader effects (status per card: design/gdd/card-effects.md). */
export const BASE_EFFECTS: EffectRegistry = {
  // ---- Guild ----
  'court-01': loyalGuild('material'),
  'court-02': producer('material'),
  'court-03': cartel('material'),
  'court-04': union('administration'),
  'court-05': union('construction'),
  'court-06': cartel('fuel'),
  'court-07': loyalGuild('fuel'),
  'court-08': {
    extraDice: { count: 2, inGate: true },
    prelude: {
      gates: {
        discardSelf: true,
        run: (ctx) => {
          const gates = ctx.ix.content.map.systems.filter((x) => x.kind === 'gate' && ctx.state.map[x.id].inPlay);
          const n = gates.reduce((t, g) => t + placeShips(ctx.state, ctx.player, g.id, 1), 0);
          return `places ${n} ships in gates`;
        },
      },
    },
  },
  'court-09': producer('fuel'),
  'court-10': union('mobilization'),
  'court-11': union('aggression'),
  'court-12': {
    actions: {
      ransom: {
        as: 'build',
        run: (ctx) => {
          const wanted = argList<Resource>(ctx, 'resources');
          if (!wanted.length) fail('Return at least one Captive');
          if (wanted.length > ctx.state.players[ctx.player].captives.length) fail('Not enough Captives');
          const got: Resource[] = [];
          for (const r of wanted) {
            returnCaptive(ctx.state, ctx.player, 0);
            if (gainFromSupply(ctx.ix.content, ctx.state, ctx.state.players[ctx.player], r)) got.push(r);
          }
          return `returns ${wanted.length} Captives, gains ${got.join(', ') || 'nothing'}`;
        },
      },
      execute: {
        as: 'influence',
        run: (ctx) => {
          const n = argNum(ctx, 'count');
          const pl = ctx.state.players[ctx.player];
          if (n < 1 || n > pl.captives.length) fail('Choose how many Captives');
          for (const owner of pl.captives.splice(0, n)) pl.trophies.push({ owner, piece: 'agent' });
          return `moves ${n} Captives to Trophies`;
        },
      },
    },
    prelude: { ships: threeShips },
  },
  'court-13': { reroll: { die: 'skirmish', limit: 'weaponIcons' }, prelude: { ships: threeShips } },
  'court-14': {
    actions: {
      abduct: {
        as: 'battle',
        run: (ctx) => {
          const s = ctx.state;
          const slot = s.court[argNum(ctx, 'courtSlot')] ?? fail('No such Court slot');
          const rivals = Object.entries(slot.agents).filter(([k, v]) => Number(k) !== ctx.player && v > 0);
          const total = rivals.reduce((t, [, v]) => t + v, 0);
          if (!total) fail('No Rival agents on that card');
          if (total >= weaponIcons(ctx.ix, s, ctx.player)) fail('That card has as many Rival agents as your Weapon icons, or more');
          for (const [k, v] of rivals) {
            for (let i = 0; i < v; i++) s.players[ctx.player].captives.push(Number(k));
            delete slot.agents[Number(k)];
          }
          return `captures ${total} agents from ${slot.card}`;
        },
      },
    },
    prelude: { ships: threeShips },
  },
  'court-15': loyalGuild('weapons', { prelude: { ships: threeShips } }),
  'court-16': {
    prelude: {
      seize: {
        beforeAnyAction: true,
        discardSelf: true,
        run: (ctx) => (seize(ctx.state, ctx.player), 'seizes the initiative'),
      },
    },
  },
  'court-17': {
    prelude: {
      redraw: {
        discardSelf: true,
        run: (ctx) => {
          const s = ctx.state;
          const hand = s.players[ctx.player].hand;
          const cards = (ctx.args.cards as string[] | undefined) ?? [];
          for (const c of cards) {
            if (!hand.includes(c)) fail(`${c} is not in your hand`);
            hand.splice(hand.indexOf(c), 1);
          }
          // FAQ: the discarded cards are shuffled before going on the discard pile.
          toDiscard(s, shuffle(s, cards), ctx.player);
          // Draw from the bottom of the action discard: this card counts too.
          const drawn = s.discard.splice(0, cards.length + 1);
          hand.push(...drawn);
          return `discards ${cards.length} cards, draws ${drawn.length} from the bottom of the discard`;
        },
      },
    },
    triggers: {
      // When you declare: look at a Rival's hand (the UI shows it), may swap 1 card with them.
      onDeclare: (ctx) => {
        if (ctx.args.rival === undefined) return 'looks at no hand';
        const s = ctx.state;
        const other = rival(ctx, 'rival');
        if (ctx.args.give === undefined) return `looks at P${other}'s hand`;
        const give = argStr(ctx, 'give');
        const take = argStr(ctx, 'take');
        const mine = s.players[ctx.player].hand;
        const theirs = s.players[other].hand;
        if (!mine.includes(give)) fail(`${give} is not in your hand`);
        if (!theirs.includes(take)) fail(`${take} is not in P${other}'s hand`);
        mine.splice(mine.indexOf(give), 1, take);
        theirs.splice(theirs.indexOf(take), 1, give);
        return `looks at P${other}'s hand and swaps a card`;
      },
    },
  },
  'court-18': { noZeroOn: ['relics', 'psionics'] },
  'court-19': loyalGuild('psionic'),
  'court-20': {
    prelude: {
      steal: {
        discardSelf: true,
        run: (ctx) => {
          const from = rival(ctx);
          if (typeof ctx.args.card === 'string') {
            stealGuild(ctx.ix, ctx.state, ctx.player, from, ctx.args.card);
            return `steals ${ctx.args.card} from P${from}`;
          }
          const r = stealResource(ctx.ix, ctx.state, ctx.player, from, argNum(ctx, 'slot'));
          return `steals ${r} from P${from}`;
        },
      },
    },
  },
  'court-21': loyalGuild('relic'),
  'court-22': { guardsSteals: true },
  'court-23': {
    actions: {
      trade: {
        as: 'tax',
        run: (ctx) => {
          const s = ctx.state;
          const id = argStr(ctx, 'system');
          const sys = inPlaySystem(s, id);
          const other = rival(ctx, 'rival');
          if (!sys.buildings.some((b) => b.owner === other && b.type === 'city')) fail(`No city of P${other} at ${id}`);
          if (!controlsSystem(sys, ctx.player)) fail(`You do not control ${id}`);
          const type = planetType(ctx.ix, s, id) ?? fail('That planet has no resource type');
          const give = argStr(ctx, 'give') as Resource;
          const me = s.players[ctx.player];
          const them = s.players[other];
          const theirSlot = them.resources.indexOf(type);
          if (theirSlot < 0) fail(`P${other} has no ${type}`);
          const mySlot = me.resources.indexOf(give);
          if (mySlot < 0) fail(`You have no ${give}`);
          if (heldResources(them).includes(give)) fail(`P${other} already has ${give}`);
          // A swap, not a steal: protections against stealing do not apply.
          me.resources[mySlot] = null;
          them.resources[theirSlot] = null;
          if (!gainResource(ctx.ix.content, them, give)) returnToSupply(s, give);
          if (!gainResource(ctx.ix.content, me, type)) returnToSupply(s, type);
          return `trades ${give} for P${other}'s ${type}`;
        },
      },
    },
    prelude: {
      supplies: {
        discardSelf: true,
        run: (ctx) => {
          const got = (['material', 'fuel', 'weapons'] as Resource[]).filter((r) => gainFromSupply(ctx.ix.content, ctx.state, ctx.state.players[ctx.player], r));
          return `gains ${got.join(', ') || 'nothing'}`;
        },
      },
    },
  },
  'court-24': {
    prelude: {
      exchange: {
        oncePerTurn: true,
        run: (ctx) => {
          const pl = ctx.state.players[ctx.player];
          const slot = argNum(ctx, 'slot');
          const r = pl.resources[slot] ?? fail(`No resource on slot ${slot}`);
          pl.resources[slot] = null;
          returnToSupply(ctx.state, r);
          return gainFromSupply(ctx.ix.content, ctx.state, pl, 'relic') ? `discards ${r}, gains 1 relic` : `discards ${r}, no relic to gain`;
        },
      },
    },
  },
  'court-25': { declareOnFollow: true },

  // ---- Vox (when secured) ----
  'court-26': {
    whenSecured: {
      choice: true,
      run: (ctx) => {
        const cl = argStr(ctx, 'cluster');
        const systems = ctx.ix.content.map.systems.filter((x) => x.cluster === cl && ctx.state.map[x.id].inPlay);
        if (!systems.length) fail(`No in-play systems in cluster ${cl}`);
        const n = systems.reduce((t, x) => t + placeShips(ctx.state, ctx.player, x.id, 1), 0);
        return `places ${n} ships in cluster ${cl}`;
      },
    },
  },
  'court-27': {
    whenSecured: {
      choice: true,
      run: (ctx) => {
        if (ctx.args.ambition === undefined) return 'declares nothing';
        return declareFromEffect(ctx, argStr(ctx, 'ambition') as AmbitionId);
      },
    },
  },
  'court-28': {
    whenSecured: {
      choice: true,
      run: (ctx) => {
        if (ctx.args.type === undefined) return 'chooses no Outrage';
        const t = argStr(ctx, 'type') as Resource;
        for (let i = 0; i < ctx.state.playerCount; i++) provokeOutrage(ctx.ix, ctx.state, (ctx.player + i) % ctx.state.playerCount, t);
        return `every player Provokes ${t} Outrage`;
      },
    },
  },
  'court-29': {
    afterSecured: 'shuffleIntoDeck',
    whenSecured: {
      choice: true,
      run: (ctx) => {
        if (ctx.args.system === undefined) return 'returns no city';
        const id = argStr(ctx, 'system');
        const sys = inPlaySystem(ctx.state, id);
        if (!controlsSystem(sys, ctx.player)) fail(`You do not control ${id}`);
        const owner = returnCity(ctx.ix, ctx.state, id, argNum(ctx, 'index'));
        let text = `returns a city of P${owner} at ${id}`;
        if (ctx.args.seize) {
          seize(ctx.state, ctx.player);
          text += ', seizes the initiative';
        }
        return text;
      },
    },
  },
  'court-30': {
    whenSecured: {
      choice: true,
      run: (ctx) => {
        const s = ctx.state;
        let text = 'steals nothing';
        if (ctx.args.card !== undefined) {
          const from = rival(ctx);
          stealGuild(ctx.ix, s, ctx.player, from, argStr(ctx, 'card'));
          text = `steals ${ctx.args.card} from P${from}`;
        }
        const guilds = s.courtDiscard.filter((id) => ctx.ix.courtCards.get(id)?.kind === 'faction');
        s.courtDiscard = s.courtDiscard.filter((id) => !guilds.includes(id));
        s.courtDeck = shuffleInto(s, s.courtDeck, guilds);
        return `${text}; ${guilds.length} Guild cards shuffled back into the Court deck`;
      },
    },
  },
  'court-31': {
    whenSecured: {
      run: (ctx) => {
        const c = ctx.state.discard.shift();
        if (!c) return 'the action discard is empty';
        ctx.state.players[ctx.player].hand.push(c);
        return 'draws a card from the bottom of the action discard';
      },
    },
  },

  // ---- Lore ----
  'lore-01': {
    actions: {
      summon: {
        as: 'build',
        oncePerTurn: true,
        run: (ctx) => {
          const id = argStr(ctx, 'system');
          const sys = inPlaySystem(ctx.state, id);
          if (!sys.buildings.some((b) => b.type === 'city')) fail(`No city at ${id}`);
          if (!controlsSystem(sys, ctx.player)) fail(`You do not control ${id}`);
          if (!placeShips(ctx.state, ctx.player, id, 1)) fail('No ships in supply');
          return `builds a ship at the city in ${id}`;
        },
      },
    },
  },
  'lore-02': {
    actions: {
      rifles: {
        as: 'battle',
        run: (ctx) => {
          const s = ctx.state;
          const from = argStr(ctx, 'system');
          const at = argStr(ctx, 'at');
          inPlaySystem(s, from);
          const sys = inPlaySystem(s, at);
          if (!adjacent(ctx.ix, s, from, at)) fail(`${from} and ${at} are not adjacent`);
          const target = rival(ctx, 'target');
          if (!(stackOf(sys, target).fresh + stackOf(sys, target).damaged) && !sys.buildings.some((b) => b.owner === target)) fail(`P${target} has nothing at ${at}`);
          const fresh = s.map[from].ships[ctx.player]?.fresh ?? 0;
          if (!fresh) fail(`No fresh ships of yours at ${from}`);
          const n = Math.min(fresh, ctx.ix.content.maxDicePerType ?? fresh);
          const roll = rollDice(ctx.ix.content, s, { skirmish: n });
          // Like a battle: only hits are dealt, ships before buildings; no battle modifiers or triggers.
          const totals = { hit: roll.totals.hit, selfHit: 0, buildingHit: 0, key: 0, intercept: 0 };
          return {
            text: `fires ${n} skirmish dice from ${from} at P${target} in ${at}`,
            roll,
            pendingBattle: { attacker: ctx.player, target, system: at, totals, interceptHits: 0, like: true },
          };
        },
      },
    },
  },
  'lore-03': { extraStep: true },
  'lore-04': { interceptOnAssault: true },
  'lore-05': { buildShipsFresh: true, freshStarportStopsRaid: true },
  'lore-06': { ignoreInterceptIfAllFresh: true },
  'lore-07': { repairAfterAttack: 1 },
  'lore-12': { hitAttackerIfFresh: true },
  'lore-14': { reroll: { die: 'assault', limit: 'freshAttackers' } },
  'lore-15': {
    triggers: {
      beforeDice: (ctx) => {
        const s = ctx.state;
        const setup = s.battleSetup ?? fail('No battle is waiting');
        const moves = (ctx.args.moves as { from: string; ships: number }[] | undefined) ?? [];
        let n = 0;
        // Moving into a gate a Rival guards (Gate Ports, lore-08) costs an agent, as any move does.
        const guards = moves.length ? gateGuardsAt(ctx.ix, s, [setup.system], ctx.player) : [];
        for (const m of moves) {
          if (!adjacent(ctx.ix, s, m.from, setup.system)) fail(`${m.from} is not adjacent to ${setup.system}`);
          const src = stackOf(inPlaySystem(s, m.from), ctx.player);
          if (m.ships < 1 || src.fresh < m.ships) fail(`Not enough fresh ships at ${m.from}`);
          // A move cap (e.g. a leader's) applies to each system the ships come from.
          const cap = Math.min(...ownedEffects(ctx.ix, s, ctx.player).map((f) => f.effect.maxShipsPerMove ?? Infinity));
          if (m.ships > cap) fail(`You cannot move more than ${cap} ships at a time`);
          src.fresh -= m.ships;
          stackOf(s.map[setup.system], ctx.player).fresh += m.ships;
          n += m.ships;
        }
        return n ? `moves ${n} fresh ships into ${setup.system}${captureAtGates(s, ctx.player, guards)}` : 'moves no ships';
      },
    },
    triggerWhen: {
      beforeDice: ({ ix, state, player, battle }) =>
        !!battle && Object.values(state.map).some((x) => x.inPlay && x.id !== battle.system && (x.ships[player]?.fresh ?? 0) > 0 && adjacent(ix, state, x.id, battle.system)),
    },
  },
  'lore-08': { gateStarports: true, captureOnGateEntry: true },
  'lore-09': { citiesOutsideSlots: true },
  'lore-11': { gateCities: true },
  'lore-17': { raidDiceWithoutBuildings: 1 },
  'lore-20': { actAsLoyalWhile: 'psionics' },
  'lore-10': {
    actions: {
      nurture: {
        as: 'build',
        run: (ctx) => HANDLERS.tax(ctx.ix, ctx.state, ctx.player, { kind: 'tax', system: argStr(ctx, 'system'), city: ctx.args.city as number | undefined }).text,
      },
      prune: {
        as: 'repair',
        run: (ctx) => {
          const id = argStr(ctx, 'system');
          const sys = inPlaySystem(ctx.state, id);
          const b = sys.buildings[argNum(ctx, 'index')];
          if (!b || b.owner !== ctx.player) fail('Choose one of your buildings');
          if (b.outside) fail('Only a building in a slot can be replaced');
          // On a gate, each building type needs its card and stays at most 1 per gate (lore-08, lore-11).
          if (ctx.ix.content.map.systems.find((x) => x.id === id)?.kind === 'gate') {
            const to = b.type === 'starport' ? 'city' : 'starport';
            const fx = ownedEffects(ctx.ix, ctx.state, ctx.player).map((f) => f.effect);
            if (!fx.some((e) => (to === 'city' ? e.gateCities : e.gateStarports))) fail(`You cannot have a ${to} on a gate`);
            if (sys.buildings.some((x) => x.type === to)) fail(`At most 1 ${to} per gate`);
          }
          const sup = ctx.state.players[ctx.player].supply;
          if (b.type === 'starport') {
            if (sup.cities < 1) fail('No city in supply');
            sup.cities -= 1;
            sup.starports += 1;
            b.type = 'city';
          } else {
            if (sup.starports < 1) fail('No starport in supply');
            const i = sys.buildings.indexOf(b);
            returnCity(ctx.ix, ctx.state, id, i);
            sup.starports -= 1;
            sys.buildings.splice(i, 0, { owner: ctx.player, type: 'starport', damaged: b.damaged });
            return `replaces its city at ${id} with a starport`;
          }
          return `replaces its starport at ${id} with a city`;
        },
      },
    },
  },
  'lore-16': {
    actions: {
      guide: {
        as: 'move',
        run: (ctx) => {
          const s = ctx.state;
          const from = argStr(ctx, 'from');
          const to = argStr(ctx, 'to');
          const a = inPlaySystem(s, from);
          const b = inPlaySystem(s, to);
          const linked = ctx.ix.content.map.links.some(([x, y]) => (x === from && y === to) || (x === to && y === from)) || s.openLinks.some(([x, y]) => (x === from && y === to) || (x === to && y === from));
          if (!linked) fail(`${from} and ${to} are not adjacent`);
          const port = (sys: typeof a) => sys.buildings.some((x) => x.owner === ctx.player && x.type === 'starport' && !x.damaged);
          if (!port(a) && !port(b)) fail('One of the two systems needs your fresh starport');
          const ships = (ctx.args.ships as Record<string, { fresh?: number; damaged?: number }>) ?? fail("Missing choice 'ships'");
          let moved = 0;
          // A Rival guarding the gate they enter captures an agent (Gate Ports, lore-08): worked out before moving.
          const guards = Object.fromEntries(Object.keys(ships).map((k) => [k, gateGuardsAt(ctx.ix, s, [to], Number(k))]));
          let caught = '';
          for (const [k, v] of Object.entries(ships)) {
            const src = stackOf(a, Number(k));
            const f = v.fresh ?? 0, d = v.damaged ?? 0;
            if (f < 0 || d < 0 || src.fresh < f || src.damaged < d) fail(`Not enough ships of P${k} at ${from}`);
            src.fresh -= f;
            src.damaged -= d;
            const dst = stackOf(b, Number(k));
            dst.fresh += f;
            dst.damaged += d;
            moved += f + d;
            if (f + d > 0) caught += captureAtGates(s, Number(k), guards[k]);
          }
          if (!moved) fail('Move at least one ship');
          return `guides ${moved} ships ${from}→${to}${caught}`;
        },
      },
    },
  },
  'lore-18': {
    actions: {
      martyr: {
        as: 'move',
        run: (ctx) => {
          const s = ctx.state;
          const id = argStr(ctx, 'system');
          const sys = inPlaySystem(s, id);
          const mine = stackOf(sys, ctx.player);
          if (mine.fresh < 1) fail(`No fresh ship of yours at ${id}`);
          if (ctx.args.target === undefined) {
            // FAQ: you may destroy your own ship without destroying another.
            mine.fresh -= 1;
            s.players[ctx.player].supply.ships += 1;
            return `destroys one of its own ships at ${id}`;
          }
          const target = rival(ctx, 'target');
          const theirs = stackOf(sys, target);
          const dmg = ctx.args.damaged === true;
          if ((dmg ? theirs.damaged : theirs.fresh) < 1) fail(`No ${dmg ? 'damaged' : 'fresh'} ship of P${target} at ${id}`);
          mine.fresh -= 1;
          s.players[ctx.player].supply.ships += 1;
          if (dmg) theirs.damaged -= 1;
          else theirs.fresh -= 1;
          // The destroyed Rival ship goes to the Trophies box, back to its owner only when trophies return.
          s.players[ctx.player].trophies.push({ owner: target, piece: 'ship' });
          return `sacrifices a ship to destroy a ship of P${target} at ${id}`;
        },
      },
    },
  },
  'lore-19': { reroll: { limit: 'any', whileDeclared: 'psionics' }, prelude: { clear: clearsOutrage('psionic') } },
  'lore-21': { guardResourcesWhile: 'relics', prelude: { clear: clearsOutrage('relic') } },
  'lore-22': { guardGuildWhile: 'relics' },
  'lore-23': { retaxWhile: 'trophies', prelude: { clear: clearsOutrage('weapons') } },
  'lore-24': {
    prelude: {
      trophies: {
        whileDeclared: 'trophies',
        run: (ctx) => {
          const slots = argList<number>(ctx, 'courtSlots');
          if (!slots.length) fail('Choose at least one Court card');
          if (slots.length > ctx.state.players[ctx.player].trophies.length) fail('Not enough Trophies');
          for (const slot of slots) {
            returnTrophy(ctx.ix, ctx.state, ctx.player, 0);
            HANDLERS.influence(ctx.ix, ctx.state, ctx.player, { kind: 'influence', courtSlot: slot });
          }
          return `spends ${slots.length} Trophies to influence`;
        },
      },
    },
  },
  'lore-25': {
    prelude: {
      captives: {
        whileDeclared: 'captives',
        run: (ctx) => {
          const slots = argList<number>(ctx, 'courtSlots');
          if (!slots.length) fail('Choose at least one Court card');
          if (slots.length > ctx.state.players[ctx.player].captives.length) fail('Not enough Captives');
          const got: string[] = [];
          for (const slot of slots) {
            returnCaptive(ctx.state, ctx.player, 0);
            got.push(HANDLERS.secure(ctx.ix, ctx.state, ctx.player, { kind: 'secure', courtSlot: slot }).text);
          }
          return got.join('; ');
        },
      },
      clear: clearsOutrage('weapons'),
    },
  },
  'lore-26': {
    actions: {
      annex: {
        as: 'build',
        whileDeclared: 'captives',
        run: (ctx) => {
          const s = ctx.state;
          const id = argStr(ctx, 'system');
          const sys = inPlaySystem(s, id);
          if (!controlsSystem(sys, ctx.player)) fail(`You do not control ${id}`);
          const i = argNum(ctx, 'index');
          const b = sys.buildings[i];
          if (!b || b.owner === ctx.player) fail('Choose a building that is not yours');
          const sup = s.players[ctx.player].supply;
          const key = b.type === 'city' ? 'cities' : 'starports';
          // Replacement is all or nothing: you need the piece to place.
          if (sup[key] < 1) fail(`No ${key} in supply`);
          const old = b.owner;
          if (b.type === 'city') returnCity(ctx.ix, s, id, i);
          else {
            sys.buildings.splice(i, 1);
            returnPiece(ctx.ix, s, old, 'starport');
          }
          sup[key] -= 1;
          // The new piece takes the old one's place: a city outside the slots stays outside them (lore-09).
          sys.buildings.splice(i, 0, { owner: ctx.player, type: b.type, damaged: false, ...(b.outside ? { outside: true } : {}) });
          return `replaces P${old}'s ${b.type} at ${id} with its own`;
        },
      },
    },
  },
  'lore-27': {
    prelude: {
      declare: {
        beforeAnyAction: true,
        whileDeclared: 'wealth',
        run: (ctx) => {
          const s = ctx.state;
          const a = argStr(ctx, 'ambition') as AmbitionId;
          if (declared(s, a)) fail(`${a} is already declared`);
          const pl = s.players[ctx.player];
          pl.resources.forEach((r, i) => {
            if (r === 'material' || r === 'fuel') {
              pl.resources[i] = null;
              returnToSupply(s, r);
            }
          });
          return `discards Material and Fuel; ${declareFromEffect(ctx, a)}`;
        },
      },
    },
  },
  'lore-28': {
    prelude: {
      exchange: {
        whileDeclared: 'wealth',
        run: (ctx) => {
          const s = ctx.state;
          const pl = s.players[ctx.player];
          const slots = argList<number>(ctx, 'slots');
          const gain = argList<Resource>(ctx, 'gain');
          if (!slots.length || slots.length !== gain.length) fail('Choose one resource to gain for each one discarded');
          for (const i of slots) {
            const r = pl.resources[i];
            if (r !== 'material' && r !== 'fuel') fail(`Slot ${i} holds no Material or Fuel`);
            pl.resources[i] = null;
            returnToSupply(s, r);
          }
          const got = gain.filter((r) => gainFromSupply(ctx.ix.content, s, pl, r));
          return `exchanges ${slots.length} Material/Fuel for ${got.join(', ') || 'nothing'}`;
        },
      },
      clear: clearsOutrage('material', 'fuel'),
    },
  },

  // ---- Leaders (battle abilities; other abilities follow in later batches) ----
  'leader-01': {
    ...justScoring('captives'),
    noRansackWhenBattled: true,
    triggers: {
      afterDefending: (ctx) => {
        if (ctx.args.courtSlot === undefined) return 'does not influence';
        return HANDLERS.influence(ctx.ix, ctx.state, ctx.player, { kind: 'influence', courtSlot: argNum(ctx, 'courtSlot') }).text;
      },
    },
    triggerWhen: { afterDefending: ({ battle }) => !!battle?.attackerTookTrophies },
  },
  'leader-02': { taxBonusOnCopyPivot: 'psionic', setup: { outrage: ['material', 'fuel'] } },
  'leader-03': { taxBonusOnCopyPivot: 'fuel', afterScoringDiscard: { resource: 'fuel', ifScored: 'wealth' } },
  'leader-04': {
    taxNeedsControl: true, // errata: no city without control
    triggers: {
      // When you declare: may gain any resource.
      onDeclare: (ctx) => {
        if (ctx.args.resource === undefined) return 'gains nothing';
        const r = argStr(ctx, 'resource') as Resource;
        return gainFromSupply(ctx.ix.content, ctx.state, ctx.state.players[ctx.player], r) ? `gains 1 ${r}` : `gains nothing (no ${r} or no room)`;
      },
    },
  },
  'leader-06': { ...justScoring('psionics'), moveWithBattleOnCopyPivot: true },
  'leader-07': { declareCostGuildToWeakest: true, influenceWithSecureOnCopyPivot: true },
  'leader-08': {
    noSecureGuildWithOneAgent: true,
    triggers: {
      // When you declare: influence any number of Court cards, at most once each.
      onDeclare: (ctx) => {
        const slots = (ctx.args.courtSlots as number[] | undefined) ?? [];
        if (new Set(slots).size !== slots.length) fail('At most one agent on each Court card');
        for (const slot of slots) HANDLERS.influence(ctx.ix, ctx.state, ctx.player, { kind: 'influence', courtSlot: slot });
        return `influences ${slots.length} Court cards`;
      },
    },
  },
  'leader-09': {
    ...justScoring('wealth'),
    setup: { extraLore: { draw: 5, keep: 2 } },
    triggers: {
      // After setup: keep some of the lore cards drawn, scrap the rest.
      setupLore: (ctx) => {
        const offer = (ctx.data?.cards as string[]) ?? [];
        const keep = Math.min((ctx.data?.keep as number) ?? 2, offer.length);
        const chosen = argList<string>(ctx, 'keep');
        if (chosen.length !== keep || new Set(chosen).size !== keep || chosen.some((c) => !offer.includes(c))) fail(`Keep exactly ${keep} of the cards drawn`);
        ctx.state.players[ctx.player].lore.push(...chosen);
        (ctx.state.loreDiscard ??= []).push(...offer.filter((c) => !chosen.includes(c)));
        return `keeps ${chosen.join(', ')}`;
      },
    },
  },
  'leader-05': { extraDice: { count: 2, mandatory: true }, maxShipsPerMove: 2 },
  'leader-10': { hitToRepeat: true, setup: { scrapShips: 2, scrapAgents: 3 } },
  'leader-12': {
    scoringFirstOnly: true,
    influenceTwiceOnCopyPivot: true,
    autoTriggers: {
      // Declaring an undeclared ambition: draw and secure the top Court card (its prelude waits for a later turn).
      onDeclare: (ctx) => {
        if (!ctx.args.wasUndeclared) return 'the ambition was already declared';
        const s = ctx.state;
        const card = s.courtDeck.shift();
        if (!card) return 'the Court deck is empty';
        const turn = currentBudget(s);
        if (turn) (turn.securedInPrelude ??= []).push(card);
        return `secures ${card} from the Court deck${receiveCourtCard(ctx.ix, s, ctx.player, card)}`;
      },
    },
  },
  'leader-13': { taxWithShips: true, cannotTaxLoyal: true, setup: { scrapCities: 2 } },
  'leader-14': { reshapePlanets: true, catapultFromGatesOnly: true },
  'leader-11': { reroll: { die: 'raid', limit: 'resourceTypes' }, assaultCappedBySkirmish: true },
  'leader-15': { interceptByWeapons: true, taxBonusOnCopyPivot: 'weapons' },
  'leader-16': { repairPerStarport: true, setup: { outrage: ['material'] } },
};

function shuffleInto(s: GameState, deck: string[], cards: string[]): string[] {
  return shuffle(s, [...deck, ...cards]);
}
