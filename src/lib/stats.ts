export type Pt = [string, number];

export const values = (p: Pt[]) => p.map((x) => x[1]);
export const dates = (p: Pt[]) => p.map((x) => x[0]);

export function mean(a: number[]) {
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
}

export function stdev(a: number[]) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

export function median(a: number[]) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

/** Rolling z-score. `window` of 0 means "score against the full history". */
export function zscore(p: Pt[], window = 0): Pt[] {
  const v = values(p);
  const out: Pt[] = [];
  for (let i = 0; i < v.length; i++) {
    const from = window > 0 ? Math.max(0, i - window + 1) : 0;
    const slice = v.slice(from, i + 1);
    const sd = stdev(slice);
    out.push([p[i][0], sd === 0 ? 0 : (v[i] - mean(slice)) / sd]);
  }
  return out;
}

/** Rolling percentile rank (0-100) of the latest value within its window. */
export function percentileRank(p: Pt[], window = 0): Pt[] {
  const v = values(p);
  const out: Pt[] = [];
  for (let i = 0; i < v.length; i++) {
    const from = window > 0 ? Math.max(0, i - window + 1) : 0;
    const slice = v.slice(from, i + 1);
    const below = slice.filter((x) => x <= v[i]).length;
    out.push([p[i][0], (below / slice.length) * 100]);
  }
  return out;
}

/** Drawdown from running peak, in percent (always <= 0). */
export function drawdown(p: Pt[]): Pt[] {
  let peak = -Infinity;
  return p.map(([d, v]) => {
    peak = Math.max(peak, v);
    return [d, peak > 0 ? ((v - peak) / peak) * 100 : 0] as Pt;
  });
}

/** Simple moving average. */
export function sma(p: Pt[], window: number): Pt[] {
  const v = values(p);
  const out: Pt[] = [];
  for (let i = 0; i < v.length; i++) {
    if (i < window - 1) continue;
    out.push([p[i][0], mean(v.slice(i - window + 1, i + 1))]);
  }
  return out;
}

/** Period-over-period percent change. */
export function pctChange(p: Pt[], lag = 1): Pt[] {
  const out: Pt[] = [];
  for (let i = lag; i < p.length; i++) {
    const prev = p[i - lag][1];
    out.push([p[i][0], prev === 0 ? 0 : ((p[i][1] - prev) / Math.abs(prev)) * 100]);
  }
  return out;
}

/** Inner-joins two series on date. */
export function align(a: Pt[], b: Pt[]): { date: string; a: number; b: number }[] {
  const m = new Map(b.map(([d, v]) => [d, v]));
  const out: { date: string; a: number; b: number }[] = [];
  for (const [d, v] of a) {
    const w = m.get(d);
    if (w !== undefined) out.push({ date: d, a: v, b: w });
  }
  return out;
}

export function pearson(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return NaN;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? NaN : num / den;
}

/** Least-squares slope + intercept for a scatter. */
export function linreg(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const r = pearson(xs, ys);
  return { slope, intercept: my - slope * mx, r2: Number.isFinite(r) ? r * r : 0 };
}

export function correlationMatrix(series: Record<string, Pt[]>) {
  const ids = Object.keys(series);
  const out: number[][] = [];
  for (let i = 0; i < ids.length; i++) {
    const row: number[] = [];
    for (let j = 0; j < ids.length; j++) {
      if (i === j) {
        row.push(1);
        continue;
      }
      // Compare percent changes, not levels: two rising series correlate at
      // ~1 on levels regardless of any real relationship.
      const a = align(pctChange(series[ids[i]]), pctChange(series[ids[j]]));
      row.push(Number(pearson(a.map((x) => x.a), a.map((x) => x.b)).toFixed(3)));
    }
    out.push(row);
  }
  return { ids, matrix: out };
}

export function histogram(p: Pt[], bins = 24) {
  const v = values(p).filter(Number.isFinite);
  if (!v.length) return { edges: [] as number[], counts: [] as number[] };
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const width = (hi - lo) / bins || 1;
  const counts = new Array(bins).fill(0);
  for (const x of v) {
    const i = Math.min(bins - 1, Math.max(0, Math.floor((x - lo) / width)));
    counts[i]++;
  }
  return { edges: Array.from({ length: bins }, (_, i) => lo + i * width), counts, lo, hi };
}

/**
 * Forward returns for an event study: for each observation of `signal`, the
 * return of `target` over the next `horizon` observations.
 */
export function forwardReturns(target: Pt[], horizon: number): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i + horizon < target.length; i++) {
    const base = target[i][1];
    const fwd = target[i + horizon][1];
    if (base > 0) out.set(target[i][0], ((fwd - base) / base) * 100);
  }
  return out;
}

export function bucketBy(
  signal: Pt[],
  fwd: Map<string, number>,
  buckets: { label: string; test: (v: number) => boolean }[],
) {
  return buckets.map((b) => {
    const rets: number[] = [];
    for (const [d, v] of signal) {
      if (!b.test(v)) continue;
      const r = fwd.get(d);
      if (r !== undefined && Number.isFinite(r)) rets.push(r);
    }
    return {
      label: b.label,
      n: rets.length,
      mean: rets.length ? mean(rets) : 0,
      median: rets.length ? median(rets) : 0,
      winRate: rets.length ? (rets.filter((r) => r > 0).length / rets.length) * 100 : 0,
      stdev: stdev(rets),
    };
  });
}
