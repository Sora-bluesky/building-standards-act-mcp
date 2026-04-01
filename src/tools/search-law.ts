import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LawRegistry } from "../lib/law-registry.js";
import { searchLaws } from "../lib/egov-client.js";

const registry = new LawRegistry();

const schema = {
  keyword: z
    .string()
    .max(500)
    .describe("検索キーワード（例: 耐火構造、避難階段、建築確認）"),
};

export function registerSearchLawTool(server: McpServer): void {
  server.tool(
    "search_law",
    "キーワードで建築関連法令を横断検索する。登録済みエイリアスとe-Gov APIの両方を検索する。",
    schema,
    async ({ keyword }) => {
      try {
        // Search aliases first
        const presetResults = registry.search(keyword);

        // Also search e-Gov API
        const apiResults = await searchLaws(keyword);

        const lines: string[] = [];

        if (presetResults.length > 0) {
          lines.push("■ 登録済み法令の検索結果:");
          for (const p of presetResults) {
            const abbrevStr =
              p.abbrev.length > 0 ? `（${p.abbrev.join("、")}）` : "";
            lines.push(`  - ${p.title}${abbrevStr} [${p.group}]`);
          }
          lines.push("");
        }

        if (apiResults.count > 0) {
          lines.push(`■ e-Gov API検索結果（${apiResults.count}件）:`);
          const maxShow = 20;
          const lawsToShow = apiResults.laws.slice(0, maxShow);
          for (const law of lawsToShow) {
            const title =
              law.revision_info?.law_title ??
              law.current_revision_info?.law_title ??
              "(不明)";
            lines.push(`  - ${title}（${law.law_info.law_num}）`);
          }
          if (apiResults.count > maxShow) {
            lines.push(`  ... 他 ${apiResults.count - maxShow} 件`);
          }
        }

        if (lines.length === 0) {
          lines.push(`「${keyword}」に該当する法令は見つかりませんでした。`);
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
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
