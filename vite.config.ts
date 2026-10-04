import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist', sourcemap: true },
  test: { environment: 'node', testTimeout: 120000 },
} as never);
