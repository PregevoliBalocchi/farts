// Build of the online pages (docs/online-access.md, docs/online-play.md) into
// dist-online/, the folder Firebase Hosting serves: the entrance (index.html)
// and the game screen (play.html).
//
// Anything here is public, so no owner content may be bundled: the game
// reads it from Firestore. The debug table imports src/ui/content.ts, which
// globs data/content.json; that module is replaced here by a stub.
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { resolve } from 'node:path';

const here = import.meta.dirname;
const ownerContentLoader = resolve(here, 'src/ui/content.ts');
const stub = resolve(here, 'src/web/content-stub.ts');

/** Points every import of the owner-content loader at the stub. */
function noOwnerContent(): Plugin {
  return {
    name: 'no-owner-content',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const r = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (r && resolve(r.id.split('?')[0]) === ownerContentLoader) return stub;
      return null;
    },
  };
}

export default defineConfig({
  root: resolve(here, 'online'),
  base: '/',
  publicDir: false,
  plugins: [noOwnerContent()],
  build: {
    outDir: resolve(here, 'dist-online'),
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        index: resolve(here, 'online/index.html'),
        play: resolve(here, 'online/play.html'),
      },
    },
  },
});
