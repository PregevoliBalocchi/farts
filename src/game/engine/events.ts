// The campaign event phase (design/campaign-plan.md milestone M2): what
// happens at the end of a round in which the Imperial Council was secured or
// an Event card was played. Rules: docs/rules/Arcs_Campaign_Rulebook_for_web.txt
// p. 13 (Resolving the Event), 14 (Imperial Council), 18 (Crises), 20-21
// (Edicts, Imperial Trust). The Summit comes with M3 and Fate Crises with M4:
// both are skipped here, with a log line.
//
// The phase is a queue of steps (`campaign.eventSteps`). `runEvent` resolves
// them in order; a step that needs a player's choice queues a Decision
// (effect `event:*`) and stops; `decideEvent` applies the answer and the
// queue goes on once no event Decision is pending. An empty `args` always
// takes the default answer.

import { markerValues } from './ambitions';
import { cityBonusPower, gainResource, heldResources, openSlots, takeResourceAt } from './board';
import { edictsInOrder, empireControls, IMPERIAL_COUNCIL } from './campaign';
import { campaignContent } from './campaign-setup';
import { anyRollRerolls } from './actions';
import { choose, EVENT_ASKS, subMultisets } from './decisions';
import type { DecisionAnswer, DecisionPart } from './decisions';
import { RuleError } from './errors';
import { isPlayer, isProtected, returnPiece } from './ops';
import { nextInt } from './rng';
import type { ContentIndex } from './setup';
import type { CampaignState, Decision, EventStep, GameState, PlayerId, Resource, ShipStack } from './types';

type Policy = 'peace' | 'escalation' | 'war';

/** The Imperial Demand of each Policy (p. 20). */
const DEMAND: Record<Policy, Resource[] | 'trophies'> = {
  peace: ['relic', 'psionic'],
  escalation: ['material', 'fuel', 'weapons'],
  war: 'trophies',
};

/** Turns `campaign.pendingEvent` into the event phase's steps (p. 13-14). */
export function startEvent(s: GameState): void {
  const c = s.campaign;
  const ev = c?.pendingEvent;
  if (!c || !ev) return;
  delete c.pendingEvent;
  delete c.rolled;
  c.eventSteps =
    ev.kind === 'council'
      ? [
          { kind: 'summit', player: ev.player },
          { kind: 'councilTitle', player: ev.player },
          { kind: 'councilChoice', player: ev.player },
        ]
      : [{ kind: 'summit', player: ev.player }, { kind: 'roll' }, { kind: 'eventDie' }];
  log(s, ev.kind === 'council' ? `P${ev.player} resolves the Imperial Council` : `P${ev.player} resolves the Event`);
}

/**
 * Resolves the event phase steps until one waits for a choice (a Decision
 * is queued) or none is left (then `finish` continues the game).
 */
export function runEvent(ix: ContentIndex, s: GameState, finish: () => void): void {
  const c = s.campaign;
  if (!c?.eventSteps) return finish();
  while (true) {
    if (s.pendingDecisions?.some(isEventDecision)) return;
    const step = c.eventSteps.shift();
    if (!step) break;
    runStep(ix, s, c, step);
  }
  delete c.eventSteps;
  delete c.rolled;
  finish();
}

/** True while the event phase is running. */
export function inEvent(s: GameState): boolean {
  return !!s.campaign?.eventSteps;
}

/** True for a Decision of the event phase. */
export function isEventDecision(d: Decision): boolean {
  return d.effect.startsWith('event:');
}

