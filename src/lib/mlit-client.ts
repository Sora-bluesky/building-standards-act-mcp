import JSZip from "jszip";
import { expandKokujiAliases } from "../data/kokuji-term-aliases.js";
import { formatArticleRef, parseArticleRefs, type ArticleRef } from "./article-ref.js";
import { createCache } from "./cache.js";
import { SERVER_VERSION } from "./version.js";

const MLIT_NOTICE_URL = "https://www.mlit.go.jp/notice/";
const EXCEL_URL_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const EXCEL_DATA_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const REQUEST_TIMEOUT = 30_000; // 30 seconds

// User-Agent for MLIT requests — some government sites block requests without it
const MLIT_USER_AGENT =
  `BuildingStandardsActMCP/${SERVER_VERSION} (https://github.com/Sora-bluesky/building-standards-act-mcp)`;

/** A single entry parsed from the MLIT notice Excel file. */
export interface MlitNoticeEntry {
  title: string;
  document_number: string;
  date: string;
  organization: string;
  pdf_url: string;
}

export type KokujiMatchStage = "exact" | "partial" | "article" | "keyword";

export interface KokujiMatch {
  entry: MlitNoticeEntry;
  stage: KokujiMatchStage;
  matched: string[];
  score: number;
}

// Column indices in the Excel spreadsheet (0-based)
const COL_TITLE = 0;
const COL_DOCUMENT_NUMBER = 1;
const COL_DATE = 2;
const COL_ORGANIZATION = 3;
// COL_LINK_TEXT = 4 (unused)
const COL_PDF_URL = 5;

const excelUrlCache = createCache<string>(
  "mlit-excel-url",
  EXCEL_URL_CACHE_TTL,
);
const excelDataCache = createCache<MlitNoticeEntry[]>(
  "mlit-excel-data",
  EXCEL_DATA_CACHE_TTL,
);

const EXCEL_URL_CACHE_KEY = "mlit:excel_url";
const EXCEL_DATA_CACHE_KEY = "mlit:excel_data";

const FETCH_HEADERS = { "User-Agent": MLIT_USER_AGENT };

/**
 * Fetch binary data from a URL with timeout and abort handling.
 */
async function fetchBuffer(url: string): Promise<ArrayBuffer | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: FETCH_HEADERS,
    });
    if (!response.ok) {
      return null;
    }
    return await response.arrayBuffer();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch text content from a URL with timeout and abort handling.
 */
async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: FETCH_HEADERS,
    });
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extract the Excel (.xlsx) download URL from the MLIT notice page HTML.
 * Looks for href attributes pointing to .xlsx files.
 */
function extractExcelUrl(html: string): string | null {
  const match = html.match(/href="([^"]*\.xlsx)"/);
  if (!match) {
    return null;
  }

  const rawUrl = match[1];

  // Make URL absolute if relative
  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }
  if (rawUrl.startsWith("/")) {
    return `https://www.mlit.go.jp${rawUrl}`;
  }
  return `https://www.mlit.go.jp/notice/${rawUrl}`;
}

/**
 * Convert Excel column letters to a 0-based index (e.g. "A" -> 0, "F" -> 5, "AA" -> 26).
 */
function columnLetterToIndex(letters: string): number {
  let index = 0;
  for (let i = 0; i < letters.length; i++) {
    index = index * 26 + (letters.charCodeAt(i) - 64); // A=65
  }
  return index - 1; // 0-based
}

/**
 * Parse an xlsx buffer using jszip to extract row data.
 *
 * xlsx files are ZIP archives containing XML files:
 * - xl/sharedStrings.xml: all text strings used in cells
 * - xl/worksheets/sheet1.xml: cell references and values
 */
async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const zip = await JSZip.loadAsync(buffer);

  // Read shared strings table
  const sharedStrings = await readSharedStrings(zip);

  // Read the first worksheet
  const sheetFile = zip.file("xl/worksheets/sheet1.xml");
  if (!sheetFile) {
    return [];
  }
  const sheetXml = await sheetFile.async("text");

  return parseSheetRows(sheetXml, sharedStrings);
}

