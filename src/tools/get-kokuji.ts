import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findBestMatch } from "../lib/best-match.js";
import { KokujiRegistry } from "../lib/kokuji-registry.js";
import { findKokujiCandidates, findKokujiEntriesByKey, normalizeKokujiTitle, searchMlitNotices, type KokujiMatch } from "../lib/mlit-client.js";
import { extractPdfText, type PdfTextResult } from "../lib/pdf-extractor.js";
import { extractLatestAmendment } from "../lib/kokuji-amendment.js";
import { DB_NOTICE, currentKokujiTitles, findKokujiKeyByCurrentTitle, findAmendmentsFor, formatAmendmentsSection, unavailableAmendments, type CurrentKokujiTitle, type KokujiAmendments } from "../lib/kokuji-amendments.js";
import { kokujiAmendmentsSchema } from "../lib/kokuji-amendment-schema.js";
import { formatKokujiNumber, kokujiKey, kokujiNumberFromDbEntry, parseKokujiNumber, type KokujiNumber } from "../lib/kokuji-number.js";
import { searchLaws, getLawData } from "../lib/egov-client.js";
import { parseFullLaw } from "../lib/egov-parser.js";
import {
  TEXT_DEFAULT_MAX_CHARS,
  TEXT_MAX_CHARS_LIMIT,
  RESPONSE_CHAR_BUDGET,
  paginateText,
  TOOL_ANNOTATIONS,
  wrapToolHandler,
} from "../lib/tool-helpers.js";

const registry = new KokujiRegistry();

const schema = {
  kokuji_name: z
    .string()
    .max(200)
    .describe("告示名または告示番号（例: 耐火構造の構造方法を定める件、平成28年国土交通省告示第696号、平28国交告696）。番号が国交省 DB にない場合は、その旨を返す。"),
  max_chars: z
    .number()
    .int()
    .min(1_000)
    .max(TEXT_MAX_CHARS_LIMIT)
    .default(TEXT_DEFAULT_MAX_CHARS)
    .describe("1回に取得する本文の最大文字数（1,000〜48,000）。省略時は30,000文字。本文を content と structuredContent.text の両方に含めるため、改正欄と構造化情報も合わせた応答全体が約50,000文字に収まるよう本文ページを減らす。"),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("取得開始位置（0から始まる文字位置）。続きの取得時は案内された offset を指定。"),
};

const outputSchema = {
  text: z.string(),
  found: z.boolean(),
  title: z.string().nullable(),
  current_title: z.string().nullable(),
  document_number: z.string().nullable(),
  kokuji_number: z.string().nullable(),
  source: z.enum(["mlit_db", "mlit_pdf", "egov", "not_found"]),
  housing_bureau: z.boolean(),
  db_notice: z.string().nullable(),
  amendments: kokujiAmendmentsSchema.nullable(),
  offset: z.number(), next_offset: z.number().nullable(), total_chars: z.number(),
};
type KokujiMetadata = Omit<z.infer<z.ZodObject<typeof outputSchema>>, "text" | "found" | "offset" | "next_offset" | "total_chars">;

async function mlitMetadata(match: KokujiMatch): Promise<KokujiMetadata> {
  const entry = match.entry;
  const number = kokujiNumberFromDbEntry(entry);
  const housing = entry.organization.includes("住宅局");
  let amendments: KokujiAmendments | null = null;
  if (housing) {
    try { amendments = await findAmendmentsFor({ key: number ? kokujiKey(number) : null, title: entry.title }); }
    catch { amendments = unavailableAmendments(); }
  }
  return { title: entry.title, current_title: null, document_number: entry.document_number,
    kokuji_number: number ? (parseKokujiNumber(entry.document_number) ? entry.document_number.normalize("NFKC") : formatKokujiNumber(number)) : null, source: "mlit_db",
    housing_bureau: housing, db_notice: housing ? DB_NOTICE : null, amendments };
}

