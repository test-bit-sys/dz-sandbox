import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    testTimeout: 30000,
    fileParallelism: false,
    include: ['packages/*/src/**/*.test.ts', 'packages/*/tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/index.ts'],
      thresholds: {
        // Global floor across all packages (including CLI runtime entry & control server)
        lines: 85,
        functions: 85,
        branches: 75,
        statements: 85,
        // Strict >=85% across all 4 metrics specifically on core and provider mocks
        'packages/core/src/**/*.ts': {
          statements: 85,
          branches: 85,
          functions: 85,
          lines: 85,
        },
        'packages/mock-chargily/src/**/*.ts': {
          statements: 85,
          branches: 85,
          functions: 85,
          lines: 85,
        },
        'packages/mock-satim/src/**/*.ts': {
          statements: 85,
          branches: 85,
          functions: 85,
          lines: 85,
        },
        'packages/mock-yalidine/src/**/*.ts': {
          statements: 85,
          branches: 85,
          functions: 85,
          lines: 85,
        },
      },
    },
  },
});
