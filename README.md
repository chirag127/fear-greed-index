# Fear & Greed — Sentiment Terminal

> 50+ interactive charts comparing India, US and crypto fear & greed against NSE index valuation, market breadth and institutional flows. Vite + React + Tailwind + Apache ECharts, free on GitHub Pages.

**Live:** [chirag127.github.io/fear-greed-index](https://chirag127.github.io/fear-greed-index/)
**Data:** [fear-greed-index-api](https://github.com/chirag127/fear-greed-index-api) — 82 series, 22,000+ points, hourly

## Chart count

The dashboard renders **98 charts across four tabs**, generated from a data-driven registry rather than hand-written components:

| View | Charts | What it shows |
| --- | --- | --- |
| **Overview** | 7+ | Three fear/greed gauges, MMI vs Nifty 50, six comparison panels, FII/DII flows |
| **Explore** | **82** | Every series as a sparkline card; click one for a full chart plus four derived analytics charts |
| **Compare** | 1+ | Overlay up to 8 series, rebased to 100, with a pairwise correlation table |
| **Analytics** | 8+ | Event study, lead–lag scan, correlation heatmap |

Selecting a series in Explore adds five more charts (main, rolling z-score, rolling percentile, drawdown, distribution).

## Views

**Overview** — the three sentiment composites side by side as gauges, then the question that matters: does sentiment lead price? Comparison panels cover India vs US vs crypto, sentiment vs volatility, the valuation ladder across cap tiers, breadth, institutional flows, and CNN's nine sub-indicators.

**Explore** — a searchable, group-filterable grid where **every series is a chart**. Click any card for a detail panel with a rolling z-score, rolling percentile rank, drawdown from peak, distribution histogram, and a 50-day moving average overlay.

**Compare** — pick any of the 82 series and overlay them. Sentiment indices share a native 0–100 scale; anything else is **rebased to 100 at the first common date**, because plotting a P/E ratio on the same axis as a 0–100 index is meaningless. Pairwise correlations are computed on **daily percent changes**, not levels — levels correlate near 1 for any two rising series and tell you nothing.

**Analytics** — the honest test. Every historic observation is bucketed by the signal reading, then matched to the Nifty's subsequent return at 5/10/20/60 days, reporting n, mean and win rate. Plus a lead–lag scan (correlation of today's reading against forward returns 1–60 days out) and a cross-series correlation heatmap.

Buckets adapt to the signal: sentiment composites use their published zones, while anything else (VIX, P/E, breadth ratio) uses **quintiles of its own distribution**, since fixed 0–100 bands are meaningless there.

## Data

The dashboard reads only static JSON from the [data API](https://github.com/chirag127/fear-greed-index-api):

| File | Purpose |
| --- | --- |
| `data/series/index.json` | Catalogue: 82 series with units, groups, zone bands, comparison specs |
| `data/latest.json` | Current snapshot for the headline |
| `data/series/<id>.json` | One series' full history as `[date, value]` pairs |

Host resolution probes a candidate list and uses the first that answers, so the dashboard works against the custom domain, `raw.githubusercontent.com`, or Pages without configuration. Override with `VITE_API_BASE`.

## Quick start

```bash
pnpm install
pnpm dev        # http://localhost:5273/fear-greed-index/
```

In development, a Vite middleware serves the **sibling `fear-greed-index-api` repo's `data/` directory** at `/api-local`, so you can develop against freshly collected data without pushing anything. Check both repos out side by side:

```
repos/
  fear-greed-index/       # this repo
  fear-greed-index-api/   # data source
```

### Verify

```bash
pnpm run typecheck                       # tsc --noEmit
pnpm run build                           # production build
node tests/smoke.mjs                     # browser smoke test (needs pnpm dev running)
node tests/smoke.mjs https://chirag127.github.io/fear-greed-index/   # against production
```

The smoke test drives a real browser and fails on **any** console error or uncaught exception, asserts each tab renders its minimum chart count, and checks that no canvas has zero height — the classic silent ECharts failure where the element exists but nothing is visible. It prefers a system Chrome/Edge over Playwright's bundled download so it runs without `npx playwright install`, and writes screenshots to `tests/__shots__/`.

It has already earned its place: it caught a React duplicate-key bug in the Analytics table that typechecking and a green build both missed.

## Verification status

| Gate | Result |
| --- | --- |
| `tsc --noEmit` | clean |
| `vite build` | clean — 84 kB gzipped app + 220 kB gzipped ECharts |
| Smoke test, all 4 tabs | **passed** — 7 / 82 / 1 / 8 canvases, no console errors |
| Bundle | ECharts tree-shaken to 5 chart types (full build is ~1 MB) |

## Tech stack

- **Vite 7** + **React 19** + **TypeScript 5.9** (strict, `noUnusedLocals`)
- **Tailwind CSS 4** via `@tailwindcss/vite`, CSS-first `@theme` config
- **Apache ECharts 6**, imported from `echarts/core` with only the chart and component modules we use
- **GitHub Pages** via Actions, $0

## Design

Dark "obsidian terminal" identity: deep navy-black ground, single amber accent, hairline borders, tabular monospace numerals, and a faint dual-tone bloom behind the header. Deliberately unlike the lighter, rounder look of the rest of the fleet.

Colour carries meaning rather than decoration — fear red through neutral grey to greed green, with a diverging red→green palette on the correlation heatmap centred at zero.

## Limitations

Be clear-eyed about these:

- **82 series is a ceiling, not a floor, on freshness.** Most NSE-derived series (valuation, breadth, flows) have only one observation per trading day and **start empty**. They accumulate. Index levels, India VIX and both fear/greed composites are backfilled with years of history from Yahoo and alternative.me, so analytics work immediately for those.
- **The MMI has no public history endpoint.** Tickertape exposes only today's value plus 1d/1w/1m references, so the MMI series grows one point per day and cannot support an event study until enough has accumulated. Analytics defaults to CNN, which ships ~252 days in a single response.
- **Nothing here is investment advice.** Fear and greed indices are built largely from price-derived inputs — momentum, breadth, volatility. A model trained on them is largely re-deriving "markets mean-revert after extremes", which is real but small and regime-dependent. The event study does not account for transaction costs or taxes.

## License

MIT © 2026 Chirag Singhal