/**
 * Extract all shared strings from xl/sharedStrings.xml.
 *
 * Each <si> element represents one shared string entry. An entry may contain:
 * - A simple <t> tag: <si><t>text</t></si>
 * - Rich text with multiple <r> runs: <si><r><t>part1</t></r><r><t>part2</t></r></si>
 * - Phonetic readings in <rPh> tags: <si><t>text</t><rPh><t>reading</t></rPh></si>
 *
 * The <rPh> (ruby/phonetic) tags must be stripped BEFORE extracting <t> values,
 * otherwise their <t> children inflate the string count and shift all indices.
 */
async function readSharedStrings(zip: JSZip): Promise<string[]> {
  const ssFile = zip.file("xl/sharedStrings.xml");
  if (!ssFile) {
    return [];
  }
  const ssXml = await ssFile.async("text");

  const strings: string[] = [];
  const siRegex = /<si>([\s\S]*?)<\/si>/g;
  const rPhRegex = /<rPh[\s\S]*?<\/rPh>/g;
  const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;

  let siMatch: RegExpExecArray | null;
  while ((siMatch = siRegex.exec(ssXml)) !== null) {
    // Strip phonetic reading elements before extracting text
    const cleaned = siMatch[1].replace(rPhRegex, "");
    let text = "";
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tRegex.exec(cleaned)) !== null) {
      text += tMatch[1];
    }
    strings.push(text);
  }
  return strings;
}

/**
 * Parse worksheet XML to extract rows of cell values.
 * Cells with t="s" reference the shared strings table by index.
 * Other cells contain literal values in their <v> tag.
 */
function parseSheetRows(sheetXml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];

  // Match each <row> element
  const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowContent = rowMatch[1];
    const cells: string[] = [];

    // Match both normal <c ...>...</c> and self-closing <c ... /> cells.
    // Use the r attribute (e.g. "A1", "F3") for correct column placement.
    const cellRegex = /<c\s([^>]*?)(?:>([\s\S]*?)<\/c>|\/>)/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] ?? ""; // empty for self-closing

      // Extract column index from r attribute (e.g. "A1" -> 0, "F3" -> 5)
      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      const colIndex = refMatch
        ? columnLetterToIndex(refMatch[1])
        : cells.length;

      // Extract cell type from attributes (t="s" for shared string)
      const typeMatch = attrs.match(/\bt="([^"]*)"/);
      const cellType = typeMatch?.[1];

      // Extract value from <v> tag
      const valueMatch = body.match(/<v>([\s\S]*?)<\/v>/);
      const cellValue = valueMatch?.[1] ?? "";

      // Pad with empty strings if columns were skipped
      while (cells.length < colIndex) {
        cells.push("");
      }

      if (cellType === "s") {
        // Shared string reference — value is the index
        const index = parseInt(cellValue, 10);
        cells.push(sharedStrings[index] ?? "");
      } else {
        cells.push(cellValue);
      }
    }

    rows.push(cells);
  }

  return rows;
}

/**
 * Convert an Excel date serial number to a YYYY-MM-DD string.
 * Excel serial dates count days from 1900-01-01 (with a known leap year bug).
 */
function excelDateToString(serial: string): string {
  const num = parseFloat(serial);
  if (isNaN(num) || num <= 0) {
    return serial; // Return as-is if not a valid serial
  }

  // Excel epoch: 1900-01-01, but Excel incorrectly counts 1900 as a leap year
  // So we subtract 1 for dates after Feb 28, 1900 (serial > 59)
  const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
  const date = new Date(excelEpoch.getTime() + num * 24 * 60 * 60 * 1000);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Ensure a PDF URL is absolute.
 * Relative URLs are prefixed with the MLIT base domain.
 */
function makeAbsoluteUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  if (url.startsWith("/")) {
    return `https://www.mlit.go.jp${url}`;
  }
  return `https://www.mlit.go.jp/${url}`;
}

/**
 * Fetch and cache the Excel URL from the MLIT notice page.
 */
