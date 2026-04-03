import { createCache } from "./cache.js";

// Polyfill DOMMatrix for serverless environments (Vercel Node 20/22).
// pdfjs-dist uses DOMMatrix for text position calculations during extraction.
// A minimal stub is sufficient — we only need the raw text, not coordinates.
if (typeof globalThis.DOMMatrix === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMMatrix = class DOMMatrix {
    m11 = 1;
    m12 = 0;
    m21 = 0;
    m22 = 1;
    m41 = 0;
    m42 = 0;
    constructor(init?: number[]) {
      if (init && init.length >= 6) {
        this.m11 = init[0];
        this.m12 = init[1];
        this.m21 = init[2];
        this.m22 = init[3];
        this.m41 = init[4];
        this.m42 = init[5];
      }
    }
  };
}

const PDF_TEXT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const REQUEST_TIMEOUT = 30_000; // 30 seconds

/**
 * Allowed hosts for PDF downloads (SSRF prevention).
 * Only government domains that host building-standards-related PDFs.
 */
export const ALLOWED_PDF_HOSTS = ["www.mlit.go.jp"];

/**
 * Validate that a PDF URL points to an allowed government domain.
 * Rejects non-HTTP(S) schemes and non-whitelisted hosts.
 */
export function isAllowedPdfUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    return ALLOWED_PDF_HOSTS.some(
      (host) =>
        parsed.hostname === host || parsed.hostname.endsWith("." + host),
    );
  } catch {
    return false;
  }
}
const PDF_USER_AGENT =
  "BuildingStandardsActMCP/1.5 (https://github.com/Sora-bluesky/building-standards-act-mcp)";

const pdfTextCache = createCache<string>("pdf-text", PDF_TEXT_CACHE_TTL);

/**
 * Fetch a PDF binary from a URL with timeout handling.
 *
 * @param url - The URL to fetch
 * @returns The PDF data as a Uint8Array
 * @throws Error if the fetch fails or times out
 */
async function fetchPdfBuffer(url: string): Promise<Uint8Array> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": PDF_USER_AGENT },
    });
    if (!response.ok) {
      throw new Error(
        `PDF取得に失敗しました (HTTP ${response.status}): ${url}`,
      );
    }
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`PDF取得がタイムアウトしました: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Normalize extracted PDF text by trimming whitespace and
 * collapsing excessive blank lines.
 */
function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n") // Normalize line breaks
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n") // Collapse 3+ newlines to 2
    .trim();
}

/**
 * Download a PDF from a URL and extract its text content.
 * Uses pdfjs-dist directly with worker configured for serverless compatibility.
 * Results are cached for 24 hours to avoid redundant downloads.
 *
 * @param pdfUrl - The URL of the PDF to download and parse
 * @returns The extracted text content
 * @throws Error if the PDF cannot be fetched or parsed
 */
export async function extractTextFromPdf(pdfUrl: string): Promise<string> {
  if (!isAllowedPdfUrl(pdfUrl)) {
    throw new Error(
      "許可されていないURLです: PDFは指定された政府サイトからのみ取得できます",
    );
  }

  const cacheKey = `pdf:${pdfUrl}`;
  const cached = pdfTextCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const data = await fetchPdfBuffer(pdfUrl);

  // Lazy import: pdfjs-dist may need native-like APIs (DOMMatrix, etc.).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Resolve worker path relative to the pdfjs-dist package.
  // import.meta.resolve returns a file:// URL that works across platforms.
  // In test environments (vitest) import.meta.resolve may not exist.
  if (typeof import.meta.resolve === "function") {
    const workerSrc = import.meta
      .resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  }

  const doc = await pdfjsLib.getDocument({ data }).promise;

  let fullText = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageText = content.items.map((item: any) => item.str).join("");
    fullText += pageText + "\n";
  }

  const text = normalizeText(fullText);

  if (!text) {
    throw new Error(`PDFからテキストを抽出できませんでした: ${pdfUrl}`);
  }

  pdfTextCache.set(cacheKey, text);
  return text;
}
