import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  test: {
    // Grading tests run the bot over many levels; give them room on busy CI runners.
    testTimeout: 30_000,
  },
});
