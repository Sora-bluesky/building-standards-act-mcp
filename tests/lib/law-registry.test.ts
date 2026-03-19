import { describe, it, expect } from "vitest";
import { LawRegistry } from "../../src/lib/law-registry.js";

describe("LawRegistry", () => {
  const registry = new LawRegistry();

  describe("findByName", () => {
    it("finds a law by exact title", () => {
      const result = registry.findByName("建築基準法");
      expect(result).toBeDefined();
      expect(result!.title).toBe("建築基準法");
    });

    it("finds a law by abbreviation", () => {
      const result = registry.findByName("建基法");
      expect(result).toBeDefined();
      expect(result!.title).toBe("建築基準法");
    });

    it("finds a law by another abbreviation variant", () => {
      const result = registry.findByName("都計法");
      expect(result).toBeDefined();
      expect(result!.title).toBe("都市計画法");
    });

    it("finds a law by partial match when no exact or abbreviation match", () => {
      const result = registry.findByName("耐震改修");
      expect(result).toBeDefined();
      expect(result!.title).toContain("耐震改修");
    });

    it("returns undefined for an unknown law name", () => {
      const result = registry.findByName("存在しない法律");
      expect(result).toBeUndefined();
    });
  });

  describe("search", () => {
    it("returns matching aliases for a keyword in titles", () => {
      const results = registry.search("建築");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((a) => a.title === "建築基準法")).toBe(true);
    });

    it("returns matching aliases for a keyword in abbreviations", () => {
      const results = registry.search("建基");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((a) => a.title === "建築基準法")).toBe(true);
    });

    it("returns matching aliases for a keyword in group", () => {
      const results = registry.search("防火");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((a) => a.group.includes("防火"))).toBe(true);
    });

    it("returns an empty array when no aliases match", () => {
      const results = registry.search("ランダムなキーワード");
      expect(results).toEqual([]);
    });
  });

  describe("getByGroup", () => {
    it("returns aliases belonging to a specific chapter group", () => {
      const results = registry.getByGroup("1章");
      expect(results.length).toBeGreaterThan(0);
      for (const alias of results) {
        expect(alias.group).toContain("1章");
      }
    });

    it("includes expected laws in group 1章", () => {
      const results = registry.getByGroup("1章");
      const titles = results.map((a) => a.title);
      expect(titles).toContain("建築基準法");
      expect(titles).toContain("建築基準法施行令");
      expect(titles).toContain("建築基準法施行規則");
      expect(titles).toContain("民法");
    });

    it("returns an empty array for a non-existent group", () => {
      const results = registry.getByGroup("99章");
      expect(results).toEqual([]);
    });
  });

  describe("getAll", () => {
    it("returns all aliases", () => {
      const all = registry.getAll();
      expect(all.length).toBeGreaterThan(0);
    });

    it("returns a defensive copy (modifying result does not affect registry)", () => {
      const first = registry.getAll();
      const originalLength = first.length;
      first.pop();
      const second = registry.getAll();
      expect(second.length).toBe(originalLength);
    });
  });

  describe("alias data integrity", () => {
    it("contains at least 100 aliases", () => {
      const all = registry.getAll();
      expect(all.length).toBeGreaterThanOrEqual(100);
    });

    it("has no duplicate titles", () => {
      const all = registry.getAll();
      const titles = all.map((a) => a.title);
      const unique = new Set(titles);
      expect(unique.size).toBe(titles.length);
    });

    it("covers all 11 chapters", () => {
      for (let ch = 1; ch <= 11; ch++) {
        const results = registry.getByGroup(`${ch}章`);
        expect(results.length).toBeGreaterThan(0);
      }
    });

    it("all aliases have non-empty abbrev", () => {
      const all = registry.getAll();
      for (const alias of all) {
        expect(alias.abbrev.length).toBeGreaterThan(0);
      }
    });

    it("finds newly added laws by name", () => {
      expect(registry.findByName("地震防災特措法")).toBeDefined();
      expect(registry.findByName("JIS法")).toBeDefined();
      expect(registry.findByName("民泊新法")).toBeDefined();
    });
  });
});
