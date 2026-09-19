# QA Test — Operational Control Sandbox

A self-contained demo application built to showcase **Playwright test
automation** 
against a realistic operational-data scenario for an
independent energy supplier: catching a PPA generation shortfall
before it becomes a commercial supply imbalance. The test suite runs
automatically on every push via GitHub Actions.

> **This is an isolated sandbox app with mock data.** It is not
> connected to any production system, real energy grid, or real
> commercial client. It exists purely to demonstrate automated UI
> testing against a believable, business-aligned scenario.

## The scenario

QA Test models an independent I&C (industrial & commercial) energy
supplier — a business that doesn't own generation assets itself, but
secures access to renewable power through long-term Power Purchase
Agreements (PPAs). It tracks **delivered volume** from two PPA
sources (Preston 2 Wind Farm and Lytham Solar Rays) against what was
**contracted**, and surfaces a **supply position imbalance alert**
when delivered volume deviates from contracted volume beyond a
tolerance threshold. A portfolio of commercial clients (a bakery, a
bank, a cold storage warehouse, and a retail park) represents the
businesses this supplier has committed to delivering power to.

If a PPA asset underdelivers against its contracted forecast — say, a
drop in wind — and the shortfall is significant rather than
negligible, the supplier has to buy the missing volume on the
wholesale/balancing market, typically at a premium, to still meet its
commitments to clients. That's the real commercial risk this sandbox
is modelling, and why an early, reliable alert has genuine business
value.

The point of the sandbox is to demonstrate that the imbalance alert
is a **derived condition**, not a scripted UI trick. Clicking a
"fault" button never directly opens the alert banner — it only
mutates the underlying delivered-volume data for whichever PPA asset
is currently selected. A separate calculation, running on every state
change, decides whether that data now represents an imbalance. This
means the alert would fire identically if the data changed by any
other means (a manual edit, a future API update, direct state
mutation) — the UI is a faithful reflection of the business rule, not
a special case wired to one button.

## Architecture

- **React + TypeScript**, single-page app, no backend required.
- **Continuous integration**: The Playwright suite runs automatically
  on every push via GitHub Actions - building the app for production
  and testing against that build not just the local dev server.
- **Selectable PPA assets**: click either row in the delivery tracker
  (Preston 2 Wind Farm or Lytham Solar Rays) to choose which asset the
  fault simulator targets. Defaults to Preston 2 on load.
- **Derived imbalance logic**: `computeImbalance()` is a pure function
  of PPA delivery state, aggregated across all assets. UI elements
  (the alert banner, the red "Imbalance Exposure" styling, the net
  supply position figure) all render conditionally off its output —
  never off a "was the button clicked" flag.
- **Commercial client data**: loads from a public Google Sheet via its
  CSV export endpoint on app start. If the fetch fails, times out, or
  the sheet isn't publicly shared, the app falls back to bundled
  static data automatically — the UI never shows a broken or empty
  state either way. A small badge in the client portfolio panel shows
  which source is currently active. Fallback client contracted-supply
  figures are reconciled to sum close to total PPA contracted volume
  (47.0 MW vs. 46.0 MW), so the two sides of the sandbox's numbers
  hold together under scrutiny.

## Running locally

This project uses [Bun](https://bun.sh) as the package manager and
runtime. `npm` works too if you prefer it — both read the same
`package.json`.

```bash
bun install
bun run dev
```

## Running the Playwright tests

```bash
bun install
bunx playwright install    # one-time — downloads browser binaries
bun run dev                # start the app (keep running in a separate terminal)
bunx playwright test       # runs against http://localhost:5173
```

To run the tests against a deployed URL instead of localhost:

```bash
PLAYWRIGHT_TEST_BASE_URL=https://your-deployed-url.pages.dev bunx playwright test
```

Other useful ways to run the suite:

```bash
bunx playwright test --ui              # step through tests interactively
SLOWMO=800 bunx playwright test --headed   # visible browser, paced for demoing
npx playwright show-report             # view the last HTML report
```

## Test coverage

| Test | What it proves |
|---|---|
| Loads balanced, no alert | Baseline state renders correctly |
| PPA shortfall on default asset → alert fires | The critical alert path works end-to-end |
| Minor within-tolerance fluctuation → **no** alert | The alert is threshold-driven, not click-driven — proves the derived-logic architecture, not just the happy path |
| Reset → alert clears | Recovery works, and clearing is a consequence of recalculated state, not a separate "hide" action |
| Client portfolio renders with a data source badge | The live/fallback data layer never leaves the UI empty or broken |
| Defaults to Preston 2 as fault target | The asset-selection feature has a sensible default, so the original single-asset demo flow needs no extra steps |
| Selecting the solar asset retargets the simulator | Proves the fault/imbalance logic is generic across assets, not hardcoded to the wind farm |
| Reset restores both assets | Recovery works correctly regardless of which asset was last selected |

## Deployment

Built with Vite; deploys cleanly as a static site to **Cloudflare
Pages** (connect the GitHub repo, build command `bun run build` or
`npm run build`, output directory `dist`). No server-side component
is required — the Google Sheets fetch happens client-side.

## Why this exists

Built as a demo to show how Playwright can catch a realistic,
business-relevant fault — an undetected PPA delivery shortfall
against a commercial supply commitment — live, in an isolated
sandbox that doesn't touch any production system.
