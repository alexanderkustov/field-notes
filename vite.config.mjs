import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Keep built asset URLs relative so the site works from a Pages project path.
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(rootDirectory, 'index.html'),
        japan2023: path.resolve(rootDirectory, 'japan-2023/index.html'),
        portraits: path.resolve(rootDirectory, 'portraits/index.html'),
      },
    },
  },
});
