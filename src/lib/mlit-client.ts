import JSZip from "jszip";
import { createCache } from "./cache.js";

const MLIT_NOTICE_URL = "https://www.mlit.go.jp/notice/";
const EXCEL_URL_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const EXCEL_DATA_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours
const REQUEST_TIMEOUT = 30_000; // 30 seconds

/** A single entry parsed from the MLIT notice Excel file. */
export interface MlitNoticeEntry {
  title: string;
  document_number: string;
  date: string;
  organization: string;
  pdf_url: string;
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

/**
 * Fetch binary data from a URL with timeout and abort handling.
 */
async function fetchBuffer(url: string): Promise<ArrayBuffer | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, { signal: controller.signal });
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
    const response = await fetch(url, { signal: controller.signal });
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
 * Each <t> tag contains one string value.
 */
async function readSharedStrings(zip: JSZip): Promise<string[]> {
  const ssFile = zip.file("xl/sharedStrings.xml");
  if (!ssFile) {
    return [];
  }
  const ssXml = await ssFile.async("text");

  const strings: string[] = [];
  // Match <t> tags, including those with xml:space attribute
  const tagRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRegex.exec(ssXml)) !== null) {
    strings.push(tagMatch[1]);
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

    // Match each <c> (cell) element within the row
    const cellRegex =
      /<c[^>]*?(?: t="([^"]*)")?[^>]*>(?:[\s\S]*?<v>([\s\S]*?)<\/v>)?[\s\S]*?<\/c>/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const cellType = cellMatch[1]; // "s" for shared string, undefined for number/literal
      const cellValue = cellMatch[2] ?? "";

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

/**
 * Search for a kokuji (ministerial notification) in the MLIT notice database
 * and return its PDF URL. Uses partial title matching.
 *
 * @param title - The kokuji title to search for (partial match supported)
 * @returns The PDF URL if found, null otherwise
 */
export async function findKokujiPdfUrl(title: string): Promise<string | null> {
  const entries = await getAllEntries();

  // Try exact match first
  const exact = entries.find((e) => e.title === title);
  if (exact) {
    return exact.pdf_url;
  }

  // Fall back to partial match (title includes search term or vice versa)
  const partial = entries.find(
    (e) => e.title.includes(title) || title.includes(e.title),
  );
  return partial?.pdf_url ?? null;
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
