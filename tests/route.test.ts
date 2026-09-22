import { NextRequest } from "next/server";
import { normaliseResults } from "@/lib/places";

async function callRoute(q: string) {
  vi.resetModules(); // fresh per-instance cache for each test
  const { GET } = await import("@/app/api/places/route");
  return GET(new NextRequest(`http://localhost/api/places?q=${encodeURIComponent(q)}`));
}

afterEach(() => vi.unstubAllGlobals());

describe("normaliseResults", () => {
  it("drops malformed and non-Nigerian rows and maps admin areas", () => {
    const out = normaliseResults({
      results: [
        { id: 1, name: "Ikeja", latitude: 6.6, longitude: 3.35, country_code: "NG", admin1: "Lagos", admin2: "Ikeja" },
        { id: 2, name: "Ikeja", latitude: 1, longitude: 1, country_code: "GH" },
        { id: 3, name: "Broken", latitude: "x", longitude: 1, country_code: "NG" },
      ],
    });
    expect(out).toEqual([{ id: "1", name: "Ikeja", state: "Lagos", lga: undefined, lat: 6.6, lon: 3.35, population: undefined }]);
  });

  it("treats a missing results key as no matches", () => {
    expect(normaliseResults({ generationtime_ms: 0.4 })).toEqual([]);
  });
});

describe("GET /api/places", () => {
  it("normalises the query, restricts to Nigeria and sets CDN cache headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ results: [{ id: 9, name: "Enugu", latitude: 6.45, longitude: 7.5, country_code: "NG", admin1: "Enugu" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await callRoute("  ENUGU ");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/s-maxage/);
    const upstream = new URL(fetchMock.mock.calls[0][0]);
    expect(upstream.searchParams.get("name")).toBe("enugu");
    expect(upstream.searchParams.get("countryCode")).toBe("NG");
    expect((await res.json()).places[0].name).toBe("Enugu");
  });

  it("returns 502 and no-store when the upstream fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    const res = await callRoute("lagos");
    expect(res.status).toBe(502);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("short-circuits queries below the minimum length without calling upstream", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await callRoute("a");
    expect((await res.json()).places).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects absurdly long queries", async () => {
    const res = await callRoute("x".repeat(200));
    expect(res.status).toBe(400);
  });
});
