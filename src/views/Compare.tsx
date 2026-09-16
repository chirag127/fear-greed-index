import { useMemo, useState } from 'react';
import { EChart } from '../components/EChart';
import { Panel, Badge, Loading, ErrorBox } from '../components/ui';
import { multiLineOption, fmt, THEME, SERIES_COLORS } from '../lib/charts';
import { useIndex, useSeriesMany } from '../lib/useData';
import { align, mean, pearson, pctChange, stdev, values } from '../lib/stats';
import type { SeriesMeta } from '../lib/types';

const PRESETS: { label: string; ids: string[] }[] = [
  { label: 'Three fear & greed indices', ids: ['mmi', 'cnn-fng', 'crypto-fng'] },
  { label: 'Sentiment vs volatility', ids: ['mmi', 'india-vix'] },
  { label: 'Valuation ladder', ids: ['nifty50-pe', 'nifty100-pe', 'nifty500-pe', 'nifty-midcap150-pe', 'nifty-smallcap250-pe'] },
  { label: 'Breadth collapse watch', ids: ['nifty50-ad-ratio', 'nifty100-ad-ratio', 'nifty500-ad-ratio'] },
  { label: 'Flows: FII vs DII', ids: ['fii-net-cum', 'dii-net-cum'] },
  { label: 'Cap-tier levels', ids: ['nifty50-level', 'nifty-midcap100-level', 'nifty-smallcap100-level'] },
];

