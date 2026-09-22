/**
 * Domain types and the upstream adapter for place search.
 *
 * The UI never sees the upstream (Open-Meteo) shape directly. Everything is
 * normalised here, so swapping providers — or moving to our own index —
 * touches this file and nothing else.
 */

export interface Place {
  id: string;
  name: string;
  /** First-level admin area, e.g. "Lagos" */
  state?: string;
  /** Second-level admin area (LGA), e.g. "Eti Osa" */
  lga?: string;
  lat: number;
  lon: number;
  population?: number;
}

/** Subset of the Open-Meteo geocoding response we rely on. */
interface UpstreamResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country_code?: string;
  admin1?: string;
  admin2?: string;
  population?: number;
}

export const COUNTRY_CODE = "NG";
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 60;
export const MAX_RESULTS = 8;

const UPSTREAM_URL = "https://geocoding-api.open-meteo.com/v1/search";

/** Collapse whitespace and lower-case so "  Lekki " and "lekki" share a cache entry. */
export function normaliseQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normaliseResults(payload: unknown): Place[] {
  const results = (payload as { results?: UpstreamResult[] } | null)?.results;
  if (!Array.isArray(results)) return []; // Open-Meteo omits `results` when nothing matches

  return results
    .filter(
      (r) =>
        r &&
        typeof r.name === "string" &&
        Number.isFinite(r.latitude) &&
        Number.isFinite(r.longitude) &&
        // Defensive: countryCode is also sent upstream, but never trust it blindly.
        (r.country_code ?? COUNTRY_CODE).toUpperCase() === COUNTRY_CODE,
    )
    .slice(0, MAX_RESULTS)
    .map((r) => ({
      id: String(r.id),
      name: r.name,
      state: r.admin1 || undefined,
      lga: r.admin2 && r.admin2 !== r.name ? r.admin2 : undefined,
      lat: r.latitude,
      lon: r.longitude,
      population: r.population || undefined,
    }));
}

export function buildUpstreamUrl(query: string): string {
  const url = new URL(UPSTREAM_URL);
  url.searchParams.set("name", query);
  url.searchParams.set("count", String(MAX_RESULTS * 2)); // headroom for filtering
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  url.searchParams.set("countryCode", COUNTRY_CODE);
  return url.toString();
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Client-side fetcher: talks to our own /api/places route, never to the
 * third party directly. Accepts an AbortSignal so superseded requests are
 * cancelled on the wire, not just ignored.
 */
export async function fetchPlaces(query: string, signal: AbortSignal): Promise<Place[]> {
  const res = await fetch(`/api/places?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) {
    throw new HttpError(res.status, res.status === 429 ? "Too many searches. Wait a moment and try again." : "Place search is unavailable right now.");
  }
  const data = (await res.json()) as { places?: Place[] };
  return Array.isArray(data.places) ? data.places : [];
}

export function placeLabel(p: Place): string {
  return [p.name, p.lga, p.state].filter(Boolean).join(", ");
}
