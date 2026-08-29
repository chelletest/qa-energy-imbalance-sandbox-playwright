# QA Test — Operational Control Sandbox

A self-contained demo application built to showcase **Playwright test
automation** against a realistic operational-data scenario: catching a
renewable energy generation shortfall before it becomes a commercial
imbalance.

> **This is an isolated sandbox app with mock data.** It is not
> connected to any production system, real energy grid, or real
> commercial client. It exists purely to demonstrate automated UI
> testing against a believable, business-aligned scenario.

## The scenario

QA Test tracks generation from a wind farm (Preston 2) against what
was expected, and surfaces a **grid imbalance alert** when actual
generation deviates from expected generation beyond a tolerance
threshold. A portfolio of commercial clients (a bakery, a bank, a
cold storage warehouse, and a retail park) represents the businesses
this generation is contractually committed to.

The point of the sandbox is to demonstrate that the imbalance alert
is a **derived condition**, not a scripted UI trick. Clicking a
"fault" button never directly opens the alert banner — it only
mutates the underlying generation data. A separate calculation,
running on every state change, decides whether that data now
represents an imbalance. This means the alert would fire identically
if the data changed by any other means (a manual edit, a future API
update, direct state mutation) — the UI is a faithful reflection of
the business rule, not a special case wired to one button.

## Architecture

- **React + TypeScript**, single-page app, no backend required.
- **Derived imbalance logic**: `computeImbalance()` is a pure function
  of generation state. UI elements (the alert banner, the red
  "Imbalance Exposure" styling, the balance figure) all render
  conditionally off its output — never off a "was the button
  clicked" flag.
- **Commercial client data**: loads from a public Google Sheet via its
  CSV export endpoint on app start. If the fetch fails, times out, or
  the sheet isn't publicly shared, the app falls back to bundled
  static data automatically — the UI never shows a broken or empty
  state either way. A small badge in the client portfolio panel shows
  which source is currently active.

## Running locally

```bash
npm install
npm run dev
```

## Running the Playwright tests

```bash
npm install
npx playwright install
npm run dev &          # start the app in the background
npx playwright test    # run against http://localhost:5173
```

To run the tests against a deployed URL instead of localhost:

```bash
PLAYWRIGHT_TEST_BASE_URL=https://your-deployed-url.pages.dev npx playwright test
```

## Test coverage

| Test | What it proves |
|---|---|
| Loads balanced, no alert | Baseline state renders correctly |
| Wind drop fault → alert fires | The critical alert path works end-to-end |
| Minor within-tolerance fluctuation → **no** alert | The alert is threshold-driven, not click-driven — proves the derived-logic architecture, not just the happy path |
| Reset → alert clears | Recovery works, and clearing is a consequence of recalculated state, not a separate "hide" action |
| Client portfolio renders with a data source badge | The live/fallback data layer never leaves the UI empty or broken |
| Defaults to Preston 2 as fault target | The asset-selection feature has a sensible default, so the original single-asset demo flow needs no extra steps |
| Selecting the solar asset retargets the simulator | Proves the fault/imbalance logic is generic across assets, not hardcoded to the wind farm |
| Reset restores both assets | Recovery works correctly regardless of which asset was last selected |

## Deployment

Built with Vite; deploys cleanly as a static site to **Cloudflare
Pages** (connect the GitHub repo, build command `npm run build`,
output directory `dist`). No server-side component is required — the
Google Sheets fetch happens client-side.

## Why this exists

Built as a demo to show how Playwright can catch a realistic,
business-relevant fault — an undetected generation shortfall against
a commercial supply commitment — live, in an isolated sandbox that
doesn't touch any production system.