async function getExcelUrl(): Promise<string | null> {
  const cached = excelUrlCache.get(EXCEL_URL_CACHE_KEY);
  if (cached) {
    return cached;
  }

  const html = await fetchText(MLIT_NOTICE_URL);
  if (!html) {
    return null;
  }

  const excelUrl = extractExcelUrl(html);
  if (!excelUrl) {
    return null;
  }

  excelUrlCache.set(EXCEL_URL_CACHE_KEY, excelUrl);
  return excelUrl;
}

/**
 * Fetch, parse, and cache all notice entries from the MLIT Excel file.
 */
async function getAllEntries(): Promise<MlitNoticeEntry[]> {
  const cached = excelDataCache.get(EXCEL_DATA_CACHE_KEY);
  if (cached) {
    return cached;
  }

  const excelUrl = await getExcelUrl();
  if (!excelUrl) {
    return [];
  }

  const buffer = await fetchBuffer(excelUrl);
  if (!buffer) {
    return [];
  }

  const rows = await parseXlsx(buffer);

  // Skip header row (index 0), convert data rows to entries
  const entries: MlitNoticeEntry[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const title = row[COL_TITLE] ?? "";
    const pdfUrl = row[COL_PDF_URL] ?? "";

    // Skip rows without a title or PDF URL
    if (!title || !pdfUrl) {
      continue;
    }

    entries.push({
      title,
      document_number: row[COL_DOCUMENT_NUMBER] ?? "",
      date: excelDateToString(row[COL_DATE] ?? ""),
      organization: row[COL_ORGANIZATION] ?? "",
      pdf_url: makeAbsoluteUrl(pdfUrl),
    });
  }

  excelDataCache.set(EXCEL_DATA_CACHE_KEY, entries);
  return entries;
}

function kanjiRuns(text: string): string[] {
  return text.match(/[\u4E00-\u9FFF]{2,}/g) ?? [];
}

function withoutRefs(text: string, refs: ArticleRef[]): string {
  let result = "";
  let end = 0;
  for (const ref of refs) {
    result += text.slice(end, ref.start) + " ";
    end = ref.end;
  }
  return result + text.slice(end);
}

function articleBase(ref: ArticleRef): string {
  return formatArticleRef({ ...ref, paragraph: undefined, item: undefined });
}

/** Match the most specific available provision, rejecting conflicting law/paragraph/item references. */
function matchArticleRef(ref: ArticleRef, titleRef: ArticleRef): string | null {
  if (articleBase(ref) !== articleBase(titleRef)) return null;
  if (ref.law && titleRef.law && ref.law !== titleRef.law) return null;
  if (ref.paragraph && titleRef.paragraph
    && formatArticleRef({ ...ref, item: undefined })
      !== formatArticleRef({ ...titleRef, item: undefined })) return null;
  if (ref.item && titleRef.item
    && formatArticleRef({ ...ref, paragraph: undefined })
      !== formatArticleRef({ ...titleRef, paragraph: undefined })) return null;

  return formatArticleRef({
    ...ref,
    paragraph: titleRef.paragraph ? ref.paragraph : undefined,
    item: titleRef.item ? ref.item : undefined,
  });
}

