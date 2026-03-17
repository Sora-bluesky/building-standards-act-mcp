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

import { registerGetKokujiTool } from "../../src/tools/get-kokuji.js";
import { searchLaws, getLawData } from "../../src/lib/egov-client.js";
import { parseFullLaw } from "../../src/lib/egov-parser.js";

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

  it("returns guidance when nothing found (no preset, no API results)", async () => {
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
    expect(result.content[0].text).toContain("get_law");
    // getLawData should NOT have been called since nothing was found
    expect(getLawData).not.toHaveBeenCalled();
  });

  it("returns search result text when API search finds something", async () => {
    const mockSearchResult = {
      total_count: 1,
      count: 1,
      laws: [
        {
          law_info: {
            law_type: "Act",
            law_id: "KOKUJI001",
            law_num: "平成十二年建設省告示第千三百九十九号",
            law_num_era: "Heisei",
            law_num_year: 12,
            law_num_type: "MinisterialNotification",
            law_num_num: "1399",
            promulgation_date: "2000-05-30",
          },
          revision_info: {
            law_revision_id: "rev1",
            law_type: "MinisterialNotification",
            law_title: "耐火構造の構造方法を定める件",
            law_title_kana: "たいかこうぞうの...",
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
            law_title: "耐火構造の構造方法を定める件",
            law_title_kana: "たいかこうぞうの...",
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
    const mockFullText = "第一条 耐火構造は、次に掲げる基準に適合する...";

    vi.mocked(searchLaws).mockResolvedValue(mockSearchResult as any);
    vi.mocked(getLawData).mockResolvedValue(mockLawData as any);
    vi.mocked(parseFullLaw).mockReturnValue(mockFullText);

    const result = await handler({
      kokuji_name: "耐火構造の構造方法を定める件",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("【検索結果】");
    expect(result.content[0].text).toContain("耐火構造の構造方法を定める件");
    expect(result.content[0].text).toContain(mockFullText);
    expect(result.content[0].text).toContain("プリセットに含まれていない");

    expect(searchLaws).toHaveBeenCalledWith("耐火構造の構造方法を定める件");
    expect(getLawData).toHaveBeenCalledWith("KOKUJI001");
    expect(parseFullLaw).toHaveBeenCalledWith(mockLawData.law_full_text);
  });

  it("returns error on API failure", async () => {
    vi.mocked(searchLaws).mockRejectedValue(
      new Error("e-Gov API returned 500"),
    );

    const result = await handler({
      kokuji_name: "耐火構造の構造方法を定める件",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("エラー");
    expect(result.content[0].text).toContain("e-Gov API returned 500");
  });
});
