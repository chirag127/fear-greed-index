import type { Latest, SeriesFile, SeriesIndex } from './types';

/**
 * The API is a set of static files on more than one equivalent host, and which
 * one is reachable depends on the environment (CDN propagation, offline dev), so
 * we probe rather than assume.
 *
 * Ordering carries meaning. `raw.githubusercontent.com` is first because it
 * serves the committed JSON directly with no Pages build in the path, so new data
 * is visible the moment the collector pushes rather than after a site rebuild.
 *
 * A dead entry here is not harmless: a host that fails at the TLS layer makes the
 * browser log a network error that no application code can suppress, and the
 * smoke test - correctly - treats any console error as a failure. An earlier
 * custom domain left over from this project's previous repository name was still
 * being probed first and failing its certificate check on every single page load.
 */
const CANDIDATES = [
  import.meta.env.VITE_API_BASE as string | undefined,
  // In dev the Vite middleware serves the sibling API repo from disk, so work
  // never blocks on a push. Dead in production builds.
  import.meta.env.DEV ? '/api-local' : undefined,
  'https://raw.githubusercontent.com/chirag127/fear-greed-index-api/main',
  'https://chirag127.github.io/fear-greed-index-api',
].filter(Boolean) as string[];

let resolvedBase: string | null = null;

const seriesCache = new Map<string, SeriesFile>();

/** Probe candidate hosts in order and remember the first that answers. */
export async function resolveBase(): Promise<string> {
  if (resolvedBase) return resolvedBase;

  const errors: string[] = [];
  for (const base of CANDIDATES) {
    try {
      const res = await fetch(`${base}/data/series/index.json`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as SeriesIndex;
      if (!json?.series?.length) throw new Error('empty catalogue');
      resolvedBase = base;
      return base;
    } catch (e) {
      errors.push(`${base}: ${(e as Error).message}`);
    }
  }
  throw new Error(`No reachable data API.\n${errors.join('\n')}`);
}

export function activeBase(): string | null {
  return resolvedBase;
}

async function getJson<T>(path: string): Promise<T> {
  const base = await resolveBase();
  const res = await fetch(`${base}/${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const loadIndex = () => getJson<SeriesIndex>('data/series/index.json');
export const loadLatest = () => getJson<Latest>('data/latest.json');

export async function loadSeries(id: string): Promise<SeriesFile> {
  const hit = seriesCache.get(id);
  if (hit) return hit;
  const file = await getJson<SeriesFile>(`data/series/${id}.json`);
  seriesCache.set(id, file);
  return file;
}

const inflight = new Map<string, Promise<SeriesFile>>();

/** De-duplicates concurrent requests for the same series (grid views ask a lot). */
export function loadSeriesOnce(id: string): Promise<SeriesFile> {
  const hit = seriesCache.get(id);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(id);
  if (pending) return pending;
  const p = loadSeries(id).finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

export function cachedSeries(id: string): SeriesFile | undefined {
  return seriesCache.get(id);
}
