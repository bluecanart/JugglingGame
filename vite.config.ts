import { defineConfig } from 'vite';

// `base: './'` produces relative asset URLs, so the build works at
// https://<user>.github.io/<repo>/ without any further config.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
});
