import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external dependencies BEFORE importing the tool module
vi.mock("../../src/lib/egov-client.js", () => ({
  getLawData: vi.fn(),
  searchLaws: vi.fn(),
}));
vi.mock("../../src/lib/egov-parser.js", () => ({
  parseArticle: vi.fn(),
  parseArticleStructured: vi.fn(),
  parseFullLaw: vi.fn(),
}));

import { registerGetLawTool } from "../../src/tools/get-law.js";
import { getLawData } from "../../src/lib/egov-client.js";
import {
  parseArticle,
  parseArticleStructured,
} from "../../src/lib/egov-parser.js";

// Capture the handler registered by the tool
let handler: Function;

const mockServer = {
  tool: vi.fn((_name: string, _desc: string, _schema: any, fn: Function) => {
    handler = fn;
  }),
};

describe("get_law tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerGetLawTool(mockServer as any);
  });

  it("registers with correct name", () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      "get_law",
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("returns article text when found", async () => {
    const mockLawData = {
      law_full_text: { tag: "Law", children: [] },
    };
    const mockArticle = {
      article_num: "20",
      article_title: "第二十条",
      article_caption: "（構造耐力）",
      text: "建築物は、自重、積載荷重...",
    };

    vi.mocked(getLawData).mockResolvedValue(mockLawData as any);
    vi.mocked(parseArticle).mockReturnValue(mockArticle);

    const result = await handler({
      law_name: "建築基準法",
      article_number: "第20条",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("建築基準法");
    expect(result.content[0].text).toContain("第二十条");
    expect(result.content[0].text).toContain("（構造耐力）");
    expect(result.content[0].text).toContain("建築物は、自重、積載荷重...");
    expect(result.content[0].text).toContain("e-Gov法令検索");

    expect(getLawData).toHaveBeenCalledWith("325AC0000000201");
    expect(parseArticle).toHaveBeenCalledWith(
      mockLawData.law_full_text,
      "第20条",
    );
  });

  it("returns error when law not found in registry", async () => {
    const result = await handler({
      law_name: "存在しない法律",
      article_number: "第1条",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("エラー");
    expect(result.content[0].text).toContain("存在しない法律");
    expect(getLawData).not.toHaveBeenCalled();
  });

  it("returns error when article not found", async () => {
    const mockLawData = {
      law_full_text: { tag: "Law", children: [] },
    };

    vi.mocked(getLawData).mockResolvedValue(mockLawData as any);
    vi.mocked(parseArticle).mockReturnValue(null);

    const result = await handler({
      law_name: "建築基準法",
      article_number: "第9999条",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("エラー");
    expect(result.content[0].text).toContain("第9999条");
  });

  it("returns error on API failure", async () => {
    vi.mocked(getLawData).mockRejectedValue(
      new Error("e-Gov API returned 500"),
    );

    const result = await handler({
      law_name: "建築基準法",
      article_number: "第20条",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("エラー");
    expect(result.content[0].text).toContain("e-Gov API returned 500");
  });

  it("returns structured JSON when format=structured", async () => {
    const mockLawData = {
      law_full_text: { tag: "Law", children: [] },
    };
    const mockStructured = {
      article_num: "20",
      article_title: "第二十条",
      article_caption: "（構造耐力）",
      paragraphs: [
        {
          paragraph_num: "1",
          paragraph_sentence: "建築物は、自重、積載荷重...",
          items: [],
        },
      ],
    };

    vi.mocked(getLawData).mockResolvedValue(mockLawData as any);
    vi.mocked(parseArticleStructured).mockReturnValue(mockStructured);

    const result = await handler({
      law_name: "建築基準法",
      article_number: "第20条",
      format: "structured",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.law_title).toBe("建築基準法");
    expect(parsed.law_num).toBe("昭和二十五年法律第二百一号");
    expect(parsed.source).toBe("e-Gov法令検索");
    expect(parsed.article.article_num).toBe("20");
    expect(parsed.article.paragraphs).toHaveLength(1);
    expect(parsed.article.paragraphs[0].paragraph_sentence).toContain(
      "建築物は",
    );

    expect(parseArticleStructured).toHaveBeenCalledWith(
      mockLawData.law_full_text,
      "第20条",
    );
  });

  it("returns text format by default (backward compatible)", async () => {
    const mockLawData = {
      law_full_text: { tag: "Law", children: [] },
    };
    const mockArticle = {
      article_num: "1",
      article_title: "第一条",
      article_caption: "（目的）",
      text: "テスト条文",
    };

    vi.mocked(getLawData).mockResolvedValue(mockLawData as any);
    vi.mocked(parseArticle).mockReturnValue(mockArticle);

    // No format parameter — should default to text
    const result = await handler({
      law_name: "建築基準法",
      article_number: "第1条",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("【建築基準法】第一条");
    expect(result.content[0].text).toContain("テスト条文");
    expect(parseArticle).toHaveBeenCalled();
    expect(parseArticleStructured).not.toHaveBeenCalled();
  });

  it("returns error when structured article not found", async () => {
    const mockLawData = {
      law_full_text: { tag: "Law", children: [] },
    };

    vi.mocked(getLawData).mockResolvedValue(mockLawData as any);
    vi.mocked(parseArticleStructured).mockReturnValue(null);

    const result = await handler({
      law_name: "建築基準法",
      article_number: "第9999条",
      format: "structured",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("エラー");
    expect(result.content[0].text).toContain("第9999条");
  });

  it("includes reference summary in text format when references exist", async () => {
    const mockLawData = {
      law_full_text: { tag: "Law", children: [] },
    };
    const mockArticle = {
      article_num: "20",
      article_title: "第二十条",
      article_caption: "",
      text: "建築基準法施行令第36条に適合する",
      references: [
        {
          raw_text: "建築基準法施行令第36条",
          ref_type: "cross_law" as const,
          target_law: "建築基準法施行令",
          target_article: "36",
        },
      ],
    };

    vi.mocked(getLawData).mockResolvedValue(mockLawData as any);
    vi.mocked(parseArticle).mockReturnValue(mockArticle);

    const result = await handler({
      law_name: "建築基準法",
      article_number: "第20条",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("■ 検出された参照:");
    expect(result.content[0].text).toContain("[他法令] 建築基準法施行令第36条");
  });
});
