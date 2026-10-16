import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

// Mock external dependencies BEFORE importing the tool module
vi.mock("../../src/lib/egov-client.js", () => ({
  getLawData: vi.fn(),
  searchLaws: vi.fn(),
}));
vi.mock("../../src/lib/egov-parser.js", () => ({
  parseArticle: vi.fn(),
  parseFullLaw: vi.fn(),
}));
vi.mock("../../src/lib/mlit-client.js", () => ({
  findKokujiPdfUrl: vi.fn(),
  searchMlitNotices: vi.fn(),
}));
vi.mock("../../src/lib/pdf-extractor.js", () => ({
  extractTextFromPdf: vi.fn(),
}));

import { registerGetKokujiTool } from "../../src/tools/get-kokuji.js";
import { searchLaws, getLawData } from "../../src/lib/egov-client.js";
import { parseFullLaw } from "../../src/lib/egov-parser.js";
import {
  findKokujiPdfUrl,
  searchMlitNotices,
} from "../../src/lib/mlit-client.js";
import { extractTextFromPdf } from "../../src/lib/pdf-extractor.js";
import { KokujiRegistry } from "../../src/lib/kokuji-registry.js";
import type { KokujiPreset } from "../../src/lib/types.js";

// Capture the handler registered by the tool
let handler: Function;

const mockServer = {
  registerTool: vi.fn((_name: string, _config: { inputSchema: z.ZodRawShape }, fn: Function) => {
    handler = fn;
  }),
};

