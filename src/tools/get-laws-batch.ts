import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveLawId } from "../lib/law-resolver.js";
import { getLawData } from "../lib/egov-client.js";
import { parseArticle, parseArticleStructured } from "../lib/egov-parser.js";
import { formatArticleRef } from "../lib/errors.js";
import { TOOL_ANNOTATIONS, wrapToolHandler } from "../lib/tool-helpers.js";
import { structuredArticleSchema } from "../lib/article-schemas.js";
import type {
  BatchFetchItem,
  BatchFetchResult,
  EgovLawDataResponse,
} from "../lib/types.js";

const MAX_REQUESTS = 20;

const schema = {
  requests: z
    .array(
      z.object({
        law_name: z.string().max(200).describe("法令名（正式名称または略称）"),
        article_number: z
          .string()
          .max(100)
          .describe("条文番号（例: 第20条、20）"),
        format: z
          .enum(["text", "structured"])
          .default("text")
          .describe("出力形式"),
      }),
    )
    .max(20)
    .describe("取得対象の条文リスト（最大20件）"),
};

const outputSchema = {
  total: z.number(),
  success: z.number(),
  failed: z.number(),
  results: z.array(
    z.object({
      law_name: z.string(),
      article_number: z.string(),
      status: z.enum([
        "success",
        "law_not_found",
        "article_not_found",
        "error",
      ]),
      text: z.string().optional(),
      structured: structuredArticleSchema.optional(),
      error_message: z.string().optional(),
    }),
  ),
} satisfies z.ZodRawShape;

export function registerGetLawsBatchTool(server: McpServer): void {
  server.registerTool(
    "get_laws_batch",
    {
      title: "条文一括取得",
      description: "複数の法令・条文を一括取得する。同一法令の複数条文はAPI呼び出し1回で効率的に処理。最大20件。",
      inputSchema: schema,
      annotations: TOOL_ANNOTATIONS,
      outputSchema,
    },
    wrapToolHandler("get_laws_batch", async ({ requests }) => {
      if (requests.length > MAX_REQUESTS) {
        return {
          content: [
            {
              type: "text" as const,
              text: `エラー: リクエスト数が上限（${MAX_REQUESTS}件）を超えています（${requests.length}件）。`,
            },
          ],
          isError: true,
        };
      }

      if (requests.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "エラー: リクエストが空です。",
            },
          ],
          isError: true,
        };
      }

      // Group requests by law_name to minimize API calls
      const lawDataMap = new Map<string, EgovLawDataResponse | null>();
      const resolvedMap = new Map<
        string,
        { title: string; law_num: string; source: string } | null
      >();

      for (const req of requests) {
        if (lawDataMap.has(req.law_name)) continue;

        const resolved = await resolveLawId(req.law_name);
        if (!resolved) {
          lawDataMap.set(req.law_name, null);
          resolvedMap.set(req.law_name, null);
          continue;
        }

        resolvedMap.set(req.law_name, {
          title: resolved.title,
          law_num: resolved.law_num,
          source: resolved.source,
        });

        try {
          const data = await getLawData(resolved.law_id);
          lawDataMap.set(req.law_name, data);
        } catch {
          lawDataMap.set(req.law_name, null);
        }
      }

      // Process each request
      const results: BatchFetchItem[] = [];

      for (const req of requests) {
        const resolvedInfo = resolvedMap.get(req.law_name);
        if (!resolvedInfo) {
          results.push({
            law_name: req.law_name,
            article_number: req.article_number,
            status: "law_not_found",
            error_message: `法令「${req.law_name}」が見つかりませんでした。`,
          });
          continue;
        }

        const lawData = lawDataMap.get(req.law_name);
        if (!lawData) {
          results.push({
            law_name: req.law_name,
            article_number: req.article_number,
            status: "error",
            error_message: `法令「${req.law_name}」のデータ取得に失敗しました。`,
          });
          continue;
        }

        try {
          if (req.format === "structured") {
            const structured = parseArticleStructured(
              lawData.law_full_text,
              req.article_number,
            );
            if (!structured) {
              results.push({
                law_name: resolvedInfo.title,
                article_number: req.article_number,
                status: "article_not_found",
                error_message: `${resolvedInfo.title}に${formatArticleRef(req.article_number)}が見つかりませんでした。`,
              });
            } else {
              results.push({
                law_name: resolvedInfo.title,
                article_number: req.article_number,
                status: "success",
                structured,
              });
            }
          } else {
            const article = parseArticle(
              lawData.law_full_text,
              req.article_number,
            );
            if (!article) {
              results.push({
                law_name: resolvedInfo.title,
                article_number: req.article_number,
                status: "article_not_found",
                error_message: `${resolvedInfo.title}に${formatArticleRef(req.article_number)}が見つかりませんでした。`,
              });
            } else {
              results.push({
                law_name: resolvedInfo.title,
                article_number: req.article_number,
                status: "success",
                text: article.text,
              });
            }
          }
        } catch (error) {
          results.push({
            law_name: resolvedInfo.title,
            article_number: req.article_number,
            status: "error",
            error_message:
              error instanceof Error ? error.message : String(error),
          });
        }
      }

      const successCount = results.filter((r) => r.status === "success").length;

      const response: BatchFetchResult = {
        total: results.length,
        success: successCount,
        failed: results.length - successCount,
        results,
      };

      return {
        structuredContent: { ...response },
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }),
  );
}
