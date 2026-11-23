import { describe, expect, it } from 'vitest';
import { cardFaces } from '../../../src/ui/table/cardfonts';

const free = {
  '/assets/fonts/cinzel-900-latin.woff2': 'cinzel.woff2',
  '/assets/fonts/jost-latin.woff2': 'jost.woff2',
  '/assets/fonts/jost-italic-latin.woff2': 'jost-italic.woff2',
};

describe('cardFaces', () => {
  it('uses the free stand-ins when the official fonts are missing', () => {
    const faces = cardFaces(free);
    expect(faces).toContainEqual({ family: 'Arcs Card Title', url: 'cinzel.woff2', weight: '100 900', style: 'normal' });
    expect(faces).toContainEqual({ family: 'Arcs Card Text', url: 'jost.woff2', weight: '100 900', style: 'normal' });
    expect(faces).toContainEqual({ family: 'Arcs Card Text', url: 'jost-italic.woff2', weight: '100 900', style: 'italic' });
    expect(faces).toHaveLength(3);
  });

  it('prefers the official fonts when their files are present', () => {
    const faces = cardFaces({
      ...free,
      '/assets/fonts/FMBolyarPro-900.otf': 'bolyar.otf',
      '/assets/fonts/NeueKabel-Book.otf': 'book.otf',
      '/assets/fonts/NeueKabel-Bold.otf': 'bold.otf',
      '/assets/fonts/NeueKabel-BookItalic.otf': 'italic.otf',
    });
    expect(faces.find((f) => f.family === 'Arcs Card Title')?.url).toBe('bolyar.otf');
    const text = faces.filter((f) => f.family === 'Arcs Card Text');
    expect(text).toEqual([
      { family: 'Arcs Card Text', url: 'book.otf', weight: '400', style: 'normal' },
      { family: 'Arcs Card Text', url: 'bold.otf', weight: '700', style: 'normal' },
      { family: 'Arcs Card Text', url: 'italic.otf', weight: '400', style: 'italic' },
    ]);
  });

  it('registers nothing when there are no font files', () => {
    expect(cardFaces({})).toEqual([]);
  });
});
