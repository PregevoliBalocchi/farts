// The card faces' fonts. The publisher's font guide (development kit) names
// FM Bolyar Pro for titles and headers and Neue Kabel for the text; both are
// commercial, so they are used only when their files are put in assets/fonts/
// (git-ignored: the owner's licensed copies). Otherwise the closest free fonts
// shipped there stand in: Cinzel Black for titles, Jost for the text (SIL OFL).
// Both families are registered under neutral names the CSS uses:
// "Arcs Card Title" and "Arcs Card Text".

const files = import.meta.glob('../../../assets/fonts/*.{woff2,woff,otf,ttf}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** One face to register: family, file, and its descriptors. */
export interface FaceSpec {
  family: 'Arcs Card Title' | 'Arcs Card Text';
  url: string;
  weight: string;
  style: 'normal' | 'italic';
}

/**
 * The faces to register for the font files present (`path → url`): the
 * official files when there, else the free stand-ins. Pure, for tests.
 */
export function cardFaces(found: Record<string, string>): FaceSpec[] {
  const list = Object.entries(found).map(([path, url]) => ({ name: path.split('/').pop()!.toLowerCase(), url }));
  const pick = (re: RegExp, not?: RegExp) => list.find((f) => re.test(f.name) && !(not && not.test(f.name)))?.url;
  const faces: FaceSpec[] = [];
  const title = pick(/bolyar/) ?? pick(/cinzel/);
  if (title) faces.push({ family: 'Arcs Card Title', url: title, weight: '100 900', style: 'normal' });
  const kabel = pick(/kabel/, /bold|italic|light|medium|black|heavy/);
  if (kabel) {
    faces.push({ family: 'Arcs Card Text', url: kabel, weight: '400', style: 'normal' });
    const bold = pick(/kabel.*bold/, /italic/);
    const italic = pick(/kabel.*italic/, /bold/);
    const boldItalic = pick(/kabel.*bold.*italic/);
    if (bold) faces.push({ family: 'Arcs Card Text', url: bold, weight: '700', style: 'normal' });
    if (italic) faces.push({ family: 'Arcs Card Text', url: italic, weight: '400', style: 'italic' });
    if (boldItalic) faces.push({ family: 'Arcs Card Text', url: boldItalic, weight: '700', style: 'italic' });
  } else {
    const jost = pick(/^jost/, /italic/);
    const jostItalic = pick(/^jost.*italic/);
    if (jost) faces.push({ family: 'Arcs Card Text', url: jost, weight: '100 900', style: 'normal' });
    if (jostItalic) faces.push({ family: 'Arcs Card Text', url: jostItalic, weight: '100 900', style: 'italic' });
  }
  return faces;
}

let loading: Promise<void> | null = null;

/** Registers the card fonts with the document and resolves once they are loaded (or failed). Safe to call more than once. */
export function loadCardFonts(): Promise<void> {
  loading ??= (async () => {
    if (typeof FontFace === 'undefined' || !document.fonts) return;
    await Promise.all(
      cardFaces(files).map(async (f) => {
        try {
          const face = new FontFace(f.family, `url("${f.url}")`, { weight: f.weight, style: f.style });
          document.fonts.add(await face.load());
        } catch {
          // A broken file leaves the next font in the CSS stack.
        }
      }),
    );
  })();
  return loading;
}
