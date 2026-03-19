import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";

// Stub global fetch before importing the module under test
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  findKokujiPdfUrl,
  searchMlitNotices,
} from "../../src/lib/mlit-client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal .xlsx (ZIP) buffer that the parseXlsx logic can read.
 * Each inner array is one row; each string is a cell value.
 */
async function createMockXlsx(rows: string[][]): Promise<ArrayBuffer> {
  const zip = new JSZip();

  // Collect unique strings for sharedStrings.xml
  const strings: string[] = [];
  const stringIndex = new Map<string, number>();
  for (const row of rows) {
    for (const cell of row) {
      if (!stringIndex.has(cell)) {
        stringIndex.set(cell, strings.length);
        strings.push(cell);
      }
    }
  }

  // xl/sharedStrings.xml
  const ssXml = `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
     count="${strings.length}" uniqueCount="${strings.length}">
${strings.map((s) => `<si><t>${s}</t></si>`).join("\n")}
</sst>`;
  zip.file("xl/sharedStrings.xml", ssXml);

  // xl/worksheets/sheet1.xml
  const cols = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const rowsXml = rows
    .map((row, ri) => {
      const cellsXml = row
        .map((cell, ci) => {
          const ref = `${cols[ci]}${ri + 1}`;
          const idx = stringIndex.get(cell) ?? 0;
          return `<c r="${ref}" s="1" t="s"><v>${idx}</v></c>`;
        })
        .join("");
      return `<row r="${ri + 1}">${cellsXml}</row>`;
    })
    .join("\n");

  const sheetXml = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>
${rowsXml}
</sheetData>
</worksheet>`;
  zip.file("xl/worksheets/sheet1.xml", sheetXml);

  return await zip.generateAsync({ type: "arraybuffer" });
}

const MOCK_NOTICE_HTML = `
<html><body>
<a href="/notice/content/001988976.xlsx">告示・通達一覧[Excelファイル]</a>
</body></html>`;

const MOCK_ROWS = [
  // Header row (skipped by the parser)
  ["国土交通省　告示・通達一覧", "", "", "", "", ""],
  // Data rows
  [
    "耐火構造の構造方法を定める件",
    "建設省告示第千三百九十九号",
    "36676",
    "国土交通省住宅局建築指導課",
    "データのリンクはこちら",
    "http://www.mlit.go.jp/notice/noticedata/pdf/201706/00006704.pdf",
  ],
  [
    "不燃材料を定める件",
    "建設省告示第千四百号",
    "36676",
    "国土交通省住宅局建築指導課",
    "データのリンクはこちら",
    "http://www.mlit.go.jp/notice/noticedata/pdf/201703/00006465.pdf",
  ],
];

/**
 * Configure mockFetch so the MLIT notice page returns `html` and
 * the Excel download returns an xlsx built from `rows`.
 */
async function setupHappyPath(
  html: string = MOCK_NOTICE_HTML,
  rows: string[][] = MOCK_ROWS,
) {
  const xlsxBuffer = await createMockXlsx(rows);
  mockFetch.mockImplementation(async (url: string) => {
    if (typeof url === "string" && url.endsWith(".xlsx")) {
      return {
        ok: true,
        arrayBuffer: () => Promise.resolve(xlsxBuffer),
      };
    }
    // Default: the notice page
    return {
      ok: true,
      text: () => Promise.resolve(html),
    };
  });
}

// ---------------------------------------------------------------------------
// Tests — findKokujiPdfUrl
// ---------------------------------------------------------------------------

describe("mlit-client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  /*
   * Because the module uses a singleton TTLCache that persists across tests,
   * the "success" describe block runs first. Once getAllEntries() succeeds,
   * the cached entries are reused in subsequent calls within the same
   * module import. The "failure" describe blocks therefore use
   * vi.resetModules() + dynamic imports to get a fresh module instance.
   */

  describe("findKokujiPdfUrl — success cases", () => {
    it("returns PDF URL when exact title match is found", async () => {
      await setupHappyPath();

      const result = await findKokujiPdfUrl("耐火構造の構造方法を定める件");

      expect(result).toBe(
        "http://www.mlit.go.jp/notice/noticedata/pdf/201706/00006704.pdf",
      );
    });

    it("returns PDF URL when partial title match is found", async () => {
      // The cache from the previous test should still be warm, which is fine.
      // "耐火構造" is contained within the full title.
      await setupHappyPath();

      const result = await findKokujiPdfUrl("耐火構造");

      expect(result).toBe(
        "http://www.mlit.go.jp/notice/noticedata/pdf/201706/00006704.pdf",
      );
    });

    it("returns null when no match is found", async () => {
      await setupHappyPath();

      const result = await findKokujiPdfUrl("存在しない告示タイトル");

      expect(result).toBeNull();
    });
  });

  describe("findKokujiPdfUrl — failure cases (fresh module)", () => {
    it("returns null when notice page fetch fails (network error)", async () => {
      vi.resetModules();

      const freshMockFetch = vi.fn();
      vi.stubGlobal("fetch", freshMockFetch);
      freshMockFetch.mockRejectedValue(new TypeError("fetch failed"));

      const { findKokujiPdfUrl: freshFn } =
        await import("../../src/lib/mlit-client.js");

      const result = await freshFn("耐火構造の構造方法を定める件");
      expect(result).toBeNull();
    });

    it("returns null when Excel URL is not found in HTML", async () => {
      vi.resetModules();

      const freshMockFetch = vi.fn();
      vi.stubGlobal("fetch", freshMockFetch);
      freshMockFetch.mockResolvedValue({
        ok: true,
        text: () =>
          Promise.resolve("<html><body>No excel link here</body></html>"),
      });

      const { findKokujiPdfUrl: freshFn } =
        await import("../../src/lib/mlit-client.js");

      const result = await freshFn("耐火構造の構造方法を定める件");
      expect(result).toBeNull();
    });

    it("returns null when Excel download fails", async () => {
      vi.resetModules();

      const freshMockFetch = vi.fn();
      vi.stubGlobal("fetch", freshMockFetch);
      freshMockFetch.mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.endsWith(".xlsx")) {
          return { ok: false, status: 500 };
        }
        return {
          ok: true,
          text: () => Promise.resolve(MOCK_NOTICE_HTML),
        };
      });

      const { findKokujiPdfUrl: freshFn } =
        await import("../../src/lib/mlit-client.js");

      const result = await freshFn("耐火構造の構造方法を定める件");
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Tests — searchMlitNotices
  // -------------------------------------------------------------------------

  describe("searchMlitNotices — success cases", () => {
    it("returns matching entries by keyword", async () => {
      await setupHappyPath();

      const results = await searchMlitNotices("耐火");

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("耐火構造の構造方法を定める件");
      expect(results[0].pdf_url).toBe(
        "http://www.mlit.go.jp/notice/noticedata/pdf/201706/00006704.pdf",
      );
    });

    it("returns empty array when no match", async () => {
      await setupHappyPath();

      const results = await searchMlitNotices("一致しないキーワード");

      expect(results).toEqual([]);
    });
  });

  describe("searchMlitNotices — failure cases (fresh module)", () => {
    it("returns empty array when fetch fails", async () => {
      vi.resetModules();

      const freshMockFetch = vi.fn();
      vi.stubGlobal("fetch", freshMockFetch);
      freshMockFetch.mockRejectedValue(new TypeError("fetch failed"));

      const { searchMlitNotices: freshFn } =
        await import("../../src/lib/mlit-client.js");

      const results = await freshFn("耐火");
      expect(results).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Tests — Excel parsing / entry transformation
  // -------------------------------------------------------------------------

  describe("Excel parsing and entry transformation", () => {
    it("converts Excel date serial to YYYY-MM-DD format", async () => {
      vi.resetModules();

      const freshMockFetch = vi.fn();
      vi.stubGlobal("fetch", freshMockFetch);

      const rows = [
        ["Header", "", "", "", "", ""],
        [
          "テスト告示",
          "国土交通省告示第一号",
          "36676",
          "テスト課",
          "リンク",
          "http://example.com/test.pdf",
        ],
      ];
      const xlsxBuffer = await createMockXlsx(rows);

      freshMockFetch.mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.endsWith(".xlsx")) {
          return {
            ok: true,
            arrayBuffer: () => Promise.resolve(xlsxBuffer),
          };
        }
        return {
          ok: true,
          text: () => Promise.resolve(MOCK_NOTICE_HTML),
        };
      });

      const { searchMlitNotices: freshFn } =
        await import("../../src/lib/mlit-client.js");

      const results = await freshFn("テスト告示");
      expect(results).toHaveLength(1);
      expect(results[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("makes relative PDF URLs absolute", async () => {
      vi.resetModules();

      const freshMockFetch = vi.fn();
      vi.stubGlobal("fetch", freshMockFetch);

      const rows = [
        ["Header", "", "", "", "", ""],
        [
          "相対URL告示",
          "告示第二号",
          "36676",
          "テスト課",
          "リンク",
          "/notice/noticedata/pdf/test.pdf",
        ],
      ];
      const xlsxBuffer = await createMockXlsx(rows);

      freshMockFetch.mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.endsWith(".xlsx")) {
          return {
            ok: true,
            arrayBuffer: () => Promise.resolve(xlsxBuffer),
          };
        }
        return {
          ok: true,
          text: () => Promise.resolve(MOCK_NOTICE_HTML),
        };
      });

      const { searchMlitNotices: freshFn } =
        await import("../../src/lib/mlit-client.js");

      const results = await freshFn("相対URL告示");
      expect(results).toHaveLength(1);
      expect(results[0].pdf_url).toBe(
        "https://www.mlit.go.jp/notice/noticedata/pdf/test.pdf",
      );
    });

    it("skips rows without title or PDF URL", async () => {
      vi.resetModules();

      const freshMockFetch = vi.fn();
      vi.stubGlobal("fetch", freshMockFetch);

      const rows = [
        ["Header", "", "", "", "", ""],
        // Row with title but no PDF URL
        ["タイトルのみ", "告示第三号", "36676", "テスト課", "リンク", ""],
        // Row with PDF URL but no title
        [
          "",
          "告示第四号",
          "36676",
          "テスト課",
          "リンク",
          "http://example.com/test.pdf",
        ],
        // Valid row
        [
          "有効な告示",
          "告示第五号",
          "36676",
          "テスト課",
          "リンク",
          "http://example.com/valid.pdf",
        ],
      ];
      const xlsxBuffer = await createMockXlsx(rows);

      freshMockFetch.mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.endsWith(".xlsx")) {
          return {
            ok: true,
            arrayBuffer: () => Promise.resolve(xlsxBuffer),
          };
        }
        return {
          ok: true,
          text: () => Promise.resolve(MOCK_NOTICE_HTML),
        };
      });

      const { searchMlitNotices: freshFn } =
        await import("../../src/lib/mlit-client.js");

      // Only "有効な告示" should pass; the other two are filtered out.
      // Search with empty-ish keyword that matches all — use a broad search.
      const results = await freshFn("告示");
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("有効な告示");
    });

    it("extracts Excel URL from relative href with leading slash", async () => {
      vi.resetModules();

      const freshMockFetch = vi.fn();
      vi.stubGlobal("fetch", freshMockFetch);

      // HTML with a relative .xlsx link starting with "/"
      const htmlWithRelativeUrl = `
<html><body>
<a href="/notice/content/test.xlsx">Excel</a>
</body></html>`;

      const rows = [
        ["Header", "", "", "", "", ""],
        [
          "相対リンクテスト",
          "告示",
          "36676",
          "テスト課",
          "リンク",
          "http://example.com/t.pdf",
        ],
      ];
      const xlsxBuffer = await createMockXlsx(rows);

      freshMockFetch.mockImplementation(async (url: string) => {
        if (typeof url === "string" && url.endsWith(".xlsx")) {
          return {
            ok: true,
            arrayBuffer: () => Promise.resolve(xlsxBuffer),
          };
        }
        return {
          ok: true,
          text: () => Promise.resolve(htmlWithRelativeUrl),
        };
      });

      const { findKokujiPdfUrl: freshFn } =
        await import("../../src/lib/mlit-client.js");

      const result = await freshFn("相対リンクテスト");
      expect(result).toBe("http://example.com/t.pdf");

      // Verify the fetch was called with the absolute URL
      const fetchCalls = freshMockFetch.mock.calls.map((c: unknown[]) => c[0]);
      expect(fetchCalls).toContain(
        "https://www.mlit.go.jp/notice/content/test.xlsx",
      );
    });
  });
});
