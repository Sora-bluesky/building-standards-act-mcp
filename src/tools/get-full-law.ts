import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LawRegistry } from "../lib/law-registry.js";
import { getLawData } from "../lib/egov-client.js";
import { parseFullLaw } from "../lib/egov-parser.js";
import { LawNotFoundError } from "../lib/errors.js";

const registry = new LawRegistry();

const schema = {
  law_name: z
    .string()
    .describe(
      "法令名（正式名称、略称のいずれか。例: 建築基準法施行令、建基令）",
    ),
};

export function registerGetFullLawTool(server: McpServer): void {
  server.tool(
    "get_full_law",
    "法令の全文を取得する。条番号を指定せず法令全体のテキストを返す。",
    schema,
    async ({ law_name }) => {
      try {
        const preset = registry.findByName(law_name);
        if (!preset) {
          throw new LawNotFoundError(law_name);
        }

        const lawData = await getLawData(preset.law_id);
        const fullText = parseFullLaw(lawData.law_full_text);

        const text = [
          `【${preset.title}】全文`,
          `法令番号: ${preset.law_num}`,
          "",
          fullText,
          "",
          `出典: e-Gov法令検索`,
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
