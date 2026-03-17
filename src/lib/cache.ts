interface CacheEntry<T> {
  value: T;
  expires_at: number;
}

export class TTLCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly default_ttl_ms: number;

  constructor(default_ttl_ms: number = 30 * 60 * 1000) {
    this.default_ttl_ms = default_ttl_ms;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() > entry.expires_at) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T, ttl_ms?: number): void {
    const ttl = ttl_ms ?? this.default_ttl_ms;
    this.store.set(key, {
      value,
      expires_at: Date.now() + ttl,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    // Clean expired entries first
    for (const [key, entry] of this.store) {
      if (Date.now() > entry.expires_at) {
        this.store.delete(key);
      }
    }
    return this.store.size;
  }
}
