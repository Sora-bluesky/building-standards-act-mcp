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

import { findRelatedLaws } from "../../src/lib/related-law-finder.js";
import { getLawData } from "../../src/lib/egov-client.js";
import { parseArticle } from "../../src/lib/egov-parser.js";
import { resolveLawId } from "../../src/lib/law-resolver.js";
import type { ArticleReference } from "../../src/lib/types.js";

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

function makeArticle(refs: ArticleReference[]) {
  return {
    article_num: "20",
    article_caption: "（構造耐力）",
    article_title: "第二十条",
    text: "テスト条文",
    references: refs,
  };
}

describe("findRelatedLaws", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws for unknown law", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(null);

    await expect(findRelatedLaws("存在しない法律", "1")).rejects.toThrow(
      "見つかりませんでした",
    );
  });

  it("throws for non-existent article", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(null);

    await expect(findRelatedLaws("建築基準法", "9999")).rejects.toThrow(
      "見つかりませんでした",
    );
  });

  it("extracts cross_law references", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(
      makeArticle([
        {
          raw_text: "建築基準法施行令第36条",
          ref_type: "cross_law",
          target_law: "建築基準法施行令",
          target_article: "36",
        },
      ]) as any,
    );

    const result = await findRelatedLaws("建築基準法", "20");

    expect(result.directly_referenced).toHaveLength(1);
    expect(result.directly_referenced[0].law_name).toBe("建築基準法施行令");
    expect(result.directly_referenced[0].article).toBe("36");
    expect(result.directly_referenced[0].preset_available).toBe(true);
  });

  it("extracts delegation references", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(
      makeArticle([
        {
          raw_text: "政令で定める",
          ref_type: "delegation",
        },
        {
          raw_text: "国土交通大臣が定める",
          ref_type: "delegation",
        },
      ]) as any,
    );

    const result = await findRelatedLaws("建築基準法", "20");

    expect(result.delegated_to).toHaveLength(2);
    expect(result.delegated_to[0].target_type).toBe("政令");
    expect(result.delegated_to[1].target_type).toBe("告示");
  });

  it("extracts same_law references", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(
      makeArticle([
        {
          raw_text: "第6条",
          ref_type: "same_law",
          target_article: "6",
        },
      ]) as any,
    );

    const result = await findRelatedLaws("建築基準法", "20");

    expect(result.same_law_references).toHaveLength(1);
    expect(result.same_law_references[0].article).toBe("6");
  });

  it("deduplicates references", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(
      makeArticle([
        {
          raw_text: "建築基準法施行令第36条",
          ref_type: "cross_law",
          target_law: "建築基準法施行令",
          target_article: "36",
        },
        {
          raw_text: "同令第36条",
          ref_type: "cross_law",
          target_law: "建築基準法施行令",
          target_article: "36",
        },
      ]) as any,
    );

    const result = await findRelatedLaws("建築基準法", "20");

    expect(result.directly_referenced).toHaveLength(1);
  });

  it("includes same_group_laws excluding source law", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(makeArticle([]) as any);

    const result = await findRelatedLaws("建築基準法", "1");

    // "1章 総則" has 建築基準法, 建築基準法施行令, 建築基準法施行規則, 民法
    // Source law (建築基準法) should be excluded
    expect(result.same_group_laws.length).toBeGreaterThanOrEqual(2);
    expect(
      result.same_group_laws.every((l) => l.law_name !== "建築基準法"),
    ).toBe(true);
  });

  it("returns empty arrays for article with no references", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawData).mockResolvedValue(MOCK_LAW_DATA as any);
    vi.mocked(parseArticle).mockReturnValue(makeArticle([]) as any);

    const result = await findRelatedLaws("建築基準法", "1");

    expect(result.directly_referenced).toHaveLength(0);
    expect(result.delegated_to).toHaveLength(0);
    expect(result.same_law_references).toHaveLength(0);
  });
});
