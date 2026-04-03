import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { analyzeArticle } from "../lib/article-analyzer.js";
import { wrapToolHandler } from "../lib/tool-helpers.js";

const schema = {
  law_name: z
    .string()
    .max(200)
    .describe("法令名（正式名称または略称。例: 建築基準法、建基法）"),
  article_number: z.string().max(100).describe("条文番号（例: 第20条、20）"),
};

export function registerAnalyzeArticleTool(server: McpServer): void {
  server.tool(
    "analyze_article",
    "条文の構造を解析し、項数・号数・参照統計・プレビューなどのメタデータをJSON形式で返す。AIが要約・解説を生成する際の素材データとして活用。",
    schema,
    wrapToolHandler("analyze_article", async ({ law_name, article_number }) => {
      const analysis = await analyzeArticle(law_name, article_number);

      return {
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
