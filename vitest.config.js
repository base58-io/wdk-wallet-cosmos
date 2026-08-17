import { defineConfig } from 'vitest/config'

// Two projects, so CI can run the offline suite without the local chains.
// `*.integration.test.ts` needs the Ignite chains and Hermes relayer from
// docker-compose.yml; everything else runs anywhere.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/**/*.test.ts'],
          exclude: ['**/node_modules/**', 'tests/**/*.integration.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/**/*.integration.test.ts'],
          exclude: ['**/node_modules/**'],
        },
      },
    ],
  },
})
