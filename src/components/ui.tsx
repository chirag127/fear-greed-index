import type { ReactNode } from 'react';
import { THEME, fmt, unitSuffix } from '../lib/charts';
import type { SeriesMeta } from '../lib/types';

export function Panel({
  title,
  subtitle,
  right,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {(title || right) && (
        <header className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          {/* `min-w-[55%]` plus `flex-wrap` is the load-bearing part. A control in
              the `right` slot sizes itself to its widest content - a <select>
              grows to fit its longest option, for instance - and with a plain
              `justify-between` row that control silently ate the subtitle's
              width, wrapping it to one word per line. Reserving a majority of
              the row for the text forces such a control onto its own line
              instead of crushing the prose beside it. */}
          <div className="min-w-[55%] flex-1 basis-0">
            {title && <h3 className="truncate text-[13px] font-semibold tracking-wide text-[var(--color-ink)]">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-[11px] leading-snug text-[var(--color-faint)]">{subtitle}</p>}
          </div>
          {right && <div className="max-w-full shrink-0">{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, color, title }: { children: ReactNode; color?: string; title?: string }) {
  const c = color ?? THEME.muted;
  return (
    <span
      title={title}
      className="num inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
      style={{ background: c + '1f', color: c, border: `1px solid ${c}33` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c }} />
      {children}
    </span>
  );
}

/** Big-number stat with a signed delta. */
export function Stat({
  label,
  value,
  decimals = 2,
  unit,
  delta,
  deltaDecimals,
  deltaLabel,
  color,
}: {
  label: string;
  value: number | null;
  decimals?: number;
  unit?: string;
  delta?: number | null;
  /**
   * Precision for the delta, which is often a different quantity to the value.
   * A Nifty level needs 0 decimals but its percent change needs 2: sharing one
   * setting rounded a +0.43% move to a flat "0%" on the headline card.
   */
  deltaDecimals?: number;
  deltaLabel?: string;
  color?: string;
}) {
  const dir = delta == null ? 0 : Math.sign(delta);
  const deltaColor = dir > 0 ? THEME.up : dir < 0 ? THEME.down : THEME.muted;
  const dDecimals = deltaDecimals ?? (deltaLabel === '%' ? 2 : decimals);
  return (
    <div className="card p-3.5">
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-faint)]">{label}</div>
      <div className="num mt-1.5 text-[26px] font-bold leading-none" style={{ color: color ?? THEME.text }}>
        {fmt(value, decimals)}
        {unit && <span className="ml-0.5 text-sm font-medium text-[var(--color-muted)]">{unitSuffix(unit)}</span>}
      </div>
      {delta != null && (
        <div className="num mt-1.5 text-[11px]" style={{ color: deltaColor }}>
          {dir > 0 ? '▲' : dir < 0 ? '▼' : '■'} {Math.abs(delta).toFixed(dDecimals)}
          {deltaLabel && <span className="ml-1 text-[var(--color-faint)]">{deltaLabel}</span>}
        </div>
      )}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-10 text-[12px] text-[var(--color-muted)]">
      <span className="size-3.5 animate-spin rounded-full border-2 border-[var(--color-hair-2)] border-t-[var(--color-amber)]" />
      {label}…
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="card border-[var(--color-fear)]/40 p-5">
      <div className="text-[12px] font-semibold text-[var(--color-fear)]">Could not load data</div>
      <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[var(--color-muted)]">
        {message}
      </pre>
      <p className="mt-2 text-[11px] text-[var(--color-faint)]">
        The dashboard reads static JSON. Check that the data API is reachable, or set{' '}
        <code className="num text-[var(--color-amber)]">VITE_API_BASE</code> to a mirror.
      </p>
    </div>
  );
}

/** Shows how stale a series is, in a human-readable and colour-coded way. */
export function Freshness({ last }: { last: string }) {
  const days = Math.round((Date.now() - new Date(last + 'T00:00:00Z').getTime()) / 86400000);
  const tone = days <= 1 ? THEME.greed : days <= 4 ? THEME.accent : THEME.fear;
  return (
    <span className="num text-[10px]" style={{ color: tone }} title={`Newest point: ${last}`}>
      {days <= 0 ? 'today' : days === 1 ? '1d ago' : `${days}d ago`}
    </span>
  );
}

export function MiniStat({ meta, points }: { meta: SeriesMeta; points: number }) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-[var(--color-faint)]">
      <span className="num">{points} pts</span>
      <span className="opacity-40">·</span>
      <span className="truncate">{meta.source}</span>
    </div>
  );
}
