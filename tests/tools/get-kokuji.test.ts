import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
vi.mock("../../src/lib/mlit-client.js", async (original) => ({
  findKokujiPdfUrl: vi.fn(),
  findKokujiCandidates: vi.fn(),
  findKokujiEntriesByKey: vi.fn(),
  normalizeKokujiTitle: (await original<typeof import("../../src/lib/mlit-client.js")>()).normalizeKokujiTitle,
  searchMlitNotices: vi.fn(),
}));
vi.mock("../../src/lib/pdf-extractor.js", () => ({
  extractPdfText: vi.fn(),
  extractTextFromPdf: vi.fn(),
}));
vi.mock("../../src/lib/kokuji-amendments.js", async (original) => ({
  ...await original<typeof import("../../src/lib/kokuji-amendments.js")>(), findAmendmentsFor: vi.fn(), currentKokujiTitles: vi.fn(), findKokujiKeyByCurrentTitle: vi.fn(),
}));

import { registerGetKokujiTool } from "../../src/tools/get-kokuji.js";
import { searchLaws, getLawData } from "../../src/lib/egov-client.js";
import { parseFullLaw } from "../../src/lib/egov-parser.js";
import {
  findKokujiCandidates,
  findKokujiEntriesByKey,
  searchMlitNotices,
  type KokujiMatch,
} from "../../src/lib/mlit-client.js";
import { extractPdfText } from "../../src/lib/pdf-extractor.js";
import { KokujiRegistry } from "../../src/lib/kokuji-registry.js";
import type { KokujiPreset } from "../../src/lib/types.js";
import { DB_NOTICE, findAmendmentsFor, currentKokujiTitles, findKokujiKeyByCurrentTitle, unavailableAmendments } from "../../src/lib/kokuji-amendments.js";

// Capture the handler registered by the tool
let handler: Function;

const mockServer = {
  registerTool: vi.fn((_name: string, _config: { inputSchema: z.ZodRawShape; outputSchema: z.ZodRawShape }, fn: Function) => {
    handler = fn;
  }),
};

function createMatch(
  title = "テスト告示",
  pdfUrl = "https://www.mlit.go.jp/notice/test.pdf",
  stage: KokujiMatch["stage"] = "exact",
): KokujiMatch {
  return {
    entry: {
      title,
      document_number: "建設省告示第千百号",
      date: "1981-06-01",
      organization: "",
      pdf_url: pdfUrl,
    },
    stage,
    matched: ["第四十六条第四項"],
    score: 5,
  };
}