function runStep(ix: ContentIndex, s: GameState, c: CampaignState, step: EventStep): void {
  const cc = campaignContent(ix);
  switch (step.kind) {
    case 'summit':
      // p. 13-14: "may call the Summit" (page 16). The Summit comes with milestone M3.
      log(s, `P${step.player} may call the Summit (not available yet)`);
      return;

    case 'councilTitle': {
      const p = step.player;
      if (c.titles[p] === 'regent') {
        // p. 14 step 2: "take the First Regent tile, keeping all resources on the Imperial Trust".
        c.firstRegent = p;
        log(s, `P${p} becomes the First Regent`);
        return;
      }
      // Step 3: "steal resources from the Imperial Trust ... up to your number of empty resource slots".
      const room = emptySlots(ix, s, p);
      if (!c.trust.length || room < 1) return;
      if (c.trust.length <= room || new Set(c.trust).size === 1) stealTrust(ix, s, p, c.trust.slice(0, room));
      else ask(s, { player: p, card: IMPERIAL_COUNCIL, effect: 'event:steal', data: { max: room } });
      return;
    }

    case 'councilChoice':
      // Step 4: "You must choose to resolve either the Crises or the Edicts".
      ask(s, { player: step.player, card: IMPERIAL_COUNCIL, effect: 'event:choice' });
      return;

    case 'roll': {
      const face = cc.eventDice.event[nextInt(s, cc.eventDice.event.length)];
      const number = cc.eventDice.number[nextInt(s, cc.eventDice.number.length)];
      c.rolled = { kind: face.kind, symbol: face.symbol, number };
      log(s, `Event dice: ${face.kind} ${face.symbol}, number ${number}`, { rolled: c.rolled });
      // p. 13 and 18: the player with initiative rolls. A card of theirs that rerolls any dice (lore-19, "even
      // outside battle") may reroll them once before they resolve: one question per such card.
      for (const card of anyRollRerolls(ix, s, s.initiative)) ask(s, { player: s.initiative, card, effect: 'event:reroll' });
      return;
    }

    case 'eventDie':
      // p. 13: the Crisis face resolves the Crises, the Edict face the Edicts.
      c.eventSteps!.unshift({ kind: c.rolled!.kind === 'crisis' ? 'crises' : 'edicts' });
      return;

    case 'crises': {
      // p. 18: Blight Crises, then Fate Crises, then Court Crises, rolling first "unless you just rolled them".
      // The Vox cards in the Court now, left to right, an attached card first; a card refilled meanwhile does not resolve.
      const court: EventStep[] = [];
      for (const slot of s.court) {
        for (const card of [slot.attached, slot.card]) {
          if (card && ix.courtCards.get(card)?.crisis && CRISES[card]) court.push({ kind: 'courtCrisis', card });
        }
      }
      log(s, 'Crises: Blight, then Fate (none yet), then Court');
      c.eventSteps!.unshift({ kind: 'blight' }, ...(c.rolled ? [] : [{ kind: 'roll' } as EventStep]), ...court);
      return;
    }

    case 'blight':
      blightCrises(ix, s);
      return;

    case 'courtCrisis':
      if (courtIndex(s, step.card) >= 0) CRISES[step.card](ix, s, step.card); // gone already: an earlier Crisis removed it
      return;

    case 'edicts': {
      const order = new Map<string, number>(cc.edicts.map((e) => [e.id, e.order]));
      const cards = edictsInOrder(s, (id) => order.get(id) ?? Number.MAX_SAFE_INTEGER);
      log(s, `Edicts: ${cards.join(', ') || 'none'}`);
      c.eventSteps!.unshift(...cards.map((card): EventStep => ({ kind: 'edict', card })));
      return;
    }

    case 'edict':
      runEdict(ix, s, c, step.card);
      return;
  }
}

// -------------------------------------------------------------- decisions ---

