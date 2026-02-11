import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'dist/**',
        'dist-electron/**',
        'dist-electron-build/**',
        'electron/**',
        'src/types/**',
        '**/*.d.ts',
      ],
    },
  },
})
