/** String literals of a TS file, templates with `${…}` as {n}. */
export function literals(src: string): string[];
/** True for a sentence (words with spaces), false for ids, paths and keys. */
export function isMessage(s: string): boolean;
/** The sorted message list of a set of source texts. */
export function collect(sources: string[]): string[];
