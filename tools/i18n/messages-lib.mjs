// The pure part of the message collector (tools/i18n/extract-messages.mjs),
// shared with the unit test that checks src/i18n/messages.json is current.

const unescape = (ch) => ({ n: '\n', t: '\t' })[ch] ?? ch;

/** String literals of a TS file (comments skipped), templates with `${…}` as {n}. */
export function literals(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
    if (c === "'" || c === '"') {
      let j = i + 1, s = '';
      while (src[j] !== c) { if (src[j] === '\\') { s += unescape(src[j + 1]); j += 2; } else s += src[j++]; }
      out.push(s);
      i = j + 1;
      continue;
    }
    if (c === '`') {
      let j = i + 1, s = '', n = 0;
      while (src[j] !== '`') {
        if (src[j] === '\\') { s += unescape(src[j + 1]); j += 2; continue; }
        if (src[j] === '$' && src[j + 1] === '{') {
          // Skip the expression (nested braces and strings included), keeping the strings inside it.
          let depth = 1; j += 2;
          const start = j;
          while (depth) {
            const d = src[j];
            if (d === '{') depth++;
            else if (d === '}') depth--;
            else if (d === "'" || d === '"' || d === '`') { const q = d; j++; while (src[j] !== q) j += src[j] === '\\' ? 2 : 1; }
            j++;
          }
          out.push(...literals(src.slice(start, j - 1)));
          s += `{${n++}}`;
          continue;
        }
        s += src[j++];
      }
      out.push(s);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

/** A message: words with a space between them (ids, paths and keys have none). */
export function isMessage(s) {
  const words = s.replace(/\{\d+\}/g, ' ').match(/[A-Za-z]{2,}/g) ?? [];
  if (!words.length || !/[a-z}] |[a-z] [{a-z(]/.test(s)) return false;
  if (/^[./]|\.ts$|^#|^[a-z-]+:[a-z]/.test(s)) return false;
  return true;
}

/** The sorted message list of a set of source texts. */
export function collect(sources) {
  const set = new Set();
  for (const src of sources) {
    for (const s of literals(src)) {
      // Fragments glued to other messages: keep their words, drop the glue.
      const m = s.replace(/^; /, '').replace(/^\s+|\s+$/g, (w) => (w.startsWith(' (') ? w : ''));
      // Sentences glued with '; ' are translated part by part.
      const parts = s.startsWith(' (') ? [s] : m.split('; ').map((x) => x.trim());
      for (const x of parts) if (isMessage(x) && !/^\{\d+\}$/.test(x)) set.add(x);
    }
  }
  return [...set].sort();
}
