import type { EChartsCoreOption } from 'echarts/core';
import type { SeriesMeta, ZoneBand } from './types';
import type { Pt } from './stats';

export const THEME = {
  bg: '#0a0e16',
  panel: '#0f1420',
  border: 'rgba(255,255,255,0.07)',
  grid: 'rgba(255,255,255,0.05)',
  text: '#e6eaf2',
  muted: '#8b97a8',
  faint: '#5a6478',
  accent: '#e8b84b',
  amber: '#e8b84b',
  fear: '#e8624a',
  greed: '#3fb98a',
  neutral: '#8b97a8',
  up: '#3fb98a',
  down: '#e8624a',
};

const FONT = 'Inter, system-ui, sans-serif';
const MONO = "'JetBrains Mono', ui-monospace, monospace";

/** Series colours for multi-series charts, in a deliberate order. */
export const SERIES_COLORS = [
  '#e8b84b',
  '#4aa3e8',
  '#3fb98a',
  '#e8624a',
  '#a78bfa',
  '#f472b6',
  '#38bdf8',
  '#fb923c',
  '#22d3ee',
  '#c084fc',
  '#84cc16',
  '#facc15',
];

const axisBase = {
  axisLine: { lineStyle: { color: THEME.border } },
  axisTick: { show: false },
  axisLabel: { color: THEME.muted, fontSize: 10, fontFamily: MONO },
  splitLine: { lineStyle: { color: THEME.grid } },
};

const tooltipBase = {
  backgroundColor: 'rgba(12,17,27,0.96)',
  borderColor: THEME.border,
  borderWidth: 1,
  textStyle: { color: THEME.text, fontSize: 11, fontFamily: MONO },
  extraCssText: 'backdrop-filter: blur(8px); border-radius: 8px;',
};

export function fmt(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_00_00_000) return (v / 1_00_00_000).toFixed(2) + 'Cr';
  if (abs >= 1_00_000) return (v / 1_00_000).toFixed(2) + 'L';
  if (abs >= 10_000) return v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return v.toFixed(decimals);
}

export function unitSuffix(unit: string): string {
  switch (unit) {
    case 'pct':
      return '%';
    case 'level':
      return '';
    case 'crore':
      return ' Cr';
    case 'ratio':
      return '×';
    default:
      return '';
  }
}

/** Colour a value according to how "hot" it is, honouring inverted scales. */
export function heatColor(value: number, meta: Pick<SeriesMeta, 'min' | 'max' | 'invert'>): string {
  const lo = meta.min ?? 0;
  const hi = meta.max ?? 100;
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo || 1)));
  return t < 0.35 ? THEME.fear : t < 0.65 ? THEME.neutral : THEME.greed;
}

function sentimentBands(zones: ZoneBand[]): unknown[] {
  let prev = 0;
  return zones.map((z) => {
    const top = z.lt === null ? 100 : z.lt;
    const band = [{ yAxis: prev, itemStyle: { color: z.color } }, { yAxis: top }];
    prev = top;
    return band;
  });
}

function zoneBandsFallback(): ZoneBand[] {
  return [
    { lt: 25, label: 'Extreme Fear', color: THEME.fear },
    { lt: 45, label: 'Fear', color: '#e8944a' },
    { lt: 55, label: 'Neutral', color: THEME.neutral },
    { lt: 75, label: 'Greed', color: THEME.greed },
    { lt: null, label: 'Extreme Greed', color: '#16a085' },
  ];
}

