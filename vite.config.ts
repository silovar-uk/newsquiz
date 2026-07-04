import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative paths keep GitHub Pages deployment simple for project repositories.
  base: './',
  plugins: [react()],
});
