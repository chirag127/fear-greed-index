// End-to-end smoke test. A green `vite build` proves the code compiles; it says
// nothing about whether ECharts actually renders, or whether a bad prop blows up
// at runtime. This drives a real browser and fails on console errors.
//
// Usage:  node tests/smoke.mjs [baseUrl]
// Default base URL expects `pnpm dev --port 5273` to be running.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5273/fear-greed-index/';
// Repo-relative by default so the same path works locally and on a Linux CI
// runner; override with SHOT_DIR when you want the artefacts elsewhere.
const SHOTS = process.env.SHOT_DIR ?? 'tests/__shots__';

const TABS = ['Overview', 'Explore', 'Compare', 'Analytics'];

/**
 * Minimum canvases each tab must render.
 *
 * Explore is the important one: it is the product requirement ("50 graphs and
 * charts"). It renders one sparkline per series in the catalogue, and the grid
 * fills progressively, so it is given a longer settle before counting.
 * The others assert structure, not volume, since how many comparison panels
 * render legitimately depends on how much history has accumulated.
 */
const MIN_CANVAS = { Overview: 7, Explore: 50, Compare: 1, Analytics: 5 };

const failures = [];
const warnings = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Prefer an already-installed browser over Playwright's bundled download, so
 * the test runs without `npx playwright install` fetching ~150 MB. Falls back
 * to the bundled build when neither system channel is present.
 */
async function launch() {
  const attempts = [
    { channel: 'chrome', label: 'system Chrome' },
    { channel: 'msedge', label: 'system Edge' },
    { label: 'bundled chromium' },
  ];
  const errors = [];
  for (const a of attempts) {
    try {
      const browser = await chromium.launch(a.channel ? { channel: a.channel } : {});
      console.log(`browser: ${a.label}`);
      return browser;
    } catch (e) {
      errors.push(`${a.label}: ${e.message.split('\n')[0]}`);
    }
  }
  throw new Error(`No usable browser.\n${errors.join('\n')}`);
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });

  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('requestfailed', (r) => {
    const url = r.url();
    // Font/CDN blocks in a sandbox are not our bug.
    if (/fonts\.g|googleapis/.test(url)) return;
    failedRequests.push(`${url} :: ${r.failure()?.errorText}`);
  });

  console.log(`loading ${BASE}`);
  const res = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 });
  if (!res || !res.ok()) failures.push(`initial navigation returned ${res?.status()}`);

  // The app must have resolved a data API and rendered the catalogue.
  await page.waitForSelector('canvas', { timeout: 30000 }).catch(() => failures.push('no <canvas> appeared within 30s'));
  await sleep(2500);

  const summary = await page.evaluate(() => ({
    canvases: document.querySelectorAll('canvas').length,
    cards: document.querySelectorAll('button.card').length,
    h1: document.querySelector('h1')?.textContent ?? '',
    body: document.body.innerText.slice(0, 2000),
  }));

  console.log(`  h1: ${JSON.stringify(summary.h1)}`);
  console.log(`  canvases on load: ${summary.canvases}, cards: ${summary.cards}`);

  if (!summary.body.includes('Fear')) failures.push('page body does not contain "Fear" - app likely failed to render');
  if (/Could not load data/.test(summary.body)) failures.push('the app rendered its error state');

  // The headline must show real readings, not empty gauges.
  for (const needle of ['India · MMI', 'US · CNN', 'Crypto · F&G']) {
    if (!summary.body.includes(needle)) failures.push(`headline gauge missing: ${needle}`);
  }

  // ...and each must carry a 1-day delta. The MMI has no history endpoint, so it
  // cannot derive a prior value from its own series; it once rendered "prev -"
  // and "1d -" here, silently hiding the day's move on the most visible card.
  const headlineArea = summary.body.slice(0, 1200);
  const blankDeltas = (headlineArea.match(/1d\s*\u2014/g) ?? []).length;
  if (blankDeltas) failures.push(`${blankDeltas} headline gauge(s) show no 1-day delta`);
  const blankPrev = (headlineArea.match(/prev\s*\u2014/g) ?? []).length;
  if (blankPrev) failures.push(`${blankPrev} headline gauge(s) show no previous reading`);

  // Walk every tab.
  for (const tab of TABS) {
    const clicked = await page
      .getByRole('button', { name: tab, exact: true })
      .first()
      .click({ timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (!clicked) {
      failures.push(`could not click the "${tab}" tab`);
      continue;
    }
    // Explore loads ~80 series sequentially; give it room.
    await sleep(tab === 'Explore' ? 9000 : 3500);

    const stats = await page.evaluate(() => ({
      canvases: document.querySelectorAll('canvas').length,
      sizes: [...document.querySelectorAll('canvas')].map((c) => `${c.width}x${c.height}`),
      text: document.body.innerText,
    }));

    console.log(`  ${tab.padEnd(10)} canvases=${stats.canvases}`);

    if (stats.canvases < MIN_CANVAS[tab]) {
      failures.push(`${tab}: only ${stats.canvases} canvases, expected at least ${MIN_CANVAS[tab]}`);
    }

    // A collapsed canvas is the classic silent ECharts failure: the element
    // exists but has zero height, so nothing is visible.
    const zeroSized = stats.sizes.filter((s) => s.startsWith('0x') || s.endsWith('x0'));
    if (zeroSized.length) failures.push(`${tab}: ${zeroSized.length} zero-sized canvas(es)`);

    await page.screenshot({ path: `${SHOTS}/${tab.toLowerCase()}.png`, fullPage: tab !== 'Explore' });

    if (tab === 'Analytics') {
      for (const needle of ['Do sentiment extremes actually predict', 'Lead–lag', 'Correlation']) {
        if (!stats.text.includes(needle)) warnings.push(`Analytics missing section: ${needle}`);
      }
    }
    if (tab === 'Explore' && stats.text.includes('No series')) warnings.push('Explore rendered empty');
  }

  await browser.close();

  // ---------- report ----------
  if (failedRequests.length) {
    const unique = [...new Set(failedRequests)];
    // A blocked font or analytics beacon shouldn't fail the run.
    warnings.push(`${unique.length} failed request(s): ${unique.slice(0, 3).join(' | ')}`);
  }
  if (consoleErrors.length) {
    for (const e of [...new Set(consoleErrors)].slice(0, 8)) failures.push(`console error: ${e}`);
  }
  for (const e of [...new Set(pageErrors)].slice(0, 8)) failures.push(`uncaught page error: ${e}`);

  if (warnings.length) {
    console.log('\nwarnings:');
    for (const w of warnings) console.log('  ! ' + w);
  }
  if (failures.length) {
    console.error(`\n${failures.length} FAILURE(S):`);
    for (const f of failures) console.error('  x ' + f);
    process.exit(1);
  }
  console.log(`\nsmoke test passed - all ${TABS.length} tabs rendered. Screenshots in ${SHOTS}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
