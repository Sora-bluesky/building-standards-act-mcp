import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AmendmentNotice, KokujiAmendments } from "../../src/lib/kokuji-amendments.js";

const index = vi.hoisted(() => ({ notices: {} as Record<string, { number: string; source_pdf: string; target_keys: string[]; target_titles: Record<string, string>; complete: boolean }> }));
vi.mock("../../src/data/kokuji-amendment-index.js", () => ({ KOKUJI_AMENDMENT_INDEX: index }));
vi.mock("../../src/lib/mlit-client.js", async (original) => ({
  ...await original<typeof import("../../src/lib/mlit-client.js")>(), fetchMlitText: vi.fn(), findHousingKokujiByTitle: vi.fn(),
}));
vi.mock("../../src/lib/pdf-extractor.js", async (original) => ({
  ...await original<typeof import("../../src/lib/pdf-extractor.js")>(), extractPdfText: vi.fn(),
}));
import { fetchMlitText, findHousingKokujiByTitle } from "../../src/lib/mlit-client.js";
import { extractPdfText } from "../../src/lib/pdf-extractor.js";
const fixture = readFileSync(new URL("../fixtures/mlit-kokuji-amendments.html", import.meta.url), "utf8");
let lib: typeof import("../../src/lib/kokuji-amendments.js");
const targetKey = "平成12:建設省:1399";
const entry = { title: "耐火構造の構造方法を定める件", document_number: "建設省告示第千三百九十九号", date: "2000-05-30", organization: "国土交通省住宅局", pdf_url: "https://www.mlit.go.jp/body.pdf" };
const targetText = "耐火構造の構造方法を定める件（平成十二年建設省告示第千三百九十九号）の一部を次のように改正する。";

function page(items = 1): string {
  return `<!-- #contents start --><h4>令和5年度</h4>` + Array.from({ length: items }, (_, i) =>
    `【令和5年3月${String(i % 28 + 1)}日公布】<br>○複数の件等の一部を改正する件（令和5年国土交通省告示第${i + 1}号）<br>・<a href="/test${i}.pdf">新旧対照表</a><br>`).join("") + "<!-- #contents end -->";
}
function notice(overrides: Partial<AmendmentNotice> = {}): AmendmentNotice {
  return { fiscal_year: "令和5年度", title: "耐火構造の構造方法を定める件の一部を改正する件", number: "令和5年国土交通省告示第207号", key: "令和5:国土交通省:207",
    promulgated_on: "2023-03-20", effective_on: "2023-04-01", effective_note: null,
    documents: [{ label: "新旧対照表", url: "https://www.mlit.go.jp/test.pdf" }], listed_target_keys: [], listed_targets_partial: false, ...overrides };
}
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  for (const key of Object.keys(index.notices)) delete index.notices[key];
  vi.mocked(fetchMlitText).mockReset().mockResolvedValue(null);
  vi.mocked(findHousingKokujiByTitle).mockReset().mockResolvedValue([]);
  vi.mocked(extractPdfText).mockReset().mockRejectedValue(new Error("unreadable"));
  lib = await import("../../src/lib/kokuji-amendments.js");
});

