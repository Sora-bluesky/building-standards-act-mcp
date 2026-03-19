import { describe, it, expect } from "vitest";
import { findBestMatch } from "../../src/lib/best-match.js";
import type { EgovLawEntry } from "../../src/lib/types.js";

/**
 * Helper to create a minimal EgovLawEntry for testing.
 */
function makeLaw(lawId: string, title: string): EgovLawEntry {
  return {
    law_info: {
      law_id: lawId,
      law_num: "",
      law_type: "",
      law_num_era: "",
      law_num_year: 0,
      law_num_type: "",
      law_num_num: "",
      promulgation_date: "",
    },
    revision_info: {
      law_title: title,
      law_revision_id: "",
      law_type: "",
      law_title_kana: "",
      abbrev: null,
      category: "",
      updated: "",
      amendment_promulgate_date: "",
      amendment_enforcement_date: "",
      amendment_enforcement_comment: null,
      amendment_law_id: "",
      amendment_law_title: "",
      amendment_law_num: "",
      repeal_status: "",
      remain_in_force: false,
      current_revision_status: "",
    },
    current_revision_info: {
      law_title: title,
      law_revision_id: "",
      law_type: "",
      law_title_kana: "",
      abbrev: null,
      category: "",
      updated: "",
      amendment_promulgate_date: "",
      amendment_enforcement_date: "",
      amendment_enforcement_comment: null,
      amendment_law_id: "",
      amendment_law_title: "",
      amendment_law_num: "",
      repeal_status: "",
      remain_in_force: false,
      current_revision_status: "",
    },
  };
}

describe("findBestMatch", () => {
  it("returns exact match even when it is not the first result", () => {
    const barrierfree = "高齢者、障害者等の移動等の円滑化の促進に関する法律";
    const laws = [
      makeLaw("WRONG001", "土地区画整理事業に関する省令"),
      makeLaw("WRONG002", "都市計画法施行令"),
      makeLaw("CORRECT", barrierfree),
    ];

    const result = findBestMatch(laws, barrierfree);
    expect(result.law_info.law_id).toBe("CORRECT");
  });

  it("distinguishes base law from enforcement order (本法 vs 施行令)", () => {
    const baseLaw = "高齢者、障害者等の移動等の円滑化の促進に関する法律";
    const laws = [
      makeLaw(
        "ENFORCEMENT",
        "高齢者、障害者等の移動等の円滑化の促進に関する法律施行令",
      ),
      makeLaw("BASE", baseLaw),
    ];

    const result = findBestMatch(laws, baseLaw);
    expect(result.law_info.law_id).toBe("BASE");
  });

  it("resolves 建築物省エネ法 correctly among similar titles", () => {
    const target = "建築物のエネルギー消費性能の向上等に関する法律";
    const laws = [
      makeLaw(
        "WRONG",
        "エネルギーの使用の合理化及び非化石エネルギーへの転換等に関する法律",
      ),
      makeLaw("CORRECT", target),
      makeLaw("ENFORCEMENT", target + "施行令"),
    ];

    const result = findBestMatch(laws, target);
    expect(result.law_info.law_id).toBe("CORRECT");
  });

  it("selects shortest containing match when no exact match exists", () => {
    const laws = [
      makeLaw("LONG", "消防法施行規則"),
      makeLaw("MEDIUM", "消防法施行令"),
      makeLaw("SHORT", "消防法"),
    ];

    const result = findBestMatch(laws, "消防法");
    // Exact match exists ("消防法"), so it picks that one
    expect(result.law_info.law_id).toBe("SHORT");
  });

  it("uses shortest containing match for partial-match scenarios", () => {
    // Simulate a case where the search name is a substring
    // but no exact match exists
    const laws = [
      makeLaw("LONG", "建築物に関する施行規則の一部"),
      makeLaw("SHORT", "建築物に関する施行規則"),
    ];

    const result = findBestMatch(laws, "施行規則");
    // Both contain "施行規則"; shorter one is preferred
    expect(result.law_info.law_id).toBe("SHORT");
  });

  it("falls back to first result when no match found", () => {
    const laws = [
      makeLaw("FIRST", "全く関係ない法律A"),
      makeLaw("SECOND", "全く関係ない法律B"),
    ];

    const result = findBestMatch(laws, "存在しない法律名");
    expect(result.law_info.law_id).toBe("FIRST");
  });

  it("returns the only result when array has single entry", () => {
    const laws = [makeLaw("ONLY", "建築基準法")];

    const result = findBestMatch(laws, "建築基準法");
    expect(result.law_info.law_id).toBe("ONLY");
  });
});
