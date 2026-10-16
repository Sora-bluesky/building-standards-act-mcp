import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { normalizeKeyword, searchKeyword } from "../lib/egov-client.js";
import { resolveLawId } from "../lib/law-resolver.js";
import { LawNotFoundError } from "../lib/errors.js";
import { TOOL_ANNOTATIONS, wrapToolHandler } from "../lib/tool-helpers.js";

const inputSchema = {
  keyword: z.string().max(200).describe(
    "本文の検索語。半角スペース区切りで AND 検索。AND・OR・NOT は演算子ではなく検索語として扱われる。全角スペースは半角に直して送る。*・? のワイルドカードが使用可能",
  ),
  law_title: z.string().max(200).optional().describe("法令名または略称で絞り込み"),
  limit: z.number().int().min(1).max(50).default(10).describe("取得する文の数（最大50）"),
  offset: z.number().int().min(0).default(0).describe("検索開始位置（文単位）"),
};

const outputSchema = {
  keyword: z.string(),
  law_title: z.string().optional(),
  total_count: z.number(),
  sentence_count: z.number(),
  next_offset: z.number().nullable(),
  hits: z.array(z.object({
    law_title: z.string(),
    law_id: z.string(),
    law_num: z.string(),
    position: z.string(),
    text: z.string(),
    amendment_promulgate_date: z.string(),
  })),
} satisfies z.ZodRawShape;

export function registerSearchArticlesTool(server: McpServer): void {
  server.registerTool(
    "search_articles",
    {
      title: "条文本文検索",
      description: "条文本文をキーワードで検索する。半角スペース区切りで AND 検索。AND・OR・NOT は演算子ではなく検索語として扱われる。全角スペースは半角に直して送る。*・? のワイルドカードに対応。法令名・略称で絞り込み可能。検索結果は節名と抜粋のみで条番号は返らないため、正確な条文は get_law で確認してください。",
      inputSchema,
      outputSchema,
      annotations: TOOL_ANNOTATIONS,
    },
    wrapToolHandler("search_articles", async ({ keyword, law_title, limit, offset }) => {
      keyword = normalizeKeyword(keyword);
      if (!keyword) {
        return {
          isError: true,
          content: [{ type: "text", text: "検索語が空です。半角スペース区切りで語を指定してください。" }],
        };
      }
      const resolved = law_title !== undefined
        ? await resolveLawId(law_title)
        : undefined;
      if (law_title !== undefined && !resolved) {
        throw new LawNotFoundError(law_title);
      }
      const result = await searchKeyword({
        keyword,
        lawNum: resolved?.law_num,
        limit,
        offset,
      });
      const hits = result.items.flatMap((item) =>
        item.sentences.map((sentence) => ({
          law_title: item.revision_info.law_title,
          law_id: item.law_info.law_id,
          law_num: item.law_info.law_num,
          position: sentence.position,
          text: sentence.text
            .replace(/<span\b[^>]*>/gi, "【")
            .replace(/<\/span\s*>/gi, "】")
            .replace(/<[^>]*>/g, ""),
          amendment_promulgate_date: item.revision_info.amendment_promulgate_date,
        })),
      );
      const structuredContent = {
        keyword,
        law_title: resolved?.title,
        total_count: result.total_count,
        sentence_count: result.sentence_count,
        next_offset: result.next_offset ?? null,
        hits,
      };
      const lines = [
        `## 条文本文検索結果「${keyword}」`,
        `該当件数: ${result.total_count}件（今回取得: ${result.sentence_count}文）`,
      ];
      if (typeof result.next_offset === "number") {
        lines.push(`次の offset: ${result.next_offset}`);
      }
      if (hits.length === 0) {
        lines.push(
          "該当する条文はありませんでした。",
          "検索語は半角スペース区切りで AND 検索します。AND・OR・NOT は演算子ではなく検索語として扱われます。",
        );
      }
      for (const hit of hits) {
        lines.push(`- **${hit.law_title}** [${hit.position}] ${hit.text}`);
      }
      lines.push(
        "",
        "※ e-Gov の検索結果は節名のみで、条番号は返りません。正確な条文は get_law で取得・確認してください。",
      );
      return {
        structuredContent,
        content: [{ type: "text", text: lines.join("\n") }],
      };
    }),
  );
}
