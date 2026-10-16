import { describe, expect, it } from "vitest";
import { extractLatestAmendment } from "../../src/lib/kokuji-amendment.js";

const NOTICE_1100_TEXT = "○建築基準法施行令第四十六条第四項表一（一）項から（七）項までに掲げる軸組と同等以上の耐力を有する軸組及び当該軸組に係る倍率の数値（昭和五十六年六月一日）（建設省告示第千百号）改正 昭和六二年一一月一四日建設省告示 第一九二六号平成 二年一一月二六日同 第一八九七号同 八年一一月一八日同 第二〇八八号同 一二年一二月二六日同 第二四六五号同 一五年一二月 九日国土交通省告示第一五四三号同 一六年 九月二九日同 第一一七一号同 一九年 五月一八日同 第 六一五号同 二八年 六月 一日同 第 七九六号建築基準法施行令（昭和二十五年政令第三百三十八号）第四十六条第四項表一（八）項の規定に基づき、告示する。";

describe("extractLatestAmendment", () => {
  it("extracts the final amendment from the Notice 1100 header", () => {
    expect(extractLatestAmendment(NOTICE_1100_TEXT))
      .toBe("平成二八年六月一日国土交通省告示第七九六号");
  });

  it("preserves a single explicit amendment without changing kanji numerals", () => {
    const amendment = "令和六年五月三十一日国土交通省告示第四百四十七号";
    expect(extractLatestAmendment(`告示の題名 改正 ${amendment}`)).toBe(amendment);
  });

  it("returns null without an amendment header", () => {
    expect(extractLatestAmendment("建築基準法施行令の規定に基づき、告示する。"))
      .toBeNull();
  });

  it("resolves the latest era and ministry after a ministry switch", () => {
    const text = "改正 昭和六二年一一月一四日建設省告示第一九二六号平成一五年一二月九日国土交通省告示第一五四三号同一六年九月二九日同第一一七一号";
    expect(extractLatestAmendment(text))
      .toBe("平成一六年九月二九日国土交通省告示第一一七一号");
  });

  it("inherits omitted era and ministry and preserves spaced Arabic numerals", () => {
    expect(extractLatestAmendment("改正 令和 6 年 5 月 31 日 国土交通省告示 第 4 4 7 号 7 年 4 月 1 日 第 5 0 0 号"))
      .toBe("令和7年4月1日国土交通省告示第500号");
  });

  it.each([
    "建築基準法施行令（昭和二十五年政令第三百三十八号）",
    "建築基準法（昭和二十五年法律第二百一号）",
    "の規定に基づき",
    "\n",
    " \r\n",
  ])("ignores body dates after the header boundary %j", (boundary) => {
    const amendment = "平成二八年六月一日国土交通省告示第七九六号";
    const body = "令和六年五月三十一日国土交通省告示第四百四十七号";
    expect(extractLatestAmendment(`改正 ${amendment}${boundary}${body}`))
      .toBe(amendment);
  });

  it("does not scan beyond the first 1500 characters", () => {
    const amendment = "改正 令和六年五月三十一日国土交通省告示第四百四十七号";
    expect(extractLatestAmendment("文".repeat(1500) + amendment)).toBeNull();
    expect(extractLatestAmendment("文".repeat(1490) + amendment)).toBeNull();
  });

  it("returns null for an empty or unresolved header", () => {
    expect(extractLatestAmendment("改正 建築基準法（昭和二十五年法律第二百一号）"))
      .toBeNull();
    expect(extractLatestAmendment("改正 同六年五月三十一日同第四百四十七号"))
      .toBeNull();
  });
});
