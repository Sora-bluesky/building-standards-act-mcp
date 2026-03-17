import { describe, it, expect, vi, beforeEach } from "vitest";

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
}));
vi.mock("../../src/lib/pdf-extractor.js", () => ({
  extractTextFromPdf: vi.fn(),
}));

import { registerGetKokujiTool } from "../../src/tools/get-kokuji.js";
import { searchLaws, getLawData } from "../../src/lib/egov-client.js";
import { parseFullLaw } from "../../src/lib/egov-parser.js";
import { findKokujiPdfUrl } from "../../src/lib/mlit-client.js";
import { extractTextFromPdf } from "../../src/lib/pdf-extractor.js";

// Capture the handler registered by the tool
let handler: Function;

const mockServer = {
  tool: vi.fn((_name: string, _desc: string, _schema: any, fn: Function) => {
    handler = fn;
  }),
};

describe("get_kokuji tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerGetKokujiTool(mockServer as any);
  });

  it("registers with correct name", () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      "get_kokuji",
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("returns preset kokuji text via MLIT pipeline", async () => {
    const mockPdfUrl = "https://www.mlit.go.jp/notice/test.pdf";
    const mockPdfText = "耐火構造の構造方法は、次に定めるものとする。";

    vi.mocked(findKokujiPdfUrl).mockResolvedValue(mockPdfUrl);
    vi.mocked(extractTextFromPdf).mockResolvedValue(mockPdfText);

    const result = await handler({
      kokuji_name: "耐火構造の構造方法を定める件",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("【告示】");
    expect(result.content[0].text).toContain("耐火構造の構造方法を定める件");
    expect(result.content[0].text).toContain(
      "平成十二年建設省告示第千三百九十九号",
    );
    expect(result.content[0].text).toContain("建築基準法施行令");
    expect(result.content[0].text).toContain(mockPdfText);
    expect(result.content[0].text).toContain("出典: 国土交通省");
  });

  it("falls back when MLIT fails and shows failure message", async () => {
    // MLIT pipeline fails
    vi.mocked(findKokujiPdfUrl).mockResolvedValue(null);

    const result = await handler({
      kokuji_name: "耐火構造の構造方法を定める件",
    });

    // Preset has law_id="" so e-Gov fallback is skipped
    // Result should show "取得に失敗しました"
    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("告示本文の取得に失敗しました");
    expect(result.content[0].text).toContain("耐火構造の構造方法を定める件");
  });

  it("returns search result text when no preset matches but MLIT finds it", async () => {
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
    expect(result.content[0].text).toContain("プリセットに含まれていない");
  });

  it("returns e-Gov fallback when no preset and MLIT fails", async () => {
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
      kokuji_name: "存在しないが検索で見つかる告示",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("【検索結果】");
    expect(result.content[0].text).toContain("e-Gov法令検索");
    expect(result.content[0].text).toContain(mockFullText);
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

    const result = await handler({
      kokuji_name: "存在しない告示",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain(
      "該当する告示を確認できませんでした",
    );
    expect(result.content[0].text).toContain("存在しない告示");
    // Should list the 7 presets
    expect(result.content[0].text).toContain("登録済みの告示一覧");
    expect(result.content[0].text).toContain("耐火構造の構造方法を定める件");
    expect(result.content[0].text).toContain("get_law");
    // getLawData should NOT have been called since nothing was found
    expect(getLawData).not.toHaveBeenCalled();
  });

  it("returns error on unexpected exception", async () => {
    // Make findKokujiPdfUrl throw an uncaught error
    // The preset is found first, then fetchViaMlit is called which calls findKokujiPdfUrl
    // But findKokujiPdfUrl is called inside fetchViaMlit which has no try-catch around it
    // Actually, looking at the code: fetchViaMlit does NOT have a try-catch around findKokujiPdfUrl
    // but the outer try-catch in the handler will catch it.
    // However, for a non-preset name, the flow is:
    // 1. no preset -> fetchViaMlit(kokuji_name) which calls findKokujiPdfUrl
    //    If findKokujiPdfUrl throws, it propagates up to fetchViaMlit, which doesn't catch it,
    //    but the outer try-catch in the handler catches it.
    // Wait, let me re-read: fetchViaMlit does NOT have try-catch around findKokujiPdfUrl call.
    // So a throw from findKokujiPdfUrl will propagate to the handler's outer try-catch.

    // For a preset name, the flow goes to fetchViaMlit first.
    // The throw from findKokujiPdfUrl propagates up through fetchViaMlit to the handler's try-catch.
    vi.mocked(findKokujiPdfUrl).mockRejectedValue(
      new Error("Unexpected network error"),
    );

    const result = await handler({
      kokuji_name: "耐火構造の構造方法を定める件",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("エラー");
    expect(result.content[0].text).toContain("Unexpected network error");
  });
});
