import { describe, it, expect } from "vitest";
import { LawRegistry } from "../../src/lib/law-registry.js";

describe("LawRegistry", () => {
  const registry = new LawRegistry();

  describe("findByName", () => {
    it("finds a law by exact title", () => {
      const result = registry.findByName("建築基準法");
      expect(result).toBeDefined();
      expect(result!.title).toBe("建築基準法");
      expect(result!.law_id).toBe("325AC0000000201");
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
      expect(result!.title).toBe("建築物の耐震改修の促進に関する法律");
    });

    it("returns undefined for an unknown law name", () => {
      const result = registry.findByName("存在しない法律");
      expect(result).toBeUndefined();
    });
  });

  describe("search", () => {
    it("returns matching presets for a keyword in titles", () => {
      const results = registry.search("建築");
      expect(results.length).toBeGreaterThan(0);
      // Should include at least 建築基準法
      expect(results.some((p) => p.title === "建築基準法")).toBe(true);
    });

    it("returns matching presets for a keyword in abbreviations", () => {
      const results = registry.search("建基");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((p) => p.title === "建築基準法")).toBe(true);
    });

    it("returns matching presets for a keyword in group", () => {
      const results = registry.search("防火");
      expect(results.length).toBeGreaterThan(0);
      // 4章 group contains 防火
      expect(results.some((p) => p.group.includes("防火"))).toBe(true);
    });

    it("returns an empty array when no presets match", () => {
      const results = registry.search("ランダムなキーワード");
      expect(results).toEqual([]);
    });
  });

  describe("getByGroup", () => {
    it("returns presets belonging to a specific chapter group", () => {
      const results = registry.getByGroup("1章");
      expect(results.length).toBeGreaterThan(0);
      // All results should be in a group containing "1章"
      for (const preset of results) {
        expect(preset.group).toContain("1章");
      }
    });

    it("includes expected laws in group 1章", () => {
      const results = registry.getByGroup("1章");
      const titles = results.map((p) => p.title);
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
    it("returns all presets", () => {
      const all = registry.getAll();
      expect(all.length).toBeGreaterThan(0);
    });

    it("returns a defensive copy (modifying result does not affect registry)", () => {
      const first = registry.getAll();
      const originalLength = first.length;

      // Mutate the returned array
      first.pop();

      const second = registry.getAll();
      expect(second.length).toBe(originalLength);
    });
  });
});
