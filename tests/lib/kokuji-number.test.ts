import { describe, expect, it } from "vitest";
import { formatKokujiNumber, kanjiNumeralToNumber, kokujiKey, kokujiNumberFromDbEntry, parseKokujiNumber, stripKokujiCitations } from "../../src/lib/kokuji-number.js";

describe("kokuji numbers", () => {
  it.each([
    ["平成28年国土交通省告示第696号", " "],
    ["平成二十八年国土交通省告示第六百九十六号", " "],
    ["平成２８年国土交通省告示第６９６号", " "],
    ["平成十二年建こう設省告示第千三百九十九号", " "],
    ["令和元年国土交通省・環きょう境省告示第二号", " "],
    ["国土交通省・環きょう境省告示第二号", " "],
    ["告示第６９６号", " "],
    ["平成二十八年四月二十二日", " "],
    ["昭和56年 令和元年五月", "   "],
    ["平成28年4月22日国土交通省告示第696号", " "],
    ["特別避難階段（平成28年国土交通省告示第696号）の構造方法", "特別避難階段( )の構造方法"],
    ["平成28年国土交通省告示第696号・平成12年建設省告示第1399号", " ・ "],
    ["特別避難階段の構造方法", "特別避難階段の構造方法"],
  ])("strips citation boilerplate from %s", (input, expected) => {
    expect(stripKokujiCitations(input)).toBe(expected);
  });

  it.each([
    ["千三百九十九", 1399], ["二百", 200], ["千百", 1100], ["一四〇〇", 1400],
    ["１２３", 123], ["123", 123], ["元", 1], ["〇", 0], ["十", 10],
    ["", null], ["一万", null], ["abc", null], ["十百", null],
  ])("converts %s", (input, expected) => expect(kanjiNumeralToNumber(input as string)).toBe(expected));

  it.each(["平成十二年建設省告示第千三百九十九号", "平成12年建設省告示第1399号", "平12建告1399"])("canonicalizes %s", (text) => {
    expect(parseKokujiNumber(text)).toEqual({ era: "平成", eraYear: 12, year: 2000, issuer: "建設省", number: 1399 });
    expect(kokujiKey(parseKokujiNumber(text)!)).toBe("平成12:建設省:1399");
  });
  it.each([
    ["令和５年国土交通省告示第207号", 2023, "国土交通省", 207],
    ["令5国交告207", 2023, "国土交通省", 207], ["昭56建告1100", 1981, "建設省", 1100],
    ["令和元年厚生労働省・国土交通省・環境省告示第2号", 2019, "厚生労働省・国土交通省・環境省", 2],
    ["平成十二年建こう設省告示第千四百十七号", 2000, "建設省", 1417],
    ["平成三十年十月厚生労働省・国土交通省・環境省告示第一号", 2018, "厚生労働省・国土交通省・環境省", 1],
  ])("parses %s", (text, year, issuer, number) => expect(parseKokujiNumber(text as string)).toMatchObject({ year, issuer, number }));
  it.each(["建設省告示第1399号", "国住指第123号", "令和0年国土交通省告示第1号", "令和5年国土交通省告示第0号", "平成17年国土交通省告示第359号及び平成26年国土交通省告示第1203号"])("rejects %s", (text) => expect(parseKokujiNumber(text)).toBeNull());
  it("uses the DB date only when the document has no era year", () => {
    expect(kokujiNumberFromDbEntry({ document_number: "建設省告示第千三百九十九号", date: "2000-05-30" })).toEqual({ era: "平成", eraYear: 12, year: 2000, issuer: "建設省", number: 1399 });
    expect(kokujiNumberFromDbEntry({ document_number: "平成12年建設省告示第1399号", date: "2017-01-01" })?.year).toBe(2000);
    expect(kokujiNumberFromDbEntry({ document_number: "国住指第123号", date: "2000-05-30" })).toBeNull();
    expect(kokujiNumberFromDbEntry({ document_number: "国土交通省告示第１２３号", date: "2019-01-01" })?.year).toBe(2019);
    expect(kokujiNumberFromDbEntry({ document_number: "建設省告示第1399号", date: "" })).toBeNull();
  });
  it.each([
    ["1989-01-07", "昭和64"], ["1989-01-08", "平成1"],
    ["2019-04-30", "平成31"], ["2019-05-01", "令和1"],
  ])("derives the era from the full DB date: %s", (date, eraKey) => {
    const number = kokujiNumberFromDbEntry({ document_number: "国土交通省告示第193号", date });
    expect(kokujiKey(number!)).toBe(`${eraKey}:国土交通省:193`);
  });
  it("keeps the two 2019 notice numbering sequences distinct", () => {
    const heisei = parseKokujiNumber("平成31年国土交通省告示第193号")!;
    const reiwa = parseKokujiNumber("令和元年国土交通省告示第193号")!;
    expect(heisei.year).toBe(reiwa.year);
    expect(kokujiKey(heisei)).toBe("平成31:国土交通省:193");
    expect(kokujiKey(reiwa)).toBe("令和1:国土交通省:193");
    expect(formatKokujiNumber(heisei)).toBe("平成31年国土交通省告示第193号");
    expect(formatKokujiNumber(reiwa)).toBe("令和元年国土交通省告示第193号");
  });
  it.each(["平成12年", "昭和56年", "令和7年", "平成元年", "昭和元年", "令和元年"])("formats the original era: %s", (display) => {
    expect(formatKokujiNumber(parseKokujiNumber(`${display}建設省告示第1399号`)!)).toBe(`${display}建設省告示第1399号`);
  });
});
