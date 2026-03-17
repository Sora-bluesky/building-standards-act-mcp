import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/egov-client.js", () => ({
  getLawData: vi.fn(),
}));

vi.mock("../../src/lib/egov-parser.js", () => ({
  parseArticleStructured: vi.fn(),
}));

import { analyzeArticle } from "../../src/lib/article-analyzer.js";
import { getLawData } from "../../src/lib/egov-client.js";
import { parseArticleStructured } from "../../src/lib/egov-parser.js";
import type { StructuredArticle } from "../../src/lib/types.js";

const MOCK_LAW_DATA = {
  law_full_text: { tag: "Law", children: [] },
  law_info: { law_id: "325AC0000000201" },
  revision_info: {},
};

function makeStructuredArticle(
  overrides: Partial<StructuredArticle> = {},
): StructuredArticle {
  return {
    article_num: "20",
    article_caption: "（構造耐力）",
    article_title: "第二十条",
    paragraphs: [
      {
        paragraph_num: "1",
        paragraph_sentence:
          "建築物は、自重、積載荷重に対して安全な構造のものとする。",
        items: [
          {
            item_num: "1",
            item_title: "一",
            item_sentence: "高さが六十メートルを超える建築物",
            subitems: [],
          },
          {
            item_num: "2",
            item_title: "二",
            item_sentence: "高さが六十メートル以下の建築物",
            subitems: [],
          },
        ],
      },
    ],
    references: [
      {
        raw_text: "建築基準法施行令第36条",
        ref_type: "cross_law",
        target_law: "建築基準法施行令",
        target_article: "36",
      },
      {
        raw_text: "第6条",
        ref_type: "same_law",
        target_article: "6",
      },
      {
        raw_text: "政令で定める",
        ref_type: "delegation",
      },
    ],
    ...overrides,
  };
}

describe("analyzeArticle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws for unknown law", async () => {
    await expect(analyzeArticle("存在しない法律", "1")).rejects.toThrow(
      "見つかりませんでした",
    );
  });

  it("throws for non-existent article", async () => {
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticleStructured).mockReturnValue(null);

    await expect(analyzeArticle("建築基準法", "9999")).rejects.toThrow(
      "見つかりませんでした",
    );
  });

  it("returns complete analysis for a structured article", async () => {
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticleStructured).mockReturnValue(makeStructuredArticle());

    const result = await analyzeArticle("建築基準法", "20");

    expect(result.law_name).toBe("建築基準法");
    expect(result.article_num).toBe("20");
    expect(result.article_title).toBe("第二十条");
    expect(result.caption).toBe("構造耐力");
  });

  it("counts structure correctly", async () => {
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticleStructured).mockReturnValue(makeStructuredArticle());

    const result = await analyzeArticle("建築基準法", "20");

    expect(result.structure.paragraph_count).toBe(1);
    expect(result.structure.item_count).toBe(2);
    expect(result.structure.subitem_count).toBe(0);
    expect(result.structure.total_characters).toBeGreaterThan(0);
  });

  it("generates paragraph summaries", async () => {
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticleStructured).mockReturnValue(makeStructuredArticle());

    const result = await analyzeArticle("建築基準法", "20");

    expect(result.paragraph_summaries).toHaveLength(1);
    expect(result.paragraph_summaries[0].paragraph_num).toBe("1");
    expect(result.paragraph_summaries[0].item_count).toBe(2);
    expect(result.paragraph_summaries[0].preview).toContain("建築物は");
  });

  it("summarizes references correctly", async () => {
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticleStructured).mockReturnValue(makeStructuredArticle());

    const result = await analyzeArticle("建築基準法", "20");

    expect(result.reference_summary.total).toBe(3);
    expect(result.reference_summary.cross_law).toBe(1);
    expect(result.reference_summary.same_law).toBe(1);
    expect(result.reference_summary.delegation).toBe(1);
    expect(result.reference_summary.referenced_laws).toEqual([
      "建築基準法施行令",
    ]);
  });

  it("handles article with no references", async () => {
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticleStructured).mockReturnValue(
      makeStructuredArticle({ references: undefined }),
    );

    const result = await analyzeArticle("建築基準法", "20");

    expect(result.reference_summary.total).toBe(0);
    expect(result.reference_summary.referenced_laws).toEqual([]);
  });

  it("strips parentheses from caption", async () => {
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticleStructured).mockReturnValue(
      makeStructuredArticle({ article_caption: "（目的）" }),
    );

    const result = await analyzeArticle("建築基準法", "20");
    expect(result.caption).toBe("目的");
  });

  it("handles empty caption", async () => {
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticleStructured).mockReturnValue(
      makeStructuredArticle({ article_caption: "" }),
    );

    const result = await analyzeArticle("建築基準法", "20");
    expect(result.caption).toBe("");
  });

  it("includes structured_data in result", async () => {
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    const article = makeStructuredArticle();
    vi.mocked(parseArticleStructured).mockReturnValue(article);

    const result = await analyzeArticle("建築基準法", "20");
    expect(result.structured_data).toBe(article);
  });
});
