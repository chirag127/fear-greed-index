import { Fragment, useMemo, useState } from 'react';
import { EChart } from '../components/EChart';
import { Panel, Badge, Loading, ErrorBox, Freshness } from '../components/ui';
import { regimeBarOption, heatmapOption, lineOption, fmt, THEME } from '../lib/charts';
import { useIndex, useSeriesMany } from '../lib/useData';
import { align, bucketBy, correlationMatrix, forwardReturns, mean, pearson, pctChange } from '../lib/stats';
import type { Pt } from '../lib/stats';
import type { SeriesMeta } from '../lib/types';

const HORIZONS = [5, 10, 20, 60];

/** Fixed 0-100 zone buckets, only meaningful for sentiment composites. */
const ZONE_BUCKETS = [
  { label: 'Extreme Fear <25', test: (v: number) => v < 25 },
  { label: 'Fear 25–45', test: (v: number) => v >= 25 && v < 45 },
  { label: 'Neutral 45–55', test: (v: number) => v >= 45 && v < 55 },
  { label: 'Greed 55–75', test: (v: number) => v >= 55 && v < 75 },
  { label: 'Extreme Greed 75+', test: (v: number) => v >= 75 },
];

/**
 * For any non-sentiment signal (VIX, P/E, breadth ratio) fixed 0-100 bands are
 * meaningless, so bucket on the series' own quintiles instead. This makes the
 * event study usable for anything, and it is the statistically safer default —
 * it never produces an empty bucket the way fixed bands can.
 */
function quantileBuckets(vals: number[]) {
  const s = [...vals].filter(Number.isFinite).sort((a, b) => a - b);
  if (s.length < 25) return ZONE_BUCKETS;
  const cut = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  const edges = [cut(0.2), cut(0.4), cut(0.6), cut(0.8)];
  const names = ['Q1 lowest', 'Q2', 'Q3', 'Q4', 'Q5 highest'];
  return names.map((label, i) => ({
    label,
    test: (v: number) => {
      if (i === 0) return v <= edges[0];
      if (i === 4) return v > edges[3];
      return v > edges[i - 1] && v <= edges[i];
    },
  }));
}

const HEAT_IDS = [
  'mmi',
  'cnn-fng',
  'crypto-fng',
  'india-vix',
  'nifty50-pe',
  'nifty50-level',
  'nifty500-ad-ratio',
  'fii-net',
  'dii-net',
  'nifty-smallcap250-pe',
];

