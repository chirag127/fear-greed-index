/** Mirrors the contract emitted by fear-greed-index-api's scripts/registry.mjs. */

export type SeriesKind = 'sentiment' | 'line' | 'bar';

export type SeriesGroup = 'sentiment' | 'volatility' | 'valuation' | 'price' | 'breadth' | 'flow' | 'component';

export interface ZoneBand {
  lt: number | null;
  label: string;
  color: string;
}

export interface Zone {
  label: string;
  color: string;
}

export interface SeriesMeta {
  id: string;
  title: string;
  short: string;
  group: SeriesGroup;
  market: 'india' | 'us' | 'crypto' | 'global';
  kind: SeriesKind;
  unit: string;
  decimals: number;
  cadence: string;
  source: string;
  sourceUrl: string;
  description: string;
  min?: number;
  max?: number;
  baseline?: number;
  invert?: boolean;
  component?: boolean;
  sector?: boolean;
  derived?: boolean;
  crossCheck?: boolean;
  higherIsExpensive?: boolean;
  /** Enriched by the API at collect time. */
  points: number;
  first: string;
  last: string;
  lastValue: number;
  zone: Zone | null;
}

export interface ComparisonSpec {
  id: string;
  title: string;
  description: string;
  ids: string[];
}

export interface SeriesIndex {
  generated: string;
  count: number;
  declared: number;
  groups: Record<string, number>;
  zones: ZoneBand[];
  comparisons: ComparisonSpec[];
  series: SeriesMeta[];
}

export interface SeriesFile {
  id: string;
  updated: string;
  /** [YYYY-MM-DD, value] pairs, ascending. */
  points: [string, number][];
}

export interface SourceStatus {
  ok: boolean;
  ms?: number;
  error?: string;
}

export interface Latest {
  updated: string;
  asOf: string;
  headline: Record<
    string,
    { title: string; short: string; value: number; date: string; zone: Zone | null; previous: number | null }
  >;
  tickertape: Record<string, unknown> | null;
  cnn: Record<string, unknown> | null;
  crypto: Record<string, unknown> | null;
  nse: {
    indices?: Record<
      string,
      {
        name: string;
        level: number;
        changePct: number;
        pe: number;
        pb: number;
        dy: number;
        advances: number;
        declines: number;
        yearHigh: number;
        yearLow: number;
        pctFromYearHigh: number;
      }
    >;
    breadth?: Record<string, { advances: number; declines: number; unchanged: number; net: number; ratio: number }>;
    flows?: { date: string; rows: { category: string; date: string; buy: number; sell: number; net: number }[] } | null;
    vix?: number;
  } | null;
  sources: Record<string, SourceStatus>;
  unavailable: string[];
  seriesCount: number;
}
