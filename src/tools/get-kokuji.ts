import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { KokujiRegistry } from "../lib/kokuji-registry.js";
import { searchLaws, getLawData } from "../lib/egov-client.js";
import { parseFullLaw } from "../lib/egov-parser.js";

const registry = new KokujiRegistry();

const schema = {
  kokuji_name: z
    .string()
    .describe("告示名（例: 耐火構造の構造方法を定める件、不燃材料を定める件）"),
};

export function registerGetKokujiTool(server: McpServer): void {
  server.tool(
    "get_kokuji",
    "建築基準法が技術基準を委任している告示の全文を取得する。e-Gov APIで検索を試みる。",
    schema,
    async ({ kokuji_name }) => {
      try {
        // First check preset registry
        const preset = registry.findByName(kokuji_name);

        if (preset) {
          // If we have a preset with a law_id, fetch from API
          const lawData = await getLawData(preset.law_id);
          const fullText = parseFullLaw(lawData.law_full_text);

          const text = [
            `【告示】${preset.title}`,
            `法令番号: ${preset.law_num}`,
            `委任元: ${preset.delegated_by}`,
            "",
            fullText,
            "",
            "出典: e-Gov法令検索",
          ].join("\n");

          return { content: [{ type: "text" as const, text }] };
        }

        // No preset found - try searching e-Gov API directly
        const searchResult = await searchLaws(kokuji_name);

        if (searchResult.count > 0) {
          // Found something - try to get the first result
          const firstLaw = searchResult.laws[0];
          const title =
            firstLaw.revision_info?.law_title ??
            firstLaw.current_revision_info?.law_title ??
            kokuji_name;
          const lawId = firstLaw.law_info.law_id;

          const lawData = await getLawData(lawId);
          const fullText = parseFullLaw(lawData.law_full_text);

          const text = [
            `【検索結果】${title}`,
            `法令番号: ${firstLaw.law_info.law_num}`,
            "",
            fullText,
            "",
            "出典: e-Gov法令検索",
            "",
            "※ この告示はプリセットに含まれていないため、検索結果から取得しました。",
          ].join("\n");

          return { content: [{ type: "text" as const, text }] };
        }

        // Nothing found
        const allKokuji = registry.getAll();
        const text = [
          `該当する告示を確認できませんでした: ${kokuji_name}`,
          "",
          "告示は e-Gov 法令 API v2 の検索対象に含まれていない場合があります。",
          "正式な告示名で再度お試しいただくか、関連する法令（建築基準法施行令等）の",
          "該当条文を get_law ツールで確認してください。",
          "",
          "登録済みの告示一覧:",
          ...(allKokuji.length > 0
            ? allKokuji.map((k) => `  - ${k.title}`)
            : ["  （現在登録されている告示はありません）"]),
        ].join("\n");

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
