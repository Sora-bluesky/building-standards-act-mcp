import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { analyzeArticle } from "../lib/article-analyzer.js";
import { TOOL_ANNOTATIONS, wrapToolHandler } from "../lib/tool-helpers.js";
import { structuredArticleSchema } from "../lib/article-schemas.js";

const schema = {
  law_name: z
    .string()
    .max(200)
    .describe("法令名（正式名称または略称。例: 建築基準法、建基法）"),
  article_number: z.string().max(100).describe("条文番号（例: 第20条、20）"),
};

const outputSchema = {
  law_name: z.string(),
  law_num: z.string(),
  article_num: z.string(),
  article_title: z.string(),
  caption: z.string(),
  structure: z.object({
    paragraph_count: z.number(),
    item_count: z.number(),
    subitem_count: z.number(),
    total_characters: z.number(),
  }),
  paragraph_summaries: z.array(
    z.object({
      paragraph_num: z.string(),
      preview: z.string(),
      item_count: z.number(),
    }),
  ),
  reference_summary: z.object({
    total: z.number(),
    cross_law: z.number(),
    same_law: z.number(),
    relative: z.number(),
    delegation: z.number(),
    referenced_laws: z.array(z.string()),
  }),
  structured_data: structuredArticleSchema,
} satisfies z.ZodRawShape;

export function registerAnalyzeArticleTool(server: McpServer): void {
  server.registerTool(
    "analyze_article",
    {
      title: "条文構造解析",
      description: "条文の構造を解析し、項数・号数・参照統計・プレビューなどのメタデータをJSON形式で返す。AIが要約・解説を生成する際の素材データとして活用。",
      inputSchema: schema,
      annotations: TOOL_ANNOTATIONS,
      outputSchema,
    },
    wrapToolHandler("analyze_article", async ({ law_name, article_number }) => {
      const analysis = await analyzeArticle(law_name, article_number);

      return {
        structuredContent: { ...analysis },
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(analysis, null, 2),
          },
        ],
      };
    }),
  );
}