/** Applies a player's answer to an event phase Decision and returns the log text. */
export function decideEvent(ix: ContentIndex, s: GameState, p: PlayerId, d: Decision, args: Record<string, unknown>): string {
  const c = s.campaign ?? fail('Not a campaign');
  const data = d.data ?? {};
  switch (d.effect) {
    case 'event:steal': {
      const max = data.max as number;
      const want = (args.resources as Resource[] | undefined) ?? c.trust.slice(0, max);
      if (want.length > max) fail(`Steal at most ${max} resources`);
      const pool = [...c.trust];
      for (const r of want) {
        const i = pool.indexOf(r);
        if (i < 0) fail(`No ${r} on the Imperial Trust`);
        pool.splice(i, 1);
      }
      return stealTrust(ix, s, p, want);
    }

    case 'event:reroll': {
      // lore-19: reroll the event die, the number die or both, once; the empty answer keeps the roll.
      const which = args.dice as string | undefined;
      if (which === undefined) return 'keeps the event dice';
      if (which !== 'event' && which !== 'number' && which !== 'both') fail('Reroll the event die, the number die or both');
      const cc = campaignContent(ix);
      const rolled = c.rolled ?? fail('No event dice to reroll');
      if (which !== 'number') {
        const face = cc.eventDice.event[nextInt(s, cc.eventDice.event.length)];
        rolled.kind = face.kind;
        rolled.symbol = face.symbol;
      }
      if (which !== 'event') rolled.number = cc.eventDice.number[nextInt(s, cc.eventDice.number.length)];
      const now = `${rolled.kind} ${rolled.symbol}, number ${rolled.number}`;
      if (which === 'event') return `rerolls the event die with ${d.card}: ${now}`;
      if (which === 'number') return `rerolls the number die with ${d.card}: ${now}`;
      return `rerolls the event and number dice with ${d.card}: ${now}`;
    }

    case 'event:choice': {
      const what = (args.resolve as string | undefined) ?? 'crises';
      if (what !== 'crises' && what !== 'edicts') fail('Choose the Crises or the Edicts');
      c.eventSteps?.unshift({ kind: what });
      return `resolves the ${what === 'crises' ? 'Crises' : 'Edicts'}`;
    }

    case 'event:govern': {
      const stack = c.booklet.edicts[data.slot as number];
      const change = args.change as string | undefined;
      if (change !== undefined) {
        // p. 20: "they choose a new Govern the Imperial Reach edict card to place on top of the other two cards".
        if (change === stack[0] || !stack.includes(change)) fail(`${change} is not another Govern the Imperial Reach card`);
        stack.splice(stack.indexOf(change), 1);
        stack.unshift(change);
        return `changes the Imperial Policy to ${policyOf(ix, change)}`;
      }
      const policy = policyOf(ix, stack[0]);
      if (!demandHasChoice(s, c, p, policy)) return `enforces the Policy of ${policy}: ${collectDemand(ix, s, c, p, policy, {})}`;
      ask(s, { player: p, card: stack[0], effect: 'event:demand', data: { policy } });
      return `enforces the Policy of ${policy}`;
    }

    case 'event:demand':
      return collectDemand(ix, s, c, p, data.policy as Policy, args);

    case 'event:escalation': {
      const options = data.options as string[];
      const sys = (args.system as string | undefined) ?? options[0];
      if (!options.includes(sys)) fail(`The Imperial ships cannot be placed at ${sys}`);
      return requisition(s, sys);
    }

    case 'event:weapons': {
      const all = data.regents as PlayerId[];
      const count = data.count as number;
      const to = (args.players as PlayerId[] | undefined) ?? all.slice(0, count);
      if (to.length !== count || new Set(to).size !== count || to.some((x) => !all.includes(x))) fail(`Choose ${count} different Regents`);
      return distributeArms(ix, s, to);
    }

    case 'event:fiasco': {
      const n = data.discard as number;
      const pl = s.players[p];
      const free = pl.court.filter((x) => isGuild(ix, x) && !isProtected(ix, x));
      const cards = (args.cards as string[] | undefined) ?? free.slice(0, n);
      if (cards.length !== n || new Set(cards).size !== n || cards.some((x) => !free.includes(x))) fail(`Discard ${n} of your unprotected Guild cards`);
      for (const x of cards) pl.court.splice(pl.court.indexOf(x), 1);
      s.courtDiscard.push(...cards);
      return `discards ${cards.join(', ')}`;
    }

    case 'event:freedom': {
      const cities = data.cities as string[];
      const sys = (args.system as string | undefined) ?? cities[0];
      if (!cities.includes(sys)) fail(`P${p} has no city at ${sys}`);
      return freeCity(ix, s, p, sys);
    }
  }
  return fail(`Unknown event decision ${d.effect}`);
}

// ----------------------------------------------------------------- crises ---

/**
 * p. 18: "each fresh Blight there deals 3 hits, and each damaged Blight there
 * deals 1 hit. The Blight deals hits to Imperial ships first. If no Imperial
 * ships remain, it deals each remaining hit to the Loyal ships of every
 * player in its system. In both cases, fresh ships take hits before damaged
 * ships." Destroyed ships go back to their supply (the Blight takes no
 * trophies). Flagships (p. 24) and buildings (Intermission, p. 28) are not
 * hit here.
 */
