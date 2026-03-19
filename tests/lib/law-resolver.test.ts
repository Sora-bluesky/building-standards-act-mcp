import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/egov-client.js", () => ({
  searchLaws: vi.fn(),
}));

import { resolveLawId } from "../../src/lib/law-resolver.js";
import { searchLaws } from "../../src/lib/egov-client.js";

describe("resolveLawId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("expands alias and searches with official title", async () => {
    vi.mocked(searchLaws).mockResolvedValue({
      total_count: 1,
      count: 1,
      laws: [
        {
          law_info: {
            law_id: "325AC0000000201",
            law_num: "昭和二十五年法律第二百一号",
          },
          revision_info: { law_title: "建築基準法" },
          current_revision_info: { law_title: "建築基準法" },
        },
      ],
    } as any);

    const result = await resolveLawId("建基法");
    expect(result).not.toBeNull();
    expect(result!.law_id).toBe("325AC0000000201");
    expect(result!.title).toBe("建築基準法");
    expect(result!.source).toBe("alias");
    // Should search with the expanded title, not the abbreviation
    expect(searchLaws).toHaveBeenCalledWith("建築基準法");
  });

  it("searches with original name when no alias exists", async () => {
    vi.mocked(searchLaws).mockResolvedValue({
      total_count: 1,
      count: 1,
      laws: [
        {
          law_info: {
            law_id: "SHOBO001",
            law_num: "昭和二十三年法律第百八十六号",
          },
          revision_info: { law_title: "消防法" },
          current_revision_info: { law_title: "消防法" },
        },
      ],
    } as any);

    const result = await resolveLawId("何かの法律");
    expect(result).not.toBeNull();
    expect(result!.source).toBe("egov_search");
    expect(searchLaws).toHaveBeenCalledWith("何かの法律");
  });

  it("returns null when search returns no results", async () => {
    vi.mocked(searchLaws).mockResolvedValue({
      total_count: 0,
      count: 0,
      laws: [],
    } as any);

    const result = await resolveLawId("存在しない法律");
    expect(result).toBeNull();
  });

  it("returns null when search throws an error", async () => {
    vi.mocked(searchLaws).mockRejectedValue(new Error("API error"));

    const result = await resolveLawId("建築基準法");
    expect(result).toBeNull();
  });

  it("selects correct law from multiple search results (バリアフリー法)", async () => {
    const correctTitle = "高齢者、障害者等の移動等の円滑化の促進に関する法律";
    vi.mocked(searchLaws).mockResolvedValue({
      total_count: 3,
      count: 3,
      laws: [
        {
          law_info: {
            law_id: "WRONG001",
            law_num: "昭和二十九年省令第百号",
          },
          revision_info: { law_title: "土地区画整理事業に関する省令" },
          current_revision_info: {
            law_title: "土地区画整理事業に関する省令",
          },
        },
        {
          law_info: {
            law_id: "CORRECT",
            law_num: "平成十八年法律第九十一号",
          },
          revision_info: { law_title: correctTitle },
          current_revision_info: { law_title: correctTitle },
        },
        {
          law_info: {
            law_id: "WRONG002",
            law_num: "平成十八年政令第三百七十九号",
          },
          revision_info: { law_title: correctTitle + "施行令" },
          current_revision_info: { law_title: correctTitle + "施行令" },
        },
      ],
    } as any);

    const result = await resolveLawId("バリアフリー法");
    expect(result).not.toBeNull();
    expect(result!.law_id).toBe("CORRECT");
    expect(result!.title).toBe(correctTitle);
  });

  it("uses revision_info.law_title for title", async () => {
    vi.mocked(searchLaws).mockResolvedValue({
      total_count: 1,
      count: 1,
      laws: [
        {
          law_info: {
            law_id: "TEST001",
            law_num: "テスト法令番号",
          },
          revision_info: { law_title: "正式名称A" },
          current_revision_info: { law_title: "正式名称B" },
        },
      ],
    } as any);

    const result = await resolveLawId("テスト法");
    expect(result!.title).toBe("正式名称A");
  });
});