describe("get_kokuji ツール", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findKokujiCandidates).mockReset().mockResolvedValue([]);
    vi.mocked(findKokujiEntriesByKey).mockReset().mockResolvedValue({ available: true, entries: [] });
    vi.mocked(extractPdfText).mockReset();
    vi.mocked(findAmendmentsFor).mockReset().mockResolvedValue({ ...unavailableAmendments(), status: "ok" });
    vi.mocked(currentKokujiTitles).mockReset().mockResolvedValue(new Map());
    vi.mocked(findKokujiKeyByCurrentTitle).mockReset().mockResolvedValue(null);
    registerGetKokujiTool(mockServer as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers pagination defaults, integer limits, and an output schema", () => {
    const config = mockServer.registerTool.mock.calls[0][1];
    const schema = z.object(config.inputSchema);
    expect(schema.parse({ kokuji_name: "テスト告示" })).toEqual({
      kokuji_name: "テスト告示", max_chars: 30_000, offset: 0,
    });
    for (const params of [
      { max_chars: 999 }, { max_chars: 48_001 }, { max_chars: 1000.5 },
      { offset: -1 }, { offset: 0.5 },
    ]) {
      expect(schema.safeParse({ kokuji_name: "テスト告示", ...params }).success).toBe(false);
    }
    expect(schema.safeParse({ kokuji_name: "テスト告示", max_chars: 48_000, offset: 1000 }).success).toBe(true);
    expect(config).toHaveProperty("outputSchema");
  });

  describe("notice number input", () => {
    const entry = {
      title: "特別避難階段の階段室又は付室の構造方法を定める件",
      document_number: "国土交通省告示第六百九十六号", date: "2016-04-22",
      organization: "国土交通省住宅局建築指導課", pdf_url: "https://www.mlit.go.jp/notice/696.pdf",
    };
    const number = "平成28年国土交通省告示第696号";

    beforeEach(() => {
      vi.mocked(findKokujiEntriesByKey).mockResolvedValue({ available: true, entries: [entry] });
      vi.mocked(extractPdfText).mockResolvedValue({ text: "告示本文です。", lastModified: "2024-09-11" });
    });

    afterEach(() => {
      expect(findKokujiCandidates).not.toHaveBeenCalled();
      expect(searchLaws).not.toHaveBeenCalled();
      expect(searchMlitNotices).not.toHaveBeenCalled();
    });

    it.each([number, "平成二十八年国土交通省告示第六百九十六号", "平28国交告696"])("fetches the exact notice for %s before checking presets", async (query) => {
      const presetLookup = vi.spyOn(KokujiRegistry.prototype, "findByName");
      const result = await handler({ kokuji_name: query });
      expect(findKokujiEntriesByKey).toHaveBeenCalledWith("平成28:国土交通省:696");
      expect(presetLookup).not.toHaveBeenCalled();
      expect(extractPdfText).toHaveBeenCalledExactlyOnceWith(entry.pdf_url);
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        found: true, title: entry.title, document_number: entry.document_number, kokuji_number: number,
        source: "mlit_db", housing_bureau: true, db_notice: DB_NOTICE,
      });
      expect(result.content[0].text).toContain([
        `【告示】${entry.title}`, `法令番号: ${entry.document_number}`, `告示番号: ${number}`, "", "告示本文です。",
      ].join("\n"));
      expect(result.content[0].text).toContain("※ 国交省 DB の PDF 更新日: 2024-09-11");
      expect(result.content[0].text).toContain("出典: 国土交通省 告示・通達データベース");
      expect(findAmendmentsFor).toHaveBeenCalledWith({ key: "平成28:国土交通省:696", title: entry.title });
      expect(result.structuredContent.text).toBe(result.content[0].text);
      expect(z.object(mockServer.registerTool.mock.calls[0][1].outputSchema).safeParse(result.structuredContent).success).toBe(true);
    });

    it("resolves the construction-ministry number through the same exact path", async () => {
      const construction = { ...entry, title: "耐火構造の構造方法を定める件", document_number: "建設省告示第千三百九十九号", date: "2000-05-30", pdf_url: "https://www.mlit.go.jp/notice/1399.pdf" };
      vi.mocked(findKokujiEntriesByKey).mockResolvedValue({ available: true, entries: [construction] });
      const result = await handler({ kokuji_name: "平成12年建設省告示第1399号" });
      expect(findKokujiEntriesByKey).toHaveBeenCalledWith("平成12:建設省:1399");
      expect(extractPdfText).toHaveBeenCalledExactlyOnceWith(construction.pdf_url);
      expect(result.structuredContent).toMatchObject({ found: true, title: construction.title, kokuji_number: "平成12年建設省告示第1399号" });
      expect(z.object(mockServer.registerTool.mock.calls[0][1].outputSchema).safeParse(result.structuredContent).success).toBe(true);
    });

    it("reports a number absent from the database without falling back to title search", async () => {
      const missing = "平成13年国土交通省告示第1113号";
      vi.mocked(findKokujiEntriesByKey).mockResolvedValue({ available: true, entries: [] });
      const result = await handler({ kokuji_name: missing });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ found: false, source: "not_found", title: null, kokuji_number: missing });
      expect(result.content[0].text.startsWith(`この番号の告示は国交省 DB にありません: ${missing}`)).toBe(true);
      expect(result.content[0].text).toContain("告示名で get_kokuji を呼ぶか、e-Gov 法令検索・官報で確認してください");
      expect(extractPdfText).not.toHaveBeenCalled();
      expect(z.object(mockServer.registerTool.mock.calls[0][1].outputSchema).safeParse(result.structuredContent).success).toBe(true);
    });

    it("distinguishes database unavailability from an absent number", async () => {
      vi.mocked(findKokujiEntriesByKey).mockResolvedValue({ available: false, entries: [] });
      const result = await handler({ kokuji_name: number });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ found: false, source: "not_found", title: null, kokuji_number: number });
      expect(result.content[0].text).toContain("国交省の告示 DB を取得できませんでした。時間をおいて再度お試しください。");
      expect(result.content[0].text).toContain(number);
      expect(extractPdfText).not.toHaveBeenCalled();
      expect(z.object(mockServer.registerTool.mock.calls[0][1].outputSchema).safeParse(result.structuredContent).success).toBe(true);
    });

    it("lists distinct titles for an ambiguous number without choosing a PDF", async () => {
      const entries = [
        { ...entry, title: "海事局の告示", document_number: "国土交通省告示第千三百九十号", date: "2024-11-01", organization: "海事局" },
        { ...entry, title: "別の海事局の告示", document_number: "国土交通省告示第千三百九十号", date: "2024-11-02", organization: "海事局" },
      ];
      vi.mocked(findKokujiEntriesByKey).mockResolvedValue({ available: true, entries });
      const result = await handler({ kokuji_name: "令和6年国土交通省告示第1390号" });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ found: false, source: "not_found", title: null, kokuji_number: "令和6年国土交通省告示第1390号" });
      for (const candidate of entries) expect(result.content[0].text).toContain(`${candidate.title}・${candidate.document_number}・${candidate.date}`);
      expect(result.content[0].text).toContain("告示名で get_kokuji を呼び直してください");
      expect(extractPdfText).not.toHaveBeenCalled();
      expect(z.object(mockServer.registerTool.mock.calls[0][1].outputSchema).safeParse(result.structuredContent).success).toBe(true);
    });

    it.each(["pdf", "housing", "order", "normalized"])("selects duplicate rows by %s preference", async (preference) => {
      let entries = [
        { ...entry, pdf_url: "https://www.mlit.go.jp/notice/first.pdf" },
        { ...entry, pdf_url: "https://www.mlit.go.jp/notice/second.PDF" },
      ];
      let expected = entries[0];
      if (preference === "pdf") {
        entries[0].pdf_url = "https://www.mlit.go.jp/notice/first.html";
        entries[1].organization = "海事局";
        expected = entries[1];
      } else if (preference === "housing") {
        entries[0].organization = "海事局";
        expected = entries[1];
      } else if (preference === "normalized") {
        entries = [entries[0], { ...entries[1], title: "　特別避難階段の階段室又は付室の構造方法　" }];
      }
      vi.mocked(findKokujiEntriesByKey).mockResolvedValue({ available: true, entries });
      const result = await handler({ kokuji_name: number });
      expect(result.structuredContent).toMatchObject({ found: true, title: expected.title, kokuji_number: number });
      expect(extractPdfText).toHaveBeenCalledExactlyOnceWith(expected.pdf_url);
      expect(z.object(mockServer.registerTool.mock.calls[0][1].outputSchema).safeParse(result.structuredContent).success).toBe(true);
    });

    it.each(["failure", "empty"])("reports a PDF %s with the resolved title, URL and reason", async (state) => {
      if (state === "failure") vi.mocked(extractPdfText).mockRejectedValue(new Error("PDF download failed"));
      else vi.mocked(extractPdfText).mockResolvedValue({ text: "", lastModified: null });
      const result = await handler({ kokuji_name: number });
      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({ found: false, source: "not_found", title: entry.title, kokuji_number: number });
      expect(result.content[0].text).toContain("告示本文の取得に失敗しました");
      expect(result.content[0].text).toContain(entry.pdf_url);
      expect(result.content[0].text).toContain("原因:");
      if (state === "failure") expect(result.content[0].text).toContain("PDF download failed");
      expect(z.object(mockServer.registerTool.mock.calls[0][1].outputSchema).safeParse(result.structuredContent).success).toBe(true);
    });
  });

  it("uses the default page size when pagination inputs are omitted", async () => {
    vi.mocked(findKokujiCandidates).mockResolvedValue([createMatch()]);
    vi.mocked(extractPdfText).mockResolvedValue({ text: "文".repeat(30_001), lastModified: null });

    const result = await handler({ kokuji_name: "テスト告示" });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent.found).toBe(true);
    expect(result.structuredContent.next_offset).toBeGreaterThan(1000);
    expect(result.structuredContent.next_offset).toBeLessThan(30_000);
    expect(result.content[0].text).toContain(`offset=${result.structuredContent.next_offset}`);
    expect(result.structuredContent.text).toBe(result.content[0].text);
    expect(result.content[0].text.length + JSON.stringify(result.structuredContent).length).toBeLessThanOrEqual(50_000);
    expect(z.object(mockServer.registerTool.mock.calls[0][1].outputSchema).safeParse(result.structuredContent).success).toBe(true);
  });

  it.each(["mlit", "pdf", "egov"])("paginates the preset %s success path", async (source) => {
    const pdfUrl = "https://www.mlit.go.jp/test.pdf";
    const preset: KokujiPreset = {
      law_id: "TEST_KOKUJI", law_num: "令和元年告示第一号", title: "テスト告示",
      abbrev: [], delegated_by: "建築基準法", pdf_url: pdfUrl,
    };
    vi.spyOn(KokujiRegistry.prototype, "findByName").mockReturnValue(preset);
    vi.mocked(findKokujiCandidates).mockResolvedValue(source === "mlit" ? [createMatch(preset.title, pdfUrl)] : []);
    const body = "告示本文".repeat(375);
    vi.mocked(extractPdfText).mockImplementation(async () => {
      if (source === "egov") throw new Error("PDF unavailable");
      return { text: body, lastModified: null };
    });
    vi.mocked(getLawData).mockResolvedValue({
      law_full_text: { tag: "Law", children: [] },
    } as Awaited<ReturnType<typeof getLawData>>);
    vi.mocked(parseFullLaw).mockReturnValue(body);

    const complete = (await handler({ kokuji_name: preset.title })).content[0].text;
    const first = await handler({ kokuji_name: preset.title, max_chars: 1000 });
    const second = await handler({ kokuji_name: preset.title, max_chars: 1000, offset: 1000 });
    expect(first.content[0].text).toBe(`${complete.slice(0, 1000)}\n\n（続きがあります。offset=1000 を指定して続きを取得してください。全体 ${complete.length} 文字）`);
    expect(second.content[0].text).toBe(complete.slice(1000));
    expect(first.structuredContent.source).toBe(({ mlit: "mlit_db", pdf: "mlit_pdf", egov: "egov" })[source]);
    expect(first.structuredContent.text).toBe(first.content[0].text);
    expect(z.object(mockServer.registerTool.mock.calls[0][1].outputSchema).safeParse(first.structuredContent).success).toBe(true);
  });
  it("registers with correct name", () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      "get_kokuji",
      expect.objectContaining({
        annotations: expect.objectContaining({ readOnlyHint: true }),
      }),
      expect.any(Function),
    );
  });

  it("returns kokuji text via MLIT dynamic search", async () => {
    const mockPdfUrl = "https://www.mlit.go.jp/notice/test.pdf";
    const mockPdfText = "耐火構造の構造方法は、次に定めるものとする。";

    vi.mocked(findKokujiCandidates).mockResolvedValue([createMatch("耐火構造の構造方法を定める件", mockPdfUrl)]);
    vi.mocked(extractPdfText).mockResolvedValue({ text: mockPdfText, lastModified: null });

    const result = await handler({
      kokuji_name: "耐火構造の構造方法を定める件",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");
    // No presets — goes through dynamic MLIT search (Step 3)
    expect(result.content[0].text).toContain("【検索結果】");
    expect(result.content[0].text).toContain("耐火構造の構造方法を定める件");
    expect(result.content[0].text).toContain("法令番号: 建設省告示第千百号");
    expect(result.content[0].text).not.toContain("一致:");
    expect(result.content[0].text).toContain(mockPdfText);
    expect(result.content[0].text).toContain("出典: 国土交通省");
  });

  describe.each(["preset-mlit", "preset-pdf", "search"] as const)("PDF currency on the %s path", (path) => {
    it.each([
      { amendment: true, lastModified: "2024-09-11" },
      { amendment: true, lastModified: null },
      { amendment: false, lastModified: "2024-09-11" },
      { amendment: false, lastModified: null },
    ])("renders available metadata after the body: %j", async ({ amendment, lastModified }) => {
      const pdfUrl = "https://www.mlit.go.jp/notice/1100.pdf";
      const preset: KokujiPreset = {
        law_num: "昭和五十六年建設省告示第千百号", title: "壁量の告示",
        abbrev: [], delegated_by: "建築基準法施行令第四十六条第四項", pdf_url: pdfUrl,
      };
      vi.spyOn(KokujiRegistry.prototype, "findByName")
        .mockReturnValue(path === "search" ? undefined : preset);
      vi.mocked(findKokujiCandidates).mockResolvedValue(
        path === "preset-pdf" ? [] : [createMatch(preset.title, pdfUrl)],
      );
      const body = amendment
        ? "○建築基準法施行令第四十六条第四項表一（一）項から（七）項までに掲げる軸組と同等以上の耐力を有する軸組及び当該軸組に係る倍率の数値（昭和五十六年六月一日）（建設省告示第千百号）改正 昭和六二年一一月一四日建設省告示 第一九二六号平成 二年一一月二六日同 第一八九七号同 八年一一月一八日同 第二〇八八号同 一二年一二月二六日同 第二四六五号同 一五年一二月 九日国土交通省告示第一五四三号同 一六年 九月二九日同 第一一七一号同 一九年 五月一八日同 第 六一五号同 二八年 六月 一日同 第 七九六号建築基準法施行令（昭和二十五年政令第三百三十八号）第四十六条第四項表一（八）項の規定に基づき、告示する。"
        : "告示本文です。";
      vi.mocked(extractPdfText).mockResolvedValue({ text: body, lastModified });

      const result = await handler({ kokuji_name: preset.title });
      const output = result.content[0].text;
      const metadata = [
        ...(amendment ? ["※ 国交省 DB の PDF に記載された最終改正: 平成二八年六月一日国土交通省告示第七九六号"] : []),
        ...(lastModified ? [`※ 国交省 DB の PDF 更新日: ${lastModified}`] : []),
        amendment || lastModified
          ? "これより後の改正は反映されていない可能性があります。最新の改正は e-Gov 法令検索または官報で確認してください。"
          : "※ 国交省 DB の PDF の収録時点は確認できませんでした。最新の改正は e-Gov 法令検索または官報で確認してください。",
      ];
      const source = path === "preset-pdf"
        ? "出典: 国土交通省（PDF直接取得）"
        : "出典: 国土交通省 告示・通達データベース";
      expect(output).toContain([body, "", ...metadata, "", source].join("\n"));
      expect(output).toContain(path === "search" ? "【検索結果】壁量の告示" : "【告示】壁量の告示");
      expect(output.includes("最終改正:")).toBe(amendment);
      expect(output.includes("PDF 更新日:")).toBe(lastModified !== null);
      expect(extractPdfText).toHaveBeenCalledWith(pdfUrl);
    });
  });

  it("falls back to e-Gov when MLIT fails", async () => {
    // MLIT pipeline fails
    vi.mocked(findKokujiCandidates).mockResolvedValue([]);

    // e-Gov returns a result
    const mockSearchResult = {
      total_count: 1,
      count: 1,
      laws: [
        {
          law_info: {
            law_type: "MinisterialNotification",
            law_id: "KOKUJI001",
            law_num: "令和元年告示第一号",
            law_num_era: "Reiwa",
            law_num_year: 1,
            law_num_type: "MinisterialNotification",
            law_num_num: "1",
            promulgation_date: "2019-05-01",
          },
          revision_info: {
            law_revision_id: "rev1",
            law_type: "MinisterialNotification",
            law_title: "テスト告示",
            law_title_kana: "てすとこくじ",
            abbrev: null,
            category: "category",
            updated: "2024-01-01",
            amendment_promulgate_date: "2024-01-01",
            amendment_enforcement_date: "2024-04-01",
            amendment_enforcement_comment: null,
            amendment_law_id: "id1",
            amendment_law_title: "title1",
            amendment_law_num: "num1",
            repeal_status: "active",
            remain_in_force: true,
            current_revision_status: "active",
          },
          current_revision_info: {
            law_revision_id: "rev1",
            law_type: "MinisterialNotification",
            law_title: "テスト告示",
            law_title_kana: "てすとこくじ",
            abbrev: null,
            category: "category",
            updated: "2024-01-01",
            amendment_promulgate_date: "2024-01-01",
            amendment_enforcement_date: "2024-04-01",
            amendment_enforcement_comment: null,
            amendment_law_id: "id1",
            amendment_law_title: "title1",
            amendment_law_num: "num1",
            repeal_status: "active",
            remain_in_force: true,
            current_revision_status: "active",
          },
        },
      ],
    };

    const mockLawData = {
      law_full_text: { tag: "Law", children: [] },
    };
    const mockFullText = "第一条 テスト告示の本文です。";

    vi.mocked(searchLaws).mockResolvedValue(mockSearchResult as any);
    vi.mocked(getLawData).mockResolvedValue(mockLawData as any);
    vi.mocked(parseFullLaw).mockReturnValue(mockFullText);

    const result = await handler({
      kokuji_name: "耐火構造の構造方法を定める件",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("【検索結果】");
    expect(result.content[0].text).toContain("e-Gov法令検索");
    expect(result.content[0].text).toContain(mockFullText);
    expect(result.content[0].text).not.toContain("国交省 DB の PDF");
    expect(result.structuredContent).toMatchObject({ source: "egov", amendments: null, housing_bureau: false });
    expect(result.structuredContent.text).toBe(result.content[0].text);
    expect(z.object(mockServer.registerTool.mock.calls[0][1].outputSchema).safeParse(result.structuredContent).success).toBe(true);

    vi.mocked(parseFullLaw).mockReturnValue("告示本文".repeat(375));
    const complete = (await handler({ kokuji_name: "テスト告示" })).content[0].text;
    const first = await handler({ kokuji_name: "テスト告示", max_chars: 1000 });
    const second = await handler({ kokuji_name: "テスト告示", max_chars: 1000, offset: 1000 });
    expect(first.content[0].text).toBe(`${complete.slice(0, 1000)}\n\n（続きがあります。offset=1000 を指定して続きを取得してください。全体 ${complete.length} 文字）`);
    expect(second.content[0].text).toBe(complete.slice(1000));
  });

  it("returns search result text when MLIT finds non-preset kokuji", async () => {
    const mockPdfUrl = "https://www.mlit.go.jp/notice/other.pdf";
    const mockPdfText = "この告示は検索で見つかりました。";

    vi.mocked(findKokujiCandidates).mockResolvedValue([createMatch("検索で解決した告示", mockPdfUrl)]);
    vi.mocked(extractPdfText).mockResolvedValue({ text: mockPdfText, lastModified: null });

    const result = await handler({
      kokuji_name: "存在しないが検索で見つかる告示",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("【検索結果】");
    expect(result.content[0].text).toContain("【検索結果】検索で解決した告示");
    expect(result.content[0].text).toContain("法令番号: 建設省告示第千百号");
    expect(result.content[0].text).toContain(mockPdfText);
  });

  it("returns guidance when nothing found anywhere", async () => {
    // MLIT pipeline fails
    vi.mocked(findKokujiCandidates).mockResolvedValue([]);

    // e-Gov returns nothing
    const emptySearchResult = {
      total_count: 0,
      count: 0,
      laws: [],
    };
    vi.mocked(searchLaws).mockResolvedValue(emptySearchResult as any);

    // MLIT suggestion search returns empty
    vi.mocked(searchMlitNotices).mockResolvedValue([]);

    const result = await handler({
      kokuji_name: "存在しない告示",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain(
      "該当する告示を確認できませんでした",
    );
    expect(result.content[0].text).toContain("存在しない告示");
    expect(result.content[0].text).toContain("get_law");
    // getLawData should NOT have been called since nothing was found
    expect(getLawData).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({ found: false, source: "not_found", title: null, amendments: null });
    expect(result.structuredContent.text).toBe(result.content[0].text);
    expect(z.object(mockServer.registerTool.mock.calls[0][1].outputSchema).safeParse(result.structuredContent).success).toBe(true);
  });

  it("paginates MLIT text including headers and continues at offset", async () => {
    vi.mocked(findKokujiCandidates).mockResolvedValue([createMatch()]);
    const body = "告示本文".repeat(375);
    vi.mocked(extractPdfText).mockResolvedValue({ text: body, lastModified: null });
    const complete = [
      "【検索結果】テスト告示", "法令番号: 建設省告示第千百号", "告示番号: 昭和56年建設省告示第1100号", "", body, "",
      "※ 国交省 DB の PDF の収録時点は確認できませんでした。最新の改正は e-Gov 法令検索または官報で確認してください。",
      "",
      "出典: 国土交通省 告示・通達データベース", "",
      "※ この告示はプリセットに含まれていないため、",
      "国土交通省の告示データベースから検索して取得しました。",
    ].join("\n");

    const first = await handler({ kokuji_name: "テスト告示", max_chars: 1000, offset: 0 });
    const second = await handler({ kokuji_name: "テスト告示", max_chars: 1000, offset: 1000 });

    expect(first.content[0].text).toBe(`${complete.slice(0, 1000)}\n\n（続きがあります。offset=1000 を指定して続きを取得してください。全体 ${complete.length} 文字）`);
    expect(second.content[0].text).toBe(complete.slice(1000));
    expect(first.structuredContent).toMatchObject({ offset: 0, next_offset: 1000, total_chars: complete.length, amendments: null });
  });

  it("returns error on unexpected exception", async () => {
    vi.mocked(findKokujiCandidates).mockRejectedValue(
      new Error("Unexpected network error"),
    );

    const result = await handler({
      kokuji_name: "耐火構造の構造方法を定める件",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("エラー");
    // Sanitized: internal error details are hidden from client
    expect(result.content[0].text).not.toContain("Unexpected network error");
    expect(result.content[0].text).toContain("内部エラー");
  });

  it.each(["article", "keyword"] as const)("shows the resolved notice and matched terms for the %s stage", async (stage) => {
    const match = createMatch("建築基準法施行令第四十六条第四項の基準", undefined, stage);
    match.matched.push("軸組");
    vi.mocked(findKokujiCandidates).mockResolvedValue([match]);
    vi.mocked(extractPdfText).mockResolvedValue({ text: "告示本文です。", lastModified: null });

    const result = await handler({ kokuji_name: "壁量" });

    expect(findKokujiCandidates).toHaveBeenCalledWith("壁量", 1);
    expect(result.content[0].text).toContain([
      `【検索結果】${match.entry.title}`,
      `法令番号: ${match.entry.document_number}`,
      "告示番号: 昭和56年建設省告示第1100号",
      "一致: 第四十六条第四項、軸組",
      "",
      "告示本文です。",
    ].join("\n"));
    expect(extractPdfText).toHaveBeenCalledWith(match.entry.pdf_url);
  });

  it("returns not-found guidance with candidate suggestions and matched references", async () => {
    const match = createMatch("軸組の基準を定める件", undefined, "article");
    vi.mocked(findKokujiCandidates).mockResolvedValue([match]);
    vi.mocked(extractPdfText).mockRejectedValue(new Error("PDF unavailable"));
    vi.mocked(searchLaws).mockResolvedValue({ total_count: 0, count: 0, laws: [] });

    const result = await handler({ kokuji_name: "壁量" });

    expect(result.content[0].text).toContain("該当する告示を確認できませんでした");
    expect(result.content[0].text).toContain("  - 軸組の基準を定める件（建設省告示第千百号・一致: 第四十六条第四項）");
    expect(findKokujiCandidates).toHaveBeenCalledWith("壁量", 5);
    expect(searchMlitNotices).not.toHaveBeenCalled();
  });

  it("uses the existing keyword suggestion only when there are no candidates", async () => {
    vi.mocked(searchLaws).mockResolvedValue({ total_count: 0, count: 0, laws: [] });
    vi.mocked(searchMlitNotices).mockResolvedValue([createMatch("構造に関する告示").entry]);

    const result = await handler({ kokuji_name: "構造規定" });

    expect(result.content[0].text).toContain("  - 構造に関する告示");
    expect(searchMlitNotices).toHaveBeenCalledWith("構造規定");
  });

  it.each([false, true])("shows housing-bureau amendments on every body page (preset=%s)", async (preset) => {
    const match = createMatch();
    match.entry.organization = "国土交通省住宅局建築指導課";
    vi.mocked(findKokujiCandidates).mockResolvedValue([match]);
    vi.mocked(extractPdfText).mockResolvedValue({ text: "本文".repeat(1500), lastModified: null });
    if (preset) vi.spyOn(KokujiRegistry.prototype, "findByName").mockReturnValue({ title: "テスト告示", law_num: "昭和56年建設省告示第1100号", abbrev: [], delegated_by: "建築基準法" });
    const amendments = { ...unavailableAmendments(), status: "ok" as const, items: [{ number: "令和7年国土交通省告示第976号", title: "軸組等の一部を改正する告示", promulgated_on: "2025-10-28", effective_on: "2025-10-28", effective_note: null, documents: [], matched_by: "pdf" as const }] };
    vi.mocked(findAmendmentsFor).mockResolvedValue(amendments);
    const full = await handler({ kokuji_name: "テスト告示" });
    const first = await handler({ kokuji_name: "テスト告示", max_chars: 1000 });
    const next = await handler({ kokuji_name: "テスト告示", max_chars: 1000, offset: first.structuredContent.next_offset });
    for (const result of [full, first, next]) {
      expect(result.content[0].text.startsWith(DB_NOTICE)).toBe(true);
      expect(result.content[0].text).toContain("令和7年国土交通省告示第976号");
      expect(result.structuredContent.text).toBe(result.content[0].text);
      expect(result.structuredContent).toMatchObject({ source: "mlit_db", housing_bureau: true, db_notice: DB_NOTICE, amendments });
      expect(z.object(mockServer.registerTool.mock.calls[0][1].outputSchema).safeParse(result.structuredContent).success).toBe(true);
    }
    const sectionEnd = full.content[0].text.indexOf("\n\n");
    const body = full.content[0].text.slice(sectionEnd + 2);
    expect(first.structuredContent.next_offset).toBe(1000);
    expect(next.content[0].text.slice(sectionEnd + 2).startsWith(body.slice(1000, 2000))).toBe(true);
    expect(findAmendmentsFor).toHaveBeenCalledWith({ key: "昭和56:建設省:1100", title: match.entry.title });
  });
  it("keeps non-housing results free of amendment metadata", async () => {
    vi.mocked(findKokujiCandidates).mockResolvedValue([createMatch()]);
    vi.mocked(extractPdfText).mockResolvedValue({ text: "本文", lastModified: null });
    const result = await handler({ kokuji_name: "テスト告示" });
    expect(result.structuredContent).toMatchObject({ amendments: null, db_notice: null, housing_bureau: false });
    expect(findAmendmentsFor).not.toHaveBeenCalled();
  });
  it("keeps the body available when amendment lookup rejects", async () => {
    const match = createMatch(); match.entry.organization = "住宅局";
    vi.mocked(findKokujiCandidates).mockResolvedValue([match]);
    vi.mocked(extractPdfText).mockResolvedValue({ text: "本文", lastModified: null });
    vi.mocked(findAmendmentsFor).mockRejectedValue(new Error("unavailable"));
    const result = await handler({ kokuji_name: "テスト告示" });
    expect(result.content[0].text).toContain("改正一覧を取得できませんでした");
    expect(result.content[0].text).toContain("本文");
    expect(result.structuredContent.amendments.status).toBe("unavailable");
  });
  it.each(["文".repeat(25) + "\n", '"\\\t\r\n'])("budgets JSON-escaped short lines on the e-Gov fallback: %j", async (line) => {
    vi.spyOn(KokujiRegistry.prototype, "findByName").mockReturnValue({
      title: "テスト告示", law_num: "令和元年告示第一号", law_id: "TEST_KOKUJI",
      abbrev: [], delegated_by: "建築基準法",
    });
    vi.mocked(getLawData).mockResolvedValue({
      law_full_text: { tag: "Law", children: [] },
    } as Awaited<ReturnType<typeof getLawData>>);
    vi.mocked(parseFullLaw).mockReturnValue(line.repeat(20_000));

    const first = await handler({ kokuji_name: "テスト告示", max_chars: 48_000 });
    const next = await handler({ kokuji_name: "テスト告示", max_chars: 48_000, offset: first.structuredContent.next_offset });
    for (const result of [first, next]) {
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent.source).toBe("egov");
      expect(result.content[0].text.length + JSON.stringify(result.structuredContent).length).toBeLessThanOrEqual(50_000);
      expect(result.structuredContent.text).toBe(result.content[0].text);
      expect(result.structuredContent.next_offset).toBeGreaterThan(result.structuredContent.offset);
      expect(result.content[0].text).toContain(`offset=${result.structuredContent.next_offset}`);
    }
    const bodyStart = first.content[0].text.indexOf("\n\n") + 2;
    const bodyOffset = first.structuredContent.next_offset - bodyStart;
    expect(next.content[0].text.startsWith(line.repeat(20_000).slice(bodyOffset, bodyOffset + 100))).toBe(true);
  });
  it("budgets text plus structured metadata below 50,000 characters", async () => {
    const match = createMatch(); match.entry.organization = "住宅局";
    vi.mocked(findKokujiCandidates).mockResolvedValue([match]);
    vi.mocked(extractPdfText).mockResolvedValue({ text: "本".repeat(100_000), lastModified: null });
    const items = Array.from({ length: 30 }, () => ({ number: "令和7年国土交通省告示第976号", title: "軸組等の一部を改正する告示".repeat(5), promulgated_on: "2025-10-28", effective_on: "2025-10-28", effective_note: null, documents: [{ label: "新旧対照表", url: "https://www.mlit.go.jp/jutakukentiku/build/content/001966676.pdf" }], matched_by: "pdf" as const }));
    vi.mocked(findAmendmentsFor).mockResolvedValue({ ...unavailableAmendments(), status: "ok", items });
    const result = await handler({ kokuji_name: "テスト告示", max_chars: 48_000 });
    expect(result.content[0].text.length + JSON.stringify(result.structuredContent).length).toBeLessThanOrEqual(50_000);
    expect(result.structuredContent.text).toBe(result.content[0].text);
    expect(result.structuredContent.next_offset).toBeLessThan(48_000);
  });
});


describe("current notice title", () => {
  const key = "昭和56:建設省:1100";
  const title = "木造の建築物の軸組の構造方法及び設置の基準を定める件";
  const oldTitle = "建築基準法施行令第四十六条第四項表一（一）項から（七）項までに掲げる軸組と同等以上の耐力を有する軸組及び当該軸組に係る倍率の数値";
  const source_number = "令和7年国土交通省告示第976号";
  const entry = { title: oldTitle, document_number: "建設省告示第千百号", date: "1981-06-01", organization: "住宅局", pdf_url: "https://www.mlit.go.jp/1100.pdf" };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findKokujiCandidates).mockReset().mockResolvedValue([]);
    vi.mocked(findKokujiEntriesByKey).mockReset().mockResolvedValue({ available: true, entries: [entry] });
    vi.mocked(extractPdfText).mockReset().mockResolvedValue({ text: "本文".repeat(50_000), lastModified: null });
    vi.mocked(searchLaws).mockReset().mockResolvedValue({ count: 0, laws: [] });
    vi.mocked(searchMlitNotices).mockReset().mockResolvedValue([]);
    vi.mocked(findKokujiKeyByCurrentTitle).mockReset().mockResolvedValue({ key, title, source_number });
    vi.mocked(currentKokujiTitles).mockReset().mockResolvedValue(new Map([[key, { title, source_number }]]));
    vi.mocked(findAmendmentsFor).mockReset().mockResolvedValue({ ...unavailableAmendments(), status: "ok", items: [{ number: source_number, title: "軸組等の一部を改正する告示", promulgated_on: "2025-10-28", effective_on: "2025-10-28", effective_note: null, documents: [], matched_by: "pdf" }] });
    registerGetKokujiTool(mockServer as any);
  });
  afterEach(() => vi.restoreAllMocks());
  it.each([title, "昭和56年建設省告示第1100号"])("returns the renamed 1100 notice for %s", async (query) => {
    const result = await handler({ kokuji_name: query, max_chars: 48_000 });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ found: true, source: "mlit_db", kokuji_number: "昭和56年建設省告示第1100号", title: oldTitle, current_title: title, db_notice: DB_NOTICE });
    expect(result.content[0].text).toContain(`現在の題名: ${title}`);
    expect(result.content[0].text).toContain(`※ 国交省 DB には改正前の題名で収録されています。現在の題名は ${source_number} の本文によります。`);
    expect(result.content[0].text).toContain(DB_NOTICE);
    expect(result.content[0].text).toContain(`- ${source_number}`);
    expect(result.content[0].text.length + JSON.stringify(result.structuredContent).length).toBeLessThanOrEqual(50_000);
    expect(z.object(mockServer.registerTool.mock.calls[0][1].outputSchema).safeParse(result.structuredContent).success).toBe(true);
    expect(extractPdfText).toHaveBeenCalledExactlyOnceWith(entry.pdf_url);
    expect(findKokujiCandidates).not.toHaveBeenCalled();
    if (query === title) expect(currentKokujiTitles).not.toHaveBeenCalled();
  });
  it.each(["関係のない告示", "DBにも改正一覧にもない題名"])("does not return a notice for %s", async (query) => {
    vi.mocked(findKokujiKeyByCurrentTitle).mockResolvedValue(null);
    const result = await handler({ kokuji_name: query });
    expect(result.structuredContent).toMatchObject({ found: false, title: null, current_title: null, kokuji_number: null });
    expect(result.content[0].text).not.toContain("【告示】");
    expect(findKokujiEntriesByKey).not.toHaveBeenCalled();
    expect(extractPdfText).not.toHaveBeenCalled();
  });
  it.each(["unavailable", "db-unavailable", "missing", "unchanged", "rejected"])("preserves title search when resolution is %s", async (reason) => {
    if (reason === "unavailable") vi.mocked(findKokujiKeyByCurrentTitle).mockResolvedValue(null);
    if (reason === "db-unavailable") vi.mocked(findKokujiEntriesByKey).mockResolvedValue({ available: false, entries: [] });
    if (reason === "missing") vi.mocked(findKokujiEntriesByKey).mockResolvedValue({ available: true, entries: [] });
    if (reason === "unchanged") vi.mocked(findKokujiEntriesByKey).mockResolvedValue({ available: true, entries: [{ ...entry, title }] });
    if (reason === "rejected") vi.mocked(findKokujiKeyByCurrentTitle).mockRejectedValue(new Error("offline"));
    const result = await handler({ kokuji_name: title });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ found: false, title: null, current_title: null });
    expect(findKokujiCandidates).toHaveBeenCalledWith(title, 1);
    expect(extractPdfText).not.toHaveBeenCalled();
  });
  it("keeps the existing title path for an unchanged DB title", async () => {
    const unchanged = { ...entry, title };
    vi.mocked(findKokujiEntriesByKey).mockResolvedValue({ available: true, entries: [unchanged] });
    vi.mocked(findKokujiCandidates).mockResolvedValue([{ entry: unchanged, stage: "exact", matched: [title], score: 1 }]);
    const result = await handler({ kokuji_name: title });
    expect(result.structuredContent).toMatchObject({ found: true, title, current_title: null });
    expect(result.content[0].text).toContain(`【検索結果】${title}`);
    expect(findKokujiCandidates).toHaveBeenCalledWith(title, 1);
  });
  it.each([false, true])("keeps number lookup available without a renamed title (rejected=%s)", async (rejected) => {
    if (rejected) vi.mocked(currentKokujiTitles).mockRejectedValue(new Error("offline"));
    else vi.mocked(currentKokujiTitles).mockResolvedValue(new Map([[key, { title: oldTitle, source_number }]]));
    const result = await handler({ kokuji_name: "昭和56年建設省告示第1100号" });
    expect(result.structuredContent).toMatchObject({ found: true, title: oldTitle, current_title: null });
    expect(result.content[0].text).not.toContain("現在の題名:");
  });
});
