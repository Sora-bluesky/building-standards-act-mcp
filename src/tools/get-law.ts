import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveLawId } from "../lib/law-resolver.js";
import { fetchParsedArticle } from "../lib/article-fetcher.js";
import { LawNotFoundError, ArticleNotFoundError } from "../lib/errors.js";
import {
  DEFAULT_MAX_CHARS,
  paginateAtLineBoundary,
  TOOL_ANNOTATIONS,
  wrapToolHandler,
} from "../lib/tool-helpers.js";
import {
  parsedArticleSchema,
  structuredArticleSchema,
} from "../lib/article-schemas.js";

const schema = {
  law_name: z
    .string()
    .max(200)
    .describe("法令名（正式名称、略称のいずれか。例: 建築基準法、建基法）"),
  article_number: z
    .string()
    .max(100)
    .describe(
      "条文番号（例: 第20条、20、第6条の2、附則、附則第3条、別表第一）",
    ),
  format: z
    .enum(["text", "structured"])
    .default("text")
    .describe(
      "出力形式。text: 従来のテキスト形式、structured: 条→項→号の階層を持つJSON構造化形式",
    ),
  max_chars: z
    .number()
    .int()
    .min(1_000)
    .max(500_000)
    .default(DEFAULT_MAX_CHARS)
    .describe("本文の最大文字数（1,000〜500,000）。省略時は100,000文字。format=text のみ適用。"),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("本文の取得開始位置（0から始まる文字位置）。続きは案内された offset を指定。format=text のみ適用。"),
};

const outputSchema = {
  law_title: z.string(),
  law_num: z.string(),
  source: z.literal("e-Gov法令検索"),
  format: z.enum(["text", "structured"]),
  article: z.union([parsedArticleSchema, structuredArticleSchema]),
  total_chars: z.number().optional(),
  offset: z.number().optional(),
  next_offset: z.number().nullable().optional(),
  truncated: z.boolean().optional(),
  note: z.string().optional(),
  revision_note: z.string().optional(),
  revision: z.object({
    law_revision_id: z.string(),
    amendment_enforcement_date: z.string(),
    current_revision_status: z.string(),
  }).optional(),
} satisfies z.ZodRawShape;

export function registerGetLawTool(server: McpServer): void {
  server.registerTool(
    "get_law",
    {
      title: "条文取得",
      description: "条番号を指定して法令の条文を取得する。附則・別表にも対応。略称・正式名称のいずれでも指定可能。format=structured で条→項→号の階層構造をJSON形式で取得可能。",
      inputSchema: schema,
      annotations: TOOL_ANNOTATIONS,
      outputSchema,
    },
    wrapToolHandler("get_law", async ({
      law_name, article_number, format, max_chars = DEFAULT_MAX_CHARS, offset = 0,
    }) => {
      const resolved = await resolveLawId(law_name);
      if (!resolved) {
        throw new LawNotFoundError(law_name);
      }

      if (format === "structured") {
        const fetched = await fetchParsedArticle(
          resolved.law_id,
          article_number,
          "structured",
        );
        const structured = fetched?.article;

        if (!structured) {
          throw new ArticleNotFoundError(article_number, resolved.title);
        }

        const response: Record<string, unknown> = {
          law_title: resolved.title,
          law_num: resolved.law_num,
          source: "e-Gov法令検索",
          article: structured,
          ...(fetched?.revision
            ? { revision: fetched.revision, revision_note: fetched.revisionNote }
            : {}),
        };
        if (resolved.source === "egov_search") {
          response.note =
            "この法令は略称マップに登録されていないため、e-Gov法令検索から取得しました。";
        }

        return {
          structuredContent: { ...response, format: "structured" },
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      }

      // Offsets address only the article body, matching get_laws_batch.
      const fetched = await fetchParsedArticle(
        resolved.law_id,
        article_number,
        "text",
      );
      const article = fetched?.article;

      if (!article) {
        throw new ArticleNotFoundError(article_number, resolved.title);
      }

      const page = paginateAtLineBoundary(article.text, offset, max_chars);
      const references = offset > 0 || page.next_offset !== null
        ? article.references?.filter((ref) => page.text.includes(ref.raw_text))
        : article.references;
      const lines = [
        `【${resolved.title}】${article.article_title}`,
        article.article_caption ? article.article_caption : "",
        "",
        page.text,
      ].filter((line) => line !== undefined);

      if (page.next_offset !== null) {
        lines.push(`（続きがあります。offset=${page.next_offset} を指定して続きを取得してください。本文全体 ${page.total_chars} 文字）`);
      }

      if (references && references.length > 0) {
        const refLabels: Record<string, string> = {
          cross_law: "他法令",
          same_law: "同法令",
          relative: "相対参照",
          delegation: "委任",
          unknown: "その他",
        };
        lines.push("");
        lines.push("■ 検出された参照:");
        for (const ref of references) {
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
      if (fetched?.revisionNote) lines.push(fetched.revisionNote);
      const text = lines.join("\n");

      return {
        content: [{ type: "text" as const, text }],
        structuredContent: {
          law_title: resolved.title,
          law_num: resolved.law_num,
          source: "e-Gov法令検索",
          format: "text",
          article: { ...article, text: page.text, ...(references ? { references } : {}) },
          total_chars: page.total_chars,
          offset: page.offset,
          next_offset: page.next_offset,
          truncated: page.next_offset !== null,
          ...(fetched?.revision
            ? { revision: fetched.revision, revision_note: fetched.revisionNote }
            : {}),
          ...(resolved.source === "egov_search"
            ? {
                note: "この法令は略称マップに登録されていないため、e-Gov法令検索から取得しました。",
              }
            : {}),
        },
      };
    }),
  );
}