export function blightCrises(ix: ContentIndex, s: GameState): void {
  const sup = s.campaign!.supply;
  for (const d of ix.content.map.systems) {
    const sys = s.map[d.id];
    if (!sys?.blight) continue;
    let hits = sys.blight.fresh * 3 + sys.blight.damaged;
    if (hits < 1) continue;
    const before = JSON.stringify([sys.imperial, sys.ships]);
    while (hits > 0 && sys.imperial && sys.imperial.fresh + sys.imperial.damaged > 0) {
      if (hitOne(sys.imperial)) sup.imperialShips += 1;
      hits -= 1;
    }
    for (; hits > 0; hits--) {
      let any = false;
      for (const [owner, st] of Object.entries(sys.ships) as [string, ShipStack][]) {
        if (st.fresh + st.damaged < 1) continue;
        any = true;
        if (hitOne(st)) s.players[Number(owner)].supply.ships += 1;
      }
      if (!any) break;
    }
    if (JSON.stringify([sys.imperial, sys.ships]) !== before) log(s, `Blight Crisis at ${d.id}`);
  }
}

/** One hit, fresh ships first: true when it destroyed a ship. */
function hitOne(st: ShipStack): boolean {
  if (st.fresh > 0) {
    st.fresh -= 1;
    st.damaged += 1;
    return false;
  }
  st.damaged -= 1;
  return true;
}

type Crisis = (ix: ContentIndex, s: GameState, card: string) => void;

/** The Crisis texts of the campaign Court's Vox cards, by card id. */
const CRISES: Record<string, Crisis> = {
  // Populist Demands: "Return the declared ambition marker of highest Power to Available Ambitions."
  'court-cc-11': (ix, s) => {
    let best: { a: string; m: string; v: number } | null = null;
    for (const [a, ms] of Object.entries(s.ambitions.declared)) {
      for (const m of ms) {
        const v = markerValues(ix.content, m, s.chapter).first;
        if (!best || v > best.v) best = { a, m, v };
      }
    }
    if (!best) return;
    const list = s.ambitions.declared[best.a as keyof typeof s.ambitions.declared];
    list.splice(list.indexOf(best.m), 1);
    s.ambitions.available.push(best.m);
    s.ambitions.available.sort((x, y) => markerValues(ix.content, y, s.chapter).first - markerValues(ix.content, x, s.chapter).first);
    log(s, `Populist Demands: the ${best.m} marker returns from ${best.a} to Available Ambitions`);
  },
  // Council Intrigue: "Flip the Imperial Council to In Session. Move agents from here to it. Bury this card."
  'court-cc-12': (_ix, s, card) => {
    s.campaign!.council = 'in-session';
    const from = s.court[courtIndex(s, card)];
    const council = s.court.find((x) => x.card === IMPERIAL_COUNCIL);
    if (council && from.card === card) {
      for (const [p, n] of Object.entries(from.agents)) council.agents[Number(p)] = (council.agents[Number(p)] ?? 0) + (n ?? 0);
      from.agents = {};
    }
    bury(s, card);
    log(s, 'Council Intrigue: the Imperial Council is In Session; Council Intrigue is buried');
  },
  // Diplomatic Fiasco: "In turn order, each player with more Guild cards than agents in their supply must discard
  // Guild cards until their Guild cards equal their agents. Bury this card. (Count protected Guild cards but don't discard them.)"
  'court-cc-13': (ix, s, card) => {
    for (let k = 0; k < s.playerCount; k++) {
      const p = (s.initiative + k) % s.playerCount;
      const pl = s.players[p];
      const guilds = pl.court.filter((x) => isGuild(ix, x));
      const free = guilds.filter((x) => !isProtected(ix, x));
      const n = Math.min(guilds.length - pl.supply.agents, free.length);
      if (n < 1) continue;
      if (n < free.length) {
        ask(s, { player: p, card, effect: 'event:fiasco', data: { discard: n } });
        continue;
      }
      for (const x of free) pl.court.splice(pl.court.indexOf(x), 1);
      s.courtDiscard.push(...free);
      log(s, `Diplomatic Fiasco: P${p} discards ${free.join(', ')}`);
    }
    bury(s, card);
    log(s, 'Diplomatic Fiasco is buried');
  },
  // Song of Freedom: "The player with the most Power must replace a Loyal city with a Free city."
  'court-cc-14': (ix, s, card) => {
    // Tied for the most Power: the first of them in turn order (the campaign breaks Power ties in turn order, p. 8).
    let top = s.initiative;
    for (let k = 1; k < s.playerCount; k++) {
      const p = (s.initiative + k) % s.playerCount;
      if (s.players[p].power > s.players[top].power) top = p;
    }
    const cities = ix.content.map.systems.filter((d) => s.map[d.id]?.buildings.some((b) => b.owner === top && b.type === 'city')).map((d) => d.id);
    if (!cities.length) return;
    if (cities.length === 1) log(s, `Song of Freedom: P${top} ${freeCity(ix, s, top, cities[0])}`);
    else ask(s, { player: top, card, effect: 'event:freedom', data: { cities } });
  },
  // Blight Looms: "Repair all Blight in the rolled cluster. Place 1 damaged Blight at each planet of the rolled
  // symbol with no Blight. Bury this card."
  'court-cc-15': (ix, s, card) => {
    const c = s.campaign!;
    const r = c.rolled!;
    for (const d of ix.content.map.systems) {
      const b = s.map[d.id]?.blight;
      if (d.cluster !== `c${r.number}` || !b) continue;
      b.fresh += b.damaged;
      b.damaged = 0;
    }
    for (const d of ix.content.map.systems) {
      const sys = s.map[d.id];
      if (!sys || d.kind !== 'planet' || d.idSymbol !== r.symbol || (sys.blight && sys.blight.fresh + sys.blight.damaged > 0) || c.supply.blight < 1) continue;
      sys.blight = { fresh: 0, damaged: 1 };
      c.supply.blight -= 1;
    }
    bury(s, card);
    log(s, `Blight Looms: Blight repaired in cluster c${r.number} and placed on the ${r.symbol} planets; Blight Looms is buried`);
  },
};

