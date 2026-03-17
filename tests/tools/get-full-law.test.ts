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

import { registerGetFullLawTool } from "../../src/tools/get-full-law.js";
import { getLawData } from "../../src/lib/egov-client.js";
import { parseFullLaw } from "../../src/lib/egov-parser.js";

// Capture the handler registered by the tool
let handler: Function;

const mockServer = {
  tool: vi.fn((_name: string, _desc: string, _schema: any, fn: Function) => {
    handler = fn;
  }),
};

describe("get_full_law tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerGetFullLawTool(mockServer as any);
  });

  it("registers with correct name", () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      "get_full_law",
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("returns full law text when found", async () => {
    const mockLawData = {
      law_full_text: { tag: "Law", children: [] },
    };
    const mockFullText =
      "建築基準法\n昭和二十五年法律第二百一号\n\n第一章 総則\n\n第一条 ...";

    vi.mocked(getLawData).mockResolvedValue(mockLawData as any);
    vi.mocked(parseFullLaw).mockReturnValue(mockFullText);

    const result = await handler({ law_name: "建築基準法" });

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("【建築基準法】全文");
    expect(result.content[0].text).toContain(
      "法令番号: 昭和二十五年法律第二百一号",
    );
    expect(result.content[0].text).toContain(mockFullText);
    expect(result.content[0].text).toContain("e-Gov法令検索");

    expect(getLawData).toHaveBeenCalledWith("325AC0000000201");
    expect(parseFullLaw).toHaveBeenCalledWith(mockLawData.law_full_text);
  });

  it("returns error when law not found in registry", async () => {
    const result = await handler({ law_name: "存在しない法律" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("エラー");
    expect(result.content[0].text).toContain("存在しない法律");
    expect(getLawData).not.toHaveBeenCalled();
  });

  it("returns error on API failure", async () => {
    vi.mocked(getLawData).mockRejectedValue(
      new Error("e-Gov API returned 503"),
    );

    const result = await handler({ law_name: "建築基準法" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("エラー");
    expect(result.content[0].text).toContain("e-Gov API returned 503");
  });
});
