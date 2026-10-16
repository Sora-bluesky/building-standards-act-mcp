import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ArticleAnalysis } from "../../src/lib/types.js";

vi.mock("../../src/lib/article-analyzer.js", () => ({
  analyzeArticle: vi.fn(),
}));

import { analyzeArticle } from "../../src/lib/article-analyzer.js";
import { registerAnalyzeArticleTool } from "../../src/tools/analyze-article.js";

let handler: (params: {
  law_name: string;
  article_number: string;
}) => Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}>;
let outputSchema: z.ZodRawShape;

const mockServer = {
  registerTool: vi.fn(
    (
      _name: string,
      config: { outputSchema: z.ZodRawShape },
      fn: typeof handler,
    ) => {
      handler = fn;
      outputSchema = config.outputSchema;
    },
  ),
};

const analysis: ArticleAnalysis = {
  law_name: "建築基準法",
  law_num: "昭和二十五年法律第二百一号",
  article_num: "20",
  article_title: "第二十条",
  caption: "構造耐力",
  structure: {
    paragraph_count: 1,
    item_count: 0,
    subitem_count: 0,
    total_characters: 4,
  },
  paragraph_summaries: [{ paragraph_num: "1", preview: "test", item_count: 0 }],
  reference_summary: {
    total: 0,
    cross_law: 0,
    same_law: 0,
    relative: 0,
    delegation: 0,
    referenced_laws: [],
  },
  structured_data: {
    article_num: "20",
    article_title: "第二十条",
    article_caption: "（構造耐力）",
    paragraphs: [{ paragraph_num: "1", paragraph_sentence: "test", items: [] }],
  },
};

describe("analyze_article tool", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    registerAnalyzeArticleTool(mockServer as unknown as McpServer);
  });

  it("registers with correct name", () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      "analyze_article",
      expect.objectContaining({
        annotations: expect.objectContaining({ readOnlyHint: true }),
      }),
      expect.any(Function),
    );
  });

  it("returns the analysis as unchanged JSON text and structuredContent", async () => {
    vi.mocked(analyzeArticle).mockResolvedValue(analysis);

    const result = await handler({ law_name: "建築基準法", article_number: "20" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toBe(JSON.stringify(analysis, null, 2));
    expect(result.structuredContent).toEqual(analysis);
    expect(Object.keys(result.structuredContent ?? {}).sort()).toEqual([
      "article_num",
      "article_title",
      "caption",
      "law_name",
      "law_num",
      "paragraph_summaries",
      "reference_summary",
      "structure",
      "structured_data",
    ]);
    expect(z.object(outputSchema).parse(result.structuredContent)).toEqual(
      analysis,
    );
  });

  it("returns errors without structuredContent", async () => {
    vi.mocked(analyzeArticle).mockRejectedValue(
      new Error("Analysis unavailable"),
    );

    const result = await handler({ law_name: "建築基準法", article_number: "20" });

    expect(result.isError).toBe(true);
    expect(result).not.toHaveProperty("structuredContent");
    expect(result.content[0].text).toContain("内部エラー");
  });
});
