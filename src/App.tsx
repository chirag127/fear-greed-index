import { useCallback, useState } from 'react';
import Overview from './views/Overview';
import Explore from './views/Explore';
import Compare from './views/Compare';
import Analytics from './views/Analytics';
import { activeBase } from './lib/api';

type Tab = 'overview' | 'explore' | 'compare' | 'analytics';

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'overview', label: 'Overview', hint: 'Headline gauges, comparisons, valuation and breadth' },
  { id: 'explore', label: 'Explore', hint: 'Every series as a card, with derived analytics' },
  { id: 'compare', label: 'Compare', hint: 'Overlay any series against any other' },
  { id: 'analytics', label: 'Analytics', hint: 'Event study, lead-lag and correlation' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('overview');
  // Lets the Overview's breadth bars and cards deep-link into Explore's drawer.
  const [focusId, setFocusId] = useState<string | null>(null);

  const openSeries = useCallback((id: string) => {
    setFocusId(id);
    setTab('explore');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const clearFocus = useCallback(() => setFocusId(null), []);

  return (
    <div className="min-h-screen">
      <header className="bloom border-b border-[var(--color-hair)]">
        <div className="mx-auto max-w-[1600px] px-4 py-7 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
                  <rect width="32" height="32" rx="7" fill="#0f1420" />
                  <path
                    d="M7 21c3-9 6-9 9 0s6 9 9 0"
                    stroke="#e8b84b"
                    strokeWidth="2.6"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
                <h1 className="text-[19px] font-semibold tracking-tight text-[var(--color-ink)] sm:text-[22px]">
                  Fear &amp; Greed
                </h1>
              </div>
              <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-[var(--color-muted)]">
                India, US and crypto sentiment measured side by side, against NSE index valuation, market breadth and
                institutional flows.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-[var(--color-faint)]">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-hair)] px-2.5 py-1">
                <span className="size-1.5 animate-pulse rounded-full bg-[var(--color-greed)]" />
                live from static JSON
              </span>
              {activeBase() && (
                <a
                  href={`${activeBase()}/data/series/index.json`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="num hidden rounded-full border border-[var(--color-hair)] px-2.5 py-1 hover:text-[var(--color-ink)] sm:inline-block"
                >
                  API
                </a>
              )}
            </div>
          </div>

          <nav className="mt-5 flex flex-wrap gap-1" aria-label="Sections">
            {TABS.map((t) => {
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  title={t.hint}
                  onClick={() => {
                    setTab(t.id);
                    if (t.id !== 'explore') clearFocus();
                  }}
                  aria-current={on ? 'page' : undefined}
                  className={`rounded-lg px-3.5 py-2 text-[12px] font-medium transition ${
                    on
                      ? 'bg-[var(--color-amber)]/10 text-[var(--color-amber)] ring-1 ring-[var(--color-amber)]/40'
                      : 'text-[var(--color-muted)] hover:bg-white/[0.03] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
        {tab === 'overview' && <Overview onOpenSeries={openSeries} />}
        {tab === 'explore' && <Explore focusId={focusId} clearFocus={clearFocus} />}
        {tab === 'compare' && <Compare />}
        {tab === 'analytics' && <Analytics />}
      </main>

      <footer className="mt-8 border-t border-[var(--color-hair)]">
        <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-[11px] leading-relaxed text-[var(--color-faint)]">
            Data from Tickertape, CNN, alternative.me and NSE, collected hourly into static JSON by{' '}
            <a
              className="text-[var(--color-muted)] underline decoration-dotted hover:text-[var(--color-ink)]"
              href="https://github.com/chirag127/fear-greed-index-api"
              target="_blank"
              rel="noreferrer noopener"
            >
              fear-greed-index-api
            </a>
            . Build and hosting on GitHub Pages, free.
          </p>
          <p className="mt-2 text-[11px] text-[var(--color-faint)]">
            <strong className="text-[var(--color-muted)]">Not investment advice.</strong> Fear and greed indices are
            sentiment gauges built largely from price-derived inputs. A high or low reading alone has no reliable
            forward-return implication.
          </p>
        </div>
      </footer>
    </div>
  );
}
