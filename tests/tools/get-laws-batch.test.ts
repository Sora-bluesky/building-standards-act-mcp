import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("../../src/lib/egov-client.js", () => ({
  getLawArticle: vi.fn(),
  searchLaws: vi.fn(),
}));

vi.mock("../../src/lib/egov-parser.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/lib/egov-parser.js")>(),
  parseArticle: vi.fn(),
  parseArticleStructured: vi.fn(),
}));

vi.mock("../../src/lib/law-resolver.js", () => ({
  resolveLawId: vi.fn(),
}));

import { registerGetLawsBatchTool } from "../../src/tools/get-laws-batch.js";
import { getLawArticle } from "../../src/lib/egov-client.js";
import {
  parseArticle,
  parseArticleStructured,
} from "../../src/lib/egov-parser.js";
import { resolveLawId } from "../../src/lib/law-resolver.js";
import type { BatchFetchResult } from "../../src/lib/types.js";

const MOCK_RESOLVED = {
  law_id: "325AC0000000201",
  title: "建築基準法",
  law_num: "昭和二十五年法律第二百一号",
  source: "alias" as const,
};

let handler: Function;

const mockServer = {
  registerTool: vi.fn((_name: string, _config: unknown, fn: Function) => {
    handler = fn;
  }),
};

const MOCK_LAW_DATA = {
  law_full_text: { tag: "Law", children: [] },
  law_info: { law_id: "325AC0000000201" },
  revision_info: {},
};

const MOCK_ARTICLE = {
  article_num: "20",
  article_caption: "（構造耐力）",
  article_title: "第二十条",
  text: "建築物は、自重、積載荷重...",
};

const MOCK_STRUCTURED = {
  article_num: "20",
  article_caption: "（構造耐力）",
  article_title: "第二十条",
  paragraphs: [{ paragraph_num: "1", paragraph_sentence: "test", items: [] }],
};

