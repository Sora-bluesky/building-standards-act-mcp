import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TTLCache } from "../../src/lib/cache.js";

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
