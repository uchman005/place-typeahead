import { NextRequest, NextResponse } from "next/server";
import {
  buildUpstreamUrl,
  MAX_QUERY_LENGTH,
  MIN_QUERY_LENGTH,
  normaliseQuery,
  normaliseResults,
  type Place,
} from "@/lib/places";
import { LRUCache } from "@/lib/lru";

/**
 * GET /api/places?q=lek
 *
 * A thin BFF in front of the geocoder. Why proxy at all?
 *  - Normalises the query, so "Lekki", " lekki " and "LEKKI" are one CDN cache key.
 *  - Sets CDN cache headers: place names barely change, so most traffic never
 *    reaches the upstream.
 *  - Hides the provider and gives us one place for rate limiting, keys and logging.
 *  - Propagates client aborts upstream, so abandoned keystrokes stop costing us.
 */

const UPSTREAM_TIMEOUT_MS = 4000;
const CDN_CACHE = "public, s-maxage=86400, stale-while-revalidate=604800";

// Per-instance hot cache. The CDN is the real cache; this soaks up bursts on a warm instance.
const memo = new LRUCache<string, Place[]>(500);

export async function GET(req: NextRequest) {
  const q = normaliseQuery(req.nextUrl.searchParams.get("q") ?? "");

  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ query: q, places: [] }, { headers: { "Cache-Control": CDN_CACHE } });
  }
  if (q.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: "Query is too long." }, { status: 400 });
  }

  const hit = memo.get(q);
  if (hit) {
    return NextResponse.json({ query: q, places: hit }, { headers: { "Cache-Control": CDN_CACHE, "X-Cache": "HIT" } });
  }

  try {
    const res = await fetch(buildUpstreamUrl(q), {
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      const status = res.status === 429 ? 429 : 502;
      return NextResponse.json({ error: "Upstream geocoder failed." }, { status, headers: { "Cache-Control": "no-store" } });
    }

    const places = normaliseResults(await res.json());
    memo.set(q, places);
    return NextResponse.json({ query: q, places }, { headers: { "Cache-Control": CDN_CACHE, "X-Cache": "MISS" } });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    return NextResponse.json(
      { error: timedOut ? "Upstream geocoder timed out." : "Upstream geocoder unreachable." },
      { status: timedOut ? 504 : 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