/** Headline 0-100 gauge with the fear→greed arc. */
export function gaugeOption(value: number, label: string, zones?: ZoneBand[]): EChartsCoreOption {
  const z = zones?.length ? zones : zoneBandsFallback();
  // Guard the arithmetic: a series with no reading yet would otherwise coerce
  // null to 0 and confidently render "Extreme Fear".
  const v = Number.isFinite(value) ? value : 50;
  // Colour the readout itself by the zone it falls in. Previously the number was
  // always white and only the arc underneath carried the reading, so a glance at
  // the figure told you nothing about whether it was fearful or greedy.
  const band = z.find((b) => v < (b.lt ?? 100)) ?? z[z.length - 1];
  return {
    backgroundColor: 'transparent',
    series: [
      {
        type: 'gauge',
        startAngle: 205,
        endAngle: -25,
        min: 0,
        max: 100,
        radius: '88%',
        center: ['50%', '58%'],
        // Four splits rather than the default ten: ten tick labels in a 172px
        // card collided with each other and with the arc.
        splitNumber: 4,
        progress: { show: false },
        axisLine: {
          lineStyle: {
            width: 12,
            color: z.map((b, i) => {
              const prev = i === 0 ? 0 : (z[i - 1].lt ?? 100);
              const top = b.lt ?? 100;
              return [(top - prev) / 100, b.color];
            }) as [number, string][],
          },
        },
        // The needle and its anchor were drawn straight through the value
        // readout, which made the number look struck through. The arc already
        // conveys position, so the needle is removed rather than merely nudged.
        pointer: { show: false },
        anchor: { show: false },
        axisTick: { show: false },
        splitLine: { distance: -20, length: 8, lineStyle: { color: 'rgba(255,255,255,0.4)', width: 1 } },
        axisLabel: { distance: -8, color: THEME.faint, fontSize: 9, fontFamily: MONO },
        title: { offsetCenter: [0, '30%'], color: THEME.muted, fontSize: 11, fontFamily: FONT },
        detail: {
          offsetCenter: [0, '-4%'],
          valueAnimation: true,
          formatter: (n: number) => n.toFixed(1),
          color: band.color,
          fontSize: 32,
          fontWeight: 700,
          fontFamily: MONO,
        },
        data: [{ value: v, name: label }],
      },
    ],
  };
}

/** Compact line for cards and the exploration grid. */
export function sparklineOption(points: Pt[], meta: SeriesMeta): EChartsCoreOption {
  const zone = meta.kind === 'sentiment';
  const color = zone && meta.lastValue != null ? (meta.zone?.color ?? THEME.accent) : meta.invert ? THEME.fear : THEME.accent;
  return {
    backgroundColor: 'transparent',
    grid: { left: 2, right: 2, top: 6, bottom: 2, containLabel: false },
    xAxis: { type: 'category', show: false, data: points.map((p) => p[0]), boundaryGap: false },
    yAxis: {
      type: 'value',
      show: false,
      scale: true,
      min: zone ? 0 : undefined,
      max: zone ? 100 : undefined,
    },
    series: [
      {
        type: 'line',
        data: points.map((p) => p[1]),
        showSymbol: false,
        smooth: 0.25,
        lineStyle: { width: 1.6, color },
        areaStyle: {
          opacity: 0.5,
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: color + '55' },
              { offset: 1, color: color + '00' },
            ],
          },
        },
      },
    ],
  };
}

