// Asset manifest (docs/ui/UI_SPEC.md §13): every picture the table shows goes
// through here. An image in assets/ui/ (git-ignored, local only) replaces the
// placeholder drawn in code. Folders become dots in the key:
//   assets/ui/card/<card id>.png     Court card art (picker, Court row, held cards)
//   assets/ui/icon/<glyph>.png       a glyph: material, fuel, weapons, relic, psionic,
//                                    ship, city, starport, agent, trophy, captive, key, …
//   assets/ui/suit/<suit id>.png     suit symbol on action cards
//   assets/ui/portrait/<seat>.png    seat portrait (0..3)
//   assets/ui/map/background.png     map background
// Extensions: png, webp, svg, jpg.

const files = import.meta.glob('../../../assets/ui/**/*.{png,webp,svg,jpg,jpeg,PNG,WEBP,SVG,JPG,JPEG}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const byKey = new Map<string, string>();
for (const [path, url] of Object.entries(files)) {
  const key = path.replace(/^.*assets\/ui\//, '').replace(/\.[a-zA-Z]+$/, '').replace(/\//g, '.');
  byKey.set(key, url);
}

/** URL of the user-supplied image for `key` (e.g. "portrait.0", "map.background"), or null. */
export function assetUrl(key: string): string | null {
  return byKey.get(key) ?? null;
}

/** Placeholder glyph names. */
export type IconName =
  | 'material' | 'fuel' | 'weapons' | 'relic' | 'psionic'
  | 'ship' | 'city' | 'starport' | 'agent' | 'trophy' | 'captive' | 'key' | 'cards' | 'power'
  | 'log' | 'settings' | 'court' | 'undo' | 'confirm' | 'close' | 'prev' | 'next' | 'trash' | 'lock'
  | 'seat0' | 'seat1' | 'seat2' | 'seat3';

// 24×24 glyphs drawn with currentColor, so CSS picks the colour.
const PATHS: Record<IconName, string> = {
  material: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z M12 3v18 M4 7.5l8 4.5 8-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  fuel: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z" fill="currentColor"/>',
  weapons: '<path d="M5 19 19 5M14 5h5v5M5 5l14 14M5 14v5h5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  relic: '<path d="M12 2 20 9l-8 13L4 9z M4 9h16 M9 9l3 13 3-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  psionic: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  ship: '<path d="M3 12 21 5l-5 7 5 7z" fill="currentColor"/>',
  city: '<path d="M4 20V10l5-4 5 4v10z M14 20V7h6v13z" fill="currentColor"/>',
  starport: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>',
  agent: '<circle cx="12" cy="7" r="4" fill="currentColor"/><path d="M5 21c0-5 3-8 7-8s7 3 7 8z" fill="currentColor"/>',
  trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z M12 14v4 M8 20h8 M7 6H4v2a3 3 0 0 0 3 3 M17 6h3v2a3 3 0 0 1-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  captive: '<rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2"/>',
  key: '<circle cx="8" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 12h9M18 12v3M21 12v3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  cards: '<rect x="4" y="5" width="11" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 3h9a2 2 0 0 1 2 2v13" fill="none" stroke="currentColor" stroke-width="2"/>',
  power: '<path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z" fill="currentColor"/>',
  log: '<path d="M5 6h14M5 12h14M5 18h9" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  settings: '<circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  court: '<rect x="3" y="6" width="8" height="12" rx="1.5" fill="currentColor"/><rect x="13" y="6" width="8" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/>',
  undo: '<path d="M9 5 4 10l5 5 M4 10h10a5 5 0 0 1 0 10h-3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  confirm: '<path d="M4 12.5 9.5 18 20 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  close: '<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  prev: '<path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  next: '<path d="M9 4l8 8-8 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  lock: '<rect x="6" y="11" width="12" height="9" rx="2" fill="currentColor"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="currentColor" stroke-width="2"/>',
  // Seat shapes: colour is never the only cue (colour-blind players).
  seat0: '<circle cx="12" cy="12" r="8" fill="currentColor"/>',
  seat1: '<rect x="4.5" y="4.5" width="15" height="15" rx="2" fill="currentColor"/>',
  seat2: '<path d="M12 3 21 20H3z" fill="currentColor"/>',
  seat3: '<path d="M12 2 22 12 12 22 2 12z" fill="currentColor"/>',
};

/**
 * A glyph: the image assets/ui/icon/<name>.* when present, else the inline SVG
 * placeholder. `label` makes it announced by screen readers, otherwise it is decorative.
 */
export function icon(name: IconName, cls = '', label?: string): string {
  const safe = label?.replace(/"/g, '&quot;');
  const url = assetUrl(`icon.${name}`);
  if (url) return `<img class="ic ic-img ${cls}" src="${url}" ${safe ? `alt="${safe}"` : 'alt="" aria-hidden="true"'}>`;
  const a11y = safe ? `role="img" aria-label="${safe}"` : 'aria-hidden="true"';
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" ${a11y}>${PATHS[name]}</svg>`;
}

/** The image for a card id (assets/ui/card/<id>.*), or null. */
export function cardArt(id: string): string | null {
  return assetUrl(`card.${id}`);
}

/** Seat glyph name for a player id. */
export function seatIcon(player: number): IconName {
  return `seat${player % 4}` as IconName;
}
