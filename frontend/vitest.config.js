import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // Use jsdom so React components can render with a real DOM
    environment: 'jsdom',
    // Run this file before every test suite to set up jest-dom matchers
    setupFiles: ['./src/setupTests.js'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['node_modules/', 'src/setupTests.js'],
    },
  },
})
