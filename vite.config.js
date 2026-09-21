import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // relative asset URLs, so the same build works from a subpath — GitHub Pages project sites live at /<repo>/
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // the preview proxy reaches the dev server through an external Host header
    allowedHosts: true,
  },
  preview: { host: '0.0.0.0', port: 4173, strictPort: true },
  build: { target: 'es2020', outDir: 'dist' },
});
