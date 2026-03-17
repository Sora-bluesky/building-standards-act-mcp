import { describe, it, expect } from "vitest";
import { KokujiRegistry } from "../../src/lib/kokuji-registry.js";

describe("KokujiRegistry", () => {
  const registry = new KokujiRegistry();

  describe("getAll", () => {
    it("returns 7 kokuji presets", () => {
      const all = registry.getAll();
      expect(all).toHaveLength(7);
    });

    it("returns a defensive copy (different reference each call)", () => {
      const first = registry.getAll();
      const second = registry.getAll();
      expect(first).not.toBe(second);
    });

    it("all presets have required fields", () => {
      const all = registry.getAll();
      for (const preset of all) {
        expect(preset).toHaveProperty("law_num");
        expect(preset).toHaveProperty("title");
        expect(preset).toHaveProperty("abbrev");
        expect(preset).toHaveProperty("delegated_by");
        expect(typeof preset.law_num).toBe("string");
        expect(typeof preset.title).toBe("string");
        expect(Array.isArray(preset.abbrev)).toBe(true);
        expect(typeof preset.delegated_by).toBe("string");
      }
    });
  });

  describe("findByName", () => {
    it("finds preset by exact title match", () => {
      const result = registry.findByName("耐火構造の構造方法を定める件");
      expect(result).toBeDefined();
      expect(result!.title).toBe("耐火構造の構造方法を定める件");
      expect(result!.law_num).toBe("平成十二年建設省告示第千三百九十九号");
    });

    it("finds preset by abbreviation", () => {
      const result = registry.findByName("耐火構造告示");
      expect(result).toBeDefined();
      expect(result!.title).toBe("耐火構造の構造方法を定める件");
    });

    it("returns undefined for unknown names", () => {
      const result = registry.findByName("存在しない告示名");
      expect(result).toBeUndefined();
    });

    it("returns a match for empty string (partial match matches all titles)", () => {
      // Empty string is included in every title, so partial match returns the first preset
      const result = registry.findByName("");
      expect(result).toBeDefined();
    });
  });

  describe("search", () => {
    it("finds presets by keyword in title", () => {
      const results = registry.search("耐火");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((p) => p.title.includes("耐火"))).toBe(true);
    });

    it("finds presets by keyword in abbreviation", () => {
      const results = registry.search("採光");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(
        results.some(
          (p) =>
            p.title.includes("採光") ||
            p.abbrev.some((a) => a.includes("採光")),
        ),
      ).toBe(true);
    });

    it("returns empty array for unknown keyword", () => {
      const results = registry.search("絶対に存在しないキーワード");
      expect(results).toEqual([]);
    });
  });
});
