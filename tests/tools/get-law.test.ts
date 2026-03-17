import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external dependencies BEFORE importing the tool module
vi.mock("../../src/lib/egov-client.js", () => ({
  getLawData: vi.fn(),
  searchLaws: vi.fn(),
}));
vi.mock("../../src/lib/egov-parser.js", () => ({
  parseArticle: vi.fn(),
  parseFullLaw: vi.fn(),
}));

import { registerGetLawTool } from "../../src/tools/get-law.js";
import { getLawData } from "../../src/lib/egov-client.js";
import { parseArticle } from "../../src/lib/egov-parser.js";

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
});
