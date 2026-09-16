import { useEffect, useState } from 'react';
import { loadIndex, loadLatest, loadSeriesOnce } from './api';
import type { Latest, SeriesFile, SeriesIndex } from './types';

interface Async<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [state, setState] = useState<Async<T>>({ data: null, error: null, loading: true });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    fn()
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e: Error) => live && setState({ data: null, error: e.message, loading: false }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export const useIndex = () => useAsync<SeriesIndex>(loadIndex, []);
export const useLatest = () => useAsync<Latest>(loadLatest, []);

/** Loads one series. Returns null data while in flight. */
export function useSeries(id: string | null): Async<SeriesFile> {
  const [state, setState] = useState<Async<SeriesFile>>({ data: null, error: null, loading: !!id });
  useEffect(() => {
    if (!id) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let live = true;
    setState({ data: null, error: null, loading: true });
    loadSeriesOnce(id)
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e: Error) => live && setState({ data: null, error: e.message, loading: false }));
    return () => {
      live = false;
    };
  }, [id]);
  return state;
}

/**
 * Loads many series at once. Sequential rather than parallel on purpose: the
 * Explore grid can ask for 80 files, and 80 simultaneous requests to
 * raw.githubusercontent.com invites rate limiting.
 */
export function useSeriesMany(ids: string[]) {
  const [map, setMap] = useState<Record<string, SeriesFile>>({});
  const key = ids.join(',');

  useEffect(() => {
    let live = true;
    (async () => {
      for (const id of ids) {
        try {
          const file = await loadSeriesOnce(id);
          if (!live) return;
          setMap((m) => ({ ...m, [id]: file }));
        } catch {
          /* a single missing series must not blank the grid */
        }
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
}