function articleMatches(entries: MlitNoticeEntry[], query: string): KokujiMatch[] {
  const expanded = expandKokujiAliases(query);
  const refs = parseArticleRefs(expanded);
  if (refs.length === 0) return [];
  const keywords = [...new Set(kanjiRuns(withoutRefs(expanded, refs)))];
  const matches: KokujiMatch[] = [];
  for (const entry of entries) {
    const titleRefs = parseArticleRefs(entry.title);
    const matchedRefs = new Map<string, number>();
    for (const ref of refs) {
      if (ref.law && !entry.title.includes(ref.law)) continue;
      let best: { matched: string; score: number } | undefined;
      for (const titleRef of titleRefs) {
        const matched = matchArticleRef(ref, titleRef);
        if (!matched) continue;
        const specificity = 1 + (matched.includes("項") ? 1 : 0) + (matched.includes("号") ? 1 : 0);
        const score = specificity + (ref.law && entry.title.includes(ref.law) ? 3 : 0);
        if (!best || score > best.score) best = { matched, score };
      }
      if (best) matchedRefs.set(best.matched, Math.max(matchedRefs.get(best.matched) ?? 0, best.score));
    }
    if (matchedRefs.size === 0) continue;
    const matchedKeywords = keywords.filter((keyword) => entry.title.includes(keyword));
    matches.push({
      entry,
      stage: "article",
      matched: [...matchedRefs.keys(), ...matchedKeywords],
      score: [...matchedRefs.values()].reduce((sum, score) => sum + score, 0) + matchedKeywords.length,
    });
  }
  return matches.sort((a, b) => b.score - a.score || b.entry.date.localeCompare(a.entry.date));
}

/** Require coverage of every kanji run; overlapping chunks count each character only once. */
function keywordMatches(entries: MlitNoticeEntry[], query: string): KokujiMatch[] {
  const expanded = expandKokujiAliases(query);
  const refs = parseArticleRefs(expanded);
  const stripped = withoutRefs(expanded, refs);
  const runs = kanjiRuns(stripped).filter((run) => !/^[第条項号法令]+$/.test(run));
  const totalChars = stripped.match(/[\u4E00-\u9FFF]/g)?.length ?? 0;
  if (runs.length === 0) return [];
  const matches: KokujiMatch[] = [];
  for (const entry of entries) {
    const matched = new Set<string>();
    let matchedChars = 0;
    let allRunsCovered = true;
    for (const run of runs) {
      const covered = new Set<number>();
      const chunkSize = run.length <= 4 ? run.length : 3;
      for (let i = 0; i <= run.length - chunkSize; i++) {
        const chunk = run.slice(i, i + chunkSize);
        if (!entry.title.includes(chunk)) continue;
        matched.add(chunk);
        for (let j = i; j < i + chunkSize; j++) covered.add(j);
      }
      if (covered.size === 0) {
        allRunsCovered = false;
        break;
      }
      matchedChars += covered.size;
    }
    const score = matchedChars / totalChars;
    if (allRunsCovered && score >= 0.6) {
      matches.push({ entry, stage: "keyword", matched: [...matched], score });
    }
  }
  return matches.sort((a, b) => b.score - a.score
    || a.entry.title.length - b.entry.title.length
    || b.entry.date.localeCompare(a.entry.date));
}

/** Return candidates from the first successful stage, preserving exact/partial ordering. */
export async function findKokujiCandidates(title: string, limit = 5): Promise<KokujiMatch[]> {
  if (!title.trim() || limit <= 0) return [];
  const entries = await getAllEntries();
  const exact = entries.filter((entry) => entry.title === title);
  if (exact.length > 0) {
    return exact.slice(0, limit).map((entry) => ({ entry, stage: "exact", matched: [title], score: 1 }));
  }
  const partial = entries.filter((entry) => entry.title.includes(title) || title.includes(entry.title));
  if (partial.length > 0) {
    return partial.slice(0, limit).map((entry) => ({
      entry, stage: "partial", matched: [title.includes(entry.title) ? entry.title : title], score: 1,
    }));
  }
  const articles = articleMatches(entries, title);
  return (articles.length > 0 ? articles : keywordMatches(entries, title)).slice(0, limit);
}

/** Keep the existing URL API backed by the same candidate selection. */
export async function findKokujiPdfUrl(title: string): Promise<string | null> {
  return (await findKokujiCandidates(title, 1))[0]?.entry.pdf_url ?? null;
}

/**
 * Search MLIT notice entries by keyword.
 * Returns all entries whose title contains the keyword.
 *
 * @param keyword - Search keyword for partial title matching
 * @returns Array of matching notice entries
 */
export async function searchMlitNotices(
  keyword: string,
): Promise<MlitNoticeEntry[]> {
  const entries = await getAllEntries();
  return entries.filter((e) => e.title.includes(keyword));
}
