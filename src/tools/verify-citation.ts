import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { verifyCitation } from "../lib/citation-verifier.js";
import { formatArticleRef } from "../lib/errors.js";
import type { CitationVerification } from "../lib/types.js";

const MAX_CITATIONS = 10;

const schema = {
  citations: z
    .array(
      z.object({
        law_name: z.string().describe("法令名（正式名称または略称）"),
        article_number: z.string().describe("条文番号（例: 第20条、20）"),
        claimed_text: z
          .string()
          .optional()
          .describe("AIが主張する条文テキスト。省略時は条文の存在確認のみ。"),
      }),
    )
    .describe("検証対象の引用リスト（最大10件）"),
};

function formatResults(results: CitationVerification[]): string {
  const verified = results.filter((r) => r.status === "verified");
  const mismatched = results.filter((r) => r.status === "mismatch");
  const notFound = results.filter(
    (r) => r.status === "article_not_found" || r.status === "law_not_found",
  );
  const errors = results.filter((r) => r.status === "error");

  const lines: string[] = [];
  lines.push("## 引用検証結果\n");
  lines.push(`- 検証対象: ${results.length}件`);
  lines.push(`- 正確: ${verified.length}件`);
  if (mismatched.length > 0) lines.push(`- **不一致: ${mismatched.length}件**`);
  if (notFound.length > 0) lines.push(`- 未発見: ${notFound.length}件`);
  if (errors.length > 0) lines.push(`- エラー: ${errors.length}件`);

  for (const r of results) {
    lines.push("");
    const icon =
      r.status === "verified"
        ? "OK"
        : r.status === "mismatch"
          ? "NG"
          : r.status === "error"
            ? "ERR"
            : "N/A";
    lines.push(
      `### [${icon}] ${r.law_name} ${formatArticleRef(r.article_number)}`,
    );

    if (r.match_score !== undefined) {
      lines.push(`- 一致度: ${(r.match_score * 100).toFixed(0)}%`);
    }

    if (r.mismatch_detail) {
      lines.push(`- ${r.mismatch_detail}`);
    }

    if (r.error_message) {
      lines.push(`- ${r.error_message}`);
    }

    if (r.actual_text) {
      lines.push(`- 実際の条文: ${r.actual_text}`);
    }
  }

  return lines.join("\n");
}

export function registerVerifyCitationTool(server: McpServer): void {
  server.tool(
    "verify_citation",
    "AIの回答に含まれる法令引用を検証する。条文の存在確認、テキスト照合による正確性チェックが可能。最大10件。",
    schema,
    async ({ citations }) => {
      try {
        if (citations.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "エラー: 検証対象が空です。",
              },
            ],
            isError: true,
          };
        }

        if (citations.length > MAX_CITATIONS) {
          return {
            content: [
              {
                type: "text" as const,
                text: `エラー: 検証対象が上限（${MAX_CITATIONS}件）を超えています（${citations.length}件）。`,
              },
            ],
            isError: true,
          };
        }

        const results: CitationVerification[] = [];

        for (const citation of citations) {
          const result = await verifyCitation(
            citation.law_name,
            citation.article_number,
            citation.claimed_text,
          );
          results.push(result);
        }

        const text = formatResults(results);
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