describe("amendment page", () => {
  it("parses all 158 notices, dates, targets, and documents from the fixture", () => {
    const notices = lib.parseAmendmentPage(fixture);
    expect(notices).toHaveLength(158);
    const amendment = notices.find((n) => n.key === "令和5:国土交通省:207")!;
    expect(amendment).toMatchObject({ number: "令和5年国土交通省告示第207号", promulgated_on: "2023-03-20", effective_on: "2023-04-01", fiscal_year: "令和4年度" });
    expect(amendment.documents).toContainEqual({ label: "新旧対照表", url: "https://www.mlit.go.jp/jutakukentiku/build/content/001598635.pdf" });
    expect(amendment.listed_target_keys).toContain(targetKey);
    expect(amendment.documents.some((d) => d.url.endsWith("001600652.pdf"))).toBe(false);
    expect(notices.find((n) => n.key === "令和6:国土交通省:447")).toMatchObject({ promulgated_on: "2024-05-31", effective_on: "2025-04-01" });
    expect(notices.find((n) => n.key === "令和7:国土交通省:976")).toMatchObject({ promulgated_on: "2025-10-28", effective_on: "2025-10-28" });
    expect(notices.find((n) => n.key === "令和6:国土交通省:221")?.listed_targets_partial).toBe(true);
    expect(notices.find((n) => n.key === "令和7:国土交通省:998")?.listed_target_keys).toContain("平成6:建設省:1882");
    expect(notices.flatMap((n) => n.documents).every((d) => new URL(d.url).origin === "https://www.mlit.go.jp")).toBe(true);
    expect(notices.find((n) => n.key === "令和6:国土交通省:1005")?.effective_note).toContain("ただし");
    expect(notices.find((n) => n.key === "令和8:国土交通省:693")?.effective_on).toBeNull();
    expect(new Set(notices.map((n) => n.key)).size).toBe(158);
  });
  it.each(["<html></html>", "<!-- #contents start -->○告示<!-- #contents end -->", "<h4>令和5年度</h4>"])("rejects changed structure", (html) => expect(lib.parseAmendmentPage(html)).toEqual([]));
  it("decodes entities and drops external links", () => {
    const html = page().replace("複数の件", "甲&amp;乙の件").replace("/test0.pdf", "https://www.jboa.or.jp/external.pdf");
    expect(lib.parseAmendmentPage(html)[0]).toMatchObject({ title: "甲&乙の件等の一部を改正する件", documents: [] });
  });
  it("extracts spaced and vertical PDF targets and deduplicates in order", () => {
    const vertical = targetText.replace("（", "︵").replace("）", "︶");
    const second = "木造（昭和五十六年建設省告示第千百号）の一部を改正する。";
    expect(lib.extractAmendedKokujiKeys([...vertical].join(" \n") + second + targetText)).toEqual([targetKey, "昭和56:建設省:1100"]);
    expect(lib.extractAmendedKokujiKeys("平成12年建設省告示第1399号を参照")).toEqual([]);
  });
  it.each([
    ["平成二十六年国土交通省告示第四百十七号の一部を次のように改正する。", "平成26:国土交通省:417"],
    ["建築基準法施行規則の規定（平成十二年建こう設省告示第千四百十七号）の一部を次のように改正する。", "平成12:建設省:1417"],
    ["登録規程（平成三十年十月厚生労働省・国土交通省・環境省告示第一号）の一部を次のように改正する。", "平成30:厚生労働省・国土交通省・環境省:1"],
    ["規程（平成三十年十月二十三日厚生労働省・国土交通省・環境省告示第一号）の一部を改正する。", "平成30:厚生労働省・国土交通省・環境省:1"],
  ])("canonicalizes the PDF citation family: %s", (text, expected) => {
    expect(lib.extractAmendedKokujiKeys(text)).toEqual([expected]);
  });
  it.each(["の全部を改正", "の全部を次のように改正"])("extracts full replacements: %s", (relation) => {
    const text = `階避難安全検証法に関する算出方法等を定める件（平成十二年建設省告示第千四百四十一号）${relation}する告示を次のように定める。`;
    expect(lib.extractAmendedKokujiKeys(text)).toEqual(["平成12:建設省:1441"]);
  });
  it.each(["は、廃止する", "は廃止する"])("extracts repeals without including supplementary commencement references: %s", (relation) => {
    const text = `建築物石綿含有建材調査者講習登録規程（平成二十五年国土交通省告示第七百四十八号）${relation}。`
      + "附則 この告示は、規程（平成三十年国土交通省告示第一号）の施行の日から施行する。";
    expect(lib.extractAmendedKokujiKeys(text)).toEqual(["平成25:国土交通省:748"]);
  });
  it.each(["の全部を改正する", "の全部を次のように改正する", "は、廃止する", "は廃止する"])("retains conjunction-chain targets for %s", (relation) => {
    const text = `（平成十二年建設省告示第千四百四十一号）及び（平成十二年建設省告示第千四百四十二号）${relation}。`;
    expect(lib.extractAmendedKokujiKeys(text)).toEqual(["平成12:建設省:1441", "平成12:建設省:1442"]);
  });
  it.each([
    "平成26年国土交通省告示第417号を引用する。",
    "新たな基準を定める（令和8年国土交通省告示第693号）。",
    "平成26年国土交通省告示第417号の一部を参照する。",
    "規程（平成三十年国土交通省告示第一号）の施行の日から施行する。",
    "規程（平成二十五年国土交通省告示第七百四十八号）を廃止する。",
    "規程（平成二十五年国土交通省告示第七百四十八号）は、廃止予定とする。",
    "規程（平成二十五年国土交通省告示第七百四十八号）の全部を参照する。",
    "規程（平成二十五年国土交通省告示第七百四十八号）の全部を順次改正する。",
  ])("does not invent targets for references or newly established notices: %s", (text) => {
    expect(lib.extractAmendedKokujiKeys(text)).toEqual([]);
  });
  it("resolves a group of directly numbered targets without treating earlier citations as issuer text", () => {
    const group = "平成十七年国土交通省告示第三百五十九号及び平成二十六年国土交通省告示第千二百三号の一部を次のように改正する。";
    expect(lib.extractAmendedKokujiKeys(group)).toEqual(["平成17:国土交通省:359", "平成26:国土交通省:1203"]);
    expect(lib.extractAmendedKokujiKeys(group.replace("の一部を次のように改正する", "を参照する"))).toEqual([]);
  });
  it.each([false, true])("extracts enumerated amendment targets from the actual 273 clause (spaced=%s)", (spaced) => {
    // MLIT 001735090.pdf, page 2; table row details are omitted after each citation.
    const clause = readFileSync(new URL("../fixtures/mlit-kokuji-273-clause.txt", import.meta.url), "utf8");
    const text = spaced ? [...clause].join(" \n") : clause;
    expect(lib.extractAmendedKokujiKeys(text)).toEqual(["平成20:国土交通省:282", "平成20:国土交通省:285"]);
  });
  it("bounds enumerated targets by item, article, and supplementary provisions", () => {
    const clause = readFileSync(new URL("../fixtures/mlit-kokuji-273-clause.txt", import.meta.url), "utf8");
    const reference = "平成12年建設省告示第1399号";
    for (const boundary of ["第三条", "附則"]) {
      expect(lib.extractAmendedKokujiKeys(clause.replace("別表第一四の項", `別表第一四の項「${reference}」を参照する。`)
        + `${boundary}（${reference}）を参照する。`)).toEqual(["平成20:国土交通省:282", "平成20:国土交通省:285"]);
    }
    expect(lib.extractAmendedKokujiKeys(clause.replace("に改める。", "と読み替える。"))).toEqual([]);
    expect(lib.extractAmendedKokujiKeys(clause.replace("の規定中", "を参照し、本文中"))).toEqual([]);
  });
  it("derives exact titles, including paired titles, and completeness", () => {
    expect(lib.targetTitlesFromName("甲を定める件及び乙を定める件の一部を改正する告示")).toEqual({ titles: ["甲を定める件", "乙を定める件"], complete: true });
    expect(lib.targetTitlesFromName("甲を定める件等の一部を改正する件")).toEqual({ titles: ["甲を定める件"], complete: false });
    expect(lib.targetTitlesFromName("甲を定める件")).toEqual({ titles: [], complete: false });
    expect(lib.normalizeKokujiTitle(" ＡＢＣ 倍率の数値を定める件 ")).toBe("ABC倍率の数値");
  });
});

