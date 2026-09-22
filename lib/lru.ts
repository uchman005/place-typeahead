/**
 * Tiny LRU cache built on Map insertion order.
 * Bounded so a long session of typing can't grow memory without limit.
 */
export class LRUCache<K, V> {
  private map = new Map<K, V>();
  constructor(private readonly capacity = 50) {}

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    // refresh recency
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value as K;
      this.map.delete(oldest);
    }
  }

  get size(): number {
    return this.map.size;
  }
}
