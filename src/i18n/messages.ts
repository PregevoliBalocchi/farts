// The rules engine's sentences (log lines, rule errors, effect results) in the
// player's language, gettext style: the engine writes English, the English
// sentence with {0}, {1}… is the key (src/i18n/messages.json, collected by
// tools/i18n/extract-messages.mjs) and a catalogue per language translates it
// (messages.it.json). The parts filled in — players, resources, cards — are
// translated too, through the vocabulary the caller gives. A sentence the
// catalogue does not know keeps its words, with those parts translated.

import keys from './messages.json';
import it from './messages.it.json';
import type { Lang } from './index';

const CATALOGUES: Partial<Record<Lang, Record<string, string>>> = { it };

/** How the filled-in parts read: a player's name, and words such as resource or card ids. */
export interface MessageVocab {
  player(id: number): string;
  /** The translation of one id-like word ("material", "court-03"), or undefined to keep it. */
  word(token: string): string | undefined;
}

interface Pattern {
  re: RegExp;
  /** For each capture, the placeholder it fills (-1: a glued prefix translated on its own). */
  slots: number[];
  players: Set<number>;
  out: string;
  weight: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(key: string, out: string): Pattern {
  const slots: number[] = [];
  const players = new Set<number>();
  // A fragment glued to the end of another sentence (" (after the battle)") also matches with that sentence in front.
  const glued = /^[ ,]/.test(key);
  let re = glued ? '(.+?)' : '';
  if (glued) slots.push(-1);
  let weight = 0;
  for (const part of key.split(/(P?\{\d+\})/)) {
    const m = part.match(/^(P?)\{(\d+)\}$/);
    if (m) {
      const n = Number(m[2]);
      slots.push(n);
      if (m[1]) {
        players.add(n);
        re += 'P(\\d+)';
      } else re += '([\\s\\S]*?)';
    } else {
      re += escapeRe(part);
      weight += part.length;
    }
  }
  return { re: new RegExp(`^${re}$`), slots, players, out, weight };
}

/** Patterns for one language, the most specific (most literal text) first. */
const cache = new Map<string, Pattern[]>();
function patterns(lang: Lang): Pattern[] {
  let list = cache.get(lang);
  if (!list) {
    const cat = CATALOGUES[lang] ?? {};
    list = (keys as string[]).map((k) => compile(k, cat[k] ?? k.replace(/P\{(\d+)\}/g, '{$1}'))).sort((a, b) => b.weight - a.weight);
    cache.set(lang, list);
  }
  return list;
}

/** Returns the translator of engine sentences for `lang`. */
export function messageTranslator(lang: Lang, vocab: MessageVocab): (msg: string) => string {
  const list = patterns(lang);

  /** Id-like words anywhere in a string that no sentence matched. */
  const words = (s: string) =>
    s.replace(/\bP(\d+)\b/g, (_, n: string) => vocab.player(Number(n))).replace(/[A-Za-z][\w-]*/g, (w) => vocab.word(w) ?? w);

  const value = (v: string, isPlayer: boolean): string => {
    if (isPlayer) return vocab.player(Number(v));
    if (v === '') return v;
    const direct = vocab.word(v.trim());
    if (direct !== undefined) return v.replace(v.trim(), direct);
    if (/^P\d+$/.test(v)) return vocab.player(Number(v.slice(1)));
    if (/[ ;]/.test(v.trim()) || /^[ ,]/.test(v)) return translate(v);
    return words(v);
  };

  const part = (p: string): string => {
    for (const pat of list) {
      const m = pat.re.exec(p);
      if (!m) continue;
      const filled = new Map<number, string>();
      let prefix = '';
      pat.slots.forEach((slot, i) => {
        if (slot < 0) prefix = translate(m[i + 1]);
        else filled.set(slot, value(m[i + 1], pat.players.has(slot)));
      });
      return prefix + pat.out.replace(/\{(\d+)\}/g, (x, n: string) => filled.get(Number(n)) ?? x);
    }
    return words(p);
  };

  // Sentences glued with "; " are translated one by one.
  function translate(msg: string): string {
    return msg.split('; ').map(part).join('; ');
  }
  return translate;
}
