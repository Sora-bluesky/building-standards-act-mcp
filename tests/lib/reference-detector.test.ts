import { describe, it, expect } from "vitest";
import { detectReferences } from "../../src/lib/reference-detector.js";

describe("reference-detector", () => {
  describe("detectReferences", () => {
    // ── same_law ──────────────────────────────────────

    describe("same_law", () => {
      it("detects 「第20条」", () => {
        const refs = detectReferences("第20条の規定による。");
        expect(refs).toHaveLength(1);
        expect(refs[0].ref_type).toBe("same_law");
        expect(refs[0].raw_text).toBe("第20条");
        expect(refs[0].target_article).toBe("20");
      });

      it("detects 「第6条の2」 (branch article number)", () => {
        const refs = detectReferences("第6条の2に規定する建築物");
        expect(refs).toHaveLength(1);
        expect(refs[0].ref_type).toBe("same_law");
        expect(refs[0].raw_text).toBe("第6条の2");
        expect(refs[0].target_article).toBe("6");
      });

      it("detects 「第6条第1項」 (article + paragraph)", () => {
        const refs = detectReferences("第6条第1項に規定する");
        expect(refs).toHaveLength(1);
        expect(refs[0].ref_type).toBe("same_law");
        expect(refs[0].target_article).toBe("6");
        expect(refs[0].target_paragraph).toBe("1");
      });

      it("detects 「第27条第1項第一号」 (article + paragraph + item)", () => {
        const refs = detectReferences("第27条第1項第一号に掲げる建築物");
        expect(refs).toHaveLength(1);
        expect(refs[0].ref_type).toBe("same_law");
        expect(refs[0].target_article).toBe("27");
        expect(refs[0].target_paragraph).toBe("1");
        expect(refs[0].target_item).toBe("一");
      });

      it("detects kanji article number 「第六条」", () => {
        const refs = detectReferences("第六条の規定に従い");
        expect(refs).toHaveLength(1);
        expect(refs[0].ref_type).toBe("same_law");
        expect(refs[0].target_article).toBe("六");
      });

      it("detects multiple same_law references", () => {
        const refs = detectReferences(
          "第20条、第21条及び第22条の規定を適用する。",
        );
        const sameLaw = refs.filter((r) => r.ref_type === "same_law");
        expect(sameLaw).toHaveLength(3);
        expect(sameLaw[0].target_article).toBe("20");
        expect(sameLaw[1].target_article).toBe("21");
        expect(sameLaw[2].target_article).toBe("22");
      });
    });

    // ── cross_law ──────────────────────────────────────

    describe("cross_law", () => {
      it("detects 「建築基準法施行令第36条」", () => {
        const refs = detectReferences(
          "建築基準法施行令第36条に規定する構造計算",
        );
        const crossLaw = refs.filter((r) => r.ref_type === "cross_law");
        expect(crossLaw).toHaveLength(1);
        expect(crossLaw[0].target_law).toBe("建築基準法施行令");
        expect(crossLaw[0].target_article).toBe("36");
      });

      it("detects 「消防法第17条」", () => {
        const refs = detectReferences("消防法第17条の規定により");
        const crossLaw = refs.filter((r) => r.ref_type === "cross_law");
        expect(crossLaw).toHaveLength(1);
        expect(crossLaw[0].target_law).toBe("消防法");
        expect(crossLaw[0].target_article).toBe("17");
      });

      it("detects 「都市計画法第29条第1項」", () => {
        const refs = detectReferences("都市計画法第29条第1項の許可");
        const crossLaw = refs.filter((r) => r.ref_type === "cross_law");
        expect(crossLaw).toHaveLength(1);
        expect(crossLaw[0].target_law).toBe("都市計画法");
        expect(crossLaw[0].target_article).toBe("29");
        expect(crossLaw[0].target_paragraph).toBe("1");
      });

      it("detects law with 施行規則 suffix", () => {
        const refs = detectReferences("建築基準法施行規則第1条の3に定める");
        const crossLaw = refs.filter((r) => r.ref_type === "cross_law");
        expect(crossLaw).toHaveLength(1);
        expect(crossLaw[0].target_law).toBe("建築基準法施行規則");
      });

      it("does not double-detect cross_law as same_law", () => {
        const refs = detectReferences("消防法第17条の規定");
        const sameLaw = refs.filter((r) => r.ref_type === "same_law");
        expect(sameLaw).toHaveLength(0);
      });
    });

    // ── relative ──────────────────────────────────────

    describe("relative", () => {
      it("detects 「前条」", () => {
        const refs = detectReferences("前条の規定にかかわらず");
        expect(
          refs.some((r) => r.ref_type === "relative" && r.raw_text === "前条"),
        ).toBe(true);
      });

      it("detects 「次条」", () => {
        const refs = detectReferences("次条に定める場合");
        expect(
          refs.some((r) => r.ref_type === "relative" && r.raw_text === "次条"),
        ).toBe(true);
      });

      it("detects 「前項」", () => {
        const refs = detectReferences("前項の規定にかかわらず");
        expect(
          refs.some((r) => r.ref_type === "relative" && r.raw_text === "前項"),
        ).toBe(true);
      });

      it("detects 「同条」「同項」「同号」", () => {
        const refs = detectReferences("同条同項同号の規定");
        const relative = refs.filter((r) => r.ref_type === "relative");
        expect(relative).toHaveLength(3);
        expect(relative.map((r) => r.raw_text)).toEqual([
          "同条",
          "同項",
          "同号",
        ]);
      });

      it("detects 「前各号」", () => {
        const refs = detectReferences("前各号に掲げるもののほか");
        expect(
          refs.some(
            (r) => r.ref_type === "relative" && r.raw_text === "前各号",
          ),
        ).toBe(true);
      });
    });

    // ── delegation ──────────────────────────────────────

    describe("delegation", () => {
      it("detects 「政令で定める」", () => {
        const refs = detectReferences("政令で定める基準に適合する");
        expect(
          refs.some(
            (r) => r.ref_type === "delegation" && r.raw_text === "政令で定める",
          ),
        ).toBe(true);
      });

      it("detects 「国土交通省令で定める」", () => {
        const refs = detectReferences("国土交通省令で定める方法により");
        expect(refs.some((r) => r.ref_type === "delegation")).toBe(true);
      });

      it("detects 「国土交通大臣が定める」", () => {
        const refs = detectReferences("国土交通大臣が定める構造方法");
        expect(refs.some((r) => r.ref_type === "delegation")).toBe(true);
      });

      it("detects 「条例で定める」", () => {
        const refs = detectReferences("条例で定めることができる");
        expect(refs.some((r) => r.ref_type === "delegation")).toBe(true);
      });

      it("detects past tense 「政令で定めた」", () => {
        const refs = detectReferences("政令で定めた事項");
        expect(refs.some((r) => r.ref_type === "delegation")).toBe(true);
      });
    });

    // ── false positive prevention ──────────────────────

    describe("false positive prevention", () => {
      it("excludes law numbers: 「昭和二十五年法律第二百一号」", () => {
        const refs = detectReferences("昭和二十五年法律第二百一号に基づく");
        // Should not detect 「第二百一号」 as a reference
        const sameLaw = refs.filter((r) => r.ref_type === "same_law");
        expect(sameLaw).toHaveLength(0);
      });

      it("excludes law numbers: 「平成十二年政令第三百三十八号」", () => {
        const refs = detectReferences("平成十二年政令第三百三十八号の規定");
        const sameLaw = refs.filter((r) => r.ref_type === "same_law");
        expect(sameLaw).toHaveLength(0);
      });

      it("excludes zone names: 「第一種低層住居専用地域」", () => {
        const refs = detectReferences("第一種低層住居専用地域内においては");
        const sameLaw = refs.filter((r) => r.ref_type === "same_law");
        expect(sameLaw).toHaveLength(0);
      });

      it("excludes zone names: 「第二種中高層住居専用地域」", () => {
        const refs = detectReferences("第二種中高層住居専用地域の建築物");
        const sameLaw = refs.filter((r) => r.ref_type === "same_law");
        expect(sameLaw).toHaveLength(0);
      });

      it("excludes ordinals: 「第3回」", () => {
        const refs = detectReferences("第3回検査を実施する");
        const sameLaw = refs.filter((r) => r.ref_type === "same_law");
        expect(sameLaw).toHaveLength(0);
      });

      it("excludes table references: 「別表第一」", () => {
        const refs = detectReferences("別表第一に掲げる用途");
        const sameLaw = refs.filter((r) => r.ref_type === "same_law");
        expect(sameLaw).toHaveLength(0);
      });

      it("excludes form references: 「第一号様式」", () => {
        const refs = detectReferences("第一号様式により提出する");
        const sameLaw = refs.filter((r) => r.ref_type === "same_law");
        expect(sameLaw).toHaveLength(0);
      });
    });

    // ── edge cases ──────────────────────────────────────

    describe("edge cases", () => {
      it("returns empty array for empty string", () => {
        expect(detectReferences("")).toEqual([]);
      });

      it("returns empty array for text with no references", () => {
        const refs = detectReferences(
          "この法律は、建築物の敷地、構造、設備及び用途に関する最低の基準を定める。",
        );
        expect(refs).toEqual([]);
      });

      it("handles mixed patterns in realistic article text", () => {
        const text =
          "建築基準法施行令第36条に規定する構造計算によつて、第20条第1項の規定に適合することを確かめなければならない。ただし、前項の規定により国土交通大臣が定める基準に適合する場合は、この限りでない。";
        const refs = detectReferences(text);
        expect(refs.length).toBeGreaterThanOrEqual(4);

        const types = refs.map((r) => r.ref_type);
        expect(types).toContain("cross_law");
        expect(types).toContain("same_law");
        expect(types).toContain("relative");
        expect(types).toContain("delegation");
      });

      it("correctly separates cross_law and same_law in same text", () => {
        const text = "消防法第17条及び第20条の規定";
        const refs = detectReferences(text);
        const crossLaw = refs.filter((r) => r.ref_type === "cross_law");
        const sameLaw = refs.filter((r) => r.ref_type === "same_law");
        expect(crossLaw).toHaveLength(1);
        expect(crossLaw[0].target_law).toBe("消防法");
        expect(sameLaw).toHaveLength(1);
        expect(sameLaw[0].target_article).toBe("20");
      });
    });
  });
});
