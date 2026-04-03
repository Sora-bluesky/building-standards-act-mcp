import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findBestMatch } from "../lib/best-match.js";
import { KokujiRegistry } from "../lib/kokuji-registry.js";
import { findKokujiPdfUrl, searchMlitNotices } from "../lib/mlit-client.js";
import { extractTextFromPdf } from "../lib/pdf-extractor.js";
import { searchLaws, getLawData } from "../lib/egov-client.js";
import { parseFullLaw } from "../lib/egov-parser.js";
import { wrapToolHandler } from "../lib/tool-helpers.js";

const registry = new KokujiRegistry();

const schema = {
  kokuji_name: z
    .string()
    .max(200)
    .describe("告示名（例: 耐火構造の構造方法を定める件、不燃材料を定める件）"),
};

/** Diagnostic info collected during fetchViaMlit for error reporting. */
interface MlitDiagnostic {
  pdfUrl: string | null;
  error: string | null;
}

/**
 * Attempt to fetch kokuji text via the MLIT pipeline:
 * 1. Find the PDF URL from the MLIT Excel notice database
 * 2. Download the PDF and extract text
 *
 * Returns the text on success, or null with diagnostic info on failure.
 */
async function fetchViaMlit(
  title: string,
  diagnostic?: MlitDiagnostic,
): Promise<string | null> {
  const pdfUrl = await findKokujiPdfUrl(title);
  if (diagnostic) {
    diagnostic.pdfUrl = pdfUrl;
  }
  if (!pdfUrl) {
    if (diagnostic) {
      diagnostic.error = "MLIT Excel から PDF URL が見つかりませんでした";
    }
    return null;
  }

  try {
    return await extractTextFromPdf(pdfUrl);
  } catch (err) {
    if (diagnostic) {
      diagnostic.error =
        err instanceof Error ? err.message : "PDF テキスト抽出に失敗";
    }
    return null;
  }
}

/**
 * Attempt to fetch kokuji text via the e-Gov API fallback:
 * Search by title, then fetch the first result.
 */
async function fetchViaEgov(
  name: string,
): Promise<{ title: string; lawNum: string; text: string } | null> {
  try {
    const searchResult = await searchLaws(name);
    if (searchResult.count === 0) {
      return null;
    }

    const firstLaw = findBestMatch(searchResult.laws, name);
    const title =
      firstLaw.revision_info?.law_title ??
      firstLaw.current_revision_info?.law_title ??
      name;
    const lawId = firstLaw.law_info.law_id;

    const lawData = await getLawData(lawId);
    const text = parseFullLaw(lawData.law_full_text);

    return { title, lawNum: firstLaw.law_info.law_num, text };
  } catch {
    return null;
  }
}

