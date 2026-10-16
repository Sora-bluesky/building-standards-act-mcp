import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchParsedArticle } from "../../src/lib/article-fetcher.js";
import { getLawArticle, getLawData, getLawDataByRevision, getLawRevisions } from "../../src/lib/egov-client.js";
import { ArticleNotFoundError } from "../../src/lib/errors.js";
import type { EgovLawDataResponse, LawNode } from "../../src/lib/types.js";

vi.mock("../../src/lib/egov-client.js", () => ({
  getLawArticle: vi.fn(),
  getLawData: vi.fn(),
  getLawDataByRevision: vi.fn(),
  getLawRevisions: vi.fn(),
}));

function article(num: string): LawNode {
  return { tag: "Article", attr: { Num: num }, children: [
    { tag: "ArticleTitle", children: [`第${num}条`] },
    { tag: "Paragraph", attr: { Num: "1" }, children: [
      { tag: "ParagraphSentence", children: [{ tag: "Sentence", children: ["経過措置の本文"] }] },
    ] },
  ] };
}

function data(supplements: LawNode[] = []): EgovLawDataResponse {
  return {
    attached_files_info: null,
    law_info: {
      law_id: "test-law", law_type: "CabinetOrder", law_num: "昭和二十五年政令第三百三十八号",
      law_num_era: "Showa", law_num_year: 25, law_num_type: "CabinetOrder",
      law_num_num: "338", promulgation_date: "1950-11-16",
    },
    revision_info: {
      law_revision_id: "current", law_type: "CabinetOrder", law_title: "建築基準法施行令",
      law_title_kana: "", abbrev: null, category: "", updated: "", amendment_promulgate_date: "2026-09-16",
      amendment_enforcement_date: "2026-11-01", amendment_enforcement_comment: null,
      amendment_law_id: "amendment", amendment_law_title: "", amendment_law_num: "令和八年政令第二百八十四号",
      repeal_status: "", remain_in_force: true, current_revision_status: "UnEnforced",
    },
    law_full_text: { tag: "Law", children: [{ tag: "LawBody", children: supplements }] },
  };
}

const supplement: LawNode = {
  tag: "SupplProvision", attr: { AmendLawNum: "令和八年九月一六日政令第二八四号" },
  children: [{ tag: "SupplProvisionLabel", children: ["附則"] }, article("1")],
};
const request = "附則（令和8年政令第284号）";

describe("fetchParsedArticle", () => {
  beforeEach(() => vi.resetAllMocks());

  it("uses elm and parses a single Article root", async () => {
    vi.mocked(getLawArticle).mockResolvedValue({ ...data(), law_full_text: article("6_2") });
    const result = await fetchParsedArticle("test-law", "第6条の2");
    expect(result?.article.article_num).toBe("6_2");
    expect(getLawArticle).toHaveBeenCalledWith("test-law", "MainProvision-Article_6_2");
    expect(getLawData).not.toHaveBeenCalled();
    expect(getLawRevisions).not.toHaveBeenCalled();
  });

  it("returns null for a missing elm without falling back to full text", async () => {
    vi.mocked(getLawArticle).mockResolvedValue(null);
    expect(await fetchParsedArticle("test-law", "第999条")).toBeNull();
    expect(getLawData).not.toHaveBeenCalled();
  });

  it.each(["附則", "附則第3条", "別表第一", "第百条"])("keeps %s on full text without revision fallback", async (input) => {
    vi.mocked(getLawData).mockResolvedValue(data());
    expect(await fetchParsedArticle("test-law", input)).toBeNull();
    expect(getLawData).toHaveBeenCalledWith("test-law");
    expect(getLawArticle).not.toHaveBeenCalled();
    expect(getLawRevisions).not.toHaveBeenCalled();
  });

  it.each(["text", "structured"] as const)("fetches the first matching revision after the current tree misses (%s)", async (format) => {
    const current = data();
    const future = { ...data([supplement]), revision_info: { ...data().revision_info, law_revision_id: "future" } };
    vi.mocked(getLawData).mockResolvedValue(current);
    vi.mocked(getLawRevisions).mockImplementation(async () => {
      expect(getLawData).toHaveBeenCalledOnce();
      expect(getLawDataByRevision).not.toHaveBeenCalled();
      return { law_info: current.law_info, revisions: [
        current.revision_info,
        { ...future.revision_info, law_revision_id: "unrelated", amendment_law_num: "令和八年法律第二百八十四号" },
        future.revision_info,
        { ...future.revision_info, law_revision_id: "later-match" },
      ] };
    });
    vi.mocked(getLawDataByRevision).mockResolvedValue(future);
    const result = await fetchParsedArticle("test-law", request, format);
    expect(getLawDataByRevision).toHaveBeenCalledExactlyOnceWith("future");
    expect(result?.article.article_num).toBe("suppl");
    expect(result?.revision).toEqual({ law_revision_id: "future", amendment_enforcement_date: "2026-11-01", current_revision_status: "UnEnforced" });
    expect(result?.revisionNote).toBe("※ この附則は未施行の改正（施行日 2026-11-01）の法令データから取得しました。");
  });

  it("does not fetch revisions when the current tree contains the supplement", async () => {
    vi.mocked(getLawData).mockResolvedValue(data([supplement]));
    const result = await fetchParsedArticle("test-law", `${request}第1条`);
    expect(result?.article.article_num).toBe("1");
    expect(result?.revisionNote).toBeUndefined();
    expect(getLawRevisions).not.toHaveBeenCalled();
    expect(getLawDataByRevision).not.toHaveBeenCalled();
  });

  it("returns null when no other matching revision exists", async () => {
    vi.mocked(getLawData).mockResolvedValue(data());
    vi.mocked(getLawRevisions).mockResolvedValue({ law_info: data().law_info, revisions: [data().revision_info] });
    expect(await fetchParsedArticle("test-law", request)).toBeNull();
    expect(getLawDataByRevision).not.toHaveBeenCalled();
  });

  it("returns null when the matched revision also lacks the supplement", async () => {
    vi.mocked(getLawData).mockResolvedValue(data());
    vi.mocked(getLawRevisions).mockResolvedValue({ law_info: data().law_info, revisions: [{ ...data().revision_info, law_revision_id: "future" }] });
    vi.mocked(getLawDataByRevision).mockResolvedValue(data());
    expect(await fetchParsedArticle("test-law", request)).toBeNull();
  });

  it.each(["text", "structured"] as const)("explains missing articles in an extracted supplement (%s)", async (format) => {
    const extracted = data([{ tag: "SupplProvision", attr: { AmendLawNum: "令和四年六月一七日法律第六九号", Extract: "true" }, children: [1, 3, 4, 5, 6].map((n) => article(String(n))) }]);
    extracted.revision_info.law_title = "建築基準法";
    vi.mocked(getLawData).mockResolvedValue(extracted);
    vi.mocked(getLawRevisions).mockResolvedValue({ law_info: extracted.law_info, revisions: [] });
    const result = fetchParsedArticle("test-law", "附則（令和4年法律第69号）第2条", format);
    await expect(result).rejects.toBeInstanceOf(ArticleNotFoundError);
    await expect(result).rejects.toThrow("建築基準法の附則（令和4年法律第69号）は抄録で、第1条・第3条・第4条・第5条・第6条のみ収録されています。");
  });

  it("propagates API failures", async () => {
    vi.mocked(getLawArticle).mockRejectedValue(new Error("unavailable"));
    await expect(fetchParsedArticle("test-law", "第20条")).rejects.toThrow("unavailable");
  });
});