// ----------------------------------------------------------------- edicts ---

function runEdict(ix: ContentIndex, s: GameState, c: CampaignState, card: string): void {
  const def = campaignContent(ix).edicts.find((e) => e.id === card);
  if (def?.twoPlayerOnly) {
    // Guild Envoys Depart (p. 21): "Bury all Guild cards in the Court with no agents on them, then refill the Court."
    const gone = s.court.filter((x) => isGuild(ix, x.card) && !Object.values(x.agents).some((n) => (n ?? 0) > 0)).map((x) => x.card);
    for (const x of gone) bury(s, x);
    log(s, `Guild Envoys Depart: ${gone.length ? gone.join(', ') + ' buried' : 'no Guild card leaves'}`);
    return;
  }
  if (def?.policy) {
    // Govern the Imperial Reach (p. 20): "The First Regent must either enforce or change the Imperial Policy".
    if (c.firstRegent === null) {
      log(s, 'Govern the Imperial Reach: there is no First Regent');
      return;
    }
    const slot = c.booklet.edicts.findIndex((st) => st[0] === card);
    ask(s, { player: c.firstRegent, card, effect: 'event:govern', data: { slot } });
    return;
  }
  log(s, `${card}: no effect yet`);
}

function policyOf(ix: ContentIndex, card: string): Policy {
  return campaignContent(ix).edicts.find((e) => e.id === card)?.policy ?? fail(`${card} is not a Govern the Imperial Reach card`);
}

/** All Regents, in turn order from the First Regent. */
function regents(s: GameState, c: CampaignState, fr: PlayerId): PlayerId[] {
  return Array.from({ length: s.playerCount }, (_, k) => (fr + k) % s.playerCount).filter((p) => c.titles[p] === 'regent');
}

/** What the First Regent may take from `p` for the Demand: resource types, or (War) `trophy:i` / `captive:i`. */
function demandOptions(s: GameState, c: CampaignState, p: PlayerId, policy: Policy): string[] {
  const want = DEMAND[policy];
  const pl = s.players[p];
  if (want !== 'trophies') return [...new Set(heldResources(pl).filter((r) => want.includes(r)))];
  // War: "Trophies or Captives, but not Regent or Imperial pieces".
  const out: string[] = [];
  pl.trophies.forEach((t, i) => {
    if (t.owner !== 'empire' && !(isPlayer(t.owner) && c.titles[t.owner] === 'regent')) out.push(`trophy:${i}`);
  });
  pl.captives.forEach((o, i) => {
    if (c.titles[o] !== 'regent') out.push(`captive:${i}`);
  });
  return out;
}

/** True when collecting the Demand leaves the First Regent something to choose. */
function demandHasChoice(s: GameState, c: CampaignState, fr: PlayerId, policy: Policy): boolean {
  if (DEMAND[policy] !== 'trophies' && demandOptions(s, c, fr, policy).length > 1) return true;
  return regents(s, c, fr)
    .filter((p) => p !== fr)
    .some((p) => {
      const o = demandOptions(s, c, p, policy);
      // Several kinds to take, or nothing and no agent: "the First Regent may make them an Outlaw".
      return o.length > 1 || (!o.length && s.players[p].supply.agents < 1);
    });
}

