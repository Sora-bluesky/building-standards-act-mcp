import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/egov-client.js", () => ({
  getLawRevisions: vi.fn(),
  hasRevisionsCached: vi.fn().mockReturnValue(false),
}));

import {
  checkLawUpdate,
  checkLawUpdates,
  getLawRevisionHistory,
  mapWithConcurrency,
} from "../../src/lib/revision-tracker.js";
import { getLawRevisions } from "../../src/lib/egov-client.js";
import type { ResolvedLaw, EgovRevisionInfo } from "../../src/lib/types.js";

function makeResolved(overrides: Partial<ResolvedLaw> = {}): ResolvedLaw {
  return {
    law_id: "325AC0000000201",
    title: "建築基準法",
    law_num: "昭和二十五年法律第二百一号",
    source: "alias",
    ...overrides,
  };
}

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

describe("revision-tracker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkLawUpdate", () => {
    it("returns has_revisions when amendment date exists", async () => {
      vi.mocked(getLawRevisions).mockResolvedValue({
        law_info: { law_id: "325AC0000000201" } as any,
        revisions: [makeRevision({ amendment_promulgate_date: "2025-06-01" })],
      });

      const result = await checkLawUpdate(makeResolved());

      expect(result.status).toBe("has_revisions");
      expect(result.title).toBe("建築基準法");
      expect(result.latest_amendment_date).toBe("2025-06-01");
    });

    it("returns has_revisions with latest amendment law info", async () => {
      vi.mocked(getLawRevisions).mockResolvedValue({
        law_info: { law_id: "325AC0000000201" } as any,
        revisions: [makeRevision({ amendment_promulgate_date: "2026-04-01" })],
      });

      const result = await checkLawUpdate(makeResolved());

      expect(result.status).toBe("has_revisions");
      expect(result.latest_amendment_date).toBe("2026-04-01");
      expect(result.latest_amendment_law).toBe("令和七年法律第九十九号");
    });

    it("returns repealed when repeal_status is set", async () => {
      vi.mocked(getLawRevisions).mockResolvedValue({
        law_info: { law_id: "325AC0000000201" } as any,
        revisions: [
          makeRevision({
            repeal_status: "Repealed",
            amendment_promulgate_date: "2026-04-01",
          }),
        ],
      });

      const result = await checkLawUpdate(makeResolved());

      expect(result.status).toBe("repealed");
    });

    it("returns has_revisions when repeal_status is 'none'", async () => {
      vi.mocked(getLawRevisions).mockResolvedValue({
        law_info: { law_id: "325AC0000000201" } as any,
        revisions: [
          makeRevision({
            repeal_status: "none",
            amendment_promulgate_date: "2025-01-01",
          }),
        ],
      });

      const result = await checkLawUpdate(makeResolved());

      expect(result.status).toBe("has_revisions");
    });

    it("returns current when revisions is empty", async () => {
      vi.mocked(getLawRevisions).mockResolvedValue({
        law_info: { law_id: "325AC0000000201" } as any,
        revisions: [],
      });

      const result = await checkLawUpdate(makeResolved());

      expect(result.status).toBe("current");
    });

    it("returns error when API call fails", async () => {
      vi.mocked(getLawRevisions).mockRejectedValue(
        new Error("API connection failed"),
      );

      const result = await checkLawUpdate(makeResolved());

      expect(result.status).toBe("error");
      expect(result.error_message).toContain("API connection failed");
    });

    it("returns current when amendment_promulgate_date is empty", async () => {
      vi.mocked(getLawRevisions).mockResolvedValue({
        law_info: { law_id: "325AC0000000201" } as any,
        revisions: [makeRevision({ amendment_promulgate_date: "" })],
      });

      const result = await checkLawUpdate(makeResolved());

      expect(result.status).toBe("current");
    });

    it("uses amendment_law_num as fallback when amendment_law_title is empty", async () => {
      vi.mocked(getLawRevisions).mockResolvedValue({
        law_info: { law_id: "325AC0000000201" } as any,
        revisions: [
          makeRevision({
            amendment_promulgate_date: "2026-04-01",
            amendment_law_title: "",
            amendment_law_num: "令和八年法律第一号",
          }),
        ],
      });

      const result = await checkLawUpdate(makeResolved());

      expect(result.status).toBe("has_revisions");
      expect(result.latest_amendment_law).toBe("令和八年法律第一号");
    });
  });

  describe("checkLawUpdates", () => {
    it("checks multiple resolved laws with rate limiting", async () => {
      vi.mocked(getLawRevisions).mockResolvedValue({
        law_info: { law_id: "325AC0000000201" } as any,
        revisions: [makeRevision({ amendment_promulgate_date: "2025-01-01" })],
      });

      const resolvedLaws = [
        makeResolved({ law_id: "AAA", title: "法A" }),
        makeResolved({ law_id: "BBB", title: "法B" }),
      ];

      const results = await checkLawUpdates(resolvedLaws);

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe("法A");
      expect(results[1].title).toBe("法B");
      expect(getLawRevisions).toHaveBeenCalledTimes(2);
    });
  });

  describe("mapWithConcurrency", () => {
    it("preserves result ordering", async () => {
      const items = [10, 20, 30];
      const results = await mapWithConcurrency(items, async (n) => n * 2, 2);
      expect(results).toEqual([20, 40, 60]);
    });

    it("respects concurrency limit", async () => {
      let running = 0;
      let maxRunning = 0;

      const items = Array.from({ length: 10 }, (_, i) => i);
      await mapWithConcurrency(
        items,
        async (n) => {
          running++;
          maxRunning = Math.max(maxRunning, running);
          await new Promise((r) => setTimeout(r, 10));
          running--;
          return n;
        },
        3,
      );

      expect(maxRunning).toBeLessThanOrEqual(3);
    });

    it("works with empty array", async () => {
      const results = await mapWithConcurrency([], async (n: number) => n, 5);
      expect(results).toEqual([]);
    });
  });

  describe("getLawRevisionHistory", () => {
    it("returns revisions array in the result", async () => {
      const revisions = [
        makeRevision({ amendment_promulgate_date: "2025-06-01" }),
        makeRevision({
          law_revision_id: "rev0",
          amendment_promulgate_date: "2024-04-01",
        }),
      ];

      vi.mocked(getLawRevisions).mockResolvedValue({
        law_info: { law_id: "325AC0000000201" } as any,
        revisions,
      });

      const result = await getLawRevisionHistory(makeResolved());

      expect(result.revisions).toBeDefined();
      expect(result.revisions).toHaveLength(2);
      expect(result.status).toBe("has_revisions");
    });

    it("returns error status on API failure", async () => {
      vi.mocked(getLawRevisions).mockRejectedValue(new Error("timeout"));

      const result = await getLawRevisionHistory(makeResolved());

      expect(result.status).toBe("error");
      expect(result.error_message).toContain("timeout");
    });
  });
});