describe("target resolution", () => {
  it("uses the index first, including an authoritative empty set", async () => {
    index.notices["令和5:国土交通省:207"] = { number: "n", source_pdf: "u", target_titles: {}, target_keys: [targetKey], complete: true };
    expect(await lib.resolveNoticeTargets(notice())).toMatchObject({ targets: { [targetKey]: "pdf" }, complete: true });
    index.notices["令和5:国土交通省:207"].target_keys = [];
    expect(await lib.resolveNoticeTargets(notice({ title: "新たな構造方法を定める件" }))).toMatchObject({ targets: {}, complete: true });
    expect(extractPdfText).not.toHaveBeenCalled();
    expect(findHousingKokujiByTitle).not.toHaveBeenCalled();
  });
  it.each([true, false])("merges page-only targets and checks completeness for indexed PDFs (complete=%s)", async (complete) => {
    index.notices["令和5:国土交通省:207"] = { number: "n", source_pdf: "u", target_titles: {}, target_keys: [targetKey], complete };
    const resolved = await lib.resolveNoticeTargets(notice({ listed_target_keys: [targetKey, "平成20:国土交通省:282"] }));
    expect(resolved).toMatchObject({ targets: { [targetKey]: "pdf", "平成20:国土交通省:282": "page" }, complete: false });
    expect(extractPdfText).not.toHaveBeenCalled();
    expect(findHousingKokujiByTitle).not.toHaveBeenCalled();
  });
  it.each([[[]], [[targetKey]]])("never re-reads a known incomplete index entry with targets %j", async (target_keys) => {
    index.notices["令和5:国土交通省:207"] = { number: "n", source_pdf: "u", target_titles: {}, target_keys, complete: false };
    expect(await lib.resolveNoticeTargets(notice())).toMatchObject({ complete: false });
    expect(extractPdfText).not.toHaveBeenCalled();
    expect(findHousingKokujiByTitle).not.toHaveBeenCalled();
  });
  it("uses runtime PDFs and retains the provenance of page-only targets", async () => {
    vi.mocked(extractPdfText).mockResolvedValue({ text: targetText, lastModified: null });
    expect(await lib.resolveNoticeTargets(notice({ listed_target_keys: ["昭和45:建設省:1826"] }))).toMatchObject({ targets: { [targetKey]: "pdf", "昭和45:建設省:1826": "page" }, complete: false });
  });
  it.each([
    ["令和2:国土交通省:510", "階避難安全検証法に関する算出方法等を定める件（平成十二年建設省告示第千四百四十一号）の全部を改正する告示を次のように定める。", "平成12:建設省:1441"],
    ["平成30:国土交通省:1203", "建築物石綿含有建材調査者講習登録規程（平成二十五年国土交通省告示第七百四十八号）は、廃止する。附則（平成三十年国土交通省告示第一号）の施行の日", "平成25:国土交通省:748"],
  ])("completes full replacement and repeal notices using PDF evidence: %s", async (key, text, target) => {
    const item = lib.parseAmendmentPage(fixture).find((n) => n.key === key)!;
    vi.mocked(extractPdfText).mockResolvedValue({ text, lastModified: null });
    expect(await lib.resolveNoticeTargets(item)).toMatchObject({ targets: { [target]: "pdf" }, complete: true });
  });
  it.each([
    "令和7:国土交通省:366", "令和7:国土交通省:103", "令和2:国土交通省:1437",
    "令和2:国土交通省:511", "令和2:国土交通省:510", "平成30:国土交通省:1203", "平成30:国土交通省:931",
  ])("keeps an unrecognized change/repeal PDF unresolved across the inventory: %s", async (key) => {
    const item = lib.parseAmendmentPage(fixture).find((n) => n.key === key)!;
    vi.mocked(extractPdfText).mockResolvedValue({ text: "読めるが対象番号を抽出できない本文", lastModified: null });
    expect(await lib.resolveNoticeTargets(item)).toMatchObject({ complete: false });
  });
  it("requires positive evidence before accepting an empty PDF target set", async () => {
    const establishing = notice({ title: "新たな構造方法を定める件", listed_target_keys: [], listed_targets_partial: false });
    vi.mocked(extractPdfText).mockResolvedValue({ text: "新たな基準を定める。", lastModified: null });
    expect(lib.hasCompletePdfTargets(establishing, [])).toBe(true);
    expect(await lib.resolveNoticeTargets(establishing)).toMatchObject({ targets: {}, complete: true });
    expect(lib.hasCompletePdfTargets(notice(), [])).toBe(false);
    expect(lib.hasCompletePdfTargets(establishing, [targetKey])).toBe(true);
    expect(lib.hasCompletePdfTargets({ ...establishing, listed_target_keys: [targetKey] }, [])).toBe(false);
    expect(lib.hasCompletePdfTargets({ ...establishing, listed_targets_partial: true }, [])).toBe(false);
    expect(lib.hasCompletePdfTargets(notice({ listed_target_keys: [targetKey] }), ["平成20:国土交通省:282"])).toBe(false);
    expect(lib.hasCompletePdfTargets(notice({ listed_target_keys: [targetKey] }), [targetKey])).toBe(true);
  });
  it("uses the same canonical citation grammar for runtime PDF fallback", async () => {
    vi.mocked(extractPdfText).mockResolvedValue({ text:
      "平成十七年国土交通省告示第三百五十九号及び平成二十六年国土交通省告示第千二百三号の一部を次のように改正する。"
      + "規程︵平成三十年十月厚生労働省・国土交通省・環境省告示第一号︶の一部を改正する。"
      + "構造︵平成十二年建こう設省告示第千四百十七号︶の一部を改正する。", lastModified: null });
    expect(await lib.resolveNoticeTargets(notice())).toMatchObject({ complete: true, targets: {
      "平成17:国土交通省:359": "pdf", "平成26:国土交通省:1203": "pdf",
      "平成30:厚生労働省・国土交通省・環境省:1": "pdf", "平成12:建設省:1417": "pdf",
    } });
  });
  it("trusts title matches only when unique and avoids unnecessary PDFs", async () => {
    vi.mocked(findHousingKokujiByTitle).mockResolvedValue([entry]);
    expect(await lib.resolveNoticeTargets(notice())).toMatchObject({ targets: { [targetKey]: "title" }, complete: true });
    expect(extractPdfText).not.toHaveBeenCalled();
    vi.mocked(findHousingKokujiByTitle).mockResolvedValue([entry, { ...entry, date: "2001-01-01" }]);
    expect(await lib.resolveNoticeTargets(notice())).toMatchObject({ targets: {}, complete: false });
  });
  it("prefers comparison tables then drafts then text", async () => {
    const documents = ["条文", "案文", "新旧対照表"].map((label, i) => ({ label, url: `https://www.mlit.go.jp/${i}.pdf` }));
    expect(lib.preferredAmendmentDocument(notice({ documents }))?.label).toBe("新旧対照表");
    expect(lib.preferredAmendmentDocument(notice({ documents: documents.slice(0, 2) }))?.label).toBe("案文");
  });
  it("caps concurrent runtime reads at five and reports unresolved notices", async () => {
    vi.mocked(fetchMlitText).mockResolvedValue(page(15));
    const result = await lib.findAmendmentsFor({ key: targetKey, title: entry.title });
    expect(extractPdfText).toHaveBeenCalledTimes(5);
    expect(result).toMatchObject({ status: "ok", items: [], unresolved_count: 15 });
  });
  it("does not complete a title match while page-listed targets lack PDF evidence", async () => {
    vi.mocked(findHousingKokujiByTitle).mockResolvedValue([entry]);
    expect(await lib.resolveNoticeTargets(notice({ listed_target_keys: [targetKey] }))).toMatchObject({ complete: false });
    expect(extractPdfText).toHaveBeenCalledTimes(1);
  });
  it("does not return Reiwa amendments for a Heisei notice with the same western year and number", async () => {
    vi.mocked(fetchMlitText).mockResolvedValue(page());
    index.notices["令和5:国土交通省:1"] = { number: "n", source_pdf: "u", target_titles: {}, target_keys: ["令和1:国土交通省:193"], complete: true };
    expect((await lib.findAmendmentsFor({ key: "平成31:国土交通省:193", title: "" })).items).toEqual([]);
    expect((await lib.findAmendmentsFor({ key: "令和1:国土交通省:193", title: "" })).items).toHaveLength(1);
  });
  it("sorts indexed matches newest first, caps at 30, and caches a resolution pass", async () => {
    vi.mocked(fetchMlitText).mockResolvedValue(page(35));
    for (let i = 1; i <= 35; i++) index.notices[`令和5:国土交通省:${i}`] = { number: "n", source_pdf: "u", target_titles: {}, target_keys: [targetKey], complete: true };
    const [result, same] = await Promise.all([lib.findAmendmentsFor({ key: targetKey, title: "" }), lib.findAmendmentsFor({ key: targetKey, title: "" })]);
    expect(result).toMatchObject({ status: "ok", omitted_count: 5, unresolved_count: 0 });
    expect(result.items).toHaveLength(30);
    expect(result.items[0].promulgated_on).toBe("2023-03-28");
    expect(result.items.every((item) => item.matched_by === "pdf")).toBe(true);
    expect(same).toEqual(result);
    await lib.findAmendmentsFor({ key: targetKey, title: "" });
    expect(fetchMlitText).toHaveBeenCalledTimes(1);
    expect(extractPdfText).not.toHaveBeenCalled();
  });
  it("uses the normalized title fallback only when the target has no key", async () => {
    vi.mocked(fetchMlitText).mockResolvedValue(page().replace("複数の件等", entry.title));
    vi.mocked(findHousingKokujiByTitle).mockResolvedValue([entry]);
    expect((await lib.findAmendmentsFor({ key: null, title: "耐火構造の構造方法" })).items[0]?.matched_by).toBe("title");
    expect((await lib.findAmendmentsFor({ key: "平成13:建設省:1399", title: entry.title })).items).toEqual([]);
  });
  it("does not cache failed fetches or structural failures", async () => {
    expect((await lib.findAmendmentsFor({ key: targetKey, title: "" })).status).toBe("unavailable");
    vi.mocked(fetchMlitText).mockResolvedValue("<html></html>");
    expect((await lib.findAmendmentsFor({ key: targetKey, title: "" })).status).toBe("unavailable");
    expect(fetchMlitText).toHaveBeenCalledTimes(2);
  });
  it("expires the resolved-list cache after 24 hours", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetchMlitText).mockResolvedValue(page());
      index.notices["令和5:国土交通省:1"] = { number: "n", source_pdf: "u", target_titles: {}, target_keys: [], complete: true };
      await lib.getKokujiAmendmentNotices();
      vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
      await lib.getKokujiAmendmentNotices();
      expect(fetchMlitText).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
  it("returns only the four supported output document labels", async () => {
    vi.mocked(fetchMlitText).mockResolvedValue(page().replace("<!-- #contents end -->", '<a href="/summary.pdf">概要</a><br><a href="/advice.pdf">技術的助言</a><!-- #contents end -->'));
    index.notices["令和5:国土交通省:1"] = { number: "n", source_pdf: "u", target_titles: {}, target_keys: [targetKey], complete: true };
    const result = await lib.findAmendmentsFor({ key: targetKey, title: "" });
    expect(result.items[0].documents.map((d) => d.label)).toEqual(["新旧対照表", "技術的助言"]);
  });
});

