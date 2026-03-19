import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/egov-client.js", () => ({
  getLawData: vi.fn(),
}));

vi.mock("../../src/lib/egov-parser.js", () => ({
  parseArticle: vi.fn(),
}));

vi.mock("../../src/lib/law-resolver.js", () => ({
  resolveLawId: vi.fn(),
}));

import { registerSuggestRelatedTool } from "../../src/tools/suggest-related.js";
import { getLawData } from "../../src/lib/egov-client.js";
import { parseArticle } from "../../src/lib/egov-parser.js";
import { resolveLawId } from "../../src/lib/law-resolver.js";

const MOCK_RESOLVED = {
  law_id: "325AC0000000201",
  title: "建築基準法",
  law_num: "昭和二十五年法律第二百一号",
  source: "alias" as const,
};

let handler: Function;

const mockServer = {
  tool: vi.fn((_name: string, _desc: string, _schema: any, fn: Function) => {
    handler = fn;
  }),
};

const MOCK_LAW_DATA = {
  law_full_text: { tag: "Law", children: [] },
  law_info: { law_id: "325AC0000000201" },
  revision_info: {},
};

describe("suggest_related tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerSuggestRelatedTool(mockServer as any);
  });

  it("registers with correct name", () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      "suggest_related",
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("returns error for unknown law", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(null);

    const result = await handler({
      law_name: "存在しない法律",
      article_number: "1",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("エラー");
  });

  it("formats cross_law references correctly", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue({
      article_num: "20",
      article_caption: "（構造耐力）",
      article_title: "第二十条",
      text: "テスト",
      references: [
        {
          raw_text: "建築基準法施行令第36条",
          ref_type: "cross_law",
          target_law: "建築基準法施行令",
          target_article: "36",
        },
      ],
    } as any);

    const result = await handler({
      law_name: "建築基準法",
      article_number: "20",
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("関連法令");
    expect(text).toContain("直接参照されている法令");
    expect(text).toContain("建築基準法施行令");
    expect(text).toContain("第36条");
  });

  it("shows no-reference message for clean article", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue({
      article_num: "1",
      article_caption: "",
      article_title: "第一条",
      text: "テスト",
      references: [],
    } as any);

    const result = await handler({
      law_name: "建築基準法",
      article_number: "1",
    });

    const text = result.content[0].text;
    expect(text).toContain("参照が検出されませんでした");
    expect(text).toContain("同カテゴリの法令");
  });

  it("formats delegation references", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue({
      article_num: "20",
      article_caption: "",
      article_title: "第二十条",
      text: "テスト",
      references: [{ raw_text: "政令で定める", ref_type: "delegation" }],
    } as any);

    const result = await handler({
      law_name: "建築基準法",
      article_number: "20",
    });

    const text = result.content[0].text;
    expect(text).toContain("委任先");
    expect(text).toContain("[政令]");
  });
});
