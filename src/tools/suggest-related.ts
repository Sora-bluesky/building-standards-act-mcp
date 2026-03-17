import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findRelatedLaws } from "../lib/related-law-finder.js";
import type { RelatedLawSuggestion } from "../lib/types.js";

const schema = {
  law_name: z
    .string()
    .describe("法令名（正式名称または略称。例: 建築基準法、建基法）"),
  article_number: z.string().describe("条文番号（例: 第20条、20）"),
};

function formatSuggestion(result: RelatedLawSuggestion): string {
  const lines: string[] = [];
  lines.push(
    `## ${result.source_law} 第${result.source_article}条 の関連法令\n`,
  );

  if (result.directly_referenced.length > 0) {
    lines.push("### 直接参照されている法令\n");
    for (const ref of result.directly_referenced) {
      const available = ref.preset_available ? "" : "（プリセット未登録）";
      const article = ref.article ? ` 第${ref.article}条` : "";
      lines.push(`- **${ref.law_name}**${article}${available}`);
      lines.push(`  - 原文: ${ref.raw_text}`);
    }
  }

  if (result.delegated_to.length > 0) {
    lines.push("\n### 委任先\n");
    for (const del of result.delegated_to) {
      lines.push(`- [${del.target_type}] ${del.raw_text}`);
    }
  }

  if (result.same_law_references.length > 0) {
    lines.push("\n### 同法令内の参照条文\n");
    for (const ref of result.same_law_references) {
      lines.push(`- 第${ref.article}条 — ${ref.raw_text}`);
    }
  }

  if (result.same_group_laws.length > 0) {
    lines.push("\n### 同カテゴリの法令\n");
    for (const law of result.same_group_laws) {
      lines.push(`- ${law.law_name}`);
    }
  }

  if (
    result.directly_referenced.length === 0 &&
    result.delegated_to.length === 0 &&
    result.same_law_references.length === 0
  ) {
    lines.push("この条文には他法令への参照が検出されませんでした。");
  }

  return lines.join("\n");
}

export function registerSuggestRelatedTool(server: McpServer): void {
  server.tool(
    "suggest_related",
    "指定した条文が参照している関連法令・委任先・同法令内参照を自動抽出して提案する。",
    schema,
    async ({ law_name, article_number }) => {
      try {
        const result = await findRelatedLaws(law_name, article_number);
        const text = formatSuggestion(result);
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
