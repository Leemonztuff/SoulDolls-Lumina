import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import levelApi from './tools/vite-level-api.js';

/**
 * Combat-only engine modules (enemy sheets, the FX atlas, FX batches, combat UI). They have no
 * import side effects, so they are marked pure: a chunk that uses none of their exports leaves them
 * out even though the engine barrel re-exports them — peaceful levels and the editor fetch them
 * only through the combat chunk that imports them from their files (KNOWN_ISSUES COMBAT-17).
 */
const COMBAT_PURE = /[\\/]src[\\/]engine[\\/](?:fx[\\/](?:FxQuads|GroundMarkers)|pixel[\\/](?:MonsterSprites|FxSprites)|ui[\\/](?:CombatHUD|BossBar|WorldLabels|Announcer|DeathScreen))\.js$/;

export default defineConfig({
  plugins: [levelApi()],
  // cors: false — Vite's default grants Access-Control-Allow-Origin to every localhost /
  // 127.0.0.1 / [::1] origin, which lets pages on other local ports read the served files.
  // watch.ignored — the file watcher walks the whole root at startup; the harness output in .check/
  // (gigabytes of screenshots) stalled module serving by seconds, which inflated every cold loadMs.
  server: { host: '127.0.0.1', port: 5173, cors: false, watch: { ignored: ['**/.check/**', '**/dist/**'] } },
  preview: { cors: false },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        editor: resolve(import.meta.dirname, 'editor.html'),
      },
      treeshake: { moduleSideEffects: (id) => !COMBAT_PURE.test(id) },
    },
  },
});
