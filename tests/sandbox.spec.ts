import { test, expect } from "@playwright/test";

// These tests assume the app is running at BASE_URL (set via
// playwright.config.ts or the PLAYWRIGHT_TEST_BASE_URL env var) —
// either a local dev server or the deployed Cloudflare Pages URL.

test.describe("QA Test | Operational Control Sandbox", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("loads with a balanced grid and no alert", async ({ page }) => {
    await expect(page.getByTestId("wind-farm-actual-gen")).toHaveText("25.0 MW");
    await expect(page.getByTestId("grid-balance-display")).toContainText("Balanced");
    await expect(page.getByTestId("imbalance-alert-banner")).toHaveCount(0);
  });

  test("triggering a wind drop fault raises the critical alert", async ({ page }) => {
    await page.getByTestId("trigger-fault-btn").click();

    await expect(page.getByTestId("wind-farm-actual-gen")).toHaveText("2.0 MW");
    await expect(page.getByTestId("grid-balance-display")).toContainText("Imbalance Exposure");
    await expect(page.getByTestId("imbalance-alert-banner")).toBeVisible();
    await expect(page.getByTestId("imbalance-alert-banner")).toContainText(
      "CRITICAL ALERT: Supply Position Imbalance Detected - Action Required"
    );
  });

  test("a minor within-tolerance fluctuation does NOT raise the alert", async ({ page }) => {
    // This is the negative-path assertion: it proves the alert is a
    // derived condition (|actual - expected| > threshold), not a
    // side-effect wired directly to the fault button.
    await page.getByTestId("trigger-minor-btn").click();

    await expect(page.getByTestId("wind-farm-actual-gen")).toHaveText("23.5 MW");
    await expect(page.getByTestId("grid-balance-display")).toContainText("Balanced");
    await expect(page.getByTestId("imbalance-alert-banner")).toHaveCount(0);
  });

  test("reset sandbox clears the fault and the alert disappears as a consequence", async ({
    page,
  }) => {
    await page.getByTestId("trigger-fault-btn").click();
    await expect(page.getByTestId("imbalance-alert-banner")).toBeVisible();

    await page.getByTestId("reset-sandbox-btn").click();

    await expect(page.getByTestId("wind-farm-actual-gen")).toHaveText("25.0 MW");
    await expect(page.getByTestId("grid-balance-display")).toContainText("Balanced");
    await expect(page.getByTestId("imbalance-alert-banner")).toHaveCount(0);
  });

  test("commercial client portfolio renders with a data source badge", async ({ page }) => {
    const table = page.getByTestId("client-portfolio-table");
    await expect(table).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(4);

    const badge = page.getByTestId("client-data-source-badge");
    await expect(badge).toBeVisible();
    // Accepts either outcome — the badge should never be stuck on
    // "Loading…", and the table must never be empty regardless of
    // whether the live Google Sheets fetch succeeded.
    await expect(badge).not.toHaveText("Loading…");
  });

  test("defaults to Preston 2 Wind Farm as the fault simulator target", async ({ page }) => {
    await expect(page.getByTestId("fault-target-label")).toContainText("Preston 2 Wind Farm");
  });

  test("selecting the solar asset targets it instead of the wind farm", async ({ page }) => {
    await page.getByTestId("asset-row-solar").click();
    await expect(page.getByTestId("fault-target-label")).toContainText("Lytham Solar Rays");

    await page.getByTestId("trigger-fault-btn").click();

    // The solar asset's delivered volume drops, the wind farm's does not.
    await expect(page.getByTestId("solar-actual-gen")).not.toHaveText("21.0 MW");
    await expect(page.getByTestId("wind-farm-actual-gen")).toHaveText("25.0 MW");
    await expect(page.getByTestId("imbalance-alert-banner")).toBeVisible();
  });

  test("reset restores both assets regardless of which was last selected", async ({ page }) => {
    await page.getByTestId("asset-row-solar").click();
    await page.getByTestId("trigger-fault-btn").click();
    await expect(page.getByTestId("imbalance-alert-banner")).toBeVisible();

    await page.getByTestId("reset-sandbox-btn").click();

    await expect(page.getByTestId("wind-farm-actual-gen")).toHaveText("25.0 MW");
    await expect(page.getByTestId("solar-actual-gen")).toHaveText("21.0 MW");
    await expect(page.getByTestId("imbalance-alert-banner")).toHaveCount(0);
  });
});
