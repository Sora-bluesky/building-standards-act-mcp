import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LawRegistry } from "../lib/law-registry.js";
import { getLawData } from "../lib/egov-client.js";
import { parseArticle, parseArticleStructured } from "../lib/egov-parser.js";
import type {
  BatchFetchItem,
  BatchFetchResult,
  EgovLawDataResponse,
} from "../lib/types.js";

const registry = new LawRegistry();

const MAX_REQUESTS = 20;

const schema = {
  requests: z
    .array(
      z.object({
        law_name: z.string().describe("法令名（正式名称または略称）"),
        article_number: z.string().describe("条文番号（例: 第20条、20）"),
        format: z
          .enum(["text", "structured"])
          .default("text")
          .describe("出力形式"),
      }),
    )
    .describe("取得対象の条文リスト（最大20件）"),
};

export function registerGetLawsBatchTool(server: McpServer): void {
  server.tool(
    "get_laws_batch",
    "複数の法令・条文を一括取得する。同一法令の複数条文はAPI呼び出し1回で効率的に処理。最大20件。",
    schema,
    async ({ requests }) => {
      try {
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
        const presetMap = new Map<
          string,
          { title: string; law_num: string } | null
        >();

        for (const req of requests) {
          if (lawDataMap.has(req.law_name)) continue;

          const preset = registry.findByName(req.law_name);
          if (!preset) {
            lawDataMap.set(req.law_name, null);
            presetMap.set(req.law_name, null);
            continue;
          }

          presetMap.set(req.law_name, {
            title: preset.title,
            law_num: preset.law_num,
          });

          try {
            const data = await getLawData(preset.law_id);
            lawDataMap.set(req.law_name, data);
          } catch {
            lawDataMap.set(req.law_name, null);
          }
        }

        // Process each request
        const results: BatchFetchItem[] = [];

        for (const req of requests) {
          const preset = presetMap.get(req.law_name);
          if (!preset) {
            results.push({
              law_name: req.law_name,
              article_number: req.article_number,
              status: "law_not_found",
              error_message: `法令「${req.law_name}」がプリセットに見つかりませんでした。`,
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
                  law_name: preset.title,
                  article_number: req.article_number,
                  status: "article_not_found",
                  error_message: `${preset.title}に第${req.article_number}条が見つかりませんでした。`,
                });
              } else {
                results.push({
                  law_name: preset.title,
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
                  law_name: preset.title,
                  article_number: req.article_number,
                  status: "article_not_found",
                  error_message: `${preset.title}に第${req.article_number}条が見つかりませんでした。`,
                });
              } else {
                results.push({
                  law_name: preset.title,
                  article_number: req.article_number,
                  status: "success",
                  text: article.text,
                });
              }
            }
          } catch (error) {
            results.push({
              law_name: preset.title,
              article_number: req.article_number,
              status: "error",
              error_message:
                error instanceof Error ? error.message : String(error),
            });
          }
        }

        const successCount = results.filter(
          (r) => r.status === "success",
        ).length;

        const response: BatchFetchResult = {
          total: results.length,
          success: successCount,
          failed: results.length - successCount,
          results,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
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
