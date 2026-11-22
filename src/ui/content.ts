// Loads the owner's data/content.json when present (it is git-ignored), else the
// placeholder data/content.example.json, so the page builds and runs either way.

import example from '../../data/content.example.json';
import type { GameContent } from '../game/engine';

const owner = import.meta.glob('../../data/content.json', { eager: true, import: 'default' }) as Record<string, unknown>;

/** The content the page plays with, and where it came from. */
export function loadContent(): { content: GameContent; source: 'owner' | 'example' } {
  const own = Object.values(owner)[0];
  if (own) return { content: structuredClone(own) as GameContent, source: 'owner' };
  return { content: structuredClone(example) as unknown as GameContent, source: 'example' };
}