describe("Japanese amendment section", () => {
  it("formats success, omitted and unresolved results, dates, documents, and notes", () => {
    const result: KokujiAmendments = { ...lib.unavailableAmendments(), status: "ok", omitted_count: 2, unresolved_count: 3,
      items: [{ ...notice(), matched_by: "pdf", effective_note: "(ただし、一部を除く)" }] };
    const text = lib.formatAmendmentsSection(result, { includeDbNotice: true });
    expect(text.split("\n")[0]).toBe(lib.DB_NOTICE);
    expect(text).toContain("改正告示（国交省");
    expect(text).toContain("公布 2023-03-20・施行 2023-04-01");
    expect(text).toContain("新旧対照表: https://www.mlit.go.jp/test.pdf");
    expect(text).toContain("ただし");
    expect(text).toContain("このほか 2 件");
    expect(text).toContain("改正対象を確定できなかった改正告示が 3 件");
    result.items[0].effective_on = null;
    expect(lib.formatAmendmentsSection(result, { includeDbNotice: false })).toContain("施行日記載なし");
  });
  it("formats no matches without a DB warning for non-housing notices", () => {
    const text = lib.formatAmendmentsSection({ ...lib.unavailableAmendments(), status: "ok" }, { includeDbNotice: false });
    expect(text).toBe("平成30年以降の改正は見つかりませんでした（改正一覧は平成29年度分から）。");
  });
  it("formats unavailable results and the official source", () => {
    const text = lib.formatAmendmentsSection(lib.unavailableAmendments(), { includeDbNotice: true });
    expect(text).toContain(lib.AMENDMENTS_PAGE_URL);
    expect(text).toContain("改正一覧を取得できませんでした");
    expect(text).toContain("最新の改正は官報で確認してください。");
  });
});


