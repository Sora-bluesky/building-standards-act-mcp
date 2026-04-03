import { describe, it, expect } from "vitest";
import { KokujiRegistry } from "../../src/lib/kokuji-registry.js";

describe("KokujiRegistry", () => {
  const registry = new KokujiRegistry();

  describe("getAll", () => {
    it("returns empty array (all kokuji are fetched dynamically)", () => {
      const all = registry.getAll();
      expect(all).toHaveLength(0);
    });

    it("returns a defensive copy (different reference each call)", () => {
      const first = registry.getAll();
      const second = registry.getAll();
      expect(first).not.toBe(second);
    });
  });

  describe("findByName", () => {
    it("returns undefined for any name (no presets)", () => {
      const result = registry.findByName("耐火構造の構造方法を定める件");
      expect(result).toBeUndefined();
    });

    it("returns undefined for abbreviations (no presets)", () => {
      const result = registry.findByName("耐火構造告示");
      expect(result).toBeUndefined();
    });

    it("returns undefined for unknown names", () => {
      const result = registry.findByName("存在しない告示名");
      expect(result).toBeUndefined();
    });
  });

  describe("search", () => {
    it("returns empty array for any keyword (no presets)", () => {
      const results = registry.search("耐火");
      expect(results).toEqual([]);
    });

    it("returns empty array for unknown keyword", () => {
      const results = registry.search("絶対に存在しないキーワード");
      expect(results).toEqual([]);
    });
  });
});
