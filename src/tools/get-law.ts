import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveLawId } from "../lib/law-resolver.js";
import { fetchParsedArticle } from "../lib/article-fetcher.js";
import { findAllMatches } from "../lib/text-find.js";
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

const MAX_LISTED_MATCHES = 20;
const FIND_LINE_MARGIN = 100;

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
    .describe("本文と参照一覧（references）を合わせた最大文字数（1,000〜500,000）。省略時は100,000文字。format=text のみ適用。"),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("本文の取得開始位置（0から始まる文字位置）。続きは案内された offset を指定。format=text のみ適用。"),
  find: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .describe("この条の本文から探す語。指定すると最初の一致を含む行から本文を返し、一致位置の一覧を matches に入れる。空白は無視し、全角・半角の違いは区別しない。長い条の中の項・表の行を探すときに使い、offset を推測しない。format=text のみ適用。続きは find を外して next_offset を指定。"),
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
  find: z.string().optional(),
  matches: z.array(z.number()).optional(),
  matches_total: z.number().optional(),
  references_total: z.number().optional(),
  references_truncated: z.boolean().optional(),
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
      description: "条番号を指定して法令の条文を取得する。附則・別表にも対応。略称・正式名称のいずれでも指定可能。format=structured で条→項→号の階層構造をJSON形式で取得可能。長い条の中の項・表の行は find で探し、offset を推測しない。",
      inputSchema: schema,
      annotations: TOOL_ANNOTATIONS,
      outputSchema,
    },
    wrapToolHandler("get_law", async ({
      law_name, article_number, format, max_chars = DEFAULT_MAX_CHARS, offset = 0, find,
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

      const { references: articleReferences, ...articleWithoutReferences } = article;
      const matches = find === undefined ? undefined : findAllMatches(article.text, find);
      const match = matches?.find((item) => item.start >= offset) ?? matches?.[0];
      const noMatch = matches?.length === 0;
      let pageStart = offset;
      if (match) {
        const lineStart = article.text.lastIndexOf("\n", match.start - 1) + 1;
        pageStart = match.end - lineStart > max_chars - FIND_LINE_MARGIN ? match.start : lineStart;
      }
      const page = noMatch
        ? { text: "", total_chars: article.text.length, offset, next_offset: null }
        : paginateAtLineBoundary(article.text, pageStart, max_chars);
      const findInfo = matches === undefined ? {} : {
        find,
        matches: matches.slice(0, MAX_LISTED_MATCHES).map((item) => item.start),
        matches_total: matches.length,
      };
      const pageReferences = noMatch ? undefined : page.offset > 0 || page.next_offset !== null
        ? articleReferences?.filter((ref) => page.text.includes(ref.raw_text))
        : articleReferences;
      let references = pageReferences;
      if (pageReferences) {
        let referenceChars = 2;
        let keep = 0;
        for (const ref of pageReferences) {
          const candidateChars = referenceChars + JSON.stringify(ref).length + (keep > 0 ? 1 : 0);
          if (page.text.length + candidateChars > max_chars) break;
          referenceChars = candidateChars;
          keep++;
        }
        references = pageReferences.slice(0, keep);
      }
      const referencesTotal = pageReferences?.length ?? 0;
      const referencesTruncated = (references?.length ?? 0) < referencesTotal;
      const lines = noMatch ? [
        `【${resolved.title}】${article.article_title}`,
        `この条に『${find}』は見つかりませんでした。（本文全体 ${page.total_chars} 文字。空白を無視し、全角・半角を区別せずに探しました）`,
      ] : [
        `【${resolved.title}】${article.article_title}`,
        article.article_caption ? article.article_caption : "",
        "",
        ...(matches === undefined ? [] : [
          `（『${find}』の一致 ${matches.length} 件。offset=${page.offset} から表示。一致位置: ${findInfo.matches?.join(", ")}）`,
        ]),
        page.text,
      ].filter((line) => line !== undefined);

      if (page.next_offset !== null) {
        lines.push(find === undefined
          ? `（続きがあります。offset=${page.next_offset} を指定して続きを取得してください。本文全体 ${page.total_chars} 文字）`
          : `（続きがあります。find を外し offset=${page.next_offset} を指定して続きを取得してください。本文全体 ${page.total_chars} 文字）`);
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
      if (referencesTruncated) {
        lines.push(`（参照 ${referencesTotal} 件のうち ${references?.length ?? 0} 件を表示。本文と合わせて max_chars を超える分は省略しました。参照は本文中の記述から抽出したもので、関連法令の一覧は suggest_related でも確認できます）`);
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
          article: { ...articleWithoutReferences, text: page.text, ...(references?.length ? { references } : {}) },
          total_chars: page.total_chars,
          offset: page.offset,
          next_offset: page.next_offset,
          truncated: page.next_offset !== null,
          ...findInfo,
          ...(referencesTruncated ? {
            references_total: referencesTotal,
            references_truncated: true,
          } : {}),
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
