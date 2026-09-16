import { useMemo } from 'react';
import { EChart } from '../components/EChart';
import { Panel, Badge, Stat, Loading, ErrorBox, Freshness } from '../components/ui';
import { gaugeOption, lineOption, buildComparison, barOption, heatColor, fmt, unitSuffix, THEME } from '../lib/charts';
import { useIndex, useLatest, useSeriesMany } from '../lib/useData';
import type { SeriesMeta, ZoneBand } from '../lib/types';

export default function Overview({ onOpenSeries }: { onOpenSeries: (id: string) => void }) {
  const { data: index, error, loading } = useIndex();
  const { data: latest } = useLatest();

  const byId = useMemo(() => {
    const m = new Map<string, SeriesMeta>();
    for (const s of index?.series ?? []) m.set(s.id, s);
    return m;
  }, [index]);

  // Everything the overview renders, in one batched load.
  const needed = useMemo(() => {
    if (!index) return [];
    const ids = new Set<string>(['mmi', 'cnn-fng', 'crypto-fng', 'india-vix', 'nifty50-level']);
    for (const c of index.comparisons) for (const id of c.ids) ids.add(id);
    return [...ids].filter((id) => byId.has(id));
  }, [index, byId]);

  const files = useSeriesMany(needed);
  const zones: ZoneBand[] = index?.zones ?? [];

  const headline = useMemo(() => {
    const pick = (id: string) => {
      const meta = byId.get(id);
      const f = files[id];
      if (!meta) return null;
      const pts = f?.points ?? [];
      const prev = pts.length > 1 ? pts[pts.length - 2][1] : null;
      return { meta, pts, prev };
    };
    return {
      mmi: pick('mmi'),
      cnn: pick('cnn-fng'),
      crypto: pick('crypto-fng'),
      vix: pick('india-vix'),
      nifty: pick('nifty50-level'),
    };
  }, [byId, files]);

  if (loading) return <Loading label="Loading catalogue" />;
  if (error) return <ErrorBox message={error} />;
  if (!index) return null;

  const h = latest?.headline;

  return (
    <div className="fade-in space-y-4">
      {/* ---------------- headline gauges ---------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        {[
          { key: 'mmi', data: headline.mmi, label: 'India · MMI' },
          { key: 'cnn-fng', data: headline.cnn, label: 'US · CNN' },
          { key: 'crypto-fng', data: headline.crypto, label: 'Crypto · F&G' },
        ].map(({ key, data, label }) => {
          if (!data) return null;
          const delta = data.prev != null ? data.meta.lastValue - data.prev : null;
          return (
            <Panel
              key={key}
              title={label}
              subtitle={data.meta.title}
              right={
                data.meta.zone ? (
                  <Badge color={data.meta.zone.color}>{data.meta.zone.label}</Badge>
                ) : (
                  <Freshness last={data.meta.last} />
                )
              }
            >
              <EChart option={gaugeOption(data.meta.lastValue, '', zones)} height={172} />
              <div className="mt-1 flex items-center justify-center gap-3 text-[10px] text-[var(--color-faint)]">
                <span className="num">
                  prev {fmt(h?.[key]?.previous ?? data.prev, data.meta.decimals)}
                </span>
                <span className="opacity-40">·</span>
                <span className="num">1d {delta == null ? '—' : (delta >= 0 ? '+' : '') + delta.toFixed(2)}</span>
                <span className="opacity-40">·</span>
                <Freshness last={data.meta.last} />
              </div>
            </Panel>
          );
        })}
      </div>

      {/* ---------------- stat strip ---------------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          label="India VIX"
          value={headline.vix?.meta.lastValue ?? null}
          decimals={2}
          delta={headline.vix?.prev != null ? (headline.vix?.meta.lastValue ?? 0) - headline.vix.prev : null}
          deltaLabel="1d"
        />
        <Stat
          label="Nifty 50"
          value={latest?.nse?.indices?.nifty50?.level ?? headline.nifty?.meta.lastValue ?? null}
          decimals={0}
          delta={latest?.nse?.indices?.nifty50?.changePct ?? null}
          deltaLabel="%"
        />
        <Stat label="Nifty 50 P/E" value={latest?.nse?.indices?.nifty50?.pe ?? null} decimals={2} unit="ratio" />
        <Stat
          label="FII net (₹Cr)"
          value={latest?.nse?.flows?.rows?.find((r) => r.category?.startsWith('FII'))?.net ?? null}
          decimals={0}
        />
        <Stat
          label="DII net (₹Cr)"
          value={latest?.nse?.flows?.rows?.find((r) => r.category === 'DII')?.net ?? null}
          decimals={0}
        />
      </div>

      {/* ---------------- MMI vs Nifty ---------------- */}
      {headline.mmi && headline.nifty && headline.nifty.pts.length > 1 && (
        <Panel
          title="Market Mood vs Nifty 50"
          subtitle="The core question: does sentiment lead price? Shaded bands are sentiment zones."
          right={<Badge color={THEME.amber}>{headline.mmi.pts.length} days</Badge>}
        >
          <EChart
            option={lineOption(headline.mmi.meta, headline.mmi.pts, {
              zones,
              overlays: [{ name: 'Nifty 50', points: headline.nifty.pts, color: '#4aa3e8' }],
            })}
            height={300}
          />
        </Panel>
      )}

      {/* ---------------- comparison groups ---------------- */}
      <div className="grid gap-4 xl:grid-cols-2">
        {index.comparisons.map((c) => {
          const entries = c.ids
            .map((id) => ({ meta: byId.get(id), points: files[id]?.points ?? [] }))
            .filter((e): e is { meta: SeriesMeta; points: [string, number][] } => !!e.meta && e.points.length > 1);
          if (entries.length < 2) return null;
          const allSameKind = entries.every((e) => e.meta.kind === entries[0].meta.kind);
          return (
            <Panel
              key={c.id}
              title={c.title}
              subtitle={c.description}
              right={<Badge>{allSameKind ? 'raw' : 'rebased to 100'}</Badge>}
            >
              <EChart option={buildComparison(entries, { zones })} height={252} />
            </Panel>
          );
        })}
      </div>

      {/* ---------------- flows ---------------- */}
      {['fii-net', 'dii-net'].map((id) => {
        const meta = byId.get(id);
        const pts = files[id]?.points ?? [];
        if (!meta || pts.length < 2) return null;
        return (
          <Panel key={id} title={meta.title} subtitle={meta.description} right={<Freshness last={meta.last} />}>
            <EChart option={barOption(meta, pts.slice(-120))} height={210} />
          </Panel>
        );
      })}

      {/* ---------------- valuation + breadth tables ---------------- */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Index Valuation" subtitle="P/E, P/B and dividend yield as published by NSE, with drawdown from 52-week high.">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-[9px] uppercase tracking-wider text-[var(--color-faint)]">
                  <th className="pb-2 font-medium">Index</th>
                  <th className="pb-2 text-right font-medium">Level</th>
                  <th className="pb-2 text-right font-medium">1d</th>
                  <th className="pb-2 text-right font-medium">P/E</th>
                  <th className="pb-2 text-right font-medium">P/B</th>
                  <th className="pb-2 text-right font-medium">DY</th>
                  <th className="pb-2 text-right font-medium">vs 52wH</th>
                </tr>
              </thead>
              <tbody className="num">
                {Object.entries(latest?.nse?.indices ?? {}).map(([slug, v]) => (
                  <tr key={slug} className="border-t border-[var(--color-hair)]">
                    <td className="py-1.5 font-sans text-[var(--color-muted)]">{v.name}</td>
                    <td className="py-1.5 text-right">{fmt(v.level, 0)}</td>
                    <td className="py-1.5 text-right" style={{ color: (v.changePct ?? 0) >= 0 ? THEME.up : THEME.down }}>
                      {v.changePct == null ? '—' : `${v.changePct >= 0 ? '+' : ''}${v.changePct}%`}
                    </td>
                    <td
                      className="py-1.5 text-right font-medium"
                      style={{ color: heatColor(v.pe, { min: 12, max: 40 }) }}
                    >
                      {fmt(v.pe, 2)}
                    </td>
                    <td className="py-1.5 text-right text-[var(--color-muted)]">{fmt(v.pb, 2)}</td>
                    <td className="py-1.5 text-right text-[var(--color-muted)]">{fmt(v.dy, 2)}%</td>
                    <td className="py-1.5 text-right" style={{ color: (v.pctFromYearHigh ?? 0) > -5 ? THEME.greed : THEME.muted }}>
                      {v.pctFromYearHigh == null ? '—' : `${v.pctFromYearHigh}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Market Breadth" subtitle="Advances vs declines across each index. Breadth diverging from price is the classic warning sign.">
          <div className="space-y-2">
            {Object.entries(latest?.nse?.breadth ?? {}).map(([slug, b]) => {
              const total = b.advances + b.declines || 1;
              const pct = (b.advances / total) * 100;
              const meta = byId.get(`${slug}-ad-ratio`);
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => meta && onOpenSeries(`${slug}-ad-net`)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-[var(--color-muted)]">{latest?.nse?.indices?.[slug]?.name ?? slug}</span>
                    <span className="num" style={{ color: b.net >= 0 ? THEME.up : THEME.down }}>
                      {b.net >= 0 ? '+' : ''}
                      {b.net} ({b.ratio?.toFixed(2) ?? '—'})
                    </span>
                  </div>
                  <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div style={{ width: `${pct}%`, background: THEME.greed }} />
                    <div style={{ width: `${100 - pct}%`, background: THEME.fear }} />
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* ---------------- provenance ---------------- */}
      <Panel title="Data Provenance" subtitle={`Snapshot as of ${latest?.asOf ?? '—'} · ${index.count} series · updated ${latest?.updated ? new Date(latest.updated).toLocaleString() : '—'}`}>
        <div className="flex flex-wrap gap-2">
          {Object.entries(latest?.sources ?? {}).map(([name, st]) => (
            <Badge key={name} color={st.ok ? THEME.greed : THEME.fear} title={st.error}>
              {name} {st.ok ? `${st.ms}ms` : 'failed'}
            </Badge>
          ))}
          {latest?.unavailable?.length ? <Badge color={THEME.faint}>{latest.unavailable.length} unavailable</Badge> : null}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-faint)]">
          Sources: Tickertape MMI, CNN Fear &amp; Greed, alternative.me crypto sentiment, NSE index valuation, breadth
          and FII/DII flows. All figures are informational and are <strong className="text-[var(--color-muted)]">not investment advice</strong>.
        </p>
      </Panel>
    </div>
  );
}

export { unitSuffix };
