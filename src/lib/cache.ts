import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

/**
 * Common cache interface shared by all cache implementations.
 */
export interface ICache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T, ttl_ms?: number): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  readonly size: number;
}

interface CacheEntry<T> {
  value: T;
  expires_at: number;
}

/**
 * In-memory TTL cache. Entries expire after a configurable duration.
 */
export class TTLCache<T> implements ICache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly default_ttl_ms: number;
  private readonly maxEntries: number;

  constructor(
    default_ttl_ms: number = 30 * 60 * 1000,
    maxEntries: number = 500,
  ) {
    this.default_ttl_ms = default_ttl_ms;
    this.maxEntries = maxEntries;
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
    // Evict oldest entry if at capacity (skip if key already exists)
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
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

const DEFAULT_CACHE_DIR = path.join(
  os.homedir(),
  ".cache",
  "building-standards-act-mcp",
);

/**
 * File-based TTL cache. Entries persist across server restarts.
 * Each key is stored as an individual JSON file under
 * `~/.cache/building-standards-act-mcp/{name}/{hash}.json`.
 */
export class FileCache<T> implements ICache<T> {
  private readonly dir: string;
  private readonly default_ttl_ms: number;
  private readonly maxEntries: number;

  constructor(
    name: string,
    default_ttl_ms: number = 30 * 60 * 1000,
    maxEntries: number = 200,
  ) {
    this.default_ttl_ms = default_ttl_ms;
    this.maxEntries = maxEntries;
    const cacheBase = process.env.BUILDING_LAW_CACHE_DIR ?? DEFAULT_CACHE_DIR;
    this.dir = path.join(cacheBase, name);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private keyToPath(key: string): string {
    const hash = crypto.createHash("md5").update(key).digest("hex");
    return path.join(this.dir, `${hash}.json`);
  }

  get(key: string): T | undefined {
    const filePath = this.keyToPath(key);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (Date.now() > entry.expires_at) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // ignore cleanup failure
        }
        return undefined;
      }
      return entry.value;
    } catch {
      return undefined;
    }
  }

  set(key: string, value: T, ttl_ms?: number): void {
    const ttl = ttl_ms ?? this.default_ttl_ms;
    const entry: CacheEntry<T> = { value, expires_at: Date.now() + ttl };
    const filePath = this.keyToPath(key);
    // Evict oldest file if at capacity (skip if key already exists)
    if (!fs.existsSync(filePath) && this.size >= this.maxEntries) {
      this.evictOldest();
    }
    fs.writeFileSync(filePath, JSON.stringify(entry), "utf-8");
  }

  private evictOldest(): void {
    try {
      const files = fs.readdirSync(this.dir).filter((f) => f.endsWith(".json"));
      let oldestFile: string | undefined;
      let oldestMtime = Infinity;
      for (const file of files) {
        const filePath = path.join(this.dir, file);
        try {
          const stat = fs.statSync(filePath);
          if (stat.mtimeMs < oldestMtime) {
            oldestMtime = stat.mtimeMs;
            oldestFile = filePath;
          }
        } catch {
          // skip inaccessible files
        }
      }
      if (oldestFile) {
        try {
          fs.unlinkSync(oldestFile);
        } catch {
          // ignore cleanup failure
        }
      }
    } catch {
      // directory might not exist
    }
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    try {
      fs.unlinkSync(this.keyToPath(key));
      return true;
    } catch {
      return false;
    }
  }

  clear(): void {
    try {
      const files = fs.readdirSync(this.dir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          try {
            fs.unlinkSync(path.join(this.dir, file));
          } catch {
            // ignore individual file cleanup failure
          }
        }
      }
    } catch {
      // directory might not exist
    }
  }

  get size(): number {
    try {
      const files = fs.readdirSync(this.dir).filter((f) => f.endsWith(".json"));
      let count = 0;
      for (const file of files) {
        const filePath = path.join(this.dir, file);
        try {
          const raw = fs.readFileSync(filePath, "utf-8");
          const entry = JSON.parse(raw) as CacheEntry<unknown>;
          if (Date.now() <= entry.expires_at) {
            count++;
          } else {
            try {
              fs.unlinkSync(filePath);
            } catch {
              // ignore cleanup failure
            }
          }
        } catch {
          // corrupted file, skip
        }
      }
      return count;
    } catch {
      return 0;
    }
  }
}

/**
 * Factory function to create a cache instance based on the
 * `BUILDING_LAW_CACHE` environment variable.
 *
 * - `"memory"` (default): in-memory TTLCache
 * - `"file"`: file-based FileCache that persists across restarts
 */
export function createCache<T>(
  name: string,
  ttl_ms: number,
  maxEntries?: number,
): ICache<T> {
  const mode = process.env.BUILDING_LAW_CACHE ?? "memory";
  if (mode === "file") {
    return new FileCache<T>(name, ttl_ms, maxEntries ?? 200);
  }
  return new TTLCache<T>(ttl_ms, maxEntries ?? 500);
}