/** Full single-series chart with axes, crosshair tooltip and optional zone shading. */
export function lineOption(
  meta: SeriesMeta,
  points: Pt[],
  opts: { zones?: ZoneBand[]; overlays?: { name: string; points: Pt[]; color?: string; dashed?: boolean }[]; height?: number } = {},
): EChartsCoreOption {
  const zone = meta.kind === 'sentiment';
  const color = zone ? (meta.zone?.color ?? THEME.accent) : meta.invert ? THEME.fear : THEME.accent;
  const overlays = opts.overlays ?? [];

  const markArea =
    zone && points.length
      ? {
          silent: true,
          itemStyle: { opacity: 0.09 },
          data: sentimentBands(opts.zones?.length ? opts.zones : zoneBandsFallback()),
        }
      : undefined;

  const multi = overlays.length > 0;
  const legend = multi ? { bottom: 0, textStyle: { color: THEME.muted, fontSize: 10, fontFamily: MONO }, icon: 'roundRect', itemWidth: 10, itemHeight: 3 } : undefined;

  return {
    backgroundColor: 'transparent',
    grid: { left: 8, right: 12, top: 18, bottom: multi ? 34 : 24, containLabel: true },
    legend,
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'cross', label: { backgroundColor: '#1c2431', color: THEME.text, fontFamily: MONO } },
      valueFormatter: (v: number) => fmt(v, meta.decimals) + unitSuffix(meta.unit),
    },
    xAxis: { type: 'category', boundaryGap: false, data: points.map((p) => p[0]), ...axisBase, splitLine: { show: false } },
    yAxis: {
      type: 'value',
      scale: !zone,
      min: zone ? 0 : undefined,
      max: zone ? 100 : undefined,
      ...axisBase,
      axisLabel: { ...axisBase.axisLabel, formatter: (v: number) => fmt(v, meta.decimals) },
    },
    dataZoom: points.length > 240 ? [{ type: 'inside' }, { type: 'slider', height: 14, bottom: multi ? 26 : 4, borderColor: THEME.border, fillerColor: 'rgba(232,184,75,0.10)', textStyle: { color: THEME.faint, fontSize: 9 }, handleStyle: { color: THEME.accent } }] : undefined,
    series: [
      {
        name: meta.short,
        type: 'line',
        data: points.map((p) => p[1]),
        showSymbol: false,
        symbolSize: 5,
        smooth: 0.15,
        lineStyle: { width: 1.8, color },
        itemStyle: { color },
        areaStyle: markArea
          ? undefined
          : {
              opacity: 0.8,
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: color + '33' },
                  { offset: 1, color: color + '00' },
                ],
              },
            },
        markArea,
        markLine:
          meta.baseline != null
            ? {
                silent: true,
                symbol: 'none',
                label: { formatter: String(meta.baseline), color: THEME.faint, fontSize: 9, fontFamily: MONO },
                lineStyle: { color: THEME.faint, type: 'dashed', width: 1 },
                data: [{ yAxis: meta.baseline }],
              }
            : undefined,
      },
      ...overlays.map((o, i) => ({
        name: o.name,
        type: 'line' as const,
        data: points.map(() => null as number | null).map((_, idx) => {
          const target = o.points.findIndex((p) => p[0] === points[idx]?.[0]);
          return target >= 0 ? o.points[target][1] : null;
        }),
        showSymbol: false,
        smooth: 0.15,
        lineStyle: { width: 1.4, color: o.color ?? SERIES_COLORS[i + 1], type: o.dashed ? 'dashed' : 'solid' },
        itemStyle: { color: o.color ?? SERIES_COLORS[i + 1] },
      })),
    ],
  };
}

/** Signed bar chart — the right shape for flows, wrong for levels. */
export function barOption(meta: SeriesMeta, points: Pt[]): EChartsCoreOption {
  return {
    backgroundColor: 'transparent',
    grid: { left: 8, right: 12, top: 18, bottom: 24, containLabel: true },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: number) => fmt(v, meta.decimals) + unitSuffix(meta.unit),
    },
    xAxis: { type: 'category', data: points.map((p) => p[0]), ...axisBase, splitLine: { show: false } },
    yAxis: { type: 'value', ...axisBase, axisLabel: { ...axisBase.axisLabel, formatter: (v: number) => fmt(v, meta.decimals) } },
    series: [
      {
        type: 'bar',
        data: points.map((p) => ({
          value: p[1],
          itemStyle: { color: p[1] >= 0 ? THEME.up : THEME.down, borderRadius: p[1] >= 0 ? [2, 2, 0, 0] : [0, 0, 2, 2] },
        })),
        barMaxWidth: 14,
      },
    ],
  };
}

/**
 * Multi-series comparison. `normalize` rebases every series to its first common
 * value at 100 — the only honest way to compare a P/E ratio against a 0-100 index.
 */
