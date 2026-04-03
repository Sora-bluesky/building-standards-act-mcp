import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external dependencies BEFORE importing the tool module
vi.mock("../../src/lib/egov-client.js", () => ({
  getLawData: vi.fn(),
  searchLaws: vi.fn(),
}));

import { registerSearchLawTool } from "../../src/tools/search-law.js";
import { searchLaws } from "../../src/lib/egov-client.js";

// Capture the handler registered by the tool
let handler: Function;

const mockServer = {
  tool: vi.fn((_name: string, _desc: string, _schema: any, fn: Function) => {
    handler = fn;
  }),
};

describe("search_law tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerSearchLawTool(mockServer as any);
  });

  it("registers with correct name", () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      "search_law",
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("returns preset results and API results", async () => {
    const mockApiResults = {
      total_count: 2,
      count: 2,
      laws: [
        {
          law_info: {
            law_type: "Act",
            law_id: "325AC0000000201",
            law_num: "昭和二十五年法律第二百一号",
            law_num_era: "Showa",
            law_num_year: 25,
            law_num_type: "Act",
            law_num_num: "201",
            promulgation_date: "1950-05-24",
          },
          revision_info: {
            law_revision_id: "rev1",
            law_type: "Act",
            law_title: "建築基準法",
            law_title_kana: "けんちくきじゅんほう",
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
            law_type: "Act",
            law_title: "建築基準法",
            law_title_kana: "けんちくきじゅんほう",
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

    vi.mocked(searchLaws).mockResolvedValue(mockApiResults as any);

    // "建築基準" matches real preset entries (e.g. 建築基準法, 建築基準法施行令, etc.)
    const result = await handler({ keyword: "建築基準" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");
    // Preset results section
    expect(result.content[0].text).toContain("登録済み法令の検索結果");
    expect(result.content[0].text).toContain("建築基準法");
    // API results section
    expect(result.content[0].text).toContain("e-Gov API検索結果");

    expect(searchLaws).toHaveBeenCalledWith("建築基準");
  });

  it("returns not-found message when no results", async () => {
    const emptyApiResults = {
      total_count: 0,
      count: 0,
      laws: [],
    };

    vi.mocked(searchLaws).mockResolvedValue(emptyApiResults as any);

    // Use a keyword that won't match any presets
    const result = await handler({ keyword: "ZZZZZZZZZ存在しないキーワード" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("見つかりませんでした");
  });

  it("returns error on API failure", async () => {
    vi.mocked(searchLaws).mockRejectedValue(
      new Error("e-Gov API request timed out"),
    );

    const result = await handler({ keyword: "建築基準" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("エラー");
    // Sanitized: internal error details are hidden from client
    expect(result.content[0].text).not.toContain("timed out");
    expect(result.content[0].text).toContain("内部エラー");
  });
});
