import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

vi.mock("../../src/lib/egov-client.js", () => ({
  getLawRevisions: vi.fn(),
  searchLaws: vi.fn(),
  hasSearchCached: vi.fn().mockReturnValue(false),
  hasRevisionsCached: vi.fn().mockReturnValue(false),
}));

vi.mock("../../src/lib/law-resolver.js", () => ({
  resolveLawId: vi.fn(),
}));

import { registerCheckLawUpdatesTool } from "../../src/tools/check-law-updates.js";
import { getLawRevisions } from "../../src/lib/egov-client.js";
import { resolveLawId } from "../../src/lib/law-resolver.js";
import type { EgovRevisionInfo } from "../../src/lib/types.js";

const MOCK_RESOLVED = {
  law_id: "325AC0000000201",
  title: "建築基準法",
  law_num: "昭和二十五年法律第二百一号",
  source: "alias" as const,
};

let handler: Function;

const mockServer = {
  registerTool: vi.fn((_name: string, _config: { inputSchema: z.ZodRawShape }, fn: Function) => {
    handler = fn;
  }),
};

function makeRevision(
  overrides: Partial<EgovRevisionInfo> = {},
): EgovRevisionInfo {
  return {
    law_revision_id: "rev1",
    law_type: "Act",
    law_title: "建築基準法",
    law_title_kana: "けんちくきじゅんほう",
    abbrev: null,
    category: "法律",
    updated: "2026-01-01",
    amendment_promulgate_date: "2025-06-01",
    amendment_enforcement_date: "2025-10-01",
    amendment_enforcement_comment: null,
    amendment_law_id: "508AC0000000099",
    amendment_law_title: "令和七年法律第九十九号",
    amendment_law_num: "令和七年法律第九十九号",
    repeal_status: "",
    remain_in_force: false,
    current_revision_status: "CurrentEnforced",
    ...overrides,
  };
}

describe("check_law_updates tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-16T00:30:00Z"));
    registerCheckLawUpdatesTool(mockServer as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers with correct name", () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      "check_law_updates",
      expect.objectContaining({
        annotations: expect.objectContaining({ readOnlyHint: true }),
      }),
      expect.any(Function),
    );
  });

  it("accepts an optional ISO date and rejects malformed since values", () => {
    const schema = z.object(mockServer.registerTool.mock.calls[0][1].inputSchema);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ since: "2025-01-01", show_history: true }).success).toBe(true);
    for (const since of ["2025-1-01", "2025/01/01", "2025-01-01T00:00:00Z", "", 2025]) {
      expect(schema.safeParse({ since }).success).toBe(false);
    }
  });

  it("returns not found message for unknown law_name", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(null);

    const result = await handler({ law_name: "存在しない法令" });

    expect(result.content[0].text).toContain("見つかりませんでした");
  });

  it("checks a single law by name and returns current", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawRevisions).mockResolvedValue({
      law_info: { law_id: "325AC0000000201" } as any,
      revisions: [makeRevision({ amendment_promulgate_date: "2025-06-01" })],
    });

    const result = await handler({ law_name: "建築基準法" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("法令改正チェック結果");
    expect(result.content[0].text.split("\n")[1]).toBe("- 基準日: 2025-10-16（これより後に公布された改正を「改正あり」として報告）");
    expect(result.content[0].text).toContain("最新: 1件");
    expect(result.content[0].text).toContain("最新改正公布日: 2025-06-01");
    expect(result.content[0].text).toContain("改正法令: 令和七年法律第九十九号");
  });

  it("forwards since to the single-law comparison", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawRevisions).mockResolvedValue({
      law_info: { law_id: "325AC0000000201" } as any,
      revisions: [makeRevision()],
    });
    const result = await handler({ law_name: "建築基準法", since: "2025-01-01" });
    expect(result.content[0].text).toContain("- 基準日: 2025-01-01");
    expect(result.content[0].text).toContain("**改正あり: 1件**");
  });

  it("forwards since to a batch without listing current laws", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawRevisions).mockResolvedValue({
      law_info: { law_id: "325AC0000000201" } as any,
      revisions: [makeRevision()],
    });
    const result = await handler({ group: "11章", since: "2025-06-01" });
    expect(result.content[0].text).toContain("- 基準日: 2025-06-01");
    expect(result.content[0].text).toContain("最新: 3件");
    expect(result.content[0].text).not.toContain("最新改正公布日");
    expect(result.content[0].text).not.toContain("建築基準法");
  });

  it("detects law with revisions", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawRevisions).mockResolvedValue({
      law_info: { law_id: "325AC0000000201" } as any,
      revisions: [makeRevision({ amendment_promulgate_date: "2026-04-01" })],
    });

    const result = await handler({ law_name: "建築基準法" });

    expect(result.content[0].text).toContain("改正あり");
    expect(result.content[0].text).toContain("2026-04-01");
  });

  it("shows revision history when show_history is true", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawRevisions).mockResolvedValue({
      law_info: { law_id: "325AC0000000201" } as any,
      revisions: [
        makeRevision({ amendment_promulgate_date: "2025-06-01" }),
        makeRevision({
          law_revision_id: "rev0",
          amendment_promulgate_date: "2024-04-01",
        }),
      ],
    });

    const result = await handler({
      law_name: "建築基準法",
      show_history: true,
      since: "2026-01-01",
    });

    expect(result.content[0].text).toContain("改正履歴");
    expect(result.content[0].text).toContain("リビジョン一覧");
    expect(result.content[0].text).toContain("2025-06-01");
    expect(result.content[0].text).toContain("2024-04-01");
  });

  it("checks group aliases in batch", async () => {
    // resolveLawId will be called for each alias in the group
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawRevisions).mockResolvedValue({
      law_info: { law_id: "TEST" } as any,
      revisions: [makeRevision({ amendment_promulgate_date: "" })],
    });

    // Use chapter 11 (smallest group: 3 aliases)
    const result = await handler({ group: "11章" });

    expect(result.content[0].text).toContain("チェック対象: 3件");
    expect(result.content[0].text).toContain("最新: 3件");
  });

  it("returns message for non-existent group", async () => {
    const result = await handler({ group: "99章" });

    expect(result.content[0].text).toContain("見つかりませんでした");
  });

  it("returns error response on unexpected exception", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    // Force an error by mocking getLawRevisions to throw for a specific call
    vi.mocked(getLawRevisions).mockRejectedValue(new Error("network failure"));

    const result = await handler({ law_name: "建築基準法" });

    // The tool catches errors at the individual law level, so it won't be isError
    expect(result.content[0].text).toContain("エラー");
  });

  it("detects repealed law", async () => {
    vi.mocked(resolveLawId).mockResolvedValue(MOCK_RESOLVED);
    vi.mocked(getLawRevisions).mockResolvedValue({
      law_info: { law_id: "325AC0000000201" } as any,
      revisions: [
        makeRevision({
          repeal_status: "Repealed",
          amendment_promulgate_date: "2026-04-01",
        }),
      ],
    });

    const result = await handler({ law_name: "建築基準法" });

    expect(result.content[0].text).toContain("廃止検出");
  });
});
