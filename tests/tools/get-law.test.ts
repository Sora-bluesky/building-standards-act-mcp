import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Mock external dependencies BEFORE importing the tool module
vi.mock("../../src/lib/egov-client.js", () => ({
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
import * as toolHelpers from "../../src/lib/tool-helpers.js";

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

  it("caps the default text body at 100,000 characters", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue({
      law_full_text: { tag: "Law", children: [] },
    } as any);
    vi.mocked(parseArticle).mockReturnValue({
      article_num: "20", article_title: "第二十条", article_caption: "", text: "あ".repeat(100_500),
    });

    const result = await handler({ law_name: "建築基準法", article_number: "20" });
    expect(result.structuredContent.article.text).toHaveLength(100_000);
    expect(result.structuredContent).toMatchObject({
      total_chars: 100_500, offset: 0, next_offset: 100_000, truncated: true,
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

  it.each([1_000, 2_000, 8_000])("paginates the entire body with all page references within %i characters", async (maxChars) => {
    const references = Array.from({ length: 200 }, (_, index) => ({
      raw_text: `ref${String(index).padStart(3, "0")}`, ref_type: "same_law" as const,
    }));
    const text = references.map((ref) => `${ref.raw_text.padEnd(99, "a")}\n`).join("");
    const article = { article_num: "20", article_title: "第二十条", article_caption: "", text, references };
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue({ law_full_text: { tag: "Law", children: [] } } as any);
    vi.mocked(parseArticle).mockReturnValue(article);

    const pages: string[] = [];
    let offset: number | null = 0;
    let visited = 0;
    while (offset !== null) {
      const result = await handler({ law_name: "建築基準法", article_number: "第20条", max_chars: maxChars, offset });
      expect(result.isError).toBeUndefined();
      const page = result.structuredContent;
      const pageReferences = references.filter((ref) => page.article.text.includes(ref.raw_text));
      expect(page.offset).toBe(visited);
      expect(page.total_chars).toBe(text.length);
      expect(pageReferences.length).toBeGreaterThan(0);
      expect(page.article.references).toEqual(pageReferences);
      expect(page.article.text.length + JSON.stringify(pageReferences).length).toBeLessThanOrEqual(maxChars);
      expect(page).not.toHaveProperty("references_total");
      expect(page).not.toHaveProperty("references_truncated");
      expect(result.content[0].text.split("\n").filter((line: string) => line.startsWith("  - ["))).toEqual(
        pageReferences.map((ref) => `  - [同法令] ${ref.raw_text}`),
      );
      expect(page.article.text).toBe(text.slice(visited, visited + page.article.text.length));
      visited += page.article.text.length;
      if (page.next_offset !== null) {
        expect(page.next_offset).toBe(visited);
        expect(page.next_offset).toBeGreaterThan(offset);
        expect(result.content[0].text).toContain(`offset=${page.next_offset} を指定して続きを取得してください`);
      }
      expect(page.truncated).toBe(page.next_offset !== null);
      expect(result.content[0].text).not.toContain("件のうち");
      pages.push(page.article.text);
      offset = page.next_offset;
    }
    expect(visited).toBe(text.length);
    expect(pages.join("")).toBe(text);
    expect(article).toEqual({ article_num: "20", article_title: "第二十条", article_caption: "", text, references });
  });

  it("uses logarithmic probes for a law-sized article with many references", async () => {
    const references = Array.from({ length: 1_591 }, (_, index) => ({
      raw_text: `ref${String(index).padStart(4, "0")}`, ref_type: "same_law" as const,
    }));
    const text = references.map((ref) => `${ref.raw_text.padEnd(79, "a")}\n`).join("").padEnd(129_085, "a");
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue({ law_full_text: { tag: "Law", children: [] } } as any);
    vi.mocked(parseArticle).mockReturnValue({ article_num: "20", article_title: "第二十条", article_caption: "", text, references });
    const paginate = vi.spyOn(toolHelpers, "paginateAtLineBoundary");
    try {
      const maxChars = 60_000;
      const result = await handler({ law_name: "建築基準法", article_number: "第20条", max_chars: maxChars });
      const page = result.structuredContent;
      expect(result.isError).toBeUndefined();
      expect(page.article.references.length).toBeGreaterThan(0);
      expect(page.article.text.length + JSON.stringify(page.article.references).length).toBeLessThanOrEqual(maxChars);
      expect(paginate.mock.calls.length).toBeLessThanOrEqual(1 + Math.ceil(Math.log2(maxChars)));
      expect(page).not.toHaveProperty("references_truncated");
    } finally {
      paginate.mockRestore();
    }
  });

  it("falls back to an ordered reference prefix when even the smallest page cannot fit all references", async () => {
    const references = [
      { raw_text: "x", ref_type: "same_law" as const },
      { raw_text: "x", ref_type: "cross_law" as const, target_law: "あ".repeat(1_000) },
      { raw_text: "x", ref_type: "relative" as const },
    ];
    const text = "x".padEnd(100, "a");
    const article = { article_num: "20", article_title: "第二十条", article_caption: "", text, references };
    const maxChars = 1_000;
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue({ law_full_text: { tag: "Law", children: [] } } as any);
    vi.mocked(parseArticle).mockReturnValue(article);

    const result = await handler({ law_name: "建築基準法", article_number: "第20条", max_chars: maxChars });
    const page = result.structuredContent;
    expect(page.article.text).toBe(text);
    expect(page.article.references).toEqual([references[0]]);
    expect(page).toMatchObject({
      references_total: 3, references_truncated: true, total_chars: text.length,
      next_offset: null, truncated: false,
    });
    expect(JSON.stringify(references).length).toBeGreaterThan(maxChars);
    expect(page.article.text.length + JSON.stringify(page.article.references).length).toBeLessThanOrEqual(maxChars);
    expect(page.article.text.length + JSON.stringify(references.slice(0, 2)).length).toBeGreaterThan(maxChars);
    expect(result.content[0].text).toContain("  - [同法令] x");
    expect(result.content[0].text).not.toContain("  - [他法令] x");
    expect(result.content[0].text).not.toContain("  - [相対参照] x");
    expect(result.content[0].text).toContain("（参照 3 件のうち 1 件を表示。参照だけで max_chars を超えるため残りは省略。max_chars を大きくすると表示されます）");
    expect(article).toEqual({ article_num: "20", article_title: "第二十条", article_caption: "", text, references });
    const config = mockServer.registerTool.mock.calls[0][1] as { outputSchema: z.ZodRawShape };
    const validated = z.object(config.outputSchema).parse(page);
    expect(validated).toMatchObject({ references_total: 3, references_truncated: true });
  });

  it.each([-1, 0])("counts serialized reference array characters at the budget boundary (%i)", async (adjustment) => {
    const references = [{ raw_text: '第一条 "引用" \\ 😀', ref_type: "same_law" as const }];
    const text = references[0].raw_text.padEnd(1_100, "あ");
    const maxChars = text.length + JSON.stringify(references).length + adjustment;
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue({ law_full_text: { tag: "Law", children: [] } } as any);
    vi.mocked(parseArticle).mockReturnValue({ article_num: "20", article_title: "第二十条", article_caption: "", text, references });

    const result = await handler({ law_name: "建築基準法", article_number: "第20条", max_chars: maxChars });
    const page = result.structuredContent;
    expect(page.article.text).toBe(text.slice(0, text.length + adjustment));
    expect(page.article.references).toEqual(references);
    expect(page.article.text.length + JSON.stringify(page.article.references).length).toBe(maxChars);
    expect(page.next_offset).toBe(adjustment === 0 ? null : text.length - 1);
    expect(page).not.toHaveProperty("references_total");
    expect(page).not.toHaveProperty("references_truncated");
  });

  it("omits references when none fit in the fallback body page", async () => {
    const text = "x".padEnd(1_000, "a");
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue({ law_full_text: { tag: "Law", children: [] } } as any);
    vi.mocked(parseArticle).mockReturnValue({
      article_num: "20", article_title: "第二十条", article_caption: "", text,
      references: [{ raw_text: "x", ref_type: "cross_law", target_law: "あ".repeat(1_000) }],
    });

    const result = await handler({ law_name: "建築基準法", article_number: "第20条", max_chars: 1_000 });
    expect(result.structuredContent.article.text).toBe(text);
    expect(result.structuredContent.article).not.toHaveProperty("references");
    expect(result.structuredContent.article.text.length).toBeLessThanOrEqual(1_000);
    expect(result.structuredContent).toMatchObject({ references_total: 1, references_truncated: true, next_offset: null });
    expect(result.content[0].text).toContain("参照 1 件のうち 0 件を表示");
    expect(result.content[0].text).not.toContain("■ 検出された参照:");
  });

  it.each([undefined, []])("omits empty article references (%j)", async (references) => {
    const text = "a".repeat(1_000);
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue({ law_full_text: { tag: "Law", children: [] } } as any);
    vi.mocked(parseArticle).mockReturnValue({ article_num: "20", article_title: "第二十条", article_caption: "", text, references });

    const result = await handler({ law_name: "建築基準法", article_number: "第20条", max_chars: 1_000 });
    expect(result.structuredContent.article.text).toBe(text);
    expect(result.structuredContent.article).not.toHaveProperty("references");
    expect(result.structuredContent).not.toHaveProperty("references_total");
    expect(result.structuredContent).not.toHaveProperty("references_truncated");
  });

  it("preserves surrogate pairs and continuation offsets when shortening the body for references", async () => {
    const references = [{ raw_text: "x", ref_type: "same_law" as const }];
    const bodyLimit = 1_000 - JSON.stringify(references).length;
    const prefix = "x".padEnd(bodyLimit - 1, "a");
    const text = `${prefix}😀tail`;
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue({ law_full_text: { tag: "Law", children: [] } } as any);
    vi.mocked(parseArticle).mockReturnValue({ article_num: "20", article_title: "第二十条", article_caption: "", text, references });

    const first = await handler({ law_name: "建築基準法", article_number: "第20条", max_chars: 1_000 });
    expect(first.structuredContent.article.text).toBe(prefix);
    expect(first.structuredContent.article.references).toEqual(references);
    expect(first.structuredContent.next_offset).toBe(prefix.length);
    const second = await handler({
      law_name: "建築基準法", article_number: "第20条", max_chars: 1_000, offset: first.structuredContent.next_offset,
    });
    expect(second.structuredContent.article.text).toBe("😀tail");
    expect(second.structuredContent.article).not.toHaveProperty("references");
    expect(second.structuredContent.next_offset).toBeNull();
    expect(first.structuredContent.article.text + second.structuredContent.article.text).toBe(text);
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
