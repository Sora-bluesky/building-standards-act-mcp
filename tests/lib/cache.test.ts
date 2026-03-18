import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TTLCache, FileCache, createCache } from "../../src/lib/cache.js";

describe("TTLCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("get / set", () => {
    it("returns undefined for a key that was never set", () => {
      const cache = new TTLCache<string>();
      expect(cache.get("missing")).toBeUndefined();
    });

    it("stores and retrieves a value", () => {
      const cache = new TTLCache<string>();
      cache.set("key1", "value1");
      expect(cache.get("key1")).toBe("value1");
    });

    it("overwrites an existing key with a new value", () => {
      const cache = new TTLCache<number>();
      cache.set("count", 1);
      cache.set("count", 2);
      expect(cache.get("count")).toBe(2);
    });
  });

  describe("TTL expiration", () => {
    it("returns the value before TTL expires", () => {
      const cache = new TTLCache<string>(1000);
      cache.set("key", "val");

      vi.advanceTimersByTime(999);
      expect(cache.get("key")).toBe("val");
    });

    it("returns undefined after TTL expires", () => {
      const cache = new TTLCache<string>(1000);
      cache.set("key", "val");

      vi.advanceTimersByTime(1001);
      expect(cache.get("key")).toBeUndefined();
    });

    it("respects per-entry TTL override", () => {
      const cache = new TTLCache<string>(10_000);
      cache.set("short", "val", 500);

      vi.advanceTimersByTime(501);
      expect(cache.get("short")).toBeUndefined();
    });

    it("uses default TTL when no override is given", () => {
      const cache = new TTLCache<string>(2000);
      cache.set("default", "val");

      vi.advanceTimersByTime(1999);
      expect(cache.get("default")).toBe("val");

      vi.advanceTimersByTime(2);
      expect(cache.get("default")).toBeUndefined();
    });
  });

  describe("has", () => {
    it("returns true for an existing non-expired key", () => {
      const cache = new TTLCache<string>();
      cache.set("key", "val");
      expect(cache.has("key")).toBe(true);
    });

    it("returns false for a missing key", () => {
      const cache = new TTLCache<string>();
      expect(cache.has("missing")).toBe(false);
    });

    it("returns false for an expired key", () => {
      const cache = new TTLCache<string>(500);
      cache.set("key", "val");

      vi.advanceTimersByTime(501);
      expect(cache.has("key")).toBe(false);
    });
  });

  describe("delete", () => {
    it("removes an existing key and returns true", () => {
      const cache = new TTLCache<string>();
      cache.set("key", "val");

      expect(cache.delete("key")).toBe(true);
      expect(cache.get("key")).toBeUndefined();
    });

    it("returns false when deleting a non-existent key", () => {
      const cache = new TTLCache<string>();
      expect(cache.delete("missing")).toBe(false);
    });
  });

  describe("clear", () => {
    it("removes all entries", () => {
      const cache = new TTLCache<string>();
      cache.set("a", "1");
      cache.set("b", "2");
      cache.set("c", "3");

      cache.clear();

      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("c")).toBeUndefined();
    });
  });

  describe("size", () => {
    it("returns 0 for an empty cache", () => {
      const cache = new TTLCache<string>();
      expect(cache.size).toBe(0);
    });

    it("returns the number of active entries", () => {
      const cache = new TTLCache<string>();
      cache.set("a", "1");
      cache.set("b", "2");
      expect(cache.size).toBe(2);
    });

    it("excludes expired entries from the count", () => {
      const cache = new TTLCache<string>(1000);
      cache.set("short", "val", 500);
      cache.set("long", "val", 2000);

      vi.advanceTimersByTime(501);

      // 'short' has expired, only 'long' should remain
      expect(cache.size).toBe(1);
    });

    it("returns 0 when all entries have expired", () => {
      const cache = new TTLCache<string>(500);
      cache.set("a", "1");
      cache.set("b", "2");

      vi.advanceTimersByTime(501);
      expect(cache.size).toBe(0);
    });
  });
});

