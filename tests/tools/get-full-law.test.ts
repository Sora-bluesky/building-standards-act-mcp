import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Mock external dependencies BEFORE importing the tool module
vi.mock("../../src/lib/egov-client.js", () => ({
  getLawData: vi.fn(),
  searchLaws: vi.fn(),
}));
vi.mock("../../src/lib/egov-parser.js", () => ({
  parseArticle: vi.fn(),
  parseFullLaw: vi.fn(),
}));
vi.mock("../../src/lib/law-resolver.js", () => ({
  resolveLawId: vi.fn(),
}));

import { registerGetFullLawTool } from "../../src/tools/get-full-law.js";
import { getLawData } from "../../src/lib/egov-client.js";
import { parseFullLaw } from "../../src/lib/egov-parser.js";
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
  registerTool: vi.fn((_name: string, _config: { inputSchema: z.ZodRawShape }, fn: Function) => {
    handler = fn;
  }),
};

describe("get_full_law ツール", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerGetFullLawTool(mockServer as any);
  });

  it("registers with correct name", () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      "get_full_law",
      expect.objectContaining({
        annotations: expect.objectContaining({ readOnlyHint: true }),
      }),
      expect.any(Function),
    );
  });

  it("registers pagination defaults and integer limits without an output schema", () => {
    const config = mockServer.registerTool.mock.calls[0][1];
    const schema = z.object(config.inputSchema);
    expect(schema.parse({ law_name: "建築基準法" })).toEqual({
      law_name: "建築基準法", max_chars: 30_000, offset: 0,
    });
    for (const params of [
      { max_chars: 999 }, { max_chars: 48_001 }, { max_chars: 1000.5 },
      { offset: -1 }, { offset: 0.5 },
    ]) {
      expect(schema.safeParse({ law_name: "建築基準法", ...params }).success).toBe(false);
    }
    expect(schema.safeParse({ law_name: "建築基準法", max_chars: 48_000, offset: 1000 }).success).toBe(true);
    expect(config).not.toHaveProperty("outputSchema");
  });

  it("returns full law text when found", async () => {
    const mockLawData = {
      law_full_text: { tag: "Law", children: [] },
    };
    const mockFullText =
      "建築基準法\n昭和二十五年法律第二百一号\n\n第一章 総則\n\n第一条 ...";

    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
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
    vi.mocked(resolveLawId).mockResolvedValue(null);

    const result = await handler({ law_name: "存在しない法律" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("エラー");
    expect(result.content[0].text).toContain("存在しない法律");
    expect(getLawData).not.toHaveBeenCalled();
  });

  it("paginates the assembled text including headers and continues at offset", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue({
      law_full_text: { tag: "Law", children: [] },
    } as Awaited<ReturnType<typeof getLawData>>);
    const body = "本文".repeat(750);
    vi.mocked(parseFullLaw).mockReturnValue(body);
    const complete = [
      "【建築基準法】全文", "法令番号: 昭和二十五年法律第二百一号",
      "", body, "", "出典: e-Gov法令検索",
    ].join("\n");

    const first = await handler({ law_name: "建築基準法", max_chars: 1000, offset: 0 });
    const second = await handler({ law_name: "建築基準法", max_chars: 1000, offset: 1000 });

    expect(first.content[0].text).toBe(`${complete.slice(0, 1000)}\n\n（続きがあります。offset=1000 を指定して続きを取得してください。全体 ${complete.length} 文字）`);
    expect(second.content[0].text).toBe(complete.slice(1000));
    expect(first).not.toHaveProperty("structuredContent");
  });

  it("uses the default page size when pagination inputs are omitted", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue({
      law_full_text: { tag: "Law", children: [] },
    } as Awaited<ReturnType<typeof getLawData>>);
    vi.mocked(parseFullLaw).mockReturnValue("文".repeat(30_001));
    const result = await handler({ law_name: "建築基準法" });
    expect(result.content[0].text).toContain("offset=30000");
  });

  it("returns error on API failure", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockRejectedValue(
      new Error("e-Gov API returned 503"),
    );

    const result = await handler({ law_name: "建築基準法" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("エラー");
    // Sanitized: internal error details are hidden from client
    expect(result.content[0].text).not.toContain("503");
    expect(result.content[0].text).toContain("内部エラー");
  });
});
