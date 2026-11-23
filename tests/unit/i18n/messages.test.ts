// The engine's sentences in other languages (src/i18n/messages.ts): the
// catalogue covers every sentence the engine can write, and a sentence comes
// out translated with its players and ids by name.
import { describe, expect, it } from 'vitest';
import keys from '../../../src/i18n/messages.json';
import itCatalogue from '../../../src/i18n/messages.it.json';
import { messageTranslator } from '../../../src/i18n/messages';
import type { MessageVocab } from '../../../src/i18n/messages';
import { collect } from '../../../tools/i18n/messages-lib.mjs';

const sources = Object.values(import.meta.glob('../../../src/game/**/*.ts', { query: '?raw', import: 'default', eager: true })) as string[];

/** A made-up vocabulary: players by letter, a few ids in capitals. */
const vocab: MessageVocab = {
  player: (n) => `[${'ABCD'[n]}]`,
  word: (w) => ({ material: 'MATERIALE', 'court-03': 'CARTA TRE', wealth: 'MAGNATE' })[w],
};

describe('engine message catalogue', () => {
  it('lists every sentence the engine writes (run tools/i18n/extract-messages.mjs when this fails)', () => {
    expect(collect(sources)).toEqual(keys);
  });

  it('translates every sentence into Italian with the same placeholders', () => {
    const it = itCatalogue as Record<string, string>;
    const slots = (s: string) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const k of keys as string[]) {
      expect(it[k], k).toBeTypeOf('string');
      expect(slots(it[k]), k).toBe(slots(k));
    }
  });
});

describe('messageTranslator', () => {
  const say = messageTranslator('it', vocab);

  it('translates a log line with players by name', () => {
    expect(say('P0 passes the initiative')).toBe("[A] passa l'iniziativa");
  });

  it('translates the ids inside a sentence', () => {
    expect(say('P1 declares wealth (m-low)')).toBe('[B] dichiara MAGNATE (m-low)');
    expect(say('You have no material')).toBe('Non hai MATERIALE');
  });

  it('translates sentences glued with a semicolon one by one', () => {
    expect(say('P0 secures court-03; no attacking ship is left')).toBe('[A] acquisisce CARTA TRE; non resta nessuna nave in attacco');
  });

  it('translates a sentence nested in another', () => {
    expect(say('P2 uses court-03 (steal): steals 1 material from P1')).toBe('[C] usa CARTA TRE (steal): ruba 1 MATERIALE a [B]');
  });

  it('translates a fragment glued to the end of a sentence', () => {
    expect(say('P0 influences court-03 (after the battle)')).toBe('[A] influenza CARTA TRE (dopo il combattimento)');
  });

  it('keeps an unknown sentence, with players and ids by name', () => {
    expect(say('P3 does something new with material')).toBe('[D] does something new with MATERIALE');
  });

  it('keeps English sentences in English, players by name', () => {
    expect(messageTranslator('en', vocab)('P0 passes the initiative')).toBe('[A] passes the initiative');
  });
});
