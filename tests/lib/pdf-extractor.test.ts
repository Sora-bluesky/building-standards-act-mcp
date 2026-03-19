import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub global fetch before importing the module under test
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock pdfjs-dist — extractTextFromPdf calls getDocument().promise, then
// iterates pages with getPage() and getTextContent().
const mockGetTextContent = vi.fn();
const mockGetPage = vi.fn();
const mockGetDocument = vi.fn();

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: (...args: unknown[]) => ({
    promise: mockGetDocument(...args),
  }),
}));

import { extractTextFromPdf } from "../../src/lib/pdf-extractor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A fake PDF buffer (content is irrelevant since pdfjs-dist is mocked). */
const FAKE_PDF_BUFFER = new ArrayBuffer(128);

function createPdfResponse(buffer: ArrayBuffer = FAKE_PDF_BUFFER) {
  return {
    ok: true,
    arrayBuffer: () => Promise.resolve(buffer),
  };
}

/** Set up the pdfjs-dist mock to return `pageTexts` (one string per page). */
function setupPdfjsMock(pageTexts: string[]) {
  mockGetPage.mockImplementation(async (pageNum: number) => ({
    getTextContent: async () => ({
      items: [{ str: pageTexts[pageNum - 1] ?? "" }],
    }),
  }));

  mockGetDocument.mockResolvedValue({
    numPages: pageTexts.length,
    getPage: mockGetPage,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("pdf-extractor", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockGetDocument.mockReset();
    mockGetPage.mockReset();
    mockGetTextContent.mockReset();
  });

  describe("extractTextFromPdf — success cases", () => {
    it("extracts text from a PDF URL", async () => {
      const pdfUrl = "http://example.com/success-test.pdf";
      mockFetch.mockResolvedValueOnce(createPdfResponse());
      setupPdfjsMock([
        "第一条　耐火構造は、次の各号に掲げる建築物の部分に応じ...",
      ]);

      const result = await extractTextFromPdf(pdfUrl);

      expect(result).toBe(
        "第一条　耐火構造は、次の各号に掲げる建築物の部分に応じ...",
      );
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        pdfUrl,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(mockGetDocument).toHaveBeenCalledOnce();
    });

    it("returns cached text on second call with same URL", async () => {
      const pdfUrl = "http://example.com/cache-test.pdf";
      mockFetch.mockResolvedValueOnce(createPdfResponse());
      setupPdfjsMock(["キャッシュテスト用テキスト"]);

      const first = await extractTextFromPdf(pdfUrl);
      const second = await extractTextFromPdf(pdfUrl);

      expect(first).toBe("キャッシュテスト用テキスト");
      expect(second).toBe("キャッシュテスト用テキスト");
      // fetch + parse should only be called once (second call hits cache)
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockGetDocument).toHaveBeenCalledOnce();
    });

    it("concatenates text from multiple pages", async () => {
      const pdfUrl = "http://example.com/multipage-test.pdf";
      mockFetch.mockResolvedValueOnce(createPdfResponse());
      setupPdfjsMock(["第一条", "第二条"]);

      const result = await extractTextFromPdf(pdfUrl);

      expect(result).toBe("第一条\n第二条");
    });
  });

  describe("extractTextFromPdf — error cases", () => {
    it("throws error on HTTP error response", async () => {
      const pdfUrl = "http://example.com/http-error-test.pdf";
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        arrayBuffer: () => Promise.resolve(FAKE_PDF_BUFFER),
      });

      await expect(extractTextFromPdf(pdfUrl)).rejects.toThrow(
        "PDF取得に失敗しました (HTTP 404)",
      );
    });

    it("throws timeout error on slow fetch", async () => {
      const pdfUrl = "http://example.com/timeout-test.pdf";
      const abortError = new DOMException(
        "The operation was aborted",
        "AbortError",
      );
      mockFetch.mockRejectedValueOnce(abortError);

      await expect(extractTextFromPdf(pdfUrl)).rejects.toThrow(
        "PDF取得がタイムアウトしました",
      );
    });

    it("throws error when PDF has no text content", async () => {
      const pdfUrl = "http://example.com/empty-text-test.pdf";
      mockFetch.mockResolvedValueOnce(createPdfResponse());
      setupPdfjsMock([""]);

      await expect(extractTextFromPdf(pdfUrl)).rejects.toThrow(
        "PDFからテキストを抽出できませんでした",
      );
    });

    it("throws error when PDF text is only whitespace", async () => {
      const pdfUrl = "http://example.com/whitespace-test.pdf";
      mockFetch.mockResolvedValueOnce(createPdfResponse());
      setupPdfjsMock(["   \n\n\r\n  "]);

      await expect(extractTextFromPdf(pdfUrl)).rejects.toThrow(
        "PDFからテキストを抽出できませんでした",
      );
    });

    it("propagates network errors from fetch", async () => {
      const pdfUrl = "http://example.com/network-error-test.pdf";
      mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

      await expect(extractTextFromPdf(pdfUrl)).rejects.toThrow("fetch failed");
    });
  });
});
