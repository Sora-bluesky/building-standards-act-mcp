import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveLawId } from "../lib/law-resolver.js";
import { fetchParsedArticle } from "../lib/article-fetcher.js";
import { ArticleNotFoundError, formatArticleRef } from "../lib/errors.js";
import {
  paginateAtLineBoundary,
  TOOL_ANNOTATIONS,
  wrapToolHandler,
} from "../lib/tool-helpers.js";
import { structuredArticleSchema } from "../lib/article-schemas.js";
import type {
  BatchFetchItem,
  BatchFetchResult,
  ResolvedLaw,
} from "../lib/types.js";

const MAX_REQUESTS = 20;
const DEFAULT_MAX_CHARS_PER_ITEM = 8_000;
const DEFAULT_MAX_TOTAL_CHARS = 40_000;

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
  max_chars_per_item: z
    .number()
    .int()
    .min(1_000)
    .max(30_000)
    .default(DEFAULT_MAX_CHARS_PER_ITEM)
    .describe("条文ごとの最大文字数（1,000〜30,000）。省略時は8,000文字。"),
  max_total_chars: z
    .number()
    .int()
    .min(10_000)
    .max(500_000)
    .default(DEFAULT_MAX_TOTAL_CHARS)
    .describe("応答全体のJSONの最大文字数（10,000〜500,000）。省略時は40,000文字。超過分の本文は省略。"),
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
      revision_note: z.string().optional(),
      truncated: z.boolean().optional(),
      next_offset: z.number().nullable().optional(),
      total_chars: z.number().optional(),
      omitted: z.boolean().optional(),
      note: z.string().optional(),
    }),
  ),
  omitted: z.array(z.object({
    law_name: z.string(),
    article_number: z.string(),
  })).optional(),
  note: z.string().optional(),
} satisfies z.ZodRawShape;

export function registerGetLawsBatchTool(server: McpServer): void {
  server.registerTool(
    "get_laws_batch",
    {
      title: "条文一括取得",
      description: "複数の法令・条文を一括取得する。各条文をe-Govから個別に条単位取得する。最大20件。長い条（例: 建築基準法施行規則 第1条の3）は get_law で個別に取得。",
      inputSchema: schema,
      annotations: TOOL_ANNOTATIONS,
      outputSchema,
    },
    wrapToolHandler("get_laws_batch", async ({
      requests,
      max_chars_per_item = DEFAULT_MAX_CHARS_PER_ITEM,
      max_total_chars = DEFAULT_MAX_TOTAL_CHARS,
    }) => {
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

      // Resolve each distinct law name once, then fetch articles individually.
      const resolvedMap = new Map<string, ResolvedLaw | null>();
      for (const req of requests) {
        if (!resolvedMap.has(req.law_name)) {
          resolvedMap.set(req.law_name, await resolveLawId(req.law_name));
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

        try {
          if (req.format === "structured") {
            const fetched = await fetchParsedArticle(
              resolvedInfo.law_id,
              req.article_number,
              "structured",
            );
            const structured = fetched?.article;
            if (!structured) {
              results.push({
                law_name: resolvedInfo.title,
                article_number: req.article_number,
                status: "article_not_found",
                error_message: `${resolvedInfo.title}に${formatArticleRef(req.article_number)}が見つかりませんでした。`,
              });
            } else {
              const truncated = JSON.stringify(structured).length > max_chars_per_item;
              const limited = truncated ? { ...structured, paragraphs: [] } : structured;
              if (truncated) {
                for (const paragraph of structured.paragraphs) {
                  const candidate = { ...limited, paragraphs: [...limited.paragraphs, paragraph] };
                  if (JSON.stringify(candidate).length > max_chars_per_item) break;
                  limited.paragraphs = candidate.paragraphs;
                }
              }
              results.push({
                law_name: resolvedInfo.title,
                article_number: req.article_number,
                status: "success",
                structured: limited,
                ...(truncated ? {
                  truncated: true,
                  next_offset: null,
                  note: `構造化形式は項単位で切り詰めました。全文は get_law("${resolvedInfo.title}", "${req.article_number}", format="text", offset=0) から offset で順に取得してください。`,
                } : {}),
                ...(fetched?.revisionNote ? { revision_note: fetched.revisionNote } : {}),
              });
            }
          } else {
            const fetched = await fetchParsedArticle(
              resolvedInfo.law_id,
              req.article_number,
              "text",
            );
            const article = fetched?.article;
            if (!article) {
              results.push({
                law_name: resolvedInfo.title,
                article_number: req.article_number,
                status: "article_not_found",
                error_message: `${resolvedInfo.title}に${formatArticleRef(req.article_number)}が見つかりませんでした。`,
              });
            } else {
              const page = paginateAtLineBoundary(article.text, 0, max_chars_per_item);
              const truncated = page.next_offset !== null;
              let text = page.text;
              if (truncated) {
                text += `\n\n（続きは get_law("${resolvedInfo.title}", "${req.article_number}", offset=${page.next_offset}, max_chars=${max_chars_per_item}) で取得。本文全体 ${page.total_chars} 文字）`;
              }
              if (fetched?.revisionNote) text += `\n\n${fetched.revisionNote}`;
              results.push({
                law_name: resolvedInfo.title,
                article_number: req.article_number,
                status: "success",
                text,
                ...(truncated ? {
                  truncated: true,
                  next_offset: page.next_offset,
                  total_chars: page.total_chars,
                } : {}),
              });
            }
          }
        } catch (error) {
          results.push({
            law_name: resolvedInfo.title,
            article_number: req.article_number,
            status: error instanceof ArticleNotFoundError ? "article_not_found" : "error",
            error_message:
              error instanceof ArticleNotFoundError
                ? error.message
                : `法令「${req.law_name}」のデータ取得に失敗しました。`,
          });
        }
      }

      const successCount = results.filter((r) => r.status === "success").length;

      let response: BatchFetchResult = {
        total: results.length,
        success: successCount,
        failed: results.length - successCount,
        results,
      };

      // Measure the final JSON, including omission metadata, for each prefix.
      let text = JSON.stringify(response, null, 2);
      if (text.length > max_total_chars) {
        for (let keep = results.length - 1; keep >= 0; keep--) {
          const omitted = results.slice(keep).map(({ law_name, article_number }) => ({
            law_name, article_number,
          }));
          response = {
            ...response,
            results: results.map((item, index) => {
              if (index < keep) return item;
              const omittedItem = { ...item, omitted: true };
              delete omittedItem.text;
              delete omittedItem.structured;
              delete omittedItem.revision_note;
              delete omittedItem.truncated;
              delete omittedItem.next_offset;
              delete omittedItem.total_chars;
              delete omittedItem.note;
              return omittedItem;
            }),
            omitted,
            note: `応答全体の上限（max_total_chars=${max_total_chars}）に達したため、次の ${omitted.length} 件は本文を省略しました。未取得: ${omitted.map((item) => `${item.law_name} ${item.article_number}`).join(", ")} 。get_law で個別に取得するか、件数を減らして再実行してください。`,
          };
          text = JSON.stringify(response, null, 2);
          if (text.length <= max_total_chars) break;
        }
      }

      return {
        structuredContent: { ...response },
        content: [
          {
            type: "text" as const,
            text,
          },
        ],
      };
    }),
  );
}
