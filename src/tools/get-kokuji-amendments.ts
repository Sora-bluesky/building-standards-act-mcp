import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findKokujiByKey, findKokujiCandidates } from "../lib/mlit-client.js";
import { formatKokujiNumber, kokujiKey, kokujiNumberFromDbEntry, parseKokujiNumber } from "../lib/kokuji-number.js";
import { findKokujiKeyByCurrentTitle, findAmendmentsFor, formatAmendmentsSection, unavailableAmendments } from "../lib/kokuji-amendments.js";
import { kokujiAmendmentsSchema } from "../lib/kokuji-amendment-schema.js";
import { TOOL_ANNOTATIONS, wrapToolHandler } from "../lib/tool-helpers.js";

export function registerGetKokujiAmendmentsTool(server: McpServer): void {
  server.registerTool("get_kokuji_amendments", {
    title: "告示の改正一覧",
    description: "告示番号または告示名から改正一覧だけを取得する。本文を取得する get_kokuji より軽量。国交省の改正ページに掲載された2018年1月1日以降公布分を対象とする。kokuji_number と kokuji_name はどちらか一つだけ指定する。",
    inputSchema: {
      kokuji_number: z.string().max(100).optional().describe("告示番号（例: 平成12年建設省告示第1399号、平12建告1399）"),
      kokuji_name: z.string().max(200).optional().describe("告示名（例: 耐火構造の構造方法を定める件）"),
    },
    outputSchema: {
      text: z.string(),
      title: z.string().nullable(), kokuji_number: z.string().nullable(), document_number: z.string().nullable(),
      housing_bureau: z.boolean(), amendments: kokujiAmendmentsSchema.nullable(),
    },
    annotations: TOOL_ANNOTATIONS,
  }, wrapToolHandler("get_kokuji_amendments", async ({ kokuji_number, kokuji_name }) => {
    const validation = (text: string) => ({
      content: [{ type: "text" as const, text }], isError: true,
      structuredContent: { text, title: null, kokuji_number: null, document_number: null, housing_bureau: false, amendments: null },
    });
    if ((kokuji_number === undefined) === (kokuji_name === undefined)) {
      return validation("kokuji_number と kokuji_name は、どちらか一つだけ指定してください。");
    }
    const parsed = kokuji_number === undefined ? null : parseKokujiNumber(kokuji_number);
    if (kokuji_number !== undefined && !parsed) return validation("告示番号を確認できませんでした。年・発出省・番号を含めて指定してください（例: 平12建告1399）。");
    const current = kokuji_name === undefined ? null : await findKokujiKeyByCurrentTitle(kokuji_name).catch(() => null);
    const entry = parsed ? await findKokujiByKey(kokujiKey(parsed))
      : (current ? await findKokujiByKey(current.key) : null) ?? (await findKokujiCandidates(kokuji_name!, 1))[0]?.entry ?? null;
    if (!entry && !parsed) return validation(`該当する告示を確認できませんでした: ${kokuji_name}`);
    const number = parsed ?? (entry ? kokujiNumberFromDbEntry(entry) : null);
    const sourceNumber = entry?.document_number ?? kokuji_number;
    const displayNumber = number ? (sourceNumber && parseKokujiNumber(sourceNumber) && sourceNumber.includes("年")
      ? sourceNumber.normalize("NFKC") : formatKokujiNumber(number)) : null;
    const housing = entry?.organization.includes("住宅局") ?? false;
    let amendments;
    try { amendments = await findAmendmentsFor({ key: number ? kokujiKey(number) : null, title: entry?.title ?? "" }); }
    catch { amendments = unavailableAmendments(); }
    const text = [
      `【告示】${entry?.title ?? "名称未確認"}（${displayNumber ?? entry?.document_number ?? "番号未確認"}）`,
      formatAmendmentsSection(amendments, { includeDbNotice: housing }),
    ].join("\n");
    return {
      content: [{ type: "text" as const, text }],
      structuredContent: { text, title: entry?.title ?? null, kokuji_number: displayNumber,
        document_number: entry?.document_number ?? null, housing_bureau: housing, amendments },
    };
  }));
}
