import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock external dependencies BEFORE importing the tool module
vi.mock("../../src/lib/egov-client.js", () => ({
  getLawData: vi.fn(),
  searchLaws: vi.fn(),
}));

import { registerValidatePresetsTool } from "../../src/tools/validate-presets.js";
import { searchLaws } from "../../src/lib/egov-client.js";

// Capture the handler registered by the tool
let handler: Function;

const mockServer = {
  tool: vi.fn((_name: string, _desc: string, _schema: any, fn: Function) => {
    handler = fn;
  }),
};

/**
 * Build a mock e-Gov API search response.
 * When law_id is provided, the result includes a matching law entry.
 * When law_id is null, an empty result set is returned (no match).
 */
function buildSearchResponse(law_id: string | null) {
  if (!law_id) {
    return { total_count: 0, count: 0, laws: [] };
  }
  return {
    total_count: 1,
    count: 1,
    laws: [
      {
        law_info: {
          law_type: "Act",
          law_id,
          law_num: "num",
          law_num_era: "Showa",
          law_num_year: 25,
          law_num_type: "Act",
          law_num_num: "201",
          promulgation_date: "1950-05-24",
        },
        revision_info: {
          law_revision_id: "rev1",
          law_type: "Act",
          law_title: "dummy",
          law_title_kana: "dummy",
          abbrev: null,
          category: "category",
          updated: "2024-01-01",
        },
        current_revision_info: {
          law_revision_id: "rev1",
          law_type: "Act",
          law_title: "dummy",
          law_title_kana: "dummy",
          abbrev: null,
          category: "category",
          updated: "2024-01-01",
        },
      },
    ],
  };
}

// Known chapter-1 preset law_ids (from chapter-01-general.ts)
const CHAPTER_1_LAW_IDS: Record<string, string> = {
  建築基準法: "325AC0000000201",
  建築基準法施行令: "325CO0000000338",
  建築基準法施行規則: "325M50004000040",
};

describe("validate_presets tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerValidatePresetsTool(mockServer as any);
  });

  it("registers with correct name", () => {
    expect(mockServer.tool).toHaveBeenCalledWith(
      "validate_presets",
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    );
  });

  // Each test uses a DIFFERENT group to avoid module-level cache collisions.
  // The validationCache is module-scoped and persists across tests.

  it("returns all presets as valid when API matches every law_id", async () => {
    // Mock: return the correct law_id for known chapter-1 presets
    vi.mocked(searchLaws).mockImplementation(async (title: string) => {
      const law_id = CHAPTER_1_LAW_IDS[title] ?? "UNKNOWN";
      return {
        total_count: 1,
        count: 1,
        laws: [
          {
            law_info: { law_type: "Act", law_id, law_num: "num" },
            revision_info: {
              law_revision_id: "rev1",
              law_type: "Act",
              law_title: title,
            },
            current_revision_info: {
              law_revision_id: "rev1",
              law_type: "Act",
              law_title: title,
            },
          },
        ],
      } as any;
    });

    const result = await handler({ group: "1章" });

    expect(result.isError).toBeUndefined();

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty("total");
    expect(parsed).toHaveProperty("valid");
    expect(parsed).toHaveProperty("invalid");
    expect(parsed).toHaveProperty("cached");
    expect(parsed).toHaveProperty("validated_at");
    expect(parsed).toHaveProperty("results");
    expect(Array.isArray(parsed.results)).toBe(true);

    // The 3 known chapter-1 presets should be valid
    const validResults = parsed.results.filter(
      (r: any) => r.status === "valid",
    );
    expect(validResults.length).toBeGreaterThanOrEqual(3);
    expect(parsed.valid).toBe(validResults.length);
    expect(parsed.cached).toBe(false);
  });

  it("marks presets as not_found when API returns no matching law_id", async () => {
    // Return empty results for every search — no law_id will match
    vi.mocked(searchLaws).mockResolvedValue(buildSearchResponse(null) as any);

    // Use a different group (2章) to avoid hitting the cache from the previous test
    const result = await handler({ group: "2章" });

    expect(result.isError).toBeUndefined();

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total).toBeGreaterThan(0);
    expect(parsed.valid).toBe(0);
    expect(parsed.invalid).toBe(parsed.total);

    // Every result should be not_found
    for (const entry of parsed.results) {
      expect(entry.status).toBe("not_found");
    }
  });

  it("filters presets by group parameter", async () => {
    vi.mocked(searchLaws).mockResolvedValue(buildSearchResponse(null) as any);

    // Use chapter 11 (3 presets) — smallest group for fast execution
    const result11 = await handler({ group: "11章" });
    const parsed11 = JSON.parse(result11.content[0].text);

    // Chapter 11 has exactly 3 presets
    expect(parsed11.total).toBe(3);

    // searchLaws should be called once per preset in the filtered group
    expect(vi.mocked(searchLaws)).toHaveBeenCalledTimes(3);

    // All results should have title and law_id fields
    for (const entry of parsed11.results) {
      expect(entry).toHaveProperty("title");
      expect(entry).toHaveProperty("law_id");
      expect(entry).toHaveProperty("status");
    }
  });

  it("returns empty message when group has no matching presets", async () => {
    const result = await handler({ group: "存在しないグループ" });

    expect(result.content[0].text).toContain("見つかりませんでした");
    expect(searchLaws).not.toHaveBeenCalled();
  });
});

// Cache test uses a group not used above (5章) to ensure a fresh cache key.
describe("validate_presets tool — cache behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerValidatePresetsTool(mockServer as any);
  });

  it("returns cached result on second call without additional API calls", async () => {
    vi.mocked(searchLaws).mockResolvedValue(buildSearchResponse(null) as any);

    // First call — populates cache
    const firstResult = await handler({ group: "5章" });
    const firstParsed = JSON.parse(firstResult.content[0].text);
    expect(firstParsed.cached).toBe(false);

    const callCountAfterFirst = vi.mocked(searchLaws).mock.calls.length;
    expect(callCountAfterFirst).toBeGreaterThan(0);

    // Second call — should come from cache
    const secondResult = await handler({ group: "5章" });
    const secondParsed = JSON.parse(secondResult.content[0].text);
    expect(secondParsed.cached).toBe(true);

    // No additional API calls should have been made
    expect(vi.mocked(searchLaws).mock.calls.length).toBe(callCountAfterFirst);
  });
});
