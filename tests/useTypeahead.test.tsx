import { act, renderHook, waitFor } from "@testing-library/react";
import { useTypeahead } from "@/hooks/useTypeahead";
import { deferred, place } from "./helpers";
import type { Place } from "@/lib/places";

const DEBOUNCE = 30;

function setup(fetcher: (q: string, s: AbortSignal) => Promise<Place[]>, initial = "") {
  return renderHook(({ q }) => useTypeahead<Place>(q, { fetcher, debounceMs: DEBOUNCE, minChars: 2 }), {
    initialProps: { q: initial },
  });
}

describe("useTypeahead", () => {
  it("stays idle and never fetches below the minimum length", async () => {
    const fetcher = vi.fn().mockResolvedValue([]);
    const { result, rerender } = setup(fetcher);
    rerender({ q: "l" });
    await act(() => new Promise((r) => setTimeout(r, DEBOUNCE * 3)));
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
  });

  it("debounces a burst of keystrokes into a single request", async () => {
    const fetcher = vi.fn().mockResolvedValue([place("Lekki")]);
    const { result, rerender } = setup(fetcher);
    for (const q of ["le", "lek", "lekk", "lekki"]) rerender({ q });

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("lekki", expect.any(AbortSignal));
    expect(result.current.results.map((p) => p.name)).toEqual(["Lekki"]);
  });

  it("ignores an out-of-order stale response and aborts the superseded request", async () => {
    const slow = deferred<Place[]>();
    const fast = deferred<Place[]>();
    const signals: Record<string, AbortSignal> = {};
    const fetcher = vi.fn((q: string, signal: AbortSignal) => {
      signals[q] = signal;
      return q === "ik" ? slow.promise : fast.promise;
    });

    const { result, rerender } = setup(fetcher);
    rerender({ q: "ik" });
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("ik", expect.any(AbortSignal)));

    rerender({ q: "ikeja" });
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith("ikeja", expect.any(AbortSignal)));
    expect(signals["ik"].aborted).toBe(true);

    // Newer request resolves first, then the stale one arrives late (fetcher ignored abort).
    await act(async () => fast.resolve([place("Ikeja")]));
    await act(async () => slow.resolve([place("Ikorodu"), place("Ikoyi")]));

    expect(result.current.status).toBe("success");
    expect(result.current.results.map((p) => p.name)).toEqual(["Ikeja"]);
  });

  it("does not surface an error from a request that was superseded", async () => {
    const first = deferred<Place[]>();
    const fetcher = vi.fn((q: string) => (q === "ab" ? first.promise : Promise.resolve([place("Abuja")])));
    const { result, rerender } = setup(fetcher);

    rerender({ q: "ab" });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    rerender({ q: "abuja" });
    await waitFor(() => expect(result.current.status).toBe("success"));

    await act(async () => first.reject(new Error("network down")));
    expect(result.current.status).toBe("success");
    expect(result.current.error).toBeNull();
  });

  it("serves repeat queries from cache without refetching", async () => {
    const fetcher = vi.fn(async (q: string) => [place(q === "yaba" ? "Yaba" : "Surulere")]);
    const { result, rerender } = setup(fetcher);

    rerender({ q: "yaba" });
    await waitFor(() => expect(result.current.results[0]?.name).toBe("Yaba"));
    rerender({ q: "surulere" });
    await waitFor(() => expect(result.current.results[0]?.name).toBe("Surulere"));
    rerender({ q: "Yaba " }); // normalises to the cached key

    // Instant path: served from cache before the debounce even fires.
    expect(result.current.results[0]?.name).toBe("Yaba");
    await act(() => new Promise((r) => setTimeout(r, DEBOUNCE * 3)));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("reports empty results distinctly from success", async () => {
    const { result, rerender } = setup(vi.fn().mockResolvedValue([]));
    rerender({ q: "zzzz" });
    await waitFor(() => expect(result.current.status).toBe("empty"));
  });

  it("surfaces errors and recovers on retry", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("Place search is unavailable right now."))
      .mockResolvedValueOnce([place("Enugu")]);
    const { result, rerender } = setup(fetcher);

    rerender({ q: "enugu" });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.message).toMatch(/unavailable/);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
