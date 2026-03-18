import { describe, it, expect, beforeEach } from "vitest";
import {
  recordToolCall,
  recordApiCall,
  recordCacheHit,
  getMetrics,
  _resetMetrics,
} from "../../src/lib/metrics.js";

describe("metrics", () => {
  beforeEach(() => {
    _resetMetrics();
  });

  describe("recordToolCall", () => {
    it("records successful tool calls", () => {
      recordToolCall("get_law", 100, true);
      recordToolCall("get_law", 200, true);

      const metrics = getMetrics();
      const tools = metrics.tools as Record<string, Record<string, number>>;
      expect(tools.get_law.calls).toBe(2);
      expect(tools.get_law.avg_ms).toBe(150);
      expect(tools.get_law.errors).toBe(0);
    });

    it("records failed tool calls", () => {
      recordToolCall("search_law", 50, true);
      recordToolCall("search_law", 80, false);

      const metrics = getMetrics();
      const tools = metrics.tools as Record<string, Record<string, number>>;
      expect(tools.search_law.calls).toBe(2);
      expect(tools.search_law.errors).toBe(1);
    });
  });

  describe("recordApiCall", () => {
    it("records API calls with status codes", () => {
      recordApiCall("/laws", 100, 200);
      recordApiCall("/laws", 200, 200);
      recordApiCall("/laws", 50, 500);

      const metrics = getMetrics();
      const api = metrics.api as Record<string, Record<string, unknown>>;
      expect(api["/laws"].requests).toBe(3);
      expect(api["/laws"].errors).toBe(1);
      expect(api["/laws"].error_rate).toBe("33.3%");
    });

    it("counts undefined status as error", () => {
      recordApiCall("/law_data", 100, undefined);

      const metrics = getMetrics();
      const api = metrics.api as Record<string, Record<string, unknown>>;
      expect(api["/law_data"].errors).toBe(1);
    });
  });

  describe("recordCacheHit", () => {
    it("records hits and misses", () => {
      recordCacheHit("search", true);
      recordCacheHit("search", true);
      recordCacheHit("search", false);

      const metrics = getMetrics();
      const cache = metrics.cache as Record<string, Record<string, unknown>>;
      expect(cache.search.hits).toBe(2);
      expect(cache.search.misses).toBe(1);
      expect(cache.search.hit_rate).toBe("66.7%");
    });
  });

  describe("getMetrics", () => {
    it("returns uptime_seconds", () => {
      const metrics = getMetrics();
      expect(metrics.uptime_seconds).toBeTypeOf("number");
      expect(metrics.uptime_seconds).toBeGreaterThanOrEqual(0);
    });

    it("returns empty collections when no metrics recorded", () => {
      const metrics = getMetrics();
      expect(metrics.tools).toEqual({});
      expect(metrics.api).toEqual({});
      expect(metrics.cache).toEqual({});
    });

    it("tracks multiple different tool names independently", () => {
      recordToolCall("get_law", 100, true);
      recordToolCall("search_law", 200, true);

      const metrics = getMetrics();
      const tools = metrics.tools as Record<string, Record<string, number>>;
      expect(Object.keys(tools)).toHaveLength(2);
      expect(tools.get_law.calls).toBe(1);
      expect(tools.search_law.calls).toBe(1);
    });
  });

  describe("_resetMetrics", () => {
    it("clears all recorded metrics", () => {
      recordToolCall("get_law", 100, true);
      recordApiCall("/laws", 200, 200);
      recordCacheHit("search", true);

      _resetMetrics();

      const metrics = getMetrics();
      expect(metrics.tools).toEqual({});
      expect(metrics.api).toEqual({});
      expect(metrics.cache).toEqual({});
    });
  });
});