/**
 * Collect Imperial Demand (p. 20), then take the Imperial Action. `args.take`:
 * what to take from each Rival Regent, by seat (a resource type, or `trophy:i`
 * / `captive:i` in War); `args.own`: the resource the First Regent adds from
 * their own; `args.outlaw`: Rival Regents with no such piece and no agent
 * that the First Regent makes Outlaws.
 */
function collectDemand(ix: ContentIndex, s: GameState, c: CampaignState, fr: PlayerId, policy: Policy, args: Record<string, unknown>): string {
  const take = (args.take ?? {}) as Record<string, string>;
  const outlaw = (args.outlaw ?? []) as PlayerId[];
  const done: string[] = [];
  const made: PlayerId[] = [];
  const frp = s.players[fr];
  for (const p of regents(s, c, fr).filter((x) => x !== fr)) {
    const opts = demandOptions(s, c, p, policy);
    const pl = s.players[p];
    if (opts.length) {
      const pick = take[p] ?? opts[0];
      if (!opts.includes(pick)) fail(`Cannot take ${pick} from P${p}`);
      if (pick.startsWith('trophy:')) {
        frp.trophies.push(...pl.trophies.splice(Number(pick.slice(7)), 1));
        done.push(`a trophy from P${p}`);
      } else if (pick.startsWith('captive:')) {
        frp.captives.push(...pl.captives.splice(Number(pick.slice(8)), 1));
        done.push(`a captive from P${p}`);
      } else {
        c.trust.push(takeResourceAt(pl, pl.resources.indexOf(pick as Resource)));
        done.push(`${pick} from P${p}`);
      }
    } else if (pl.supply.agents > 0) {
      // "If a Rival Regent has no pieces shown by the Demand, the First Regent must take 1 agent from the Rival's supply as a Favor."
      pl.supply.agents -= 1;
      c.favors[fr].push(p);
      done.push(`a Favor from P${p}`);
    } else if (outlaw.includes(p)) {
      // "If they have no agents, the First Regent may make them an Outlaw."
      c.titles[p] = 'outlaw';
      made.push(p);
      done.push(`P${p} becomes an Outlaw`);
    }
  }
  for (const p of outlaw) if (!made.includes(p)) fail(`P${p} cannot be made an Outlaw`);
  if (DEMAND[policy] !== 'trophies') {
    // "The First Regent must also add 1 resource shown by the Demand to the Trust, if they have it."
    const own = demandOptions(s, c, fr, policy);
    if (own.length) {
      const r = (args.own as Resource | undefined) ?? (own[0] as Resource);
      if (!own.includes(r)) fail(`P${fr} has no ${r} to add`);
      c.trust.push(takeResourceAt(frp, frp.resources.indexOf(r)));
      done.push(`${r} of their own`);
    }
  }
  return `collects ${done.join(', ') || 'nothing'}; ${imperialAction(ix, s, c, fr, policy)}`;
}

/** Take Imperial Action (p. 21). */
function imperialAction(ix: ContentIndex, s: GameState, c: CampaignState, fr: PlayerId, policy: Policy): string {
  if (policy === 'peace') {
    // "Each Regent gains the bonus city Power shown on all uncovered city slots on their player board."
    const got = regents(s, c, fr).map((p) => {
      const n = cityBonusPower(ix.content, s.players[p]);
      s.players[p].power += n;
      return n ? `P${p} +${n}` : '';
    });
    return `Celebrate Regency: ${got.filter(Boolean).join(', ') || 'no Power gained'}`;
  }
  if (policy === 'escalation') {
    // "Place 2 fresh Imperial ships in an Empire-controlled system. If no systems are controlled by the Empire,
    // place them at a Loyal starport instead."
    const systems = ix.content.map.systems.filter((d) => s.map[d.id]?.inPlay);
    let options = systems.filter((d) => empireControls(s.map[d.id])).map((d) => d.id);
    if (!options.length) options = systems.filter((d) => s.map[d.id].buildings.some((b) => b.type === 'starport' && isPlayer(b.owner))).map((d) => d.id);
    if (!options.length || c.supply.imperialShips < 1) return 'Requisition Ships: nowhere to place them';
    if (options.length === 1) return requisition(s, options[0]);
    ask(s, { player: fr, card: 'requisition-ships', effect: 'event:escalation', data: { options } });
    return 'Requisition Ships';
  }
  // War: "Give 1 Weapon to each Regent from the supply. If the supply is empty, give it from the Imperial Trust."
  const all = regents(s, c, fr);
  const count = Math.min(all.length, (s.resourceSupply.weapons ?? 0) + c.trust.filter((r) => r === 'weapons').length);
  if (count === all.length) return distributeArms(ix, s, all);
  if (count < 1) return 'Distribute Arms: no Weapons left';
  // "In War, if there aren't enough Weapons to give out, you choose which Regents get them."
  ask(s, { player: fr, card: 'distribute-arms', effect: 'event:weapons', data: { regents: all, count } });
  return 'Distribute Arms';
}

