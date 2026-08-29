import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: 0,
  use: {
    // Override with PLAYWRIGHT_TEST_BASE_URL to point at the deployed
    // Cloudflare Pages URL instead of a local dev server.
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:5173",
    trace: "on-first-retry",
    // Set SLOWMO=1000 (ms) as an env var to slow down actions for a
    // live demo — e.g. `SLOWMO=800 bunx playwright test --headed`.
    launchOptions: {
      slowMo: process.env.SLOWMO ? Number(process.env.SLOWMO) : 0,
    },
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
