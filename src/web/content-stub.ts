// Stands in for src/ui/content.ts in the online build (vite.online.config.ts):
// the online game gets its content from Firestore, so nothing is bundled.
import type { GameContent } from '../game/engine';

/** Never used online (the game screen passes the content in). */
export function loadContent(): { content: GameContent; source: 'owner' | 'example' } {
  throw new Error('Online, the game content comes from the database');
}