describe("FileCache", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "filecache-test-"));
    process.env.BUILDING_LAW_CACHE_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.BUILDING_LAW_CACHE_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("get / set", () => {
    it("returns undefined for a key that was never set", () => {
      const cache = new FileCache<string>("test");
      expect(cache.get("missing")).toBeUndefined();
    });

    it("stores and retrieves a value", () => {
      const cache = new FileCache<string>("test");
      cache.set("key1", "value1");
      expect(cache.get("key1")).toBe("value1");
    });

    it("stores and retrieves complex objects", () => {
      const cache = new FileCache<{ name: string; count: number }>("test");
      const obj = { name: "test", count: 42 };
      cache.set("obj", obj);
      expect(cache.get("obj")).toEqual(obj);
    });

    it("overwrites an existing key with a new value", () => {
      const cache = new FileCache<number>("test");
      cache.set("count", 1);
      cache.set("count", 2);
      expect(cache.get("count")).toBe(2);
    });
  });

  describe("TTL expiration", () => {
    it("returns the value before TTL expires", () => {
      vi.useFakeTimers();
      const cache = new FileCache<string>("test", 5000);
      cache.set("key", "val");

      vi.advanceTimersByTime(4999);
      expect(cache.get("key")).toBe("val");
      vi.useRealTimers();
    });

    it("returns undefined after TTL expires", () => {
      vi.useFakeTimers();
      const cache = new FileCache<string>("test", 1000);
      cache.set("key", "val");

      vi.advanceTimersByTime(1001);
      expect(cache.get("key")).toBeUndefined();
      vi.useRealTimers();
    });

    it("respects per-entry TTL override", () => {
      vi.useFakeTimers();
      const cache = new FileCache<string>("test", 10_000);
      cache.set("short", "val", 500);

      vi.advanceTimersByTime(501);
      expect(cache.get("short")).toBeUndefined();
      vi.useRealTimers();
    });
  });

  describe("persistence across instances", () => {
    it("survives creating a new FileCache instance (simulates restart)", () => {
      const cache1 = new FileCache<string>("test", 60_000);
      cache1.set("persistent", "hello");

      // Create a new instance pointing to the same directory
      const cache2 = new FileCache<string>("test", 60_000);
      expect(cache2.get("persistent")).toBe("hello");
    });
  });

  describe("has", () => {
    it("returns true for an existing non-expired key", () => {
      const cache = new FileCache<string>("test");
      cache.set("key", "val");
      expect(cache.has("key")).toBe(true);
    });

    it("returns false for a missing key", () => {
      const cache = new FileCache<string>("test");
      expect(cache.has("missing")).toBe(false);
    });
  });

  describe("delete", () => {
    it("removes an existing key and returns true", () => {
      const cache = new FileCache<string>("test");
      cache.set("key", "val");

      expect(cache.delete("key")).toBe(true);
      expect(cache.get("key")).toBeUndefined();
    });

    it("returns false when deleting a non-existent key", () => {
      const cache = new FileCache<string>("test");
      expect(cache.delete("missing")).toBe(false);
    });
  });

  describe("clear", () => {
    it("removes all entries", () => {
      const cache = new FileCache<string>("test");
      cache.set("a", "1");
      cache.set("b", "2");
      cache.set("c", "3");

      cache.clear();

      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("c")).toBeUndefined();
    });
  });

  describe("size", () => {
    it("returns 0 for an empty cache", () => {
      const cache = new FileCache<string>("test");
      expect(cache.size).toBe(0);
    });

    it("returns the number of active entries", () => {
      const cache = new FileCache<string>("test");
      cache.set("a", "1");
      cache.set("b", "2");
      expect(cache.size).toBe(2);
    });

    it("excludes expired entries from the count", () => {
      vi.useFakeTimers();
      const cache = new FileCache<string>("test", 1000);
      cache.set("short", "val", 500);
      cache.set("long", "val", 2000);

      vi.advanceTimersByTime(501);
      expect(cache.size).toBe(1);
      vi.useRealTimers();
    });
  });

  describe("isolation between cache names", () => {
    it("does not share entries between different cache names", () => {
      const cacheA = new FileCache<string>("alpha");
      const cacheB = new FileCache<string>("beta");

      cacheA.set("key", "from-alpha");
      cacheB.set("key", "from-beta");

      expect(cacheA.get("key")).toBe("from-alpha");
      expect(cacheB.get("key")).toBe("from-beta");
    });
  });
});

describe("createCache", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "createcache-test-"));
    delete process.env.BUILDING_LAW_CACHE;
    delete process.env.BUILDING_LAW_CACHE_DIR;
  });

  afterEach(() => {
    delete process.env.BUILDING_LAW_CACHE;
    delete process.env.BUILDING_LAW_CACHE_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns TTLCache by default (memory mode)", () => {
    const cache = createCache<string>("test", 1000);
    expect(cache).toBeInstanceOf(TTLCache);
  });

  it("returns TTLCache when BUILDING_LAW_CACHE=memory", () => {
    process.env.BUILDING_LAW_CACHE = "memory";
    const cache = createCache<string>("test", 1000);
    expect(cache).toBeInstanceOf(TTLCache);
  });

  it("returns FileCache when BUILDING_LAW_CACHE=file", () => {
    process.env.BUILDING_LAW_CACHE = "file";
    process.env.BUILDING_LAW_CACHE_DIR = tmpDir;
    const cache = createCache<string>("test", 1000);
    expect(cache).toBeInstanceOf(FileCache);
  });

  it("file cache stores and retrieves values", () => {
    process.env.BUILDING_LAW_CACHE = "file";
    process.env.BUILDING_LAW_CACHE_DIR = tmpDir;
    const cache = createCache<string>("test", 60_000);

    cache.set("hello", "world");
    expect(cache.get("hello")).toBe("world");
  });
});
