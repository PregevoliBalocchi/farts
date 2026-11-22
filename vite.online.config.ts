// Build of the online pages (docs/online-access.md) into dist-online/, the
// folder Firebase Hosting serves. Only the access page: no game content.
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(import.meta.dirname, 'online'),
  base: '/',
  publicDir: false,
  build: {
    outDir: resolve(import.meta.dirname, 'dist-online'),
    emptyOutDir: true,
  },
});
