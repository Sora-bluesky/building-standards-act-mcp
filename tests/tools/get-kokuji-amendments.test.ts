import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("../../src/lib/mlit-client.js", () => ({ findKokujiByKey: vi.fn(), findKokujiCandidates: vi.fn() }));
vi.mock("../../src/lib/kokuji-amendments.js", async (original) => ({
  ...await original<typeof import("../../src/lib/kokuji-amendments.js")>(), findAmendmentsFor: vi.fn(), findKokujiKeyByCurrentTitle: vi.fn(),
}));
import { findKokujiByKey, findKokujiCandidates } from "../../src/lib/mlit-client.js";
import { DB_NOTICE, findAmendmentsFor, findKokujiKeyByCurrentTitle, unavailableAmendments } from "../../src/lib/kokuji-amendments.js";
import { registerGetKokujiAmendmentsTool } from "../../src/tools/get-kokuji-amendments.js";
const entry = { title: "耐火構造の構造方法を定める件", document_number: "建設省告示第千三百九十九号", date: "2000-05-30", organization: "国土交通省住宅局", pdf_url: "https://www.mlit.go.jp/body.pdf" };
let handler: Function;
let config: { inputSchema: z.ZodRawShape; outputSchema: z.ZodRawShape };
const server = { registerTool: vi.fn((_name, options, fn) => { config = options; handler = fn; }) };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findKokujiByKey).mockResolvedValue(entry);
  vi.mocked(findKokujiCandidates).mockResolvedValue([{ entry, stage: "exact", matched: [entry.title], score: 1 }]);
  vi.mocked(findAmendmentsFor).mockResolvedValue({ ...unavailableAmendments(), status: "ok" });
  vi.mocked(findKokujiKeyByCurrentTitle).mockReset().mockResolvedValue(null);
  registerGetKokujiAmendmentsTool(server as any);
});
describe("get_kokuji_amendments", () => {
  it.each([{ kokuji_number: "平12建告1399" }, { kokuji_name: entry.title }])("resolves %j and validates structured output", async (params) => {
    const result = await handler(params);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain(`【告示】${entry.title}（平成12年建設省告示第1399号）`);
    expect(result.content[0].text.split(DB_NOTICE)).toHaveLength(2);
    expect(result.structuredContent.text).toBe(result.content[0].text);
    expect(result.structuredContent).toMatchObject({ title: entry.title, kokuji_number: "平成12年建設省告示第1399号", document_number: entry.document_number, housing_bureau: true, amendments: { status: "ok" } });
    expect(z.object(config.outputSchema).safeParse(result.structuredContent).success).toBe(true);
    expect(findAmendmentsFor).toHaveBeenCalledWith({ key: "平成12:建設省:1399", title: entry.title });
    if ("kokuji_number" in params) expect(findKokujiByKey).toHaveBeenCalledWith("平成12:建設省:1399");
    else expect(findKokujiCandidates).toHaveBeenCalledWith(entry.title, 1);
  });
  it.each([{}, { kokuji_number: "平12建告1399", kokuji_name: entry.title }])("validates exactly one input: %j", async (params) => {
    const result = await handler(params);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("どちらか一つだけ指定");
    expect(result.structuredContent.text).toBe(result.content[0].text);
    expect(findAmendmentsFor).not.toHaveBeenCalled();
    expect(z.object(config.outputSchema).safeParse(result.structuredContent).success).toBe(true);
  });
  it("rejects a number without a year", async () => {
    expect((await handler({ kokuji_number: "建設省告示第1399号" })).content[0].text).toContain("年・発出省・番号");
  });
  it("checks a known number even when absent from the DB", async () => {
    vi.mocked(findKokujiByKey).mockResolvedValue(null);
    const result = await handler({ kokuji_number: "平12建告1399" });
    expect(result.structuredContent).toMatchObject({ title: null, housing_bureau: false, document_number: null });
    expect(result.content[0].text).not.toContain(DB_NOTICE);
    expect(findAmendmentsFor).toHaveBeenCalledWith({ key: "平成12:建設省:1399", title: "" });
  });
  it("returns guidance for an unknown name", async () => {
    vi.mocked(findKokujiCandidates).mockResolvedValue([]);
    expect((await handler({ kokuji_name: "未知の告示" })).content[0].text).toContain("該当する告示を確認できませんでした");
  });
  it("reports amendment lookup failure without throwing", async () => {
    vi.mocked(findAmendmentsFor).mockRejectedValue(new Error("offline"));
    const result = await handler({ kokuji_number: "平12建告1399" });
    expect(result.content[0].text).toContain("改正一覧を取得できませんでした");
    expect(result.structuredContent.amendments.status).toBe("unavailable");
  });
  it("resolves the current title of 1100 before fuzzy search", async () => {
    const title = "木造の建築物の軸組の構造方法及び設置の基準を定める件";
    const oldEntry = { ...entry, title: "軸組及び当該軸組に係る倍率の数値", document_number: "建設省告示第千百号", date: "1981-06-01" };
    vi.mocked(findKokujiKeyByCurrentTitle).mockResolvedValue({ key: "昭和56:建設省:1100", title, source_number: "令和7年国土交通省告示第976号" });
    vi.mocked(findKokujiByKey).mockResolvedValue(oldEntry);
    const amendments = { ...unavailableAmendments(), status: "ok" as const, items: [{ number: "令和7年国土交通省告示第976号", title: "軸組等の一部を改正する告示", promulgated_on: "2025-10-28", effective_on: null, effective_note: null, documents: [], matched_by: "pdf" as const }] };
    vi.mocked(findAmendmentsFor).mockResolvedValue(amendments);
    const result = await handler({ kokuji_name: title });
    expect(result.structuredContent).toMatchObject({ title: oldEntry.title, kokuji_number: "昭和56年建設省告示第1100号", amendments });
    expect(result.content[0].text).toContain("令和7年国土交通省告示第976号");
    expect(findKokujiByKey).toHaveBeenCalledWith("昭和56:建設省:1100");
    expect(findKokujiCandidates).not.toHaveBeenCalled();
    expect(findAmendmentsFor).toHaveBeenCalledWith({ key: "昭和56:建設省:1100", title: oldEntry.title });
  });
  it("falls back to fuzzy search when current title lookup rejects", async () => {
    vi.mocked(findKokujiKeyByCurrentTitle).mockRejectedValue(new Error("offline"));
    expect((await handler({ kokuji_name: entry.title })).structuredContent.title).toBe(entry.title);
    expect(findKokujiCandidates).toHaveBeenCalledWith(entry.title, 1);
  });
  it("enforces input lengths", () => {
    const schema = z.object(config.inputSchema);
    expect(schema.safeParse({ kokuji_number: "x".repeat(101) }).success).toBe(false);
    expect(schema.safeParse({ kokuji_name: "x".repeat(201) }).success).toBe(false);
  });
});
