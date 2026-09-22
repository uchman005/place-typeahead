import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "./useDebouncedValue";
import { LRUCache } from "@/lib/lru";

export type SearchStatus = "idle" | "loading" | "success" | "empty" | "error";

export interface TypeaheadOptions<T> {
  /** Must honour the AbortSignal. Throwing marks the query as failed. */
  fetcher: (query: string, signal: AbortSignal) => Promise<T[]>;
  /** Normalises input into a cache/request key. */
  normalise?: (raw: string) => string;
  debounceMs?: number;
  minChars?: number;
  cacheSize?: number;
}

export interface TypeaheadState<T> {
  status: SearchStatus;
  results: T[];
  error: Error | null;
  /** True while the user is still typing (debounce window open). */
  isPending: boolean;
  /** The query whose results are currently displayed. */
  resolvedQuery: string;
  retry: () => void;
}

interface Settled<T> {
  query: string;
  status: SearchStatus;
  results: T[];
  error: Error | null;
}

const IDLE: Settled<never> = { query: "", status: "idle", results: [], error: null };

/**
 * Debounced, cancellable, cache-backed search.
 *
 * Race-safety is layered:
 *  1. Each new debounced query aborts the previous in-flight request.
 *  2. A monotonically increasing request id guards against a response that
 *     was already resolving when abort() was called (or a fetcher that
 *     ignores the signal) — only the latest request may write state.
 */
export function useTypeahead<T>(rawQuery: string, opts: TypeaheadOptions<T>): TypeaheadState<T> {
  const {
    fetcher,
    normalise = (s: string) => s.trim().toLowerCase(),
    debounceMs = 250,
    minChars = 2,
    cacheSize = 50,
  } = opts;

  const query = normalise(rawQuery);
  const debouncedQuery = useDebouncedValue(query, debounceMs);

  const [cache] = useState(() => new LRUCache<string, T[]>(cacheSize));
  const [settled, setSettled] = useState<Settled<T>>(IDLE);
  const [attempt, setAttempt] = useState(0);
  const latestRequest = useRef(0);

  // Keep the latest fetcher without re-triggering the effect when callers pass an inline function.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    const requestId = ++latestRequest.current;

    if (debouncedQuery.length < minChars) {
      setSettled(IDLE);
      return;
    }

    const cached = cache.get(debouncedQuery);
    if (cached) {
      setSettled({ query: debouncedQuery, status: cached.length ? "success" : "empty", results: cached, error: null });
      return;
    }

    const controller = new AbortController();
    // Keep previous results on screen while loading to avoid list flicker.
    setSettled((prev) => ({ ...prev, status: "loading", error: null }));

    fetcherRef
      .current(debouncedQuery, controller.signal)
      .then((results) => {
        if (requestId !== latestRequest.current) return; // stale
        cache.set(debouncedQuery, results);
        setSettled({ query: debouncedQuery, status: results.length ? "success" : "empty", results, error: null });
      })
      .catch((err: unknown) => {
        if (requestId !== latestRequest.current || controller.signal.aborted) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setSettled({ query: debouncedQuery, status: "error", results: [], error });
      });

    return () => controller.abort();
  }, [debouncedQuery, minChars, cache, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Instant path: if what the user has typed is already cached (e.g. backspacing),
  // show it now instead of waiting out the debounce.
  const instant = query !== debouncedQuery && query.length >= minChars ? cache.get(query) : undefined;
  if (instant) {
    return {
      status: instant.length ? "success" : "empty",
      results: instant,
      error: null,
      isPending: false,
      resolvedQuery: query,
      retry,
    };
  }

  const belowMin = query.length < minChars;
  return {
    status: belowMin ? "idle" : settled.status,
    results: belowMin ? [] : settled.results,
    error: belowMin ? null : settled.error,
    isPending: !belowMin && query !== debouncedQuery,
    resolvedQuery: settled.query,
    retry,
  };
}
