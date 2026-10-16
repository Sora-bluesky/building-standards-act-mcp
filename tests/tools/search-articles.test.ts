import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchArticlesTool } from "../../src/tools/search-articles.js";
import { searchKeyword } from "../../src/lib/egov-client.js";
import { resolveLawId } from "../../src/lib/law-resolver.js";
import type { EgovKeywordResponse } from "../../src/lib/types.js";

vi.mock("../../src/lib/egov-client.js", () => ({ searchKeyword: vi.fn() }));
vi.mock("../../src/lib/law-resolver.js", () => ({ resolveLawId: vi.fn() }));

const response: EgovKeywordResponse = {
  total_count: 10, sentence_count: 2, next_offset: 2, items: [{
    law_info: { law_id: "law", law_type: "Act", law_num: "昭和二十五年法律第二百一号", law_num_era: "Showa", law_num_year: 25, law_num_type: "Act", law_num_num: "201", promulgation_date: "1950-05-24" },
    revision_info: { law_revision_id: "rev", law_type: "Act", law_title: "建築基準法", law_title_kana: "", abbrev: null, category: "", updated: "", amendment_promulgate_date: "2026-09-16", amendment_enforcement_date: "2026-11-01", amendment_enforcement_comment: null, amendment_law_id: "", amendment_law_title: "", amendment_law_num: "", repeal_status: "", remain_in_force: true, current_revision_status: "CurrentEnforced" },
    sentences: [{ position: "mainprovision", text: "<b>壁</b>は<span>耐火構造</span>とする。" }, { position: "appdxtable", text: '<span class="highlight">耐火構造</span>の基準' }],
  }],
};

type Handler = (args: { keyword: string; law_title?: string; limit: number; offset: number }) => Promise<{
  isError?: boolean; content: Array<{ text: string }>; structuredContent?: Record<string, unknown>;
}>;
let handler: Handler;
const registerTool = vi.fn((_name: string, _config: unknown, fn: Handler) => { handler = fn; });

describe("search_articles", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    registerSearchArticlesTool({ registerTool } as unknown as McpServer);
    vi.mocked(searchKeyword).mockResolvedValue(response);
  });

  it("registers an annotated tool with an output schema", () => {
    expect(registerTool).toHaveBeenCalledWith("search_articles", expect.objectContaining({ title: "条文本文検索", outputSchema: expect.any(Object), annotations: expect.objectContaining({ readOnlyHint: true }) }), expect.any(Function));
  });

  it("resolves a law title to its law number and converts highlights", async () => {
    vi.mocked(resolveLawId).mockResolvedValue({ law_id: "law", title: "建築基準法", law_num: response.items[0].law_info.law_num, source: "alias" });
    const result = await handler({ keyword: "耐火構造", law_title: "建基法", limit: 2, offset: 0 });
    expect(searchKeyword).toHaveBeenCalledWith({ keyword: "耐火構造", lawNum: "昭和二十五年法律第二百一号", limit: 2, offset: 0 });
    expect(result.structuredContent).toMatchObject({ keyword: "耐火構造", law_title: "建築基準法", total_count: 10, sentence_count: 2, next_offset: 2, hits: [
      { law_id: "law", position: "mainprovision", text: "壁は【耐火構造】とする。", amendment_promulgate_date: "2026-09-16" },
      { position: "appdxtable", text: "【耐火構造】の基準" },
    ] });
    expect(result.content[0].text).toContain('## 条文本文検索結果「耐火構造」');
    expect(result.content[0].text).toContain("次の offset: 2");
    expect(result.content[0].text).toContain("条番号は返りません");
    expect(result.content[0].text).toContain("get_law");
    expect(result.content[0].text).not.toContain("<");
  });

  it("searches without resolving a law when no title is supplied", async () => {
    await handler({ keyword: "耐火構造", limit: 10, offset: 4 });
    expect(resolveLawId).not.toHaveBeenCalled();
    expect(searchKeyword).toHaveBeenCalledWith({ keyword: "耐火構造", lawNum: undefined, limit: 10, offset: 4 });
  });

  it("returns a plain zero-hit message without an error", async () => {
    vi.mocked(searchKeyword).mockResolvedValue({ total_count: 0, sentence_count: 0, next_offset: null, items: [] });
    const result = await handler({ keyword: "no-match", limit: 10, offset: 0 });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ hits: [], next_offset: null });
    expect(result.content[0].text).toContain("見つかりませんでした");
    expect(result.content[0].text).not.toContain("次の offset");
  });

  it.each([0, 1])("returns an explicit null offset when next_offset is undefined with %i hits", async (totalCount) => {
    vi.mocked(searchKeyword).mockResolvedValue({
      ...response,
      total_count: totalCount,
      sentence_count: totalCount === 0 ? 0 : response.sentence_count,
      next_offset: undefined,
      items: totalCount === 0 ? [] : response.items,
    } as unknown as EgovKeywordResponse);

    const result = await handler({ keyword: "三百平方メートル", limit: 8, offset: 0 });
    const structuredContent = result.structuredContent!;

    expect(result.isError).toBeUndefined();
    expect("next_offset" in structuredContent).toBe(true);
    expect(structuredContent.next_offset).toBe(null);
    expect(JSON.parse(JSON.stringify(structuredContent)).next_offset).toBe(null);
    expect(result.content[0].text).not.toContain("次の offset");
  });

  it("returns the LawNotFoundError message before searching an unknown law", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(null);
    const result = await handler({ keyword: "耐火構造", law_title: "不明な法律", limit: 10, offset: 0 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("法令が見つかりません: 不明な法律");
    expect(searchKeyword).not.toHaveBeenCalled();
  });
});
