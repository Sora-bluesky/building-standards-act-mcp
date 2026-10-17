import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Mock external dependencies BEFORE importing the tool module
vi.mock("../../src/lib/egov-client.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/lib/egov-client.js")>(),
  getLawArticle: vi.fn(),
  getLawData: vi.fn(),
  getLawRevisions: vi.fn(),
  getLawDataByRevision: vi.fn(),
  searchLaws: vi.fn(),
}));
vi.mock("../../src/lib/egov-parser.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/lib/egov-parser.js")>(),
  parseArticle: vi.fn(),
  parseArticleStructured: vi.fn(),
  parseFullLaw: vi.fn(),
}));
vi.mock("../../src/lib/law-resolver.js", () => ({
  resolveLawId: vi.fn(),
}));

import { registerGetLawTool } from "../../src/tools/get-law.js";
import {
  getLawArticle,
  getLawData,
  getLawRevisions,
  getLawDataByRevision,
} from "../../src/lib/egov-client.js";
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

describe("get_law ツール", () => {
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

  it.each(["text", "structured"] as const)(
    "returns article-not-found when elm returns null (%s)",
    async (format) => {
      vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
      vi.mocked(getLawArticle).mockResolvedValue(null);
      const result = await handler({ law_name: "建築基準法", article_number: "第999条", format });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("建築基準法の第999条が見つかりません");
      expect(getLawData).not.toHaveBeenCalled();
    },
  );

  it.each(["text", "structured"] as const)(
    "exposes the revision metadata and unenforced note (%s)",
    async (format) => {
      vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
      const lawData = {
        law_full_text: { tag: "Law", children: [] },
        revision_info: { law_revision_id: "current", law_title: "建築基準法" },
      };
      const revision = {
        law_revision_id: "future",
        amendment_law_num: "令和八年政令第二百八十四号",
        amendment_enforcement_date: "2026-11-01",
        current_revision_status: "UnEnforced",
      };
      vi.mocked(getLawData).mockResolvedValue(lawData as any);
      vi.mocked(getLawRevisions).mockResolvedValue({ revisions: [revision] } as any);
      vi.mocked(getLawDataByRevision).mockResolvedValue(lawData as any);
      const article = { article_num: "suppl", article_title: "附則", article_caption: "", text: "経過措置", paragraphs: [] };
      const parser = format === "text" ? vi.mocked(parseArticle) : vi.mocked(parseArticleStructured);
      parser.mockReturnValueOnce(null).mockReturnValueOnce(article);

      const result = await handler({ law_name: "建築基準法", article_number: "附則（令和8年政令第284号）", format });
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        revision: { law_revision_id: "future", amendment_enforcement_date: "2026-11-01", current_revision_status: "UnEnforced" },
        revision_note: "※ この附則は未施行の改正（施行日 2026-11-01）の法令データから取得しました。",
      });
      expect(result.content[0].text).toContain(result.structuredContent.revision_note);
      expect(getLawDataByRevision).toHaveBeenCalledWith("future");
    },
  );

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
    vi.mocked(getLawArticle).mockResolvedValue(mockLawData as any);
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
      total_chars: mockArticle.text.length,
      offset: 0,
      next_offset: null,
      truncated: false,
    });

    expect(getLawArticle).toHaveBeenCalledWith("325AC0000000201", "MainProvision-Article_20");
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
    expect(getLawArticle).not.toHaveBeenCalled();
  });

  it("returns error when article not found", async () => {
    const mockLawData = {
      law_full_text: { tag: "Law", children: [] },
    };

    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue(mockLawData as any);
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
    vi.mocked(getLawArticle).mockRejectedValue(
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
    vi.mocked(getLawArticle).mockResolvedValue(mockLawData as any);
    vi.mocked(parseArticleStructured).mockReturnValue(mockStructured);

    const result = await handler({
      law_name: "建築基準法",
      article_number: "第20条",
      format: "structured",
      max_chars: 1_000,
      offset: 999_999,
      find: "存在しない語",
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
    vi.mocked(getLawArticle).mockResolvedValue(mockLawData as any);
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

  it("reconstructs the article body by following next_offset", async () => {
    const text = `${"あ".repeat(650)}😀\n${"い".repeat(650)}\n${"う".repeat(650)}`;
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue({
      law_full_text: { tag: "Law", children: [] },
    } as any);
    vi.mocked(parseArticle).mockReturnValue({
      article_num: "20", article_title: "第二十条", article_caption: "（構造耐力）", text,
    });

    const pages: string[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const result = await handler({
        law_name: "建築基準法", article_number: "第20条", max_chars: 1_000, offset,
      });
      expect(result.isError).toBeUndefined();
      const page = result.structuredContent;
      expect(page.offset).toBe(offset);
      expect(page.total_chars).toBe(text.length);
      expect(page.article.text.length).toBeLessThanOrEqual(1_000);
      expect(result.content[0].text).toContain("【建築基準法】第二十条");
      expect(result.content[0].text).toContain(`\n\n${page.article.text}`);
      expect(page.truncated).toBe(page.next_offset !== null);
      if (page.next_offset !== null) {
        expect(page.next_offset).toBeGreaterThan(offset);
        expect(page.article.text.endsWith("\n")).toBe(true);
        expect(result.content[0].text).toContain(
          `（続きがあります。offset=${page.next_offset} を指定して続きを取得してください。本文全体 ${text.length} 文字）`,
        );
      }
      pages.push(page.article.text);
      offset = page.next_offset;
    }
    expect(pages).toHaveLength(3);
    expect(pages.join("")).toBe(text);
  });

  it("registers the article default and validates the character bounds", () => {
    const config = mockServer.registerTool.mock.calls[0][1] as { inputSchema: z.ZodRawShape };
    const schema = z.object(config.inputSchema);
    const params = { law_name: "建築基準法", article_number: "20" };
    expect(schema.parse(params)).toMatchObject({ max_chars: 20_000, offset: 0, format: "text" });
    expect(schema.safeParse({ ...params, max_chars: 1_000 }).success).toBe(true);
    expect(schema.safeParse({ ...params, max_chars: 24_000 }).success).toBe(true);
    for (const max_chars of [999, 24_001, 1000.5]) {
      expect(schema.safeParse({ ...params, max_chars }).success).toBe(false);
    }
  });

  it.each([
    { max_chars: undefined, expected: 20_000 },
    { max_chars: 24_000, expected: 24_000 },
  ])("caps the text body at $expected characters", async ({ max_chars, expected }) => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue({
      law_full_text: { tag: "Law", children: [] },
    } as any);
    vi.mocked(parseArticle).mockReturnValue({
      article_num: "20", article_title: "第二十条", article_caption: "", text: "あ".repeat(24_500),
    });

    const result = await handler({ law_name: "建築基準法", article_number: "20", max_chars });
    expect(result.structuredContent.article.text).toHaveLength(expected);
    expect(result.structuredContent).toMatchObject({
      total_chars: 24_500, offset: 0, next_offset: expected, truncated: true,
    });
    expect(result.content[0].text.length + JSON.stringify(result.structuredContent, null, 2).length).toBeLessThan(50_000);
  });

  describe("条文内検索（find）", () => {
    beforeEach(() => {
      vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
      vi.mocked(getLawArticle).mockResolvedValue({
        law_full_text: { tag: "Law", children: [] },
      } as any);
    });

    function mockBody(text: string) {
      vi.mocked(parseArticle).mockReturnValue({
        article_num: "20", article_title: "第二十条", article_caption: "（構造耐力）", text,
      });
    }

    it("starts at the matching line and retains continuation offsets", async () => {
      const prefix = `${"前の行😀".repeat(250)}\n`;
      const row = `| （八） | 非常用の昇降機 | ${"あ".repeat(600)} |\n`;
      const text = prefix + row + "後の行".repeat(500);
      const find = "非常用の昇降機";
      mockBody(text);

      const result = await handler({ law_name: "建築基準法", article_number: "20", find, max_chars: 1_000 });
      const page = result.structuredContent;
      expect(result.isError).not.toBe(true);
      expect(page).toMatchObject({
        find, matches: [text.indexOf(find)], matches_total: 1, offset: prefix.length,
        total_chars: text.length, next_offset: prefix.length + row.length, truncated: true,
      });
      expect(page.article.text).toBe(row);
      expect(result.content[0].text).toContain(
        `（『${find}』の一致 1 件。offset=${prefix.length} から表示。一致位置: ${text.indexOf(find)}）\n${row}`,
      );
      expect(result.content[0].text).toContain(
        `（続きがあります。find を外し offset=${page.next_offset} を指定して続きを取得してください。本文全体 ${page.total_chars} 文字）`,
      );
      const continued = await handler({ law_name: "建築基準法", article_number: "20", offset: page.next_offset, max_chars: 1_000 });
      expect(continued.structuredContent.article.text).toBe(text.slice(page.next_offset, page.next_offset + 1_000));
      const config = mockServer.registerTool.mock.calls[0][1] as { outputSchema: z.ZodRawShape };
      expect(z.object(config.outputSchema).parse(page)).toMatchObject({ find, matches: page.matches, matches_total: 1 });
    });

    it.each(["不一致", " \t\n　"])("returns an empty non-error result for %j", async (find) => {
      const text = "第一条の本文";
      const article = {
        article_num: "20", article_title: "第二十条", article_caption: "（構造耐力）", text,
        references: [{ raw_text: "第一条", ref_type: "same_law" as const }],
      };
      vi.mocked(parseArticle).mockReturnValue(article);

      const result = await handler({ law_name: "建築基準法", article_number: "20", find, offset: 3 });
      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toBe(
        `【建築基準法】第二十条\nこの条に『${find}』は見つかりませんでした。（本文全体 ${text.length} 文字。空白を無視し、全角・半角を区別せずに探しました）\n\n出典: e-Gov法令検索（法令番号: 昭和二十五年法律第二百一号）`,
      );
      expect(result.structuredContent).toMatchObject({
        find, matches: [], matches_total: 0, total_chars: text.length,
        offset: 3, next_offset: null, truncated: false,
        article: { article_num: "20", article_title: "第二十条", article_caption: "（構造耐力）", text: "" },
      });
      expect(result.structuredContent.article).not.toHaveProperty("references");
      const config = mockServer.registerTool.mock.calls[0][1] as { outputSchema: z.ZodRawShape };
      expect(z.object(config.outputSchema).safeParse(result.structuredContent).success).toBe(true);
      expect(article.text).toBe(text);
    });

    it("caps reported matches at 20 and selects matches throughout the whole body", async () => {
      const rows = Array.from({ length: 25 }, (_, i) => `行${i}: 対象\n`);
      const text = rows.join("");
      const offsets = rows.map((_, i) => rows.slice(0, i).join("").length + rows[i].indexOf("対象"));
      mockBody(text);
      const params = { law_name: "建築基準法", article_number: "20", find: "対象" };

      for (const [offset, selected] of [[0, 0], [offsets[1], 1], [offsets[1] + 1, 2], [offsets[24], 24], [text.length, 0]]) {
        const result = await handler({ ...params, offset });
        expect(result.structuredContent).toMatchObject({
          find: "対象", matches: offsets.slice(0, 20), matches_total: 25,
          offset: text.lastIndexOf("\n", offsets[selected] - 1) + 1,
        });
        expect(result.structuredContent.article.text).toBe(rows.slice(selected).join(""));
      }
    });

    it("ignores whitespace and width differences while returning original UTF-16 offsets", async () => {
      const prefix = "😀前の行\n";
      const row = "| （１）　非　常\t用の 昇降機 |　|";
      mockBody(prefix + row);
      const result = await handler({ law_name: "建築基準法", article_number: "20", find: " (1) 非常用の昇降機　" });
      expect(result.structuredContent).toMatchObject({
        matches: [prefix.length + 2], matches_total: 1, offset: prefix.length,
        article: { text: row },
      });
    });

    it.each([898, 899, 1_100])("starts at the match when its line cannot fit with the margin (prefix=%i)", async (size) => {
      const prefix = "前の行\n";
      const text = prefix + "あ".repeat(size) + "対象" + "い".repeat(1_100);
      mockBody(text);
      const result = await handler({ law_name: "建築基準法", article_number: "20", find: "対象", max_chars: 1_000 });
      const expected = size + 2 > 900 ? prefix.length + size : prefix.length;
      expect(result.structuredContent.offset).toBe(expected);
      expect(result.structuredContent.article.text).toBe(text.slice(expected, expected + 1_000));
      expect(result.structuredContent.article.text).toContain("対象");
    });

    it("uses the original match end when ignored whitespace consumes the line budget", async () => {
      const text = "あ".repeat(800) + "対" + "　".repeat(100) + "象" + "い".repeat(1_100);
      mockBody(text);
      const result = await handler({ law_name: "建築基準法", article_number: "20", find: "対象", max_chars: 1_000 });
      expect(result.structuredContent).toMatchObject({ matches: [800], offset: 800, next_offset: 1_800 });
      expect(result.structuredContent.article.text).toBe(text.slice(800, 1_800));
    });

    it("retains line-boundary pagination for a match spanning a newline", async () => {
      const text = "対" + " ".repeat(599) + "\n象" + "後".repeat(1_000);
      mockBody(text);
      const result = await handler({ law_name: "建築基準法", article_number: "20", find: "対象", max_chars: 1_000 });
      expect(result.structuredContent).toMatchObject({ matches: [0], matches_total: 1, offset: 0, next_offset: 601 });
      expect(result.structuredContent.article.text).toBe(text.slice(0, 601));
    });

    it("filters references using the find-selected final page offset", async () => {
      const references = ["第一条", "第二条"].map((raw_text) => ({ raw_text, ref_type: "same_law" as const }));
      const prefix = "第一条の行\n";
      const row = "対象は第二条による。";
      vi.mocked(parseArticle).mockReturnValue({
        article_num: "20", article_title: "第二十条", article_caption: "", text: prefix + row, references,
      });
      const result = await handler({ law_name: "建築基準法", article_number: "20", find: "対象" });
      expect(result.structuredContent).toMatchObject({ offset: prefix.length, next_offset: null });
      expect(result.structuredContent.article.references).toEqual([references[1]]);
      expect(result.content[0].text).not.toContain("[同法令] 第一条");
      expect(result.content[0].text).toContain("[同法令] 第二条");
    });

    it("validates the find length through the registered input schema", () => {
      const config = mockServer.registerTool.mock.calls[0][1] as { inputSchema: z.ZodRawShape };
      const schema = z.object(config.inputSchema);
      const params = { law_name: "建築基準法", article_number: "20" };
      expect(schema.safeParse(params).success).toBe(true);
      expect(schema.safeParse({ ...params, find: "" }).success).toBe(false);
      expect(schema.safeParse({ ...params, find: "あ".repeat(100) }).success).toBe(true);
      expect(schema.safeParse({ ...params, find: "あ".repeat(101) }).success).toBe(false);
    });
  });

  it("returns error when structured article not found", async () => {
    const mockLawData = {
      law_full_text: { tag: "Law", children: [] },
    };

    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue(mockLawData as any);
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
      vi.mocked(getLawArticle).mockResolvedValue({
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

  it.each([0, 700, 1_400, 2_100])(
    "includes only references present in the page body at offset %i",
    async (offset) => {
      const references = ["第一条", "第二条", "第三条"].map((raw_text) => ({
        raw_text, ref_type: "same_law" as const,
      }));
      const text = references.map((ref) => `${"あ".repeat(696)}${ref.raw_text}\n`).join("");
      const article = {
        article_num: "20", article_title: "第二十条", article_caption: "", text, references,
      };
      vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
      vi.mocked(getLawArticle).mockResolvedValue({
        law_full_text: { tag: "Law", children: [] },
      } as any);
      vi.mocked(parseArticle).mockReturnValue(article);

      const result = await handler({
        law_name: "建築基準法", article_number: "第20条", max_chars: 1_000, offset,
      });
      expect(result.isError).toBeUndefined();
      const expected = offset < text.length ? [references[offset / 700]] : [];
      if (expected.length > 0) {
        expect(result.structuredContent.article.references).toEqual(expected);
      } else {
        expect(result.structuredContent.article).not.toHaveProperty("references");
      }
      expect(result.structuredContent.article.text).toBe(
        offset < text.length
          ? text.slice(offset, offset + 700)
          : `指定された offset=${offset} は本文の末尾以降です（全体 ${text.length} 文字）。`,
      );
      expect(result.structuredContent.next_offset).toBe(offset < 1_400 ? offset + 700 : null);
      expect(result.structuredContent).not.toHaveProperty("references_total");
      expect(result.structuredContent).not.toHaveProperty("references_truncated");
      expect(result.content[0].text.includes("■ 検出された参照:")).toBe(expected.length > 0);
      for (const ref of references) {
        expect(result.content[0].text.includes(`  - [同法令] ${ref.raw_text}`)).toBe(expected.includes(ref));
      }
      expect(article.references).toEqual(references);
      expect(article.text).toBe(text);
    },
  );

  it.each([false, true])("budgets the reference prefix without changing the body (paged=%s)", async (paged) => {
    const references = [
      { raw_text: "第一条", ref_type: "same_law" as const },
      { raw_text: "第二条", ref_type: "cross_law" as const, target_law: "あ".repeat(1_000) },
      { raw_text: "第三条", ref_type: "same_law" as const },
    ];
    const pageText = `${"第一条 第二条 第三条".padEnd(1_100, "あ")}\n`;
    const text = pageText + (paged ? "い".repeat(1_200) : "");
    const article = { article_num: "20", article_title: "第二十条", article_caption: "", text, references };
    const maxChars = pageText.length + JSON.stringify([references[0], references[2]]).length;
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue({ law_full_text: { tag: "Law", children: [] } } as any);
    vi.mocked(parseArticle).mockReturnValue(article);

    const result = await handler({ law_name: "建築基準法", article_number: "第20条", max_chars: maxChars });
    const page = result.structuredContent;
    expect(page.article.text).toBe(pageText);
    expect(page.article.references).toEqual([references[0]]);
    expect(page).toMatchObject({
      references_total: 3, references_truncated: true, total_chars: text.length,
      next_offset: paged ? pageText.length : null, truncated: paged,
    });
    expect(page.article.text.length + JSON.stringify(page.article.references).length).toBeLessThanOrEqual(maxChars);
    expect(page.article.text.length + JSON.stringify(references.slice(0, 2)).length).toBeGreaterThan(maxChars);
    expect(result.content[0].text).toContain("  - [同法令] 第一条");
    expect(result.content[0].text).not.toContain("  - [他法令] 第二条");
    expect(result.content[0].text).not.toContain("  - [同法令] 第三条");
    expect(result.content[0].text).toContain("（参照 3 件のうち 1 件を表示。本文と合わせて max_chars を超える分は省略しました。参照は本文中の記述から抽出したもので、関連法令の一覧は suggest_related でも確認できます）");
    expect(article).toEqual({ article_num: "20", article_title: "第二十条", article_caption: "", text, references });
    const config = mockServer.registerTool.mock.calls[0][1] as { outputSchema: z.ZodRawShape };
    const validated = z.object(config.outputSchema).parse(page);
    expect(validated).toMatchObject({ references_total: 3, references_truncated: true });
  });

  it.each([-1, 0])("counts serialized reference array characters at the budget boundary (%i)", async (adjustment) => {
    const references = [{ raw_text: '第一条 "引用" \\ 😀', ref_type: "same_law" as const }];
    const text = "あ".repeat(1_100);
    const maxChars = text.length + JSON.stringify(references).length + adjustment;
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue({ law_full_text: { tag: "Law", children: [] } } as any);
    vi.mocked(parseArticle).mockReturnValue({ article_num: "20", article_title: "第二十条", article_caption: "", text, references });

    const result = await handler({ law_name: "建築基準法", article_number: "第20条", max_chars: maxChars });
    const page = result.structuredContent;
    expect(page.article.text).toBe(text);
    expect(page.article.text.length + (page.article.references?.length ? JSON.stringify(page.article.references).length : 0)).toBeLessThanOrEqual(maxChars);
    if (adjustment === 0) {
      expect(page.article.references).toEqual(references);
      expect(page).not.toHaveProperty("references_total");
      expect(page).not.toHaveProperty("references_truncated");
    } else {
      expect(page.article).not.toHaveProperty("references");
      expect(page).toMatchObject({ references_total: 1, references_truncated: true });
      expect(result.content[0].text).toContain("参照 1 件のうち 0 件を表示");
      expect(result.content[0].text).not.toContain("■ 検出された参照:");
    }
  });

  it.each([false, true])("omits the references key when the body fills the budget (paged=%s)", async (paged) => {
    const pageText = "第一条".padEnd(1_000, "あ");
    const text = pageText + (paged ? "い".repeat(1_000) : "");
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue({ law_full_text: { tag: "Law", children: [] } } as any);
    vi.mocked(parseArticle).mockReturnValue({
      article_num: "20", article_title: "第二十条", article_caption: "", text,
      references: [{ raw_text: "第一条", ref_type: "same_law" }],
    });

    const result = await handler({ law_name: "建築基準法", article_number: "第20条", max_chars: 1_000 });
    const page = result.structuredContent;
    expect(page.article.text).toBe(pageText);
    expect(page.article).not.toHaveProperty("references");
    expect(page.article.text.length).toBeLessThanOrEqual(1_000);
    expect(page).toMatchObject({ references_total: 1, references_truncated: true, next_offset: paged ? pageText.length : null });
    expect(result.content[0].text).toContain("（参照 1 件のうち 0 件を表示。本文と合わせて max_chars を超える分は省略しました。参照は本文中の記述から抽出したもので、関連法令の一覧は suggest_related でも確認できます）");
  });

  it("preserves all references and the exact text output for an unpaged request", async () => {
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
        {
          raw_text: "前条",
          ref_type: "relative" as const,
        },
      ],
    };

    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue(mockLawData as any);
    vi.mocked(parseArticle).mockReturnValue(mockArticle);

    const result = await handler({
      law_name: "建築基準法",
      article_number: "第20条",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("■ 検出された参照:");
    expect(result.content[0].text).toContain("[他法令] 建築基準法施行令第36条");
    expect(result.content[0].text).toBe(
      `【建築基準法】第二十条\n\n\n${mockArticle.text}\n\n■ 検出された参照:\n  - [他法令] 建築基準法施行令第36条\n  - [相対参照] 前条\n\n出典: e-Gov法令検索（法令番号: 昭和二十五年法律第二百一号）`,
    );
    expect(result.structuredContent.article).toEqual(mockArticle);
    expect(result.structuredContent).toMatchObject({ offset: 0, next_offset: null });
    expect(result.structuredContent).not.toHaveProperty("references_total");
    expect(result.structuredContent).not.toHaveProperty("references_truncated");
  });
});
