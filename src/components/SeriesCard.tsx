import { useMemo } from 'react';
import { EChart } from './EChart';
import { sparklineOption, fmt, unitSuffix, THEME } from '../lib/charts';
import { Freshness } from './ui';
import type { Pt } from '../lib/stats';
import type { SeriesMeta } from '../lib/types';

interface Props {
  meta: SeriesMeta;
  points: Pt[] | null;
  onSelect?: (id: string) => void;
  selected?: boolean;
}

export function SeriesCard({ meta, points, onSelect, selected }: Props) {
  const option = useMemo(() => (points?.length ? sparklineOption(points, meta) : null), [points, meta]);

  const change = useMemo(() => {
    if (!points || points.length < 2) return null;
    const last = points[points.length - 1][1];
    const prev = points[points.length - 2][1];
    if (prev === 0) return null;
    return { abs: last - prev, pct: ((last - prev) / Math.abs(prev)) * 100 };
  }, [points]);

  const zoneColor = meta.kind === 'sentiment' ? (meta.zone?.color ?? THEME.muted) : undefined;
  const dirColor = change == null ? THEME.muted : change.abs > 0 ? THEME.up : change.abs < 0 ? THEME.down : THEME.muted;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(meta.id)}
      aria-pressed={selected}
      title={meta.description}
      className={`card card-hover group w-full p-3 text-left ${
        selected ? 'ring-1 ring-[var(--color-amber)]' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-[11px] font-medium leading-tight text-[var(--color-ink)]">{meta.short}</span>
        {meta.zone && (
          <span className="num shrink-0 text-[9px] uppercase tracking-wider" style={{ color: zoneColor }}>
            {meta.zone.label.replace('Extreme ', 'X-')}
          </span>
        )}
      </div>

      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="num text-[17px] font-semibold leading-none text-[var(--color-ink)]">
          {fmt(meta.lastValue, meta.decimals)}
        </span>
        <span className="text-[10px] text-[var(--color-faint)]">{unitSuffix(meta.unit)}</span>
        {change && (
          <span className="num ml-auto text-[10px]" style={{ color: dirColor }}>
            {change.pct >= 0 ? '+' : ''}
            {change.pct.toFixed(2)}%
          </span>
        )}
      </div>

      <div className="mt-2 -mx-1">
        {option ? (
          <EChart option={option} height={44} silent />
        ) : (
          <div className="h-[44px] animate-pulse rounded bg-white/[0.03]" />
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between">
        <span className="truncate text-[9px] uppercase tracking-wider text-[var(--color-faint)]">{meta.group}</span>
        <Freshness last={meta.last} />
      </div>
    </button>
  );
}