describe("get_kokuji tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerGetKokujiTool(mockServer as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers pagination defaults and integer limits without an output schema", () => {
    const config = mockServer.registerTool.mock.calls[0][1];
    const schema = z.object(config.inputSchema);
    expect(schema.parse({ kokuji_name: "テスト告示" })).toEqual({
      kokuji_name: "テスト告示", max_chars: 100_000, offset: 0,
    });
    for (const params of [
      { max_chars: 999 }, { max_chars: 500_001 }, { max_chars: 1000.5 },
      { offset: -1 }, { offset: 0.5 },
    ]) {
      expect(schema.safeParse({ kokuji_name: "テスト告示", ...params }).success).toBe(false);
    }
    expect(config).not.toHaveProperty("outputSchema");
  });

  it.each(["mlit", "pdf", "egov"])("paginates the preset %s success path", async (source) => {
    const pdfUrl = "https://www.mlit.go.jp/test.pdf";
    const preset: KokujiPreset = {
      law_id: "TEST_KOKUJI", law_num: "令和元年告示第一号", title: "テスト告示",
      abbrev: [], delegated_by: "建築基準法", pdf_url: pdfUrl,
    };
    vi.spyOn(KokujiRegistry.prototype, "findByName").mockReturnValue(preset);
    vi.mocked(findKokujiPdfUrl).mockResolvedValue(source === "mlit" ? pdfUrl : null);
    const body = "告示本文".repeat(375);
    vi.mocked(extractTextFromPdf).mockImplementation(async () => {
      if (source === "egov") throw new Error("PDF unavailable");
      return body;
    });
    vi.mocked(getLawData).mockResolvedValue({
      law_full_text: { tag: "Law", children: [] },
    } as Awaited<ReturnType<typeof getLawData>>);
    vi.mocked(parseFullLaw).mockReturnValue(body);

    const complete = (await handler({ kokuji_name: preset.title })).content[0].text;
    const first = await handler({ kokuji_name: preset.title, max_chars: 1000 });
    const second = await handler({ kokuji_name: preset.title, max_chars: 1000, offset: 1000 });
    expect(first.content[0].text).toBe(`${complete.slice(0, 1000)}\n\n（続きがあります。offset=1000 を指定して続きを取得してください。全体 ${complete.length} 文字）`);
    expect(second.content[0].text).toBe(complete.slice(1000));
  });
  it("registers with correct name", () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      "get_kokuji",
      expect.objectContaining({
        annotations: expect.objectContaining({ readOnlyHint: true }),
      }),
      expect.any(Function),
    );
  });

  it("returns kokuji text via MLIT dynamic search", async () => {
    const mockPdfUrl = "https://www.mlit.go.jp/notice/test.pdf";
    const mockPdfText = "耐火構造の構造方法は、次に定めるものとする。";

    vi.mocked(findKokujiPdfUrl).mockResolvedValue(mockPdfUrl);
    vi.mocked(extractTextFromPdf).mockResolvedValue(mockPdfText);

    const result = await handler({
      kokuji_name: "耐火構造の構造方法を定める件",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");
    // No presets — goes through dynamic MLIT search (Step 3)
    expect(result.content[0].text).toContain("【検索結果】");
    expect(result.content[0].text).toContain("耐火構造の構造方法を定める件");
    expect(result.content[0].text).toContain(mockPdfText);
    expect(result.content[0].text).toContain("出典: 国土交通省");
  });

  it("falls back to e-Gov when MLIT fails", async () => {
    // MLIT pipeline fails
    vi.mocked(findKokujiPdfUrl).mockResolvedValue(null);

    // e-Gov returns a result
    const mockSearchResult = {
      total_count: 1,
      count: 1,
      laws: [
        {
          law_info: {
            law_type: "MinisterialNotification",
            law_id: "KOKUJI001",
            law_num: "令和元年告示第一号",
            law_num_era: "Reiwa",
            law_num_year: 1,
            law_num_type: "MinisterialNotification",
            law_num_num: "1",
            promulgation_date: "2019-05-01",
          },
          revision_info: {
            law_revision_id: "rev1",
            law_type: "MinisterialNotification",
            law_title: "テスト告示",
            law_title_kana: "てすとこくじ",
            abbrev: null,
            category: "category",
            updated: "2024-01-01",
            amendment_promulgate_date: "2024-01-01",
            amendment_enforcement_date: "2024-04-01",
            amendment_enforcement_comment: null,
            amendment_law_id: "id1",
            amendment_law_title: "title1",
            amendment_law_num: "num1",
            repeal_status: "active",
            remain_in_force: true,
            current_revision_status: "active",
          },
          current_revision_info: {
            law_revision_id: "rev1",
            law_type: "MinisterialNotification",
            law_title: "テスト告示",
            law_title_kana: "てすとこくじ",
            abbrev: null,
            category: "category",
            updated: "2024-01-01",
            amendment_promulgate_date: "2024-01-01",
            amendment_enforcement_date: "2024-04-01",
            amendment_enforcement_comment: null,
            amendment_law_id: "id1",
            amendment_law_title: "title1",
            amendment_law_num: "num1",
            repeal_status: "active",
            remain_in_force: true,
            current_revision_status: "active",
          },
        },
      ],
    };

    const mockLawData = {
      law_full_text: { tag: "Law", children: [] },
    };
    const mockFullText = "第一条 テスト告示の本文です。";

    vi.mocked(searchLaws).mockResolvedValue(mockSearchResult as any);
    vi.mocked(getLawData).mockResolvedValue(mockLawData as any);
    vi.mocked(parseFullLaw).mockReturnValue(mockFullText);

    const result = await handler({
      kokuji_name: "耐火構造の構造方法を定める件",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("【検索結果】");
    expect(result.content[0].text).toContain("e-Gov法令検索");
    expect(result.content[0].text).toContain(mockFullText);

    vi.mocked(parseFullLaw).mockReturnValue("告示本文".repeat(375));
    const complete = (await handler({ kokuji_name: "テスト告示" })).content[0].text;
    const first = await handler({ kokuji_name: "テスト告示", max_chars: 1000 });
    const second = await handler({ kokuji_name: "テスト告示", max_chars: 1000, offset: 1000 });
    expect(first.content[0].text).toBe(`${complete.slice(0, 1000)}\n\n（続きがあります。offset=1000 を指定して続きを取得してください。全体 ${complete.length} 文字）`);
    expect(second.content[0].text).toBe(complete.slice(1000));
  });

  it("returns search result text when MLIT finds non-preset kokuji", async () => {
    const mockPdfUrl = "https://www.mlit.go.jp/notice/other.pdf";
    const mockPdfText = "この告示は検索で見つかりました。";

    vi.mocked(findKokujiPdfUrl).mockResolvedValue(mockPdfUrl);
    vi.mocked(extractTextFromPdf).mockResolvedValue(mockPdfText);

    const result = await handler({
      kokuji_name: "存在しないが検索で見つかる告示",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("【検索結果】");
    expect(result.content[0].text).toContain(mockPdfText);
  });

  it("returns guidance when nothing found anywhere", async () => {
    // MLIT pipeline fails
    vi.mocked(findKokujiPdfUrl).mockResolvedValue(null);

    // e-Gov returns nothing
    const emptySearchResult = {
      total_count: 0,
      count: 0,
      laws: [],
    };
    vi.mocked(searchLaws).mockResolvedValue(emptySearchResult as any);

    // MLIT suggestion search returns empty
    vi.mocked(searchMlitNotices).mockResolvedValue([]);

    const result = await handler({
      kokuji_name: "存在しない告示",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain(
      "該当する告示を確認できませんでした",
    );
    expect(result.content[0].text).toContain("存在しない告示");
    expect(result.content[0].text).toContain("get_law");
    // getLawData should NOT have been called since nothing was found
    expect(getLawData).not.toHaveBeenCalled();
  });

  it("paginates MLIT text including headers and continues at offset", async () => {
    vi.mocked(findKokujiPdfUrl).mockResolvedValue("https://www.mlit.go.jp/notice/test.pdf");
    const body = "告示本文".repeat(375);
    vi.mocked(extractTextFromPdf).mockResolvedValue(body);
    const complete = [
      "【検索結果】テスト告示", "", body, "",
      "出典: 国土交通省 告示・通達データベース", "",
      "※ この告示はプリセットに含まれていないため、",
      "国土交通省の告示データベースから検索して取得しました。",
    ].join("\n");

    const first = await handler({ kokuji_name: "テスト告示", max_chars: 1000, offset: 0 });
    const second = await handler({ kokuji_name: "テスト告示", max_chars: 1000, offset: 1000 });

    expect(first.content[0].text).toBe(`${complete.slice(0, 1000)}\n\n（続きがあります。offset=1000 を指定して続きを取得してください。全体 ${complete.length} 文字）`);
    expect(second.content[0].text).toBe(complete.slice(1000));
    expect(first).not.toHaveProperty("structuredContent");
  });

  it("returns error on unexpected exception", async () => {
    vi.mocked(findKokujiPdfUrl).mockRejectedValue(
      new Error("Unexpected network error"),
    );

    const result = await handler({
      kokuji_name: "耐火構造の構造方法を定める件",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("エラー");
    // Sanitized: internal error details are hidden from client
    expect(result.content[0].text).not.toContain("Unexpected network error");
    expect(result.content[0].text).toContain("内部エラー");
  });
});
