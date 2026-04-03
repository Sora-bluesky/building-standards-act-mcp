import { describe, it, expect, vi, beforeEach } from "vitest";

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
  tool: vi.fn((_name: string, _desc: string, _schema: any, fn: Function) => {
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
    registerCheckLawUpdatesTool(mockServer as any);
  });

  it("registers with correct name", () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      "check_law_updates",
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
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