function fallbackMetadata(title: string | null, documentNumber: string | null, source: KokujiMetadata["source"]): KokujiMetadata {
  const number = documentNumber ? parseKokujiNumber(documentNumber) : null;
  return { title, current_title: null, document_number: documentNumber, kokuji_number: number ? documentNumber : null,
    source, housing_bureau: false, db_notice: null, amendments: null };
}

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
      description: "告示名または告示番号（例: 平成28年国土交通省告示第696号、平28国交告696）から、建築基準法が技術基準を委任している告示の全文を取得する。国土交通省の告示データベース（PDF）から取得し、告示名で見つからない場合はe-Gov APIで検索を試みる。番号が国交省 DB にない場合は、その旨を返す。",
      inputSchema: schema,
      annotations: TOOL_ANNOTATIONS,
      outputSchema,
    },
    wrapToolHandler("get_kokuji", async ({
      kokuji_name, max_chars = TEXT_DEFAULT_MAX_CHARS, offset = 0,
    }) => {
      const textResult = (body: string, metadata: KokujiMetadata) => {
        const section = metadata.amendments ? formatAmendmentsSection(metadata.amendments, { includeDbNotice: true }) : "";
        const structuredContent = { ...metadata, found: metadata.source !== "not_found", offset, next_offset: null as number | null, total_chars: body.length };
        let effectiveMaxChars = Math.max(1_000, Math.min(max_chars,
          Math.floor((RESPONSE_CHAR_BUDGET - 2 * section.length - JSON.stringify(structuredContent).length - 500) / 2)));
        const buildResult = (pageSize: number) => {
          const page = paginateText(body, offset, pageSize);
          const text = (section ? section + "\n\n" : "") + page.text;
          return {
            content: [{ type: "text" as const, text }],
            structuredContent: { ...structuredContent, offset: page.offset, next_offset: page.next_offset, text },
          };
        };
        let result = buildResult(effectiveMaxChars);
        // JSON escaping adds characters that the initial estimate does not include.
        for (let attempt = 0; attempt < 3; attempt++) {
          const overflow = result.content[0].text.length + JSON.stringify(result.structuredContent).length - RESPONSE_CHAR_BUDGET;
          if (overflow <= 0 || effectiveMaxChars === 1_000) break;
          effectiveMaxChars = Math.max(1_000, effectiveMaxChars - overflow);
          result = buildResult(effectiveMaxChars);
        }
        return result;
      };
      const numberResult = async (parsed: KokujiNumber, lookup?: Awaited<ReturnType<typeof findKokujiEntriesByKey>>, resolvedTitle?: CurrentKokujiTitle) => {
        const number = formatKokujiNumber(parsed);
        const { available, entries } = lookup ?? await findKokujiEntriesByKey(kokujiKey(parsed));
        const notFound = { ...fallbackMetadata(null, null, "not_found"), kokuji_number: number };
        if (!available) {
          return textResult(`国交省の告示 DB を取得できませんでした。時間をおいて再度お試しください。\n告示番号: ${number}`, notFound);
        }
        if (entries.length === 0) {
          return textResult(`この番号の告示は国交省 DB にありません: ${number}\n告示名で get_kokuji を呼ぶか、e-Gov 法令検索・官報で確認してください。`, notFound);
        }
        if (new Set(entries.map((entry) => normalizeKokujiTitle(entry.title))).size > 1) {
          return textResult([
            `この番号には複数の告示があります: ${number}`,
            ...entries.map((entry) => `  - ${entry.title}・${entry.document_number}・${entry.date}`),
            "告示名で get_kokuji を呼び直してください。",
          ].join("\n"), notFound);
        }
        const [entry] = [...entries].sort((a, b) => Number(/\.pdf$/i.test(b.pdf_url)) - Number(/\.pdf$/i.test(a.pdf_url))
          || Number(b.organization.includes("住宅局")) - Number(a.organization.includes("住宅局")));
        let pdf: PdfTextResult;
        try {
          pdf = await extractPdfText(entry.pdf_url);
          if (!pdf.text) throw new Error("PDF から本文を抽出できませんでした");
        } catch (err) {
          return textResult([
            `【告示】${entry.title}`, `法令番号: ${entry.document_number}`, `告示番号: ${number}`, "",
            "告示本文の取得に失敗しました。",
            `PDF URL: ${entry.pdf_url}`,
            `原因: ${err instanceof Error ? err.message : "PDF テキスト抽出に失敗"}`,
          ].join("\n"), { ...notFound, title: entry.title, document_number: entry.document_number });
        }
        const match: KokujiMatch = { entry, stage: "number", matched: [number], score: 1 };
        const metadata = await mlitMetadata(match);
        const current = resolvedTitle ?? (await currentKokujiTitles().catch(() => null))?.get(kokujiKey(parsed));
        if (current && normalizeKokujiTitle(current.title) !== normalizeKokujiTitle(entry.title)) metadata.current_title = current.title;
        return textResult([
          `【告示】${entry.title}`,
          ...(metadata.current_title && current ? [
            `現在の題名: ${metadata.current_title}`,
            `※ 国交省 DB には改正前の題名で収録されています。現在の題名は ${current.source_number} の本文によります。`,
          ] : []),
          `法令番号: ${entry.document_number}`,
          `告示番号: ${metadata.kokuji_number}`,
          "",
          pdf.text,
          "",
          ...pdfCurrencyLines(pdf),
          "",
          "出典: 国土交通省 告示・通達データベース",
          `URL: ${entry.pdf_url}`,
        ].join("\n"), metadata);
      };
      const parsed = parseKokujiNumber(kokuji_name);
      if (parsed) return numberResult(parsed);
      const current = await findKokujiKeyByCurrentTitle(kokuji_name).catch(() => null);
      if (current) {
        const lookup = await findKokujiEntriesByKey(current.key);
        const entry = lookup.entries[0];
        const number = entry ? kokujiNumberFromDbEntry(entry) : null;
        if (lookup.available && number && normalizeKokujiTitle(entry.title) !== normalizeKokujiTitle(current.title)) {
          return numberResult(number, lookup, current);
        }
      }

      // Step 1: Check preset registry for known kokuji
      const preset = registry.findByName(kokuji_name);

      if (preset) {
        // Step 2a: Try MLIT pipeline (Excel → PDF → text)
        const diag: MlitDiagnostic = { pdfUrl: null, error: null };
        const mlitText = await fetchViaMlit(preset.title, diag);

        if (mlitText) {
          const metadata = await mlitMetadata(mlitText.match);
          const text = [
            `【告示】${preset.title}`,
            `法令番号: ${preset.law_num}`,
            ...(metadata.kokuji_number ? [`告示番号: ${metadata.kokuji_number}`] : []),
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

          return textResult(text, metadata);
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
            return textResult(text, fallbackMetadata(preset.title, preset.law_num, "mlit_pdf"));
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

            return textResult(text, fallbackMetadata(preset.title, preset.law_num, "egov"));
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

        return textResult(text, fallbackMetadata(preset.title, preset.law_num, "not_found"));
      }

      // Step 3: No preset — try MLIT search directly
      const mlitText = await fetchViaMlit(kokuji_name);
      if (mlitText) {
        const { match } = mlitText;
        const metadata = await mlitMetadata(match);
        const text = [
          `【検索結果】${match.entry.title}`,
          `法令番号: ${match.entry.document_number}`,
          ...(metadata.kokuji_number ? [`告示番号: ${metadata.kokuji_number}`] : []),
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

        return textResult(text, metadata);
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

        return textResult(text, fallbackMetadata(egovResult.title, egovResult.lawNum, "egov"));
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

      return textResult(text, fallbackMetadata(null, null, "not_found"));
    }),
  );
}
