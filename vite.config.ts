/**
 * Vite build/dev configuration.
 *
 * Notes:
 * - `base` is `/` for local development.
 * - CI/deploy tooling may override `base` for GitHub Pages-style deployments.
 */

import { defineConfig } from 'vite';

export default defineConfig({
  // Base path — '/' for local dev. The GitHub Actions deploy workflow
  // overrides this to '/engine/' when building for GitHub Pages.
  base: '/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 5173,
    open: true,
  },
});
