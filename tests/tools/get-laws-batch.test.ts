import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/egov-client.js", () => ({
  getLawData: vi.fn(),
}));

vi.mock("../../src/lib/egov-parser.js", () => ({
  parseArticle: vi.fn(),
  parseArticleStructured: vi.fn(),
}));

import { registerGetLawsBatchTool } from "../../src/tools/get-laws-batch.js";
import { getLawData } from "../../src/lib/egov-client.js";
import {
  parseArticle,
  parseArticleStructured,
} from "../../src/lib/egov-parser.js";
import type { BatchFetchResult } from "../../src/lib/types.js";

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
    expect(mockServer.tool).toHaveBeenCalledWith(
      "get_laws_batch",
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("returns error for empty requests", async () => {
    const result = await handler({ requests: [] });
    expect(result.isError).toBe(true);
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
    expect(result.content[0].text).toContain("上限");
  });

  it("fetches single article successfully", async () => {
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
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
  });

  it("fetches structured format", async () => {
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
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
  });

  it("groups same law requests into one API call", async () => {
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(MOCK_ARTICLE as any);

    await handler({
      requests: [
        { law_name: "建築基準法", article_number: "1", format: "text" },
        { law_name: "建築基準法", article_number: "20", format: "text" },
        { law_name: "建築基準法", article_number: "6", format: "text" },
      ],
    });

    // getLawData should only be called once for the same law
    expect(getLawData).toHaveBeenCalledTimes(1);
  });

  it("returns law_not_found for unknown law", async () => {
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
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
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
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
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
    vi.mocked(getLawData).mockRejectedValue(new Error("API timeout"));

    const result = await handler({
      requests: [
        { law_name: "建築基準法", article_number: "20", format: "text" },
      ],
    });

    const parsed: BatchFetchResult = JSON.parse(result.content[0].text);
    expect(parsed.results[0].status).toBe("error");
  });
});
