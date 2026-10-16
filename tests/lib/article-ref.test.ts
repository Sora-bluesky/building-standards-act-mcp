import { describe, expect, it } from "vitest";
import { formatArticleRef, parseArticleRefs } from "../../src/lib/article-ref.js";
import { expandKokujiAliases } from "../../src/data/kokuji-term-aliases.js";

describe("article references", () => {
  it.each([
    ["令46条4項", "建築基準法施行令", "第四十六条第四項"],
    ["施行令第46条第4項", "建築基準法施行令", "第四十六条第四項"],
    ["法第2条第9号", "建築基準法", "第二条第九号"],
    ["令第136条の2の11第1号", "建築基準法施行令", "第百三十六条の二の十一第一号"],
    ["令４６条４項", "建築基準法施行令", "第四十六条第四項"],
    ["第四十六条第四項", undefined, "第四十六条第四項"],
    ["建築基準法施行令 第46条第4項", "建築基準法施行令", "第四十六条第四項"],
    ["道路法第46条第3項", "道路法", "第四十六条第三項"],
    ["規則第10条", "規則", "第十条"],
  ])("parses and formats %s", (text, law, formatted) => {
    const refs = parseArticleRefs(text);
    expect(refs).toHaveLength(1);
    expect(refs[0].law).toBe(law);
    expect(formatArticleRef(refs[0])).toBe(formatted);
    expect(text.slice(refs[0].start, refs[0].end)).toBe(text);
  });

  it.each([
    [2, "二"], [10, "十"], [21, "二十一"], [46, "四十六"],
    [100, "百"], [136, "百三十六"], [1000, "千"], [1100, "千百"],
  ])("formats the numeral %i", (number, kanji) => {
    expect(formatArticleRef(parseArticleRefs(`${number}条`)[0])).toBe(`第${kanji}条`);
  });

  it("preserves kanji numerals and nested branches", () => {
    const [ref] = parseArticleRefs("第百三十六条の二の十一第一号");
    expect(formatArticleRef(ref)).toBe("第百三十六条の二の十一第一号");
  });

  it("finds two references in free text with independent law contexts", () => {
    const text = "令46条4項と法第2条第9号を参照してください";
    const refs = parseArticleRefs(text);
    expect(refs.map(formatArticleRef)).toEqual(["第四十六条第四項", "第二条第九号"]);
    expect(refs.map((ref) => ref.law)).toEqual(["建築基準法施行令", "建築基準法"]);
  });

  it("returns no references for ordinary text", () => {
    expect(parseArticleRefs("壁量について確認する")).toEqual([]);
  });
});

describe("expandKokujiAliases", () => {
  it("preserves the query and appends each target only once", () => {
    expect(expandKokujiAliases("必要壁量と存在壁量の壁量計算"))
      .toBe("必要壁量と存在壁量の壁量計算 令46条4項");
  });

  it("expands the column-dimension family as well as wall quantity", () => {
    expect(expandKokujiAliases("壁量基準と柱の小径"))
      .toBe("壁量基準と柱の小径 令46条4項 令43条1項");
  });

  it("leaves other terms unchanged", () => {
    expect(expandKokujiAliases("構造耐力上必要な軸組等"))
      .toBe("構造耐力上必要な軸組等");
  });
});
