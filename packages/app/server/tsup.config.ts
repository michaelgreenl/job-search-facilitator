import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  clean: true,
  external: [/^@prisma\//],
  noExternal: ['@job-search-facilitator/core', '@job-search-facilitator/utils'],
})
