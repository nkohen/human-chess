import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base: the production build is copied into a subfolder of the GitHub Pages site
// (scripts/deploy-web.sh -> https://nkohen.github.io/human-chess/), and hash routing means the
// pathname never changes, so every asset can be addressed relative to index.html. Dev and the
// screenshot harness still serve from the root and are unaffected.
export default defineConfig({
  base: './',
  plugins: [react()],
});