export default function Analytics() {
  const { data: index, error, loading } = useIndex();
  // Default to CNN rather than the MMI: the MMI has no public history endpoint,
  // so it only accumulates one point per trading day and cannot support a study
  // until enough has built up. CNN ships ~252 days in a single response.
  const [signalId, setSignalId] = useState('cnn-fng');

  const byId = useMemo(() => {
    const m = new Map<string, SeriesMeta>();
    for (const s of index?.series ?? []) m.set(s.id, s);
    return m;
  }, [index]);

  const needed = useMemo(
    () => [...new Set([signalId, 'nifty50-level', ...HEAT_IDS])].filter((id) => !index || byId.has(id)),
    [signalId, index, byId],
  );
  const files = useSeriesMany(needed);

  const signal = files[signalId]?.points ?? [];
  const nifty = files['nifty50-level']?.points ?? [];

  const signalMeta = byId.get(signalId);
  const buckets = useMemo(() => {
    // Sentiment composites keep their published zone semantics; everything else
    // buckets on its own quintiles.
    if (signalMeta?.kind === 'sentiment') return ZONE_BUCKETS;
    return quantileBuckets(signal.map((p) => p[1]));
  }, [signalMeta, signal]);

  const study = useMemo(() => {
    if (signal.length < 30 || nifty.length < 30) return null;
    return HORIZONS.map((h) => {
      const fwd = forwardReturns(nifty, h);
      return { h, buckets: bucketBy(signal, fwd, buckets) };
    });
  }, [signal, nifty, buckets]);

  /** Correlate today's signal with the next N-day Nifty return, for N = 1..60. */
  const leadLag = useMemo((): Pt[] => {
    if (signal.length < 40 || nifty.length < 40) return [];
    const out: Pt[] = [];
    for (let h = 1; h <= 60; h++) {
      const fwd = forwardReturns(nifty, h);
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [d, v] of signal) {
        const r = fwd.get(d);
        if (r !== undefined) {
          xs.push(v);
          ys.push(r);
        }
      }
      const r = pearson(xs, ys);
      // x-axis is "days ahead" but the chart component wants a date-like key.
      out.push([String(h).padStart(2, '0'), Number.isFinite(r) ? r : 0]);
    }
    return out;
  }, [signal, nifty]);

  const heat = useMemo(() => {
    const m: Record<string, Pt[]> = {};
    for (const id of HEAT_IDS) {
      const f = files[id];
      if (f?.points.length) m[id] = f.points;
    }
    if (Object.keys(m).length < 3) return null;
    const { ids, matrix } = correlationMatrix(m);
    return { ids, matrix, labels: ids.map((i) => byId.get(i)?.short ?? i) };
  }, [files, byId]);

  if (loading) return <Loading label="Loading catalogue" />;
  if (error) return <ErrorBox message={error} />;
  if (!index) return null;

  const meta = signalMeta;
  // Only series with enough observations can support a study at all.
  const signalChoices = index.series.filter((s) => s.points >= 60).sort((a, b) => b.points - a.points);
  const thin = index.series.filter((s) => s.points < 60);

  return (
    <div className="fade-in space-y-4">
      <Panel
        title="Do sentiment extremes actually predict Nifty returns?"
        subtitle="Every historic observation is bucketed by the sentiment reading on that day, then matched to the Nifty's subsequent return. This is the honest test of whether a fear/greed signal is tradeable — not a backtest, an event study."
        right={
          <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
            signal
            <select
              value={signalId}
              onChange={(e) => setSignalId(e.target.value)}
              className="num max-w-[260px] rounded-lg border border-[var(--color-hair)] bg-black/40 px-2 py-1.5 text-[11px] text-[var(--color-ink)] outline-none focus:border-[var(--color-amber)]/50"
            >
              {signalChoices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.short} · {s.points} pts
                </option>
              ))}
            </select>
          </label>
        }
      >
        {!study ? (
          <p className="text-[12px] text-[var(--color-muted)]">
            Need at least 30 overlapping observations of {meta?.short} and the Nifty to run this study. Currently{' '}
            {signal.length} and {nifty.length}. The MMI series only accumulates one observation per trading day, so this
            fills in as the collector runs.
          </p>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              {study.map((s) => (
                <div key={s.h}>
                  <div className="mb-1.5 text-[10px] uppercase tracking-wider text-[var(--color-faint)]">
                    Forward {s.h}-day return
                  </div>
                  <EChart option={regimeBarOption(s.buckets, '%')} height={188} />
                </div>
              ))}
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-[9px] uppercase tracking-wider text-[var(--color-faint)]">
                    <th className="pb-2 font-medium">Zone</th>
                    {HORIZONS.map((h) => (
                      <th key={h} colSpan={3} className="pb-2 text-center font-medium">
                        {h}-day forward
                      </th>
                    ))}
                  </tr>
                  <tr className="text-[9px] uppercase tracking-wider text-[var(--color-faint)]">
                    <th />
                    {HORIZONS.map((h) => (
                      <Fragment key={h}>
                        <th className="pb-1 text-right font-medium">n</th>
                        <th className="pb-1 text-right font-medium">mean</th>
                        <th className="pb-1 text-right font-medium">win</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody className="num">
                  {buckets.map((_, bi) => (
                    <tr key={bi} className="border-t border-[var(--color-hair)]">
                      <td className="py-1.5 font-sans text-[var(--color-muted)]">{buckets[bi].label}</td>
                      {study.map((s) => {
                        const b = s.buckets[bi];
                        return (
                          <Fragment key={s.h}>
                            <td className="py-1.5 text-right text-[var(--color-faint)]">{b.n}</td>
                            <td
                              className="py-1.5 text-right font-medium"
                              style={{ color: b.mean > 0 ? THEME.up : b.mean < 0 ? THEME.down : THEME.muted }}
                            >
                              {b.n ? b.mean.toFixed(2) + '%' : '—'}
                            </td>
                            <td className="py-1.5 text-right text-[var(--color-muted)]">
                              {b.n ? b.winRate.toFixed(0) + '%' : '—'}
                            </td>
                          </Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-faint)]">
              Small <span className="num">n</span> values are noise, not signal. Treat any row with fewer than ~30
              observations as anecdote. Nothing here accounts for transaction costs or taxes.
              {meta?.kind !== 'sentiment' && ' Buckets are quintiles of this signal\u2019s own distribution.'}
              {thin.length > 0 && ` ${thin.length} series are still accumulating history and cannot be studied yet.`}
            </p>
          </>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Lead–lag: where is the signal strongest?"
          subtitle={`Correlation between the ${meta?.short ?? 'signal'} reading and the Nifty's forward return, 1 to 60 trading days ahead. A peak far from zero means the signal has predictive content at that horizon.`}
        >
          {leadLag.length ? (
            <EChart
              option={lineOption(
                {
                  id: 'leadlag',
                  title: 'Lead-lag correlation',
                  short: 'r',
                  group: 'sentiment',
                  market: 'india',
                  kind: 'line',
                  unit: 'ratio',
                  decimals: 3,
                  cadence: 'daily',
                  source: 'derived',
                  sourceUrl: '',
                  description: '',
                  points: leadLag.length,
                  first: leadLag[0][0],
                  last: '60',
                  lastValue: leadLag[leadLag.length - 1][1],
                  zone: null,
                  baseline: 0,
                } as SeriesMeta,
                leadLag,
              )}
              height={260}
            />
          ) : (
            <p className="text-[12px] text-[var(--color-muted)]">Not enough overlap yet.</p>
          )}
        </Panel>

        <Panel
          title="Cross-series correlation"
          subtitle="Pearson r on daily percent changes. Use this to check whether two indicators are genuinely independent or restating each other."
          right={heat ? <Badge>{heat.ids.length} series</Badge> : null}
        >
          {heat ? (
            <EChart option={heatmapOption(heat.ids, heat.matrix, heat.labels)} height={330} />
          ) : (
            <p className="text-[12px] text-[var(--color-muted)]">Loading correlation inputs…</p>
          )}
        </Panel>
      </div>

      <Panel title="Input coverage" subtitle="Analytics are only as good as the overlap between series.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {needed.map((id) => {
            const m = byId.get(id);
            const f = files[id];
            if (!m) return null;
            return (
              <div key={id} className="rounded-lg border border-[var(--color-hair)] bg-black/20 px-2.5 py-2">
                <div className="truncate text-[10px] text-[var(--color-muted)]">{m.short}</div>
                <div className="num mt-0.5 text-[12px] font-semibold text-[var(--color-ink)]">
                  {f?.points.length ?? 0} pts
                </div>
                <Freshness last={m.last} />
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

export { align, mean, pctChange, fmt };