export function multiLineOption(
  entries: { meta: SeriesMeta; points: Pt[] }[],
  opts: { normalize?: boolean; zones?: ZoneBand[]; height?: number } = {},
): EChartsCoreOption {
  const normalize = opts.normalize ?? false;

  const prepared = entries.map((e, i) => {
    const color = SERIES_COLORS[i % SERIES_COLORS.length];
    let pts = e.points;
    if (normalize && pts.length) {
      const base = pts[0][1] || 1;
      pts = pts.map(([d, v]) => [d, (v / base) * 100] as Pt);
    }
    return { meta: e.meta, points: pts, color };
  });

  const dates = [...new Set(prepared.flatMap((p) => p.points.map((x) => x[0])))].sort();
  const idxOf = new Map(dates.map((d, i) => [d, i]));

  const showZones = opts.zones?.length && prepared.every((p) => p.meta.kind === 'sentiment');

  return {
    backgroundColor: 'transparent',
    grid: { left: 8, right: 12, top: 16, bottom: 52, containLabel: true },
    legend: {
      bottom: 0,
      textStyle: { color: THEME.muted, fontSize: 10, fontFamily: MONO },
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 3,
      inactiveColor: '#39424f',
    },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'cross', label: { backgroundColor: '#1c2431', color: THEME.text, fontFamily: MONO } },
      valueFormatter: (v: number) => (v == null ? '—' : v.toFixed(2)),
    },
    xAxis: { type: 'category', boundaryGap: false, data: dates, ...axisBase, splitLine: { show: false } },
    yAxis: { type: 'value', scale: !showZones, ...axisBase },
    dataZoom: dates.length > 260 ? [{ type: 'inside' }] : undefined,
    series: prepared.map((p) => {
      const arr: (number | null)[] = new Array(dates.length).fill(null);
      for (const [d, v] of p.points) {
        const i = idxOf.get(d);
        if (i !== undefined) arr[i] = v;
      }
      return {
        name: p.meta.short,
        type: 'line' as const,
        data: arr,
        showSymbol: false,
        connectNulls: true,
        smooth: 0.15,
        lineStyle: { width: 1.8, color: p.color },
        itemStyle: { color: p.color },
        markArea:
          showZones && p === prepared[0]
            ? { silent: true, itemStyle: { opacity: 0.07 }, data: sentimentBands(opts.zones!) }
            : undefined,
      };
    }),
  };
}

export function scatterOption(
  pts: { x: number; y: number; date: string }[],
  opts: { xLabel: string; yLabel: string; trend?: { slope: number; intercept: number } },
): EChartsCoreOption {
  const xs = pts.map((p) => p.x);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const trend = opts.trend;

  return {
    backgroundColor: 'transparent',
    grid: { left: 8, right: 16, top: 20, bottom: 34, containLabel: true },
    tooltip: {
      ...tooltipBase,
      trigger: 'item',
      formatter: (p: { data: [number, number, string] }) =>
        `${p.data[2]}<br/>${opts.xLabel}: <b>${p.data[0].toFixed(2)}</b><br/>${opts.yLabel}: <b>${p.data[1].toFixed(2)}%</b>`,
    },
    xAxis: { type: 'value', name: opts.xLabel, nameTextStyle: { color: THEME.faint, fontSize: 10 }, scale: true, ...axisBase },
    yAxis: { type: 'value', name: opts.yLabel, nameTextStyle: { color: THEME.faint, fontSize: 10 }, scale: true, ...axisBase },
    series: [
      {
        type: 'scatter',
        symbolSize: 5,
        data: pts.map((p) => [p.x, p.y, p.date]),
        itemStyle: { color: THEME.accent, opacity: 0.55 },
        emphasis: { itemStyle: { color: THEME.text, opacity: 1 } },
      },
      ...(trend
        ? [
            {
              type: 'line' as const,
              data: [
                [lo, trend.slope * lo + trend.intercept],
                [hi, trend.slope * hi + trend.intercept],
              ],
              symbol: 'none',
              lineStyle: { color: THEME.fear, width: 1.4, type: 'dashed' as const },
              tooltip: { show: false },
            },
          ]
        : []),
    ],
  };
}

