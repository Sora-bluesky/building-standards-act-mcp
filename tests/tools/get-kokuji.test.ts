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
vi.mock("../../src/lib/mlit-client.js", () => ({
  findKokujiPdfUrl: vi.fn(),
  findKokujiCandidates: vi.fn(),
  searchMlitNotices: vi.fn(),
}));
vi.mock("../../src/lib/pdf-extractor.js", () => ({
  extractPdfText: vi.fn(),
  extractTextFromPdf: vi.fn(),
}));

import { registerGetKokujiTool } from "../../src/tools/get-kokuji.js";
import { searchLaws, getLawData } from "../../src/lib/egov-client.js";
import { parseFullLaw } from "../../src/lib/egov-parser.js";
import {
  findKokujiCandidates,
  searchMlitNotices,
  type KokujiMatch,
} from "../../src/lib/mlit-client.js";
import { extractPdfText } from "../../src/lib/pdf-extractor.js";
import { KokujiRegistry } from "../../src/lib/kokuji-registry.js";
import type { KokujiPreset } from "../../src/lib/types.js";

// Capture the handler registered by the tool
let handler: Function;

const mockServer = {
  registerTool: vi.fn((_name: string, _config: { inputSchema: z.ZodRawShape }, fn: Function) => {
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
    vi.mocked(extractPdfText).mockReset();
    registerGetKokujiTool(mockServer as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers pagination defaults and integer limits without an output schema", () => {
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
    expect(config).not.toHaveProperty("outputSchema");
  });

  it("uses the default page size when pagination inputs are omitted", async () => {
    vi.mocked(findKokujiCandidates).mockResolvedValue([createMatch()]);
    vi.mocked(extractPdfText).mockResolvedValue({ text: "文".repeat(30_001), lastModified: null });

    const result = await handler({ kokuji_name: "テスト告示" });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("offset=30000");
    expect(result).not.toHaveProperty("structuredContent");
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
  });

  it("paginates MLIT text including headers and continues at offset", async () => {
    vi.mocked(findKokujiCandidates).mockResolvedValue([createMatch()]);
    const body = "告示本文".repeat(375);
    vi.mocked(extractPdfText).mockResolvedValue({ text: body, lastModified: null });
    const complete = [
      "【検索結果】テスト告示", "法令番号: 建設省告示第千百号", "", body, "",
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
    expect(first).not.toHaveProperty("structuredContent");
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
});
