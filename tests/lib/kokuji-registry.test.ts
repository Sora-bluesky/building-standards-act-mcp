import { describe, it, expect } from "vitest";
import { KokujiRegistry } from "../../src/lib/kokuji-registry.js";

describe("KokujiRegistry", () => {
  const registry = new KokujiRegistry();

  describe("getAll", () => {
    it("returns an empty array (no kokuji available via e-Gov API v2)", () => {
      const all = registry.getAll();
      expect(all).toEqual([]);
    });

    it("returns a defensive copy (different reference each call)", () => {
      const first = registry.getAll();
      const second = registry.getAll();
      expect(first).not.toBe(second);
    });
  });

  describe("findByName", () => {
    it("returns undefined for any name (presets are empty)", () => {
      const result = registry.findByName("耐火構造の構造方法を定める件");
      expect(result).toBeUndefined();
    });

    it("returns undefined for an empty string", () => {
      const result = registry.findByName("");
      expect(result).toBeUndefined();
    });
  });
});
