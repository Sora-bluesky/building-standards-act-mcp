import { describe, it, expect, vi, beforeEach } from "vitest";

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
