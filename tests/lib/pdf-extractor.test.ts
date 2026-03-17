import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub global fetch before importing the module under test
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock pdf-parse module — PDFParse is a class used as `new PDFParse({ data })`
const mockGetText = vi.fn();
const mockDestroy = vi.fn();

vi.mock("pdf-parse", () => ({
  PDFParse: vi.fn().mockImplementation(() => ({
    getText: mockGetText,
    destroy: mockDestroy,
  })),
}));

import { extractTextFromPdf } from "../../src/lib/pdf-extractor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A fake PDF buffer (content is irrelevant since pdf-parse is mocked). */
const FAKE_PDF_BUFFER = new ArrayBuffer(128);

function createPdfResponse(buffer: ArrayBuffer = FAKE_PDF_BUFFER) {
  return {
    ok: true,
    arrayBuffer: () => Promise.resolve(buffer),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("pdf-extractor", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockGetText.mockReset();
    mockDestroy.mockReset();
    mockDestroy.mockResolvedValue(undefined);
  });

  // NOTE: Do NOT use vi.restoreAllMocks() here — it would remove
  // the mockImplementation from the vi.mock("pdf-parse") factory,
  // causing subsequent tests to fail with "parser.getText is not a function".

  describe("extractTextFromPdf — success cases", () => {
    it("extracts text from a PDF URL", async () => {
      const pdfUrl = "http://example.com/success-test.pdf";
      mockFetch.mockResolvedValueOnce(createPdfResponse());
      mockGetText.mockResolvedValueOnce({
        text: "第一条　耐火構造は、次の各号に掲げる建築物の部分に応じ...",
      });

      const result = await extractTextFromPdf(pdfUrl);

      expect(result).toBe(
        "第一条　耐火構造は、次の各号に掲げる建築物の部分に応じ...",
      );
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        pdfUrl,
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(mockGetText).toHaveBeenCalledOnce();
      expect(mockDestroy).toHaveBeenCalledOnce();
    });

    it("returns cached text on second call with same URL", async () => {
      const pdfUrl = "http://example.com/cache-test.pdf";
      mockFetch.mockResolvedValueOnce(createPdfResponse());
      mockGetText.mockResolvedValueOnce({
        text: "キャッシュテスト用テキスト",
      });

      const first = await extractTextFromPdf(pdfUrl);
      const second = await extractTextFromPdf(pdfUrl);

      expect(first).toBe("キャッシュテスト用テキスト");
      expect(second).toBe("キャッシュテスト用テキスト");
      // fetch + parse should only be called once (second call hits cache)
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockGetText).toHaveBeenCalledOnce();
    });

    it("normalizes text: collapses excessive blank lines", async () => {
      const pdfUrl = "http://example.com/normalize-test.pdf";
      mockFetch.mockResolvedValueOnce(createPdfResponse());
      mockGetText.mockResolvedValueOnce({
        text: "第一条\r\n\r\n\r\n\r\n第二条\r第三条",
      });

      const result = await extractTextFromPdf(pdfUrl);

      // \r\n -> \n, 4+ newlines collapsed to 2, \r -> \n
      expect(result).toBe("第一条\n\n第二条\n第三条");
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
      mockGetText.mockResolvedValueOnce({ text: "" });

      await expect(extractTextFromPdf(pdfUrl)).rejects.toThrow(
        "PDFからテキストを抽出できませんでした",
      );
      expect(mockDestroy).toHaveBeenCalledOnce();
    });

    it("throws error when PDF text is only whitespace", async () => {
      const pdfUrl = "http://example.com/whitespace-test.pdf";
      mockFetch.mockResolvedValueOnce(createPdfResponse());
      mockGetText.mockResolvedValueOnce({ text: "   \n\n\r\n  " });

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