describe("get_laws_batch tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerGetLawsBatchTool(mockServer as any);
  });

  it("registers with correct name", () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      "get_laws_batch",
      expect.objectContaining({
        annotations: expect.objectContaining({ readOnlyHint: true }),
      }),
      expect.any(Function),
    );
  });

  it("returns error for empty requests", async () => {
    const result = await handler({ requests: [] });
    expect(result.isError).toBe(true);
    expect(result).not.toHaveProperty("structuredContent");
    expect(result.content[0].text).toContain("空です");
  });

  it("returns error when exceeding max requests", async () => {
    const requests = Array.from({ length: 21 }, (_, i) => ({
      law_name: "建築基準法",
      article_number: `${i + 1}`,
      format: "text",
    }));
    const result = await handler({ requests });
    expect(result.isError).toBe(true);
    expect(result).not.toHaveProperty("structuredContent");
    expect(result.content[0].text).toContain("上限");
  });

  it("fetches single article successfully", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(MOCK_ARTICLE as any);

    const result = await handler({
      requests: [
        { law_name: "建築基準法", article_number: "20", format: "text" },
      ],
    });

    expect(result.isError).toBeUndefined();
    const parsed: BatchFetchResult = JSON.parse(result.content[0].text);
    expect(parsed.total).toBe(1);
    expect(parsed.success).toBe(1);
    expect(parsed.failed).toBe(0);
    expect(parsed.results[0].status).toBe("success");
    expect(parsed.results[0].text).toContain("建築物は");
    expect(result.structuredContent).toEqual(parsed);
    expect(result.structuredContent).toMatchObject({
      total: 1,
      success: 1,
      failed: 0,
      results: expect.any(Array),
    });
  });

  it("fetches structured format", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticleStructured).mockReturnValue(MOCK_STRUCTURED as any);

    const result = await handler({
      requests: [
        { law_name: "建築基準法", article_number: "20", format: "structured" },
      ],
    });

    const parsed: BatchFetchResult = JSON.parse(result.content[0].text);
    expect(parsed.results[0].status).toBe("success");
    expect(parsed.results[0].structured).toBeDefined();
    expect(parsed.results[0].structured!.article_num).toBe("20");
    expect(result.structuredContent).toEqual(parsed);
  });

  it("resolves each law once and fetches each article individually", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(MOCK_ARTICLE as any);

    await handler({
      requests: [
        { law_name: "建築基準法", article_number: "1", format: "text" },
        { law_name: "建築基準法", article_number: "20", format: "text" },
        { law_name: "建築基準法", article_number: "6", format: "text" },
      ],
    });

    // Resolve the law once but fetch each article separately.
    expect(resolveLawId).toHaveBeenCalledOnce();
    expect(getLawArticle).toHaveBeenCalledTimes(3);
    expect(getLawArticle).toHaveBeenNthCalledWith(1, MOCK_RESOLVED.law_id, "MainProvision-Article_1");
    expect(getLawArticle).toHaveBeenNthCalledWith(2, MOCK_RESOLVED.law_id, "MainProvision-Article_20");
    expect(getLawArticle).toHaveBeenNthCalledWith(3, MOCK_RESOLVED.law_id, "MainProvision-Article_6");
  });

  it("returns law_not_found for unknown law", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(null);

    const result = await handler({
      requests: [
        { law_name: "存在しない法律", article_number: "1", format: "text" },
      ],
    });

    const parsed: BatchFetchResult = JSON.parse(result.content[0].text);
    expect(parsed.results[0].status).toBe("law_not_found");
    expect(parsed.failed).toBe(1);
  });

  it("returns article_not_found for non-existent article", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(null);

    const result = await handler({
      requests: [
        { law_name: "建築基準法", article_number: "9999", format: "text" },
      ],
    });

    const parsed: BatchFetchResult = JSON.parse(result.content[0].text);
    expect(parsed.results[0].status).toBe("article_not_found");
  });

  it("handles mixed success and failure", async () => {
    vi.mocked(resolveLawId)
      .mockResolvedValueOnce(MOCK_RESOLVED)
      .mockResolvedValueOnce(null);
    vi.mocked(getLawArticle).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle)
      .mockReturnValueOnce(MOCK_ARTICLE as any)
      .mockReturnValueOnce(null);

    const result = await handler({
      requests: [
        { law_name: "建築基準法", article_number: "20", format: "text" },
        { law_name: "建築基準法", article_number: "9999", format: "text" },
        { law_name: "存在しない法律", article_number: "1", format: "text" },
      ],
    });

    const parsed: BatchFetchResult = JSON.parse(result.content[0].text);
    expect(parsed.total).toBe(3);
    expect(parsed.success).toBe(1);
    expect(parsed.failed).toBe(2);
    expect(parsed.results[0].status).toBe("success");
    expect(parsed.results[1].status).toBe("article_not_found");
    expect(parsed.results[2].status).toBe("law_not_found");
  });

  it("preserves small articles within both limits without truncation or omissions", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(MOCK_ARTICLE);

    const result = await handler({
      requests: [
        { law_name: "建基法", article_number: "20", format: "text" },
        { law_name: "建基法", article_number: "6", format: "text" },
      ],
      max_chars_per_item: 1_000,
      max_total_chars: 10_000,
    });
    const response: BatchFetchResult = JSON.parse(result.content[0].text);
    expect(result.structuredContent).toEqual(response);
    expect(response).not.toHaveProperty("omitted");
    expect(response).not.toHaveProperty("note");
    for (const item of response.results) {
      expect(item.text).toBe(MOCK_ARTICLE.text);
      expect(item.truncated).toBeUndefined();
      expect(item.next_offset).toBeUndefined();
      expect(item.omitted).toBeUndefined();
    }
  });

  it("truncates a long text item at a line boundary with an article-body offset", async () => {
    const text = `${"あ".repeat(650)}\n${"い".repeat(650)}`;
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue({ ...MOCK_ARTICLE, text });

    const result = await handler({
      requests: [{ law_name: "建基法", article_number: "第20条", format: "text" }],
      max_chars_per_item: 1_000,
    });
    const response: BatchFetchResult = JSON.parse(result.content[0].text);
    expect(result.structuredContent).toEqual(response);
    expect(response.results[0]).toMatchObject({
      law_name: "建築基準法", truncated: true, next_offset: 651, total_chars: text.length,
    });
    expect(response.results[0].text).toBe(
      `${text.slice(0, 651)}\n\n（続きは get_law("建築基準法", "第20条", offset=651, max_chars=1000) で取得。本文全体 ${text.length} 文字）`,
    );
    expect(text[response.results[0].next_offset! - 1]).toBe("\n");
  });

  it("keeps the largest prefix fitting the final serialized response budget", async () => {
    // Quotes and newlines count twice in JSON, and omission metadata also costs space.
    const text = '"\n'.repeat(1_300);
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue({ ...MOCK_ARTICLE, text });

    const requests = Array.from({ length: 3 }, (_, i) => ({
      law_name: "建築基準法", article_number: `${i + 1}`, format: "text",
    }));
    const result = await handler({ requests, max_chars_per_item: 3_000, max_total_chars: 10_000 });
    const response: BatchFetchResult = JSON.parse(result.content[0].text);
    expect(result.structuredContent).toEqual(response);
    expect(response).toMatchObject({ total: 3, success: 3, failed: 0 });
    expect(response.results[0].text).toBe(text);
    expect(response.results[0].omitted).toBeUndefined();
    expect(response.results.map((item) => item.article_number)).toEqual(["1", "2", "3"]);
    for (const item of response.results.slice(1)) {
      expect(item).toMatchObject({ status: "success", omitted: true });
      expect(item).not.toHaveProperty("text");
      expect(item).not.toHaveProperty("structured");
      expect(item).not.toHaveProperty("revision_note");
    }
    expect(response.omitted).toEqual([
      { law_name: "建築基準法", article_number: "2" },
      { law_name: "建築基準法", article_number: "3" },
    ]);
    expect(response.note).toBe(
      "応答全体の上限（max_total_chars=10000）に達したため、次の 2 件は本文を省略しました。未取得: 建築基準法 2, 建築基準法 3 。get_law で個別に取得するか、件数を減らして再実行してください。",
    );
    expect(JSON.stringify(response, null, 2).length).toBeLessThanOrEqual(10_000);
    expect(result.content[0].text.length).toBeLessThanOrEqual(10_000);
    const withAnotherBody = structuredClone(response);
    withAnotherBody.results[1].text = text;
    delete withAnotherBody.results[1].omitted;
    withAnotherBody.omitted = [response.omitted![1]];
    withAnotherBody.note = "応答全体の上限（max_total_chars=10000）に達したため、次の 1 件は本文を省略しました。未取得: 建築基準法 3 。get_law で個別に取得するか、件数を減らして再実行してください。";
    expect(JSON.stringify(withAnotherBody, null, 2).length).toBeGreaterThan(10_000);
  });

  it("defaults to 8,000 body characters per item and 40,000 for the final JSON", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue({ ...MOCK_ARTICLE, text: "あ".repeat(20_000) });

    const result = await handler({
      requests: Array.from({ length: 9 }, (_, i) => ({
        law_name: "建築基準法", article_number: `${i + 1}`, format: "text",
      })),
    });
    const response: BatchFetchResult = JSON.parse(result.content[0].text);
    expect(response.results[0]).toMatchObject({
      truncated: true, next_offset: 8_000, total_chars: 20_000,
    });
    expect(response.results[0].text!.split("\n\n")[0]).toHaveLength(8_000);
    expect(response.results[0].text).toContain('offset=8000, max_chars=8000) で取得');
    expect(response.omitted).toHaveLength(5);
    expect(response.note).toContain("max_total_chars=40000");
    expect(result.content[0].text.length).toBeLessThanOrEqual(40_000);
    expect(result.structuredContent).toEqual(response);
  });

  it("registers the new batch defaults and rejects per-item limits above 30,000", () => {
    const config = mockServer.registerTool.mock.calls[0][1] as { inputSchema: z.ZodRawShape };
    const schema = z.object(config.inputSchema);
    const requests = [{ law_name: "建築基準法", article_number: "20" }];
    expect(schema.parse({ requests })).toMatchObject({ max_chars_per_item: 8_000, max_total_chars: 40_000 });
    expect(schema.safeParse({ requests, max_chars_per_item: 30_000 }).success).toBe(true);
    expect(schema.safeParse({ requests, max_chars_per_item: 30_001 }).success).toBe(false);
  });

  it.each([500, 1_500])("keeps only leading whole structured paragraphs of size %i", async (size) => {
    const structured = {
      ...MOCK_STRUCTURED,
      paragraphs: [1, 2, 3].map((number) => ({
        paragraph_num: `${number}`, paragraph_sentence: "あ".repeat(size), items: [],
      })),
    };
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticleStructured).mockReturnValue(structured);

    const result = await handler({
      requests: [{ law_name: "建基法", article_number: "20", format: "structured" }],
      max_chars_per_item: 1_000,
    });
    const response: BatchFetchResult = JSON.parse(result.content[0].text);
    const item = response.results[0];
    const count = size === 500 ? 1 : 0;
    expect(item.structured!.paragraphs).toEqual(structured.paragraphs.slice(0, count));
    expect(JSON.stringify(item.structured).length).toBeLessThanOrEqual(1_000);
    expect(item).toMatchObject({ truncated: true, next_offset: null });
    expect(item.note).toBe(
      '構造化形式は項単位で切り詰めました。全文は get_law("建築基準法", "20", format="text", offset=0) から offset で順に取得してください。',
    );
    expect(structured.paragraphs).toHaveLength(3);
    expect(result.structuredContent).toEqual(response);
  });

  it("returns all results with bodies omitted when no body fits", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue({ ...MOCK_ARTICLE, text: "あ".repeat(15_000) });

    const result = await handler({
      requests: [{ law_name: "建築基準法", article_number: "20", format: "text" }],
      max_chars_per_item: 20_000,
      max_total_chars: 10_000,
    });
    const response: BatchFetchResult = JSON.parse(result.content[0].text);
    expect(result.isError).toBeUndefined();
    expect(response).toMatchObject({ total: 1, success: 1, failed: 0 });
    expect(response.results[0]).toMatchObject({ status: "success", omitted: true });
    expect(response.results[0]).not.toHaveProperty("text");
    expect(response.omitted).toEqual([{ law_name: "建築基準法", article_number: "20" }]);
    expect(result.content[0].text.length).toBeLessThanOrEqual(10_000);
    expect(result.structuredContent).toEqual(response);
  });

  it.each(["text", "structured"] as const)(
    "removes continuation fields when a truncated %s item is omitted",
    async (format) => {
      vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
      vi.mocked(getLawArticle).mockResolvedValue(MOCK_LAW_DATA as any);
      vi.mocked(parseArticle).mockReturnValue({ ...MOCK_ARTICLE, text: "あ".repeat(15_000) });
      vi.mocked(parseArticleStructured).mockReturnValue({
        ...MOCK_STRUCTURED,
        paragraphs: [1, 2].map((number) => ({
          paragraph_num: `${number}`, paragraph_sentence: "あ".repeat(10_500), items: [],
        })),
      });
      const params = {
        requests: [{ law_name: "建築基準法", article_number: "20", format }],
        max_chars_per_item: 11_000,
      };
      const retained = await handler(params);
      expect(retained.structuredContent.results[0].truncated).toBe(true);
      if (format === "structured") {
        expect(retained.structuredContent.results[0].note).toContain("構造化形式は項単位で切り詰めました。");
      }

      const result = await handler({ ...params, max_total_chars: 10_000 });
      const response: BatchFetchResult = JSON.parse(result.content[0].text);
      expect(result.isError).toBeUndefined();
      expect(response).toMatchObject({ total: 1, success: 1, failed: 0 });
      expect(response.results[0]).toEqual({
        law_name: "建築基準法", article_number: "20", status: "success", omitted: true,
      });
      expect(result.structuredContent).toEqual(response);
      const config = mockServer.registerTool.mock.calls[0][1] as { outputSchema: z.ZodRawShape };
      expect(z.object(config.outputSchema).safeParse(result.structuredContent).success).toBe(true);
    },
  );

  it("handles API error gracefully", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawArticle).mockRejectedValue(new Error("API timeout"));

    const result = await handler({
      requests: [
        { law_name: "建築基準法", article_number: "20", format: "text" },
      ],
    });

    const parsed: BatchFetchResult = JSON.parse(result.content[0].text);
    expect(parsed.results[0].status).toBe("error");
  });
});