/** Correlation heatmap. Diverging palette centred on zero. */
export function heatmapOption(ids: string[], matrix: number[][], labels: string[]): EChartsCoreOption {
  const data: [number, number, number][] = [];
  for (let i = 0; i < ids.length; i++) for (let j = 0; j < ids.length; j++) data.push([j, i, matrix[i][j]]);

  return {
    backgroundColor: 'transparent',
    grid: { left: 8, right: 16, top: 10, bottom: 56, containLabel: true },
    tooltip: {
      ...tooltipBase,
      formatter: (p: { data: [number, number, number] }) =>
        `${labels[p.data[1]]} × ${labels[p.data[0]]}<br/><b>${p.data[2].toFixed(3)}</b>`,
    },
    xAxis: { type: 'category', data: labels, ...axisBase, splitLine: { show: false }, axisLabel: { ...axisBase.axisLabel, rotate: 38, fontSize: 9 } },
    yAxis: { type: 'category', data: labels, ...axisBase, splitLine: { show: false }, axisLabel: { ...axisBase.axisLabel, fontSize: 9 } },
    visualMap: {
      min: -1,
      max: 1,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemWidth: 10,
      itemHeight: 90,
      textStyle: { color: THEME.muted, fontSize: 9, fontFamily: MONO },
      inRange: { color: ['#e8624a', '#1a2130', '#3fb98a'] },
    },
    series: [{ type: 'heatmap', data, label: { show: ids.length <= 8, color: THEME.text, fontSize: 9, fontFamily: MONO, formatter: (p: { data: [number, number, number] }) => p.data[2].toFixed(2) } }],
  };
}

export function histogramOption(meta: SeriesMeta, edges: number[], counts: number[]): EChartsCoreOption {
  const labels = edges.map((e, i) => `${fmt(e, meta.decimals)}–${fmt(edges[i + 1] ?? e, meta.decimals)}`);
  return {
    backgroundColor: 'transparent',
    grid: { left: 8, right: 16, top: 18, bottom: 40, containLabel: true },
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'category', data: labels, ...axisBase, splitLine: { show: false }, axisLabel: { ...axisBase.axisLabel, rotate: 40, fontSize: 9 } },
    yAxis: { type: 'value', ...axisBase },
    series: [
      {
        type: 'bar',
        data: counts.map((c, i) => ({ value: c, itemStyle: { color: i < counts.length / 3 ? THEME.fear : i > (2 * counts.length) / 3 ? THEME.greed : THEME.neutral, borderRadius: [2, 2, 0, 0] } })),
        barMaxWidth: 26,
      },
    ],
  };
}

export function regimeBarOption(
  buckets: { label: string; n: number; mean: number; winRate: number }[],
  label: string,
): EChartsCoreOption {
  return {
    backgroundColor: 'transparent',
    grid: { left: 8, right: 16, top: 22, bottom: 34, containLabel: true },
    tooltip: { ...tooltipBase, trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'category', data: buckets.map((b) => b.label), ...axisBase, splitLine: { show: false } },
    yAxis: { type: 'value', name: label, nameTextStyle: { color: THEME.faint, fontSize: 10 }, ...axisBase },
    series: [
      {
        type: 'bar',
        data: buckets.map((b) => ({
          value: Number(b.mean.toFixed(2)),
          itemStyle: { color: b.mean >= 0 ? THEME.up : THEME.down, borderRadius: b.mean >= 0 ? [2, 2, 0, 0] : [0, 0, 2, 2] },
        })),
        barMaxWidth: 40,
        label: { show: true, position: 'top', color: THEME.muted, fontSize: 9, fontFamily: MONO, formatter: (p: { value: number }) => `${p.value}%` },
      },
    ],
  };
}

/** Normalise a group of series into one chart, sorted so the legend order is stable. */
export function buildComparison(
  entries: { meta: SeriesMeta; points: Pt[] }[],
  opts: { normalize?: boolean; zones?: ZoneBand[] } = {},
): EChartsCoreOption {
  const allSentiment = entries.every((e) => e.meta.kind === 'sentiment');
  return multiLineOption(entries, { normalize: opts.normalize ?? !allSentiment, zones: opts.zones });
}
