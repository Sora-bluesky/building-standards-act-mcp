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
vi.mock("../../src/lib/law-resolver.js", () => ({
  resolveLawId: vi.fn(),
}));

import { registerGetLawTool } from "../../src/tools/get-law.js";
import { getLawData } from "../../src/lib/egov-client.js";
import {
  parseArticle,
  parseArticleStructured,
} from "../../src/lib/egov-parser.js";
import { resolveLawId } from "../../src/lib/law-resolver.js";

const MOCK_RESOLVED = {
  law_id: "325AC0000000201",
  title: "建築基準法",
  law_num: "昭和二十五年法律第二百一号",
  source: "alias" as const,
};

// Capture the handler registered by the tool
let handler: Function;

const mockServer = {
  registerTool: vi.fn((_name: string, _config: unknown, fn: Function) => {
    handler = fn;
  }),
};

describe("get_law tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerGetLawTool(mockServer as any);
  });

  it("registers with correct name", () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      "get_law",
      expect.objectContaining({
        annotations: expect.objectContaining({ readOnlyHint: true }),
      }),
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

    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
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
    expect(result.content[0].text).toBe(
      "【建築基準法】第二十条\n（構造耐力）\n\n建築物は、自重、積載荷重...\n\n出典: e-Gov法令検索（法令番号: 昭和二十五年法律第二百一号）",
    );
    expect(result.structuredContent).toEqual({
      law_title: MOCK_RESOLVED.title,
      law_num: MOCK_RESOLVED.law_num,
      source: "e-Gov法令検索",
      format: "text",
      article: mockArticle,
    });

    expect(getLawData).toHaveBeenCalledWith("325AC0000000201");
    expect(parseArticle).toHaveBeenCalledWith(
      mockLawData.law_full_text,
      "第20条",
    );
  });

  it("returns error when law not found in registry", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(null);

    const result = await handler({
      law_name: "存在しない法律",
      article_number: "第1条",
    });

    expect(result.isError).toBe(true);
    expect(result).not.toHaveProperty("structuredContent");
    expect(result.content[0].text).toContain("エラー");
    expect(result.content[0].text).toContain("存在しない法律");
    expect(getLawData).not.toHaveBeenCalled();
  });

  it("returns error when article not found", async () => {
    const mockLawData = {
      law_full_text: { tag: "Law", children: [] },
    };

    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue(mockLawData as any);
    vi.mocked(parseArticle).mockReturnValue(null);

    const result = await handler({
      law_name: "建築基準法",
      article_number: "第9999条",
    });

    expect(result.isError).toBe(true);
    expect(result).not.toHaveProperty("structuredContent");
    expect(result.content[0].text).toContain("エラー");
    expect(result.content[0].text).toContain("第9999条");
  });

  it("returns error on API failure", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockRejectedValue(
      new Error("e-Gov API returned 500"),
    );

    const result = await handler({
      law_name: "建築基準法",
      article_number: "第20条",
    });

    expect(result.isError).toBe(true);
    expect(result).not.toHaveProperty("structuredContent");
    expect(result.content[0].text).toContain("エラー");
    // Sanitized: internal error details are hidden from client
    expect(result.content[0].text).not.toContain("500");
    expect(result.content[0].text).toContain("内部エラー");
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

    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
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
    expect(result.content[0].text).toBe(
      JSON.stringify(
        {
          law_title: MOCK_RESOLVED.title,
          law_num: MOCK_RESOLVED.law_num,
          source: "e-Gov法令検索",
          article: mockStructured,
        },
        null,
        2,
      ),
    );
    expect(result.structuredContent).toEqual({ ...parsed, format: "structured" });
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

    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
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

    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue(mockLawData as any);
    vi.mocked(parseArticleStructured).mockReturnValue(null);

    const result = await handler({
      law_name: "建築基準法",
      article_number: "第9999条",
      format: "structured",
    });

    expect(result.isError).toBe(true);
    expect(result).not.toHaveProperty("structuredContent");
    expect(result.content[0].text).toContain("エラー");
    expect(result.content[0].text).toContain("第9999条");
  });

  it.each(["text", "structured"] as const)(
    "includes the search note in structuredContent for format=%s",
    async (format) => {
      vi.mocked(resolveLawId).mockResolvedValue({
        ...MOCK_RESOLVED,
        source: "egov_search",
      });
      vi.mocked(getLawData).mockResolvedValue({
        law_full_text: { tag: "Law", children: [] },
      } as any);
      const article = {
        article_num: "1",
        article_title: "第一条",
        article_caption: "",
        text: "test",
      };
      const structured = {
        article_num: article.article_num,
        article_title: article.article_title,
        article_caption: article.article_caption,
        paragraphs: [],
      };
      vi.mocked(parseArticle).mockReturnValue(article);
      vi.mocked(parseArticleStructured).mockReturnValue(structured);

      const result = await handler({
        law_name: "建築基準法",
        article_number: "1",
        format,
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        format,
        note: "この法令は略称マップに登録されていないため、e-Gov法令検索から取得しました。",
        article: format === "text" ? article : structured,
      });
      expect(result.content[0].text).toContain(result.structuredContent.note);
    },
  );

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

    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
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
