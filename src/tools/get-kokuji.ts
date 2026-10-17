import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findBestMatch } from "../lib/best-match.js";
import { KokujiRegistry } from "../lib/kokuji-registry.js";
import { findKokujiCandidates, searchMlitNotices, type KokujiMatch } from "../lib/mlit-client.js";
import { extractPdfText, type PdfTextResult } from "../lib/pdf-extractor.js";
import { extractLatestAmendment } from "../lib/kokuji-amendment.js";
import { searchLaws, getLawData } from "../lib/egov-client.js";
import { parseFullLaw } from "../lib/egov-parser.js";
import {
  TEXT_DEFAULT_MAX_CHARS,
  TEXT_MAX_CHARS_LIMIT,
  paginateText,
  TOOL_ANNOTATIONS,
  wrapToolHandler,
} from "../lib/tool-helpers.js";

const registry = new KokujiRegistry();

const schema = {
  kokuji_name: z
    .string()
    .max(200)
    .describe("告示名（例: 耐火構造の構造方法を定める件、不燃材料を定める件）"),
  max_chars: z
    .number()
    .int()
    .min(1_000)
    .max(TEXT_MAX_CHARS_LIMIT)
    .default(TEXT_DEFAULT_MAX_CHARS)
    .describe("1回に取得する最大文字数（1,000〜48,000）。省略時は30,000文字。"),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("取得開始位置（0から始まる文字位置）。続きの取得時は案内された offset を指定。"),
};

/** Diagnostic info collected during fetchViaMlit for error reporting. */
interface MlitDiagnostic {
  pdfUrl: string | null;
  error: string | null;
}

/** Describe the PDF's evidence of currency without treating HTTP metadata as proof. */
function pdfCurrencyLines(pdf: PdfTextResult): string[] {
  const latestAmendment = extractLatestAmendment(pdf.text);
  const lines: string[] = [];
  if (latestAmendment) {
    lines.push(`※ 国交省 DB の PDF に記載された最終改正: ${latestAmendment}`);
  }
  if (pdf.lastModified) {
    lines.push(`※ 国交省 DB の PDF 更新日: ${pdf.lastModified}`);
  }
  if (lines.length === 0) {
    return ["※ 国交省 DB の PDF の収録時点は確認できませんでした。最新の改正は e-Gov 法令検索または官報で確認してください。"];
  }
  return [
    ...lines,
    "これより後の改正は反映されていない可能性があります。最新の改正は e-Gov 法令検索または官報で確認してください。",
  ];
}

/**
 * Attempt to fetch kokuji text via the MLIT pipeline:
 * 1. Find the PDF URL from the MLIT Excel notice database
 * 2. Download the PDF and extract text
 *
 * Returns the resolved notice and text, or null with diagnostic info on failure.
 */
async function fetchViaMlit(
  title: string,
  diagnostic?: MlitDiagnostic,
): Promise<(PdfTextResult & { match: KokujiMatch }) | null> {
  const [match] = await findKokujiCandidates(title, 1);
  if (diagnostic) {
    diagnostic.pdfUrl = match?.entry.pdf_url ?? null;
  }
  if (!match) {
    if (diagnostic) {
      diagnostic.error = "MLIT Excel から PDF URL が見つかりませんでした";
    }
    return null;
  }

  try {
    const pdf = await extractPdfText(match.entry.pdf_url);
    return pdf.text ? { match, ...pdf } : null;
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
  server.registerTool(
    "get_kokuji",
    {
      title: "告示取得",
      description: "建築基準法が技術基準を委任している告示の全文を取得する。国土交通省の告示データベース（PDF）から取得し、見つからない場合はe-Gov APIで検索を試みる。",
      inputSchema: schema,
      annotations: TOOL_ANNOTATIONS,
    },
    wrapToolHandler("get_kokuji", async ({
      kokuji_name, max_chars = TEXT_DEFAULT_MAX_CHARS, offset = 0,
    }) => {
      const textResult = (text: string) => ({
        content: [{ type: "text" as const, text: paginateText(text, offset, max_chars).text }],
      });
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
            mlitText.text,
            "",
            ...pdfCurrencyLines(mlitText),
            "",
            "出典: 国土交通省 告示・通達データベース",
            "",
            "※ 掲載情報の正確性については万全を期しておりますが、",
            "本データの利用に伴って発生した不利益や問題について責任を負うものではありません。",
            "正確な条文は官報または法令集で確認してください。",
          ].join("\n");

          return textResult(text);
        }

        // Step 2b: MLIT failed — try preset pdf_url if available
        if (preset.pdf_url) {
          try {
            const pdfText = await extractPdfText(preset.pdf_url);
            const text = [
              `【告示】${preset.title}`,
              `法令番号: ${preset.law_num}`,
              `委任元: ${preset.delegated_by}`,
              "",
              pdfText.text,
              "",
              ...pdfCurrencyLines(pdfText),
              "",
              `出典: 国土交通省（PDF直接取得）`,
              `URL: ${preset.pdf_url}`,
            ].join("\n");
            return textResult(text);
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

            return textResult(text);
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

        return textResult(text);
      }

      // Step 3: No preset — try MLIT search directly
      const mlitText = await fetchViaMlit(kokuji_name);
      if (mlitText) {
        const { match } = mlitText;
        const text = [
          `【検索結果】${match.entry.title}`,
          `法令番号: ${match.entry.document_number}`,
          ...(match.stage === "article" || match.stage === "keyword"
            ? [`一致: ${match.matched.join("、")}`]
            : []),
          "",
          mlitText.text,
          "",
          ...pdfCurrencyLines(mlitText),
          "",
          "出典: 国土交通省 告示・通達データベース",
          "",
          "※ この告示はプリセットに含まれていないため、",
          "国土交通省の告示データベースから検索して取得しました。",
        ].join("\n");

        return textResult(text);
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

        return textResult(text);
      }

      // Nothing found anywhere — suggest similar entries from MLIT database
      const candidates = await findKokujiCandidates(kokuji_name, 5);
      let suggestionLines: string[] = [];
      if (candidates.length > 0) {
        suggestionLines = [
          "",
          "関連する告示:",
          ...candidates.map(({ entry, matched }) =>
            `  - ${entry.title}（${entry.document_number}・一致: ${matched.join("、")}）`),
          "",
          "正式名称で再度お試しください。",
        ];
      } else {
        const mainKeyword = kokuji_name
          .replace(/[のをにはでがとへもからまで等及び又は並びに]/g, "")
          .replace(/[、。（）()「」]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length >= 3)
          .slice(0, 1)[0];
        const suggestions = mainKeyword ? await searchMlitNotices(mainKeyword) : [];
        if (suggestions.length > 0) {
          suggestionLines = [
            "",
            `「${mainKeyword}」を含む告示:`,
            ...suggestions.slice(0, 5).map((s) => `  - ${s.title}`),
            "",
            "正式名称で再度お試しください。",
          ];
        }
      }

      const text = [
        `該当する告示を確認できませんでした: ${kokuji_name}`,
        "",
        "国土交通省の告示データベースおよび e-Gov 法令検索のいずれにも",
        "一致する告示が見つかりませんでした。",
        "正式な告示名で再度お試しいただくか、関連する法令の",
        "該当条文を get_law ツールで確認してください。",
        ...suggestionLines,
      ].join("\n");

      return textResult(text);
    }),
  );
}