export default function Compare() {
  const { data: index, error, loading } = useIndex();
  const [selected, setSelected] = useState<string[]>(PRESETS[0].ids);
  const [normalize, setNormalize] = useState(true);

  const byId = useMemo(() => {
    const m = new Map<string, SeriesMeta>();
    for (const s of index?.series ?? []) m.set(s.id, s);
    return m;
  }, [index]);

  const files = useSeriesMany(selected);

  const entries = useMemo(
    () =>
      selected
        .map((id) => ({ meta: byId.get(id), points: files[id]?.points ?? [] }))
        .filter((e): e is { meta: SeriesMeta; points: [string, number][] } => !!e.meta && e.points.length > 1),
    [selected, byId, files],
  );

  const zones = index?.zones ?? [];
  const allSentiment = entries.length > 0 && entries.every((e) => e.meta.kind === 'sentiment');

  const stats = useMemo(() => {
    return entries.map((e, i) => {
      const v = values(e.points);
      const ch = values(pctChange(e.points));
      return {
        meta: e.meta,
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        n: v.length,
        last: v[v.length - 1],
        mean: mean(v),
        sd: stdev(v),
        vol: stdev(ch) * Math.sqrt(252),
        first: e.points[0][0],
      };
    });
  }, [entries]);

  const pairs = useMemo(() => {
    const out: { a: string; b: string; r: number }[] = [];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        // Percent changes, not levels — levels correlate spuriously.
        const a = align(pctChange(entries[i].points), pctChange(entries[j].points));
        const r = pearson(a.map((x) => x.a), a.map((x) => x.b));
        out.push({ a: entries[i].meta.short, b: entries[j].meta.short, r: Number.isFinite(r) ? r : NaN });
      }
    }
    return out;
  }, [entries]);

  if (loading) return <Loading label="Loading catalogue" />;
  if (error) return <ErrorBox message={error} />;
  if (!index) return null;

  return (
    <div className="fade-in space-y-4">
      <Panel
        title="Build a comparison"
        subtitle="Pick any series to overlay. Sentiment indices share a 0–100 scale; everything else is rebased to 100 at the first common date so the shapes are honestly comparable."
        right={
          <button
            type="button"
            onClick={() => setNormalize((n) => !n)}
            disabled={allSentiment}
            className={`num rounded-lg border px-2.5 py-1 text-[10px] uppercase tracking-wider transition disabled:opacity-40 ${
              normalize
                ? 'border-[var(--color-amber)]/60 bg-[var(--color-amber)]/10 text-[var(--color-amber)]'
                : 'border-[var(--color-hair)] text-[var(--color-muted)]'
            }`}
          >
            {allSentiment ? 'native scale' : normalize ? 'rebased 100' : 'raw'}
          </button>
        }
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setSelected(p.ids.filter((id) => byId.has(id)))}
              className="rounded-lg border border-[var(--color-hair)] px-2.5 py-1 text-[10px] text-[var(--color-muted)] transition hover:border-[var(--color-hair-2)] hover:text-[var(--color-ink)]"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="max-h-[190px] overflow-y-auto rounded-lg border border-[var(--color-hair)] bg-black/20 p-2.5">
          <div className="flex flex-wrap gap-1.5">
            {index.series.map((s) => {
              const on = selected.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  title={s.title}
                  onClick={() =>
                    setSelected((cur) => (on ? cur.filter((x) => x !== s.id) : cur.length >= 8 ? cur : [...cur, s.id]))
                  }
                  className={`num rounded-md border px-2 py-1 text-[10px] transition ${
                    on
                      ? 'border-[var(--color-amber)]/60 bg-[var(--color-amber)]/10 text-[var(--color-amber)]'
                      : 'border-transparent bg-white/[0.03] text-[var(--color-faint)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  {s.short}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-2 text-[10px] text-[var(--color-faint)]">
          {selected.length} selected · max 8 · click a chip to toggle
          {/* A series with a single observation cannot be overlaid, so it is
              dropped from the chart. Saying so beats leaving the user to wonder
              why they picked three series and got two lines. */}
          {selected.length > entries.length && (
            <span className="ml-1 text-[var(--color-amber)]">
              · {selected.length - entries.length} not plotted yet (needs 2+ points of history)
            </span>
          )}
        </div>
      </Panel>

      {entries.length >= 2 ? (
        <>
          <Panel
            title="Overlay"
            subtitle={`${entries.length} series${normalize && !allSentiment ? ', rebased to 100' : ''}`}
            right={allSentiment ? <Badge color={THEME.amber}>0–100 native</Badge> : null}
          >
            <EChart option={multiLineOption(entries, { normalize: !allSentiment && normalize, zones })} height={380} />
          </Panel>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Statistics" subtitle="Annualised volatility is computed from daily percent changes (×√252).">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-[9px] uppercase tracking-wider text-[var(--color-faint)]">
                      <th className="pb-2 font-medium">Series</th>
                      <th className="pb-2 text-right font-medium">Latest</th>
                      <th className="pb-2 text-right font-medium">Mean</th>
                      <th className="pb-2 text-right font-medium">Std dev</th>
                      <th className="pb-2 text-right font-medium">Ann. vol</th>
                      <th className="pb-2 text-right font-medium">From</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    {stats.map((s) => (
                      <tr key={s.meta.id} className="border-t border-[var(--color-hair)]">
                        <td className="py-1.5 font-sans">
                          <span className="mr-1.5 inline-block size-2 rounded-sm align-middle" style={{ background: s.color }} />
                          {s.meta.short}
                        </td>
                        <td className="py-1.5 text-right">{fmt(s.last, s.meta.decimals)}</td>
                        <td className="py-1.5 text-right text-[var(--color-muted)]">{fmt(s.mean, s.meta.decimals)}</td>
                        <td className="py-1.5 text-right text-[var(--color-muted)]">{fmt(s.sd, s.meta.decimals)}</td>
                        <td className="py-1.5 text-right">{s.vol.toFixed(1)}%</td>
                        <td className="py-1.5 text-right text-[var(--color-faint)]">{s.first}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel
              title="Pairwise correlation"
              subtitle="Pearson r on daily percent changes. Near zero means the pair adds diversification; near ±1 means it is telling you the same thing twice."
            >
              <div className="space-y-1.5">
                {pairs.map((p) => {
                  const strong = Math.abs(p.r) > 0.6;
                  return (
                    <div key={`${p.a}-${p.b}`} className="flex items-center gap-3 text-[11px]">
                      <span className="w-[46%] truncate text-right text-[var(--color-muted)]">{p.a}</span>
                      <span className="text-[var(--color-faint)]">×</span>
                      <span className="w-[46%] truncate text-[var(--color-muted)]">{p.b}</span>
                      <span
                        className="num ml-auto w-14 text-right font-medium"
                        style={{ color: strong ? THEME.amber : THEME.muted }}
                      >
                        {Number.isFinite(p.r) ? p.r.toFixed(3) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        </>
      ) : (
        <Panel>
          <p className="text-[12px] text-[var(--color-muted)]">Select at least two series to compare.</p>
        </Panel>
      )}
    </div>
  );
}