export function registerGetKokujiTool(server: McpServer): void {
  server.tool(
    "get_kokuji",
    "建築基準法が技術基準を委任している告示の全文を取得する。国土交通省の告示データベース（PDF）から取得し、見つからない場合はe-Gov APIで検索を試みる。",
    schema,
    wrapToolHandler("get_kokuji", async ({ kokuji_name }) => {
      // Step 1: Check preset registry for known kokuji
      const preset = registry.findByName(kokuji_name);

      if (preset) {
        // Step 2a: Try MLIT pipeline (Excel → PDF → text)
        const diag: MlitDiagnostic = { pdfUrl: null, error: null };
        const mlitText = await fetchViaMlit(preset.title, diag);

        if (mlitText) {
          const text = [
            `【告示】${preset.title}`,
            `法令番号: ${preset.law_num}`,
            `委任元: ${preset.delegated_by}`,
            "",
            mlitText,
            "",
            "出典: 国土交通省 告示・通達データベース",
            "",
            "※ 掲載情報の正確性については万全を期しておりますが、",
            "本データの利用に伴って発生した不利益や問題について責任を負うものではありません。",
            "正確な条文は官報または法令集で確認してください。",
          ].join("\n");

          return { content: [{ type: "text" as const, text }] };
        }

        // Step 2b: MLIT failed — try preset pdf_url if available
        if (preset.pdf_url) {
          try {
            const pdfText = await extractTextFromPdf(preset.pdf_url);
            const text = [
              `【告示】${preset.title}`,
              `法令番号: ${preset.law_num}`,
              `委任元: ${preset.delegated_by}`,
              "",
              pdfText,
              "",
              `出典: 国土交通省（PDF直接取得）`,
              `URL: ${preset.pdf_url}`,
            ].join("\n");
            return { content: [{ type: "text" as const, text }] };
          } catch (err) {
            // Update diagnostic and fall through to next fallback
            diag.pdfUrl = preset.pdf_url;
            diag.error = `PDF直接取得に失敗: ${err instanceof Error ? err.message : String(err)}`;
          }
        }

        // Step 2c: MLIT and pdf_url failed — try e-Gov API if law_id exists
        if (preset.law_id) {
          try {
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
          } catch {
            // e-Gov also failed — fall through to "not found" message
          }
        }

        // Preset found but no text available from any source
        const diagLines = [];
        if (diag.pdfUrl) {
          diagLines.push(`PDF URL: ${diag.pdfUrl}`);
        }
        if (diag.error) {
          diagLines.push(`原因: ${diag.error}`);
        }

        const text = [
          `【告示】${preset.title}`,
          `法令番号: ${preset.law_num}`,
          `委任元: ${preset.delegated_by}`,
          "",
          "告示本文の取得に失敗しました。",
          "国土交通省の告示データベース（PDF）および e-Gov 法令検索の",
          "いずれからも取得できませんでした。",
          ...(diagLines.length > 0 ? ["", "診断情報:", ...diagLines] : []),
          "",
          "ネットワーク接続を確認するか、時間をおいて再度お試しください。",
        ].join("\n");

        return { content: [{ type: "text" as const, text }] };
      }

      // Step 3: No preset — try MLIT search directly
      const mlitText = await fetchViaMlit(kokuji_name);
      if (mlitText) {
        const text = [
          `【検索結果】${kokuji_name}`,
          "",
          mlitText,
          "",
          "出典: 国土交通省 告示・通達データベース",
          "",
          "※ この告示はプリセットに含まれていないため、",
          "国土交通省の告示データベースから検索して取得しました。",
        ].join("\n");

        return { content: [{ type: "text" as const, text }] };
      }

      // Step 4: MLIT not found — try e-Gov API as final fallback
      const egovResult = await fetchViaEgov(kokuji_name);
      if (egovResult) {
        const text = [
          `【検索結果】${egovResult.title}`,
          `法令番号: ${egovResult.lawNum}`,
          "",
          egovResult.text,
          "",
          "出典: e-Gov法令検索",
          "",
          "※ この告示はプリセットに含まれていないため、検索結果から取得しました。",
        ].join("\n");

        return { content: [{ type: "text" as const, text }] };
      }

      // Nothing found anywhere — suggest similar entries from MLIT database
      const mainKeyword = kokuji_name
        .replace(/[のをにはでがとへもからまで等及び又は並びに]/g, "")
        .replace(/[、。（）()「」]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3)
        .slice(0, 1)[0];

      const suggestions = mainKeyword
        ? await searchMlitNotices(mainKeyword)
        : [];
      const suggestionLines =
        suggestions.length > 0
          ? [
              "",
              `「${mainKeyword}」を含む告示:`,
              ...suggestions.slice(0, 5).map((s) => `  - ${s.title}`),
              "",
              "正式名称で再度お試しください。",
            ]
          : [];

      const text = [
        `該当する告示を確認できませんでした: ${kokuji_name}`,
        "",
        "国土交通省の告示データベースおよび e-Gov 法令検索のいずれにも",
        "一致する告示が見つかりませんでした。",
        "正式な告示名で再度お試しいただくか、関連する法令の",
        "該当条文を get_law ツールで確認してください。",
        ...suggestionLines,
      ].join("\n");

      return { content: [{ type: "text" as const, text }] };
    }),
  );
}
