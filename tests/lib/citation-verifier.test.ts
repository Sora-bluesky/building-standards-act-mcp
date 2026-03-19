import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/egov-client.js", () => ({
  getLawData: vi.fn(),
  searchLaws: vi.fn(),
}));

vi.mock("../../src/lib/egov-parser.js", () => ({
  parseArticle: vi.fn(),
}));

vi.mock("../../src/lib/law-resolver.js", () => ({
  resolveLawId: vi.fn(),
}));

import {
  normalizeText,
  calculateMatchScore,
  verifyCitation,
} from "../../src/lib/citation-verifier.js";
import { getLawData } from "../../src/lib/egov-client.js";
import { parseArticle } from "../../src/lib/egov-parser.js";
import { resolveLawId } from "../../src/lib/law-resolver.js";

const MOCK_RESOLVED = {
  law_id: "325AC0000000201",
  title: "建築基準法",
  law_num: "昭和二十五年法律第二百一号",
  source: "alias" as const,
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
  text: "建築物は、自重、積載荷重、積雪荷重、風圧、土圧及び水圧並びに地震その他の振動及び衝撃に対して安全な構造のものとして、次の各号に掲げる建築物の区分に応じ、それぞれ当該各号に定める基準に適合するものでなければならない。",
};

describe("normalizeText", () => {
  it("collapses whitespace", () => {
    expect(normalizeText("建築物 は  自重")).toBe("建築物は自重");
  });

  it("removes punctuation", () => {
    expect(normalizeText("建築物は、自重。")).toBe("建築物は自重");
  });

  it("removes brackets", () => {
    expect(normalizeText("（構造耐力）")).toBe("構造耐力");
  });

  it("handles empty string", () => {
    expect(normalizeText("")).toBe("");
  });
});

describe("calculateMatchScore", () => {
  it("returns 1.0 for exact match after normalization", () => {
    const score = calculateMatchScore("建築物は、自重", "建築物は、自重");
    expect(score).toBe(1.0);
  });

  it("returns 1.0 when claimed is substring of actual", () => {
    const score = calculateMatchScore(
      "自重積載荷重",
      "建築物は自重積載荷重積雪荷重",
    );
    expect(score).toBe(1.0);
  });

  it("returns 0 for completely different texts", () => {
    const score = calculateMatchScore("あいうえお", "かきくけこ");
    expect(score).toBe(0);
  });

  it("returns 0 for empty claimed text", () => {
    expect(calculateMatchScore("", "テスト")).toBe(0);
  });

  it("returns 0 for empty actual text", () => {
    expect(calculateMatchScore("テスト", "")).toBe(0);
  });

  it("returns partial score for partially matching texts", () => {
    const score = calculateMatchScore(
      "建築物は自重積載荷重に対して安全",
      "建築物は自重積載荷重積雪荷重風圧に対して安全な構造",
    );
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(1.0);
  });
});

describe("verifyCitation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns law_not_found for unknown law", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(null);

    const result = await verifyCitation("存在しない法律", "1");
    expect(result.status).toBe("law_not_found");
  });

  it("returns article_not_found when article does not exist", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(null);

    const result = await verifyCitation("建築基準法", "9999");
    expect(result.status).toBe("article_not_found");
  });

  it("returns verified when article exists (no claimed_text)", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(MOCK_ARTICLE as any);

    const result = await verifyCitation("建築基準法", "20");
    expect(result.status).toBe("verified");
    expect(result.actual_text).toBeDefined();
  });

  it("returns verified when claimed_text matches", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(MOCK_ARTICLE as any);

    const result = await verifyCitation(
      "建築基準法",
      "20",
      "建築物は、自重、積載荷重、積雪荷重",
    );
    expect(result.status).toBe("verified");
    expect(result.match_score).toBeGreaterThanOrEqual(0.8);
  });

  it("returns mismatch for completely wrong text", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(MOCK_ARTICLE as any);

    const result = await verifyCitation(
      "建築基準法",
      "20",
      "この法律は全く関係のないテキストです。",
    );
    expect(result.status).toBe("mismatch");
    expect(result.match_score).toBeLessThan(0.8);
    expect(result.mismatch_detail).toBeDefined();
  });

  it("returns verified for empty claimed_text", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(MOCK_ARTICLE as any);

    const result = await verifyCitation("建築基準法", "20", "");
    expect(result.status).toBe("verified");
  });

  it("returns error on API failure", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockRejectedValue(new Error("timeout"));

    const result = await verifyCitation("建築基準法", "20");
    expect(result.status).toBe("error");
    expect(result.error_message).toContain("timeout");
  });

  it("handles whitespace/punctuation differences as match", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue({
      ...MOCK_ARTICLE,
      text: "建築物は、自重に対して安全。",
    } as any);

    const result = await verifyCitation(
      "建築基準法",
      "20",
      "建築物は 自重に対して安全",
    );
    expect(result.status).toBe("verified");
  });
});
