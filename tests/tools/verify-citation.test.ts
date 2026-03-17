import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/egov-client.js", () => ({
  getLawData: vi.fn(),
}));

vi.mock("../../src/lib/egov-parser.js", () => ({
  parseArticle: vi.fn(),
}));

import { registerVerifyCitationTool } from "../../src/tools/verify-citation.js";
import { getLawData } from "../../src/lib/egov-client.js";
import { parseArticle } from "../../src/lib/egov-parser.js";

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
  article_num: "1",
  article_caption: "（目的）",
  article_title: "第一条",
  text: "この法律は、建築物の敷地、構造、設備及び用途に関する最低の基準を定めて、国民の生命、健康及び財産の保護を図り、もつて公共の福祉の増進に資することを目的とする。",
};

describe("verify_citation tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerVerifyCitationTool(mockServer as any);
  });

  it("registers with correct name", () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      "verify_citation",
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("returns error for empty citations", async () => {
    const result = await handler({ citations: [] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("空です");
  });

  it("returns error when exceeding max citations", async () => {
    const citations = Array.from({ length: 11 }, () => ({
      law_name: "建築基準法",
      article_number: "1",
    }));
    const result = await handler({ citations });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("上限");
  });

  it("verifies existing article without claimed_text", async () => {
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(MOCK_ARTICLE as any);

    const result = await handler({
      citations: [{ law_name: "建築基準法", article_number: "1" }],
    });

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("引用検証結果");
    expect(text).toContain("[OK]");
    expect(text).toContain("正確: 1件");
  });

  it("detects mismatch for wrong claimed_text", async () => {
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(MOCK_ARTICLE as any);

    const result = await handler({
      citations: [
        {
          law_name: "建築基準法",
          article_number: "1",
          claimed_text: "これは全く異なるテキストです。",
        },
      ],
    });

    const text = result.content[0].text;
    expect(text).toContain("[NG]");
    expect(text).toContain("不一致");
  });

  it("reports law_not_found", async () => {
    const result = await handler({
      citations: [{ law_name: "存在しない法律", article_number: "1" }],
    });

    const text = result.content[0].text;
    expect(text).toContain("[N/A]");
    expect(text).toContain("未発見: 1件");
  });

  it("verifies multiple citations in one call", async () => {
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle)
      .mockReturnValueOnce(MOCK_ARTICLE as any)
      .mockReturnValueOnce(null);

    const result = await handler({
      citations: [
        { law_name: "建築基準法", article_number: "1" },
        { law_name: "建築基準法", article_number: "9999" },
      ],
    });

    const text = result.content[0].text;
    expect(text).toContain("検証対象: 2件");
    expect(text).toContain("[OK]");
    expect(text).toContain("[N/A]");
  });
});
