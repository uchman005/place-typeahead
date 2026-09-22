import type { Place } from "@/lib/places";

export function place(name: string, extra: Partial<Place> = {}): Place {
  return { id: name, name, state: "Lagos", lat: 6.5, lon: 3.4, ...extra };
}

/** A promise you resolve/reject from the test, to control response ordering. */
export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
