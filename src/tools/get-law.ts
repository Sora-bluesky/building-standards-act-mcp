import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveLawId } from "../lib/law-resolver.js";
import { getLawData } from "../lib/egov-client.js";
import { parseArticle, parseArticleStructured } from "../lib/egov-parser.js";
import { LawNotFoundError, ArticleNotFoundError } from "../lib/errors.js";

const schema = {
  law_name: z
    .string()
    .describe("法令名（正式名称、略称のいずれか。例: 建築基準法、建基法）"),
  article_number: z.string().describe("条文番号（例: 第20条、20、第6条の2）"),
  format: z
    .enum(["text", "structured"])
    .default("text")
    .describe(
      "出力形式。text: 従来のテキスト形式、structured: 条→項→号の階層を持つJSON構造化形式",
    ),
};

export function registerGetLawTool(server: McpServer): void {
  server.tool(
    "get_law",
    "条番号を指定して法令の条文を取得する。略称・正式名称のいずれでも指定可能。format=structured で条→項→号の階層構造をJSON形式で取得可能。",
    schema,
    async ({ law_name, article_number, format }) => {
      try {
        const resolved = await resolveLawId(law_name);
        if (!resolved) {
          throw new LawNotFoundError(law_name);
        }

        const lawData = await getLawData(resolved.law_id);

        if (format === "structured") {
          const structured = parseArticleStructured(
            lawData.law_full_text,
            article_number,
          );

          if (!structured) {
            throw new ArticleNotFoundError(article_number, resolved.title);
          }

          const response: Record<string, unknown> = {
            law_title: resolved.title,
            law_num: resolved.law_num,
            source: "e-Gov法令検索",
            article: structured,
          };
          if (resolved.source === "egov_search") {
            response.note =
              "この法令は略称マップに登録されていないため、e-Gov法令検索から取得しました。";
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(response, null, 2),
              },
            ],
          };
        }

        // Default: text format (backward compatible)
        const article = parseArticle(lawData.law_full_text, article_number);

        if (!article) {
          throw new ArticleNotFoundError(article_number, resolved.title);
        }

        const lines = [
          `【${resolved.title}】${article.article_title}`,
          article.article_caption ? article.article_caption : "",
          "",
          article.text,
        ].filter((line) => line !== undefined);

        if (article.references && article.references.length > 0) {
          const refLabels: Record<string, string> = {
            cross_law: "他法令",
            same_law: "同法令",
            relative: "相対参照",
            delegation: "委任",
            unknown: "その他",
          };
          lines.push("");
          lines.push("■ 検出された参照:");
          for (const ref of article.references) {
            const label = refLabels[ref.ref_type] ?? ref.ref_type;
            lines.push(`  - [${label}] ${ref.raw_text}`);
          }
        }

        lines.push("");
        lines.push(`出典: e-Gov法令検索（法令番号: ${resolved.law_num}）`);
        if (resolved.source === "egov_search") {
          lines.push(
            "※ この法令は略称マップに登録されていないため、e-Gov法令検索から取得しました。",
          );
        }
        const text = lines.join("\n");

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