function requisition(s: GameState, system: string): string {
  const c = s.campaign!;
  const n = Math.min(2, c.supply.imperialShips);
  c.supply.imperialShips -= n;
  (s.map[system].imperial ??= { fresh: 0, damaged: 0 }).fresh += n;
  return `Requisition Ships: ${n} fresh Imperial ships at ${system}`;
}

function distributeArms(ix: ContentIndex, s: GameState, to: PlayerId[]): string {
  const c = s.campaign!;
  for (const p of to) {
    if ((s.resourceSupply.weapons ?? 0) > 0) s.resourceSupply.weapons -= 1;
    else c.trust.splice(c.trust.indexOf('weapons'), 1);
    gainResource(ix.content, s.players[p], 'weapons');
  }
  return `Distribute Arms: a Weapon to ${to.map((p) => `P${p}`).join(', ')}`;
}

// ---------------------------------------------------------------- helpers ---

/** p. 14 step 3: the Outlaw takes the resources; "The First Regent loses 1 Power for each resource stolen." */
function stealTrust(ix: ContentIndex, s: GameState, p: PlayerId, rs: Resource[]): string {
  const c = s.campaign!;
  for (const r of rs) {
    c.trust.splice(c.trust.indexOf(r), 1);
    gainResource(ix.content, s.players[p], r);
  }
  if (c.firstRegent !== null) s.players[c.firstRegent].power = Math.max(0, s.players[c.firstRegent].power - rs.length);
  const text = `steals ${rs.join(', ')} from the Imperial Trust`;
  log(s, `P${p} ${text}`);
  return text;
}

function emptySlots(ix: ContentIndex, s: GameState, p: PlayerId): number {
  const pl = s.players[p];
  return openSlots(ix.content, pl).filter((i) => !pl.resources[i]).length;
}

/** Song of Freedom: the player's city returns to their supply and a Free city takes its place. */
function freeCity(ix: ContentIndex, s: GameState, p: PlayerId, system: string): string {
  const b = s.map[system].buildings.find((x) => x.owner === p && x.type === 'city') ?? fail(`P${p} has no city at ${system}`);
  b.owner = 'free';
  b.damaged = false;
  const sup = s.campaign!.supply;
  sup.freeCities = Math.max(0, sup.freeCities - 1);
  returnPiece(ix, s, p, 'city');
  return `replaces their city at ${system} with a Free city`;
}

function isGuild(ix: ContentIndex, card: string): boolean {
  return ix.courtCards.get(card)?.kind === 'faction';
}

/** Index of the Court slot holding `card` (on top or attached), or -1. */
function courtIndex(s: GameState, card: string): number {
  return s.court.findIndex((x) => x.card === card || x.attached === card);
}

/**
 * Bury: "place on the bottom of the Court deck" (p. 18). "If a Crisis
 * removes a card from the Court, return all agents on it and draw a card
 * from the Court deck to refill the Court"; a card with an attached card
 * lets it slide down with the agents instead (p. 27).
 */
function bury(s: GameState, card: string): void {
  const i = courtIndex(s, card);
  if (i < 0) return;
  const slot = s.court[i];
  if (slot.attached === card) delete slot.attached;
  else if (slot.attached) s.court[i] = { card: slot.attached, agents: slot.agents };
  else {
    for (const [p, n] of Object.entries(slot.agents)) s.players[Number(p)].supply.agents += n ?? 0;
    s.court.splice(i, 1);
    const refill = s.courtDeck.shift();
    if (refill) s.court.splice(i, 0, { card: refill, agents: {} });
  }
  s.courtDeck.push(card);
}

