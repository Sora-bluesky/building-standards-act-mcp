import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LawRegistry } from "../lib/law-registry.js";
import { getLawData } from "../lib/egov-client.js";
import { parseArticle } from "../lib/egov-parser.js";
import { LawNotFoundError, ArticleNotFoundError } from "../lib/errors.js";

const registry = new LawRegistry();

const schema = {
  law_name: z
    .string()
    .describe("法令名（正式名称、略称のいずれか。例: 建築基準法、建基法）"),
  article_number: z.string().describe("条文番号（例: 第20条、20、第6条の2）"),
};

export function registerGetLawTool(server: McpServer): void {
  server.tool(
    "get_law",
    "条番号を指定して法令の条文を取得する。略称・正式名称のいずれでも指定可能。",
    schema,
    async ({ law_name, article_number }) => {
      try {
        const preset = registry.findByName(law_name);
        if (!preset) {
          throw new LawNotFoundError(law_name);
        }

        const lawData = await getLawData(preset.law_id);
        const article = parseArticle(lawData.law_full_text, article_number);

        if (!article) {
          throw new ArticleNotFoundError(article_number, preset.title);
        }

        const text = [
          `【${preset.title}】${article.article_title}`,
          article.article_caption ? article.article_caption : "",
          "",
          article.text,
          "",
          `出典: e-Gov法令検索（法令番号: ${preset.law_num}）`,
        ]
          .filter((line) => line !== undefined)
          .join("\n");

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `エラー: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
