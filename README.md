# Place typeahead

A debounced, accessible, race-safe autocomplete for Nigerian places, built with Next.js 16 (App Router), React 19 and TypeScript. No UI or data-fetching libraries — the combobox, debounce, cache and stale-response handling are all in this repo.

Built as the screening task for the Frontend Engineer role at Expert Listing. The reasoning is in **[WRITEUP.md](./WRITEUP.md)**.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 22 unit + integration tests
npm run typecheck
npm run build
```

Node 20+ is required. No API key is needed — data comes from the free [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api), filtered to Nigeria.

## What it handles

| Requirement | How |
|---|---|
| Debounced input | `useDebouncedValue` (250 ms). Queries under 2 characters never hit the network. |
| Loading state | Spinner in the field; previous results stay visible (dimmed) so the list doesn't flicker. |
| Empty state | Names the query and suggests what to do next. |
| Error state | Clear message plus a **Try again** button that re-runs the same query. Upstream timeouts and 429s are mapped to distinct statuses by the API route. |
| Keyboard navigation | ↑/↓ with wrap-around, Enter to choose, Esc to close (again to clear), Tab to leave. IME composition is left alone. |
| Out-of-order / stale responses | Superseded requests are aborted with `AbortController`, **and** a request-id guard discards any response that still lands late. Both are covered by tests. |
| Accessibility | WAI-ARIA combobox pattern: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `role="listbox"`/`option`, polite live region announcing result counts. Visible focus, reduced-motion respected. |

## Structure

```
app/
  api/places/route.ts   BFF: validates + normalises the query, calls the geocoder with a
                        4 s timeout, forwards client aborts, sets CDN cache headers
  page.tsx              demo page
components/
  PlaceSearch.tsx       the combobox UI and keyboard handling
  Highlight.tsx         marks the matched part of each result
hooks/
  useTypeahead.ts       debounce + cache + abort + stale-response guard (UI-agnostic, fetcher injected)
  useDebouncedValue.ts
lib/
  places.ts             domain types, upstream adapter, client fetcher
  lru.ts                small bounded LRU cache
tests/                  Vitest + Testing Library
```

`useTypeahead` takes the fetcher as a parameter, so it knows nothing about places or HTTP. The same hook could drive search for listings, estates or agents in the professional directory.

## Deploy

Push to GitHub and import the repo on Vercel — no configuration or environment variables needed.
