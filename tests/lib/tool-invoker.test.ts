import { describe, it, expect, beforeEach } from "vitest";
import {
  invokeTool,
  listTools,
  _resetClient,
} from "../../src/lib/tool-invoker.js";

describe("tool-invoker", () => {
  beforeEach(() => {
    _resetClient();
  });

  describe("listTools", () => {
    it("returns all 11 registered tools", async () => {
      const tools = await listTools();
      expect(tools.length).toBe(11);

      const names = tools.map((t) => t.name);
      expect(names).toContain("get_law");
      expect(names).toContain("get_full_law");
      expect(names).toContain("search_law");
      expect(names).toContain("get_kokuji");
      expect(names).toContain("validate_presets");
      expect(names).toContain("check_law_updates");
      expect(names).toContain("get_laws_batch");
      expect(names).toContain("verify_citation");
      expect(names).toContain("suggest_related");
      expect(names).toContain("analyze_article");
      expect(names).toContain("get_metrics");
    });

    it("each tool has name and inputSchema", async () => {
      const tools = await listTools();
      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe("object");
      }
    });

    it("reuses cached client across calls", async () => {
      const tools1 = await listTools();
      const tools2 = await listTools();
      expect(tools1.length).toBe(tools2.length);
    });
  });

  describe("invokeTool", () => {
    it("returns a result with content array for get_metrics", async () => {
      // get_metrics doesn't need API calls, safe to test directly
      const result = await invokeTool("get_metrics", {});
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe("text");
    });

    it("returns isError for non-existent tool", async () => {
      const result = await invokeTool("non_existent_tool", {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  describe("_resetClient", () => {
    it("allows re-initialization after reset", async () => {
      const tools1 = await listTools();
      _resetClient();
      const tools2 = await listTools();
      expect(tools1.length).toBe(tools2.length);
    });
  });
});
