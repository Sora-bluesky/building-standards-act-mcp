import { describe, it, expect } from "vitest";
import { findAllMatches } from "../../src/lib/text-find.js";

describe("findAllMatches", () => {
  it("finds non-overlapping matches at the beginning, middle and end", () => {
    expect(findAllMatches("対象・対象・対象", "対象")).toEqual([
      { start: 0, end: 2 }, { start: 3, end: 5 }, { start: 6, end: 8 },
    ]);
    expect(findAllMatches("aaaaa", "aa")).toEqual([{ start: 0, end: 2 }, { start: 2, end: 4 }]);
  });

  it("ignores all whitespace and width differences in both inputs", () => {
    expect(findAllMatches("前（１）非　常\t用\nの 昇降機後", "　(1) 非常用の昇降機\t")).toEqual([
      { start: 1, end: 15 },
    ]);
    expect(findAllMatches("ﾃｽﾄ 1", "テスト　１")).toEqual([{ start: 0, end: 5 }]);
  });

  it("maps NFKC expansions back to the full original character", () => {
    expect(findAllMatches("前㍍後 メートル", "メートル")).toEqual([
      { start: 1, end: 2 }, { start: 4, end: 8 },
    ]);
    expect(findAllMatches("メートル", "㍍")).toEqual([{ start: 0, end: 4 }]);
  });

  it("preserves UTF-16 coordinates around and within surrogate pairs", () => {
    expect(findAllMatches("😀 前１ 😀後１", "1")).toEqual([
      { start: 4, end: 5 }, { start: 9, end: 10 },
    ]);
    expect(findAllMatches("前😀\t１後", "😀1")).toEqual([{ start: 1, end: 5 }]);
    expect(findAllMatches("𠮷 𠮷", "𠮷")).toEqual([{ start: 0, end: 2 }, { start: 3, end: 5 }]);
  });

  it.each(["", " \t\r\n　\u00a0"])("returns no matches for an empty normalized query %j", (query) => {
    expect(findAllMatches("本文", query)).toEqual([]);
  });

  it("returns no matches for absent text or an empty body", () => {
    expect(findAllMatches("本文", "対象")).toEqual([]);
    expect(findAllMatches("", "本文")).toEqual([]);
  });
});