describe("amended notice titles", () => {
  const title = "木造の建築物の軸組の構造方法及び設置の基準を定める件";
  const citation = "昭和五十六年建設省告示第千百号";
  const key = "昭和56:建設省:1100";
  it.each([false, true])("extracts the actual 976 heading (vertical=%s)", (vertical) => {
    let text = `${title}等の一部を改正する告示(${title}の一部改正)第一条${title}(${citation})の一部を次のように改正する。次の表により`;
    if (vertical) text = [...text.replaceAll("(", "︵").replaceAll(")", "︶")].join(" \n");
    expect(lib.extractAmendedKokujiTitles(text, [])).toEqual({ [key]: title });
  });
  it("extracts a second article and an article subdivision independently", () => {
    const text = `（${title}の一部改正）第一条${title}（${citation}）の一部を次のように改正する。`
      + `（${entry.title}の一部改正）第二条の三${entry.title}（平成十二年建設省告示第千三百九十九号）の全部を改正する。`;
    expect(lib.extractAmendedKokujiTitles(text, [])).toEqual({ [key]: title, [targetKey]: entry.title });
  });
  it("requires the heading title and article title to be identical", () => {
    expect(lib.extractAmendedKokujiTitles(`（旧題名の一部改正）第一条${title}（${citation}）の一部を改正する。`, [])).toEqual({});
  });
  it("extracts only a named direct target without a heading, escaping regexp characters", () => {
    const named = "構造[甲]+の基準を定める件";
    const text = `${named}（${citation}）の一部を改正する。`;
    expect(lib.extractAmendedKokujiTitles(text, [named])).toEqual({ [key]: named });
    expect(lib.extractAmendedKokujiTitles(text, [])).toEqual({});
    expect(lib.extractAmendedKokujiTitles(text, ["構造.*の基準を定める件"])).toEqual({});
  });
  it.each(["に規定する基準を適用する。", "の一部を参照する。", "」に規定する基準を適用する。"])("rejects references: %s", (relation) => {
    const text = `（${title}の一部改正）第一条${title}（${citation}）${relation}`;
    expect(lib.extractAmendedKokujiTitles(text, [title])).toEqual({});
  });
  it("rejects a quoted amendment clause as title evidence", () => {
    const text = `「${title}（${citation}）の一部を改正する。」を引用する。`;
    expect(lib.extractAmendedKokujiTitles(text, [title])).toEqual({});
  });
  it("does not lose titles containing parentheses", () => {
    const named = "構造方法（試験方法を含む。）を定める件";
    const text = `（${named}の一部改正）第2条${named}（${citation}）の一部を改正する。`;
    expect(lib.extractAmendedKokujiTitles(text, [])).toEqual({ [key]: named.normalize("NFKC") });
  });
  it("drops a key with conflicting titles in the same PDF", () => {
    const old = "軸組及び当該軸組に係る倍率の数値";
    const text = `（${title}の一部改正）第一条${title}（${citation}）の一部を改正する。`
      + `${old}（${citation}）の一部を改正する。`;
    expect(lib.extractAmendedKokujiTitles(text, [old])).toEqual({});
    expect(lib.extractAmendedKokujiTitles(text + `${title}（${citation}）の一部を改正する。`, [old, title])).toEqual({});
  });
});

