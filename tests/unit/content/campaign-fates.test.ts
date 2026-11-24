// Checks the campaign Fate sets in data/content.json (campaign.fates and
// campaign.fateCards, installed by tools/cards/install-fates.py) against the
// campaign rulebook's structure (docs/rules/Arcs_Campaign_Rulebook_for_web.txt,
// pages 6-9): 8 Fates per tier; A Fates play Acts I-III, B Fates Acts II-III,
// C Fates Act III only; Acts I and II have an objective with a target and a
// Resolution card; in Act III, A and B Fates have two grand ambitions and C
// Fates a final objective. One entry per physical card: the counts match the
// set dividers (docs/rules/Arcs_Campaign_Punchboard.pdf), and a two-sided card
// keeps its other side in `back` (every Setup card has its Objective there).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PATH = 'data/content.json';

interface FateCard {
  id: string;
  fate: string;
  no: number;
  kind: string;
  act?: 'I' | 'II' | 'III';
  name?: string;
  text?: string;
  crisis?: string;
  target?: number | Record<string, number>;
  grand?: string[];
  final?: boolean;
  back?: { kind: string; name?: string; text?: string; target?: number | Record<string, number>; grand?: string[]; final?: boolean };
}
interface Fate {
  id: string;
  tier: 'A' | 'B' | 'C';
  name?: string;
  cardCount?: number;
  pieces?: { id: string; count: number; sides?: string[] }[];
  acts?: Record<string, { objectiveCard?: string; objectiveTarget?: unknown; grandAmbitions?: number; finalObjective?: boolean }>;
}

const ACTS_BY_TIER = { A: ['I', 'II', 'III'], B: ['II', 'III'], C: ['III'] } as const;
const ICONS = new Set(['key', 'hit', 'intercept', 'obj', 'arrowhead', 'hexagon', 'crescent']);

describe.skipIf(!existsSync(PATH))('campaign Fate sets', () => {
  const load = () => (JSON.parse(readFileSync(PATH, 'utf8')) as { campaign: { fates: Fate[]; fateCards: FateCard[] } }).campaign;

  it('has 24 named Fates, 8 per tier', () => {
    const { fates } = load();
    expect(fates).toHaveLength(24);
    for (const tier of ['A', 'B', 'C'] as const) expect(fates.filter((f) => f.tier === tier && f.name)).toHaveLength(8);
  });

  it('has one entry per physical card: as many cards as each set divider shows, 342 in all', () => {
    const { fates, fateCards } = load();
    for (const f of fates) expect(fateCards.filter((c) => c.fate === f.id).length, f.id).toBe(f.cardCount);
    expect(fateCards).toHaveLength(342);
  });

  it('gives each Fate one two-sided Setup / Objective card for every Act its tier plays, and no other', () => {
    const { fates, fateCards } = load();
    for (const f of fates) {
      const setups = fateCards.filter((c) => c.fate === f.id && c.kind === 'setup');
      expect(setups.map((c) => c.act).sort(), f.id).toEqual([...ACTS_BY_TIER[f.tier]].sort());
      for (const c of setups) expect(c.back?.kind, c.id).toBe('objective');
    }
    expect(fateCards.filter((c) => c.kind === 'objective')).toEqual([]);
  });

  it('counts the pieces of each set, with both sides for two-sided ones', () => {
    const { fates } = load();
    const ideal = fates.find((f) => f.name === 'Believer')?.pieces?.find((p) => p.id === 'ideal');
    expect(ideal).toEqual({ id: 'ideal', count: 5, sides: ['zeal', 'wisdom'] });
    for (const f of fates) for (const p of f.pieces ?? []) expect(p.count, `${f.id} ${p.id}`).toBeGreaterThan(0);
  });

  it('gives Acts I and II an objective target and a Resolution card, and Act III grand ambitions or a final objective', () => {
    const { fates, fateCards } = load();
    for (const f of fates) {
      const own = fateCards.filter((c) => c.fate === f.id);
      for (const act of ACTS_BY_TIER[f.tier]) {
        const obj = own.find((c) => c.kind === 'setup' && c.act === act)?.back;
        expect(f.acts?.[act]?.objectiveCard, `${f.id} act ${act}`).toBe(own.find((c) => c.kind === 'setup' && c.act === act)?.id);
        if (act === 'III') {
          if (f.tier === 'C') expect(obj?.final && obj.target !== undefined, `${f.id} final objective`).toBe(true);
          else expect(obj?.grand, `${f.id} grand ambitions`).toHaveLength(2);
        } else {
          expect(obj?.target, `${f.id} act ${act} target`).toBeDefined();
        }
      }
      const resolutions = own.filter((c) => c.kind === 'resolution').length;
      expect(resolutions, `${f.id} resolution cards`).toBe(ACTS_BY_TIER[f.tier].filter((a) => a !== 'III').length);
    }
  });

  it('keeps every card id unique and every text icon known', () => {
    const { fateCards } = load();
    expect(new Set(fateCards.map((c) => c.id)).size).toBe(fateCards.length);
    for (const c of fateCards) {
      for (const t of [c.text, c.crisis, c.back?.text, ...(c.grand ?? []), ...(c.back?.grand ?? [])]) {
        for (const m of (t ?? '').matchAll(/\{(\w*)\}/g)) expect(ICONS.has(m[1]), `${c.id}: {${m[1]}}`).toBe(true);
      }
    }
  });

  it('uses the corrected Navy Reprisal for Steward card 15, not the misprinted Event', () => {
    const { fates, fateCards } = load();
    const steward = fates.find((f) => f.name === 'Steward');
    const card = fateCards.find((c) => c.fate === steward?.id && c.no === 15);
    expect(card?.kind).toBe('vox');
    expect(card?.name).toBe('Navy Reprisal');
  });
});