function ask(s: GameState, d: Decision): void {
  (s.pendingDecisions ??= []).push(d);
}

function log(s: GameState, text: string, data?: unknown): void {
  s.log.push({ chapter: s.chapter, text, ...(data !== undefined ? { data } : {}) });
}

function fail(msg: string): never {
  throw new RuleError(msg);
}

// ---- how each event Decision is answered (decisions.ts): the empty answer takes the rules' default ----

/** Most answers offered for collecting the Demand (each Rival Regent's piece, the own resource, Outlaws). */
const MAX_DEMAND_ANSWERS = 64;

/** Every way to collect the Demand that leaves a choice: what to take from each Rival Regent, the own resource, the Outlaws. */
function demandAnswers(s: GameState, fr: PlayerId, policy: Policy): DecisionAnswer[] {
  const c = s.campaign;
  if (!c) return [];
  const rivals = regents(s, c, fr).filter((p) => p !== fr);
  const takes = rivals.map((p) => ({ p, opts: demandOptions(s, c, p, policy) })).filter((x) => x.opts.length > 1);
  const own = DEMAND[policy] !== 'trophies' ? demandOptions(s, c, fr, policy) : [];
  const outlawable = rivals.filter((p) => !demandOptions(s, c, p, policy).length && s.players[p].supply.agents < 1);
  const out: DecisionAnswer[] = [];
  const walk = (i: number, take: Record<string, string>) => {
    if (out.length >= MAX_DEMAND_ANSWERS) return;
    if (i < takes.length) {
      for (const o of takes[i].opts) walk(i + 1, { ...take, [takes[i].p]: o });
      return;
    }
    for (const r of own.length > 1 ? own : [undefined]) {
      for (const outlaw of [[], ...choose(outlawable, 1), ...(outlawable.length > 1 ? [outlawable] : [])]) {
        const parts: DecisionPart[] = [];
        if (takes.length) parts.push({ key: 'take', kind: 'take', value: take });
        if (r !== undefined) parts.push({ key: 'own', kind: 'resource', value: r });
        if (outlaw.length) parts.push({ key: 'outlaw', kind: 'players', value: outlaw });
        if (parts.length) out.push(parts);
      }
    }
  };
  walk(0, {});
  return out;
}

Object.assign(EVENT_ASKS, {
  'event:steal': { empty: 'default', answers: ({ state, data }) => subMultisets(state.campaign?.trust ?? [], (data?.max as number) ?? 0).map((resources) => [{ key: 'resources', kind: 'resources', value: resources }]) },
  'event:choice': { empty: 'default', answers: () => ['crises', 'edicts'].map((value) => [{ key: 'resolve', kind: 'word', value }]) },
  'event:reroll': { empty: 'default', answers: () => ['event', 'number', 'both'].map((value) => [{ key: 'dice', kind: 'word', value }]) },
  'event:govern': {
    empty: 'default',
    answers: ({ state, data }) => {
      const stack = state.campaign?.booklet.edicts[data?.slot as number] ?? [];
      return [...new Set(stack.slice(1))].filter((x) => x !== stack[0]).map((value) => [{ key: 'change', kind: 'card', value }]);
    },
  },
  'event:demand': { empty: 'default', answers: ({ state, player, data }) => demandAnswers(state, player, data?.policy as Policy) },
  'event:escalation': { empty: 'default', answers: ({ data }) => ((data?.options as string[]) ?? []).map((value) => [{ key: 'system', kind: 'system', value }]) },
  'event:weapons': {
    empty: 'default',
    answers: ({ data }) => choose((data?.regents as PlayerId[]) ?? [], (data?.count as number) ?? 0).map((value) => [{ key: 'players', kind: 'players', value }]),
  },
  'event:fiasco': {
    empty: 'default',
    answers: ({ ix, state, player, data }) => {
      const free = state.players[player].court.filter((x) => isGuild(ix, x) && !isProtected(ix, x));
      return choose(free, (data?.discard as number) ?? 0).map((value) => [{ key: 'cards', kind: 'cards', value }]);
    },
  },
  'event:freedom': { empty: 'default', answers: ({ data }) => ((data?.cities as string[]) ?? []).map((value) => [{ key: 'system', kind: 'system', value }]) },
} satisfies typeof EVENT_ASKS);
