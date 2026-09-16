import { useMemo, useState } from 'react';
import { EChart } from '../components/EChart';
import { Panel, Badge, Loading, ErrorBox, Freshness } from '../components/ui';
import { SeriesCard } from '../components/SeriesCard';
import {
  lineOption,
  barOption,
  histogramOption,
  sparklineOption,
  fmt,
  unitSuffix,
  THEME,
} from '../lib/charts';
import { useIndex, useSeriesMany } from '../lib/useData';
import {
  zscore,
  percentileRank,
  drawdown,
  sma,
  histogram,
  mean,
  stdev,
  median,
  pctChange,
  pearson,
  align,
  values,
} from '../lib/stats';
import type { SeriesMeta } from '../lib/types';

const GROUP_ORDER = ['sentiment', 'volatility', 'valuation', 'breadth', 'flow', 'price', 'component'] as const;

export default function Explore({
  focusId,
  clearFocus,
}: {
  focusId: string | null;
  clearFocus: () => void;
}) {
  const { data: index, error, loading } = useIndex();
  const [group, setGroup] = useState<string>('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(focusId);

  const shown = useMemo(() => {
    if (!index) return [];
    const needle = q.trim().toLowerCase();
    return index.series.filter((s) => {
      if (group !== 'all' && s.group !== group) return false;
      if (!needle) return true;
      return (
        s.id.includes(needle) ||
        s.title.toLowerCase().includes(needle) ||
        s.short.toLowerCase().includes(needle) ||
        s.description.toLowerCase().includes(needle)
      );
    });
  }, [index, group, q]);

  const ids = useMemo(() => shown.map((s) => s.id), [shown]);
  const files = useSeriesMany(ids);
  const loaded = Object.keys(files).length;

  const byId = useMemo(() => {
    const m = new Map<string, SeriesMeta>();
    for (const s of index?.series ?? []) m.set(s.id, s);
    return m;
  }, [index]);

  if (loading) return <Loading label="Loading catalogue" />;
  if (error) return <ErrorBox message={error} />;
  if (!index) return null;

  const active = openId ? byId.get(openId) : null;

  return (
    <div className="fade-in space-y-4">
      {/* filters */}
      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search 80 series…"
            className="num min-w-[200px] flex-1 rounded-lg border border-[var(--color-hair)] bg-black/25 px-3 py-2 text-[12px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-amber)]/50"
          />
          <div className="flex flex-wrap gap-1.5">
            {['all', ...GROUP_ORDER.filter((g) => index.groups[g])].map((g) => {
              const n = g === 'all' ? index.count : (index.groups[g] ?? 0);
              const on = group === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroup(g)}
                  className={`num rounded-lg border px-2.5 py-1.5 text-[10px] uppercase tracking-wider transition ${
                    on
                      ? 'border-[var(--color-amber)]/60 bg-[var(--color-amber)]/10 text-[var(--color-amber)]'
                      : 'border-[var(--color-hair)] text-[var(--color-muted)] hover:border-[var(--color-hair-2)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {g} <span className="opacity-50">{n}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-2 text-[10px] text-[var(--color-faint)]">
          <span className="num">
            {shown.length} series · {loaded} loaded
          </span>
          {loaded < shown.length && (
            <span className="size-2.5 animate-spin rounded-full border border-[var(--color-hair-2)] border-t-[var(--color-amber)]" />
          )}
        </div>
      </Panel>

      {/* detail drawer */}
      {active && <SeriesDetail meta={active} onClose={() => { setOpenId(null); clearFocus(); }} />}

      {/* grid — every card here is a chart */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {shown.map((meta) => (
          <SeriesCard
            key={meta.id}
            meta={meta}
            points={files[meta.id]?.points ?? null}
            selected={openId === meta.id}
            onSelect={(id) => setOpenId(id === openId ? null : id)}
          />
        ))}
      </div>
    </div>
  );
}

/** Full detail for one series: main chart plus four derived analytics charts. */
function SeriesDetail({ meta, onClose }: { meta: SeriesMeta; onClose: () => void }) {
  const files = useSeriesMany([meta.id]);
  const pts = files[meta.id]?.points ?? [];

  const derived = useMemo(() => {
    if (pts.length < 10) return null;
    const z = zscore(pts, 252);
    const pr = percentileRank(pts, 252);
    const dd = drawdown(pts);
    const ma = sma(pts, 50);
    const hist = histogram(pts, 24);
    const v = values(pts);
    return {
      z,
      pr,
      dd,
      ma,
      hist,
      stats: {
        n: pts.length,
        last: v[v.length - 1],
        mean: mean(v),
        median: median(v),
        sd: stdev(v),
        min: Math.min(...v),
        max: Math.max(...v),
        z: z[z.length - 1]?.[1] ?? 0,
        pct: pr[pr.length - 1]?.[1] ?? 0,
        dd: dd[dd.length - 1]?.[1] ?? 0,
        trend1m: pctChange(pts, Math.min(21, pts.length - 1)).at(-1)?.[1] ?? 0,
        trend1y: pctChange(pts, Math.min(252, pts.length - 1)).at(-1)?.[1] ?? 0,
      },
    };
  }, [pts]);

  const trendColor = (x: number) => (x > 0 ? THEME.up : x < 0 ? THEME.down : THEME.muted);

  return (
    <Panel
      title={meta.title}
      subtitle={meta.description}
      right={
        <div className="flex items-center gap-2">
          {meta.zone && <Badge color={meta.zone.color}>{meta.zone.label}</Badge>}
          <Freshness last={meta.last} />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--color-hair)] px-2 py-0.5 text-[10px] text-[var(--color-muted)] hover:border-[var(--color-hair-2)] hover:text-[var(--color-ink)]"
          >
            close
          </button>
        </div>
      }
    >
      {pts.length < 2 ? (
        <Loading label="Loading series" />
      ) : (
        <div className="space-y-4">
          <EChart option={lineOption(meta, pts, { overlays: derived?.ma.length ? [{ name: '50-day MA', points: derived.ma, color: '#4aa3e8', dashed: true }] : [] })} height={280} />

          {derived && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                {[
                  { l: 'Latest', v: fmt(derived.stats.last, meta.decimals) },
                  { l: 'Mean', v: fmt(derived.stats.mean, meta.decimals) },
                  { l: 'Median', v: fmt(derived.stats.median, meta.decimals) },
                  { l: 'Std dev', v: fmt(derived.stats.sd, meta.decimals) },
                  { l: 'Z-score (1y)', v: derived.stats.z.toFixed(2), c: trendColor(derived.stats.z) },
                  { l: 'Percentile (1y)', v: derived.stats.pct.toFixed(0) + '%' },
                  { l: '1-month', v: derived.stats.trend1m.toFixed(2) + '%', c: trendColor(derived.stats.trend1m) },
                  { l: '1-year', v: derived.stats.trend1y.toFixed(2) + '%', c: trendColor(derived.stats.trend1y) },
                  { l: 'Drawdown', v: derived.stats.dd.toFixed(2) + '%', c: THEME.down },
                  { l: 'Range', v: `${fmt(derived.stats.min, meta.decimals)}–${fmt(derived.stats.max, meta.decimals)}` },
                  { l: 'History', v: `${derived.stats.n}d` },
                  { l: 'Source', v: meta.source },
                ].map((s) => (
                  <div key={s.l} className="rounded-lg border border-[var(--color-hair)] bg-black/20 px-2.5 py-2">
                    <div className="text-[9px] uppercase tracking-wider text-[var(--color-faint)]">{s.l}</div>
                    <div className="num mt-0.5 truncate text-[13px] font-semibold" style={{ color: s.c ?? THEME.text }}>
                      {s.v}
                      {s.l === 'Latest' ? unitSuffix(meta.unit) : ''}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <Panel title="Rolling z-score (1y)" subtitle="How unusual today's reading is versus the past year.">
                  <EChart option={lineOption({ ...meta, decimals: 2, unit: 'ratio' }, derived.z)} height={168} />
                </Panel>
                <Panel title="Rolling percentile rank (1y)" subtitle="Share of the past year spent below this level.">
                  <EChart option={lineOption({ ...meta, decimals: 0, unit: 'pct', kind: 'line' }, derived.pr)} height={168} />
                </Panel>
                <Panel title="Drawdown from peak" subtitle="Distance below the running maximum, in percent.">
                  <EChart option={lineOption({ ...meta, decimals: 2, unit: 'pct', invert: true }, derived.dd)} height={168} />
                </Panel>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Distribution" subtitle="Histogram of all observed values. Tails are where the signal lives.">
                  <EChart option={histogramOption(meta, derived.hist.edges, derived.hist.counts)} height={196} />
                </Panel>
                <Panel title="Full history" subtitle={`${pts[0][0]} → ${pts[pts.length - 1][0]}`}>
                  <EChart option={lineOption(meta, pts)} height={196} />
                </Panel>
              </div>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

export { sparklineOption, pearson, align, barOption };
