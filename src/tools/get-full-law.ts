import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveLawId } from "../lib/law-resolver.js";
import { getLawData } from "../lib/egov-client.js";
import { parseFullLaw } from "../lib/egov-parser.js";
import { LawNotFoundError } from "../lib/errors.js";
import { wrapToolHandler } from "../lib/tool-helpers.js";

const schema = {
  law_name: z
    .string()
    .max(200)
    .describe(
      "法令名（正式名称、略称のいずれか。例: 建築基準法施行令、建基令）",
    ),
};

export function registerGetFullLawTool(server: McpServer): void {
  server.tool(
    "get_full_law",
    "法令の全文を取得する。条番号を指定せず法令全体のテキストを返す。",
    schema,
    wrapToolHandler("get_full_law", async ({ law_name }) => {
      const resolved = await resolveLawId(law_name);
      if (!resolved) {
        throw new LawNotFoundError(law_name);
      }

      const lawData = await getLawData(resolved.law_id);
      const fullText = parseFullLaw(lawData.law_full_text);

      const lines = [
        `【${resolved.title}】全文`,
        `法令番号: ${resolved.law_num}`,
        "",
        fullText,
        "",
        `出典: e-Gov法令検索`,
      ];
      if (resolved.source === "egov_search") {
        lines.push(
          "※ この法令は略称マップに登録されていないため、e-Gov法令検索から取得しました。",
        );
      }
      const text = lines.join("\n");

      return { content: [{ type: "text" as const, text }] };
    }),
  );
}