describe("current notice titles", () => {
  const key = "昭和56:建設省:1100";
  const title = "木造の建築物の軸組の構造方法及び設置の基準を定める件";
  function titlesPage(items: { titles: Record<string, string>; date: string | null }[]) {
    const html = items.map((item, i) => {
      index.notices[`令和5:国土交通省:${i + 1}`] = { number: "n", source_pdf: "u", target_keys: Object.keys(item.titles), target_titles: item.titles, complete: true };
      return `<h4>令和5年度</h4>${item.date ? `【${item.date}公布】<br>` : ""}○基準等の一部を改正する告示（令和5年国土交通省告示第${i + 1}号）<br>`;
    }).join("");
    vi.mocked(fetchMlitText).mockResolvedValue(`<!-- #contents start -->${html}<!-- #contents end -->`);
  }
  it("uses the latest promulgated title, independent of page order and enforcement dates", async () => {
    for (const item of lib.parseAmendmentPage(fixture)) index.notices[item.key!] = { number: item.number, source_pdf: "u", target_keys: [], target_titles: {}, complete: false };
    for (const amendment of ["令和6:国土交通省:447", "令和7:国土交通省:215", "令和7:国土交通省:976"]) {
      index.notices[amendment].target_keys = [key];
      index.notices[amendment].target_titles = { [key]: amendment.startsWith("令和6") ? "旧題名" : title };
    }
    vi.mocked(fetchMlitText).mockResolvedValue(fixture);
    const current = { title, source_number: "令和7年国土交通省告示第976号" };
    expect((await lib.currentKokujiTitles())?.get(key)).toEqual(current);
    expect(await lib.findKokujiKeyByCurrentTitle(` ${title.replace("木造", "木 造")} `)).toEqual({ key, ...current });
    expect(await lib.findKokujiKeyByCurrentTitle("旧題名")).toBeNull();
    expect(await lib.findKokujiKeyByCurrentTitle("未知の題名")).toBeNull();
    expect(fetchMlitText).toHaveBeenCalledTimes(1);
    expect(extractPdfText).not.toHaveBeenCalled();
  });
  it("rejects a normalized title shared by two keys", async () => {
    titlesPage([{ titles: { [key]: title, [targetKey]: title.replace(/を定める件$/, "") }, date: "令和5年3月1日" }]);
    expect(await lib.findKokujiKeyByCurrentTitle(title)).toBeNull();
  });
  it.each(["tie", "undated-first", "undated-last"])("rejects conflicting titles with %s", async (kind) => {
    const old = { titles: { [key]: "旧題名" }, date: kind === "undated-first" ? null : "令和5年3月1日" };
    const current = { titles: { [key]: title }, date: kind === "undated-last" ? null : "令和5年3月1日" };
    titlesPage([old, current]);
    expect((await lib.currentKokujiTitles())?.has(key)).toBe(false);
    expect(await lib.findKokujiKeyByCurrentTitle(title)).toBeNull();
  });
  it("resolves a latest dated title even when older dates conflict", async () => {
    titlesPage([{ titles: { [key]: "旧題名A" }, date: "令和5年3月1日" }, { titles: { [key]: "旧題名B" }, date: "令和5年3月1日" }, { titles: { [key]: title }, date: "令和5年3月2日" }]);
    expect((await lib.currentKokujiTitles())?.get(key)?.title).toBe(title);
  });
  it("keeps agreeing titles at tied or unknown dates", async () => {
    titlesPage([{ titles: { [key]: title }, date: null }, { titles: { [key]: title }, date: "令和5年3月1日" }, { titles: { [key]: title }, date: "令和5年3月1日" }]);
    expect((await lib.currentKokujiTitles())?.get(key)?.title).toBe(title);
  });
  it("exposes indexed titles but never derives them from runtime PDFs", async () => {
    index.notices["令和5:国土交通省:207"] = { number: "n", source_pdf: "u", target_keys: [key], target_titles: { [key]: title }, complete: true };
    expect((await lib.resolveNoticeTargets(notice())).target_titles).toEqual({ [key]: title });
    vi.mocked(extractPdfText).mockResolvedValue({ text: targetText, lastModified: null });
    expect((await lib.resolveNoticeTargets(notice({ key: "令和5:国土交通省:999" }))).target_titles).toEqual({});
  });
  it.each([false, true])("returns no title when the amendment page is unavailable (rejected=%s)", async (rejected) => {
    if (rejected) vi.mocked(fetchMlitText).mockRejectedValue(new Error("offline"));
    expect(await lib.currentKokujiTitles()).toBeNull();
    expect(await lib.findKokujiKeyByCurrentTitle(title)).toBeNull();
  });
});
