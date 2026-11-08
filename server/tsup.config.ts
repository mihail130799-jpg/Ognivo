import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  // Общий пакет хранится как исходники TypeScript — вшиваем его в сборку.
  noExternal: ['@ognivo/shared'],
});
