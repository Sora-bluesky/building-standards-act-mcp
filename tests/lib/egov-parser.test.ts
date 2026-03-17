import { describe, it, expect } from "vitest";
import {
  parseArticle,
  parseAllArticles,
  parseFullLaw,
} from "../../src/lib/egov-parser.js";
import type { LawNode } from "../../src/lib/types.js";

// Minimal test law tree mimicking e-Gov API response format
const TEST_LAW_TREE: LawNode = {
  tag: "Law",
  attr: { Era: "Showa", Year: "25", Lang: "ja" },
  children: [
    { tag: "LawNum", children: ["昭和二十五年法律第二百一号"] },
    {
      tag: "LawBody",
      children: [
        { tag: "LawTitle", children: ["テスト法"] },
        {
          tag: "MainProvision",
          children: [
            {
              tag: "Chapter",
              attr: { Num: "1" },
              children: [
                { tag: "ChapterTitle", children: ["第一章　総則"] },
                {
                  tag: "Article",
                  attr: { Num: "1" },
                  children: [
                    { tag: "ArticleCaption", children: ["（目的）"] },
                    { tag: "ArticleTitle", children: ["第一条"] },
                    {
                      tag: "Paragraph",
                      attr: { Num: "1" },
                      children: [
                        { tag: "ParagraphNum" },
                        {
                          tag: "ParagraphSentence",
                          children: [
                            {
                              tag: "Sentence",
                              children: [
                                "この法律は、テストのために制定する。",
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
                {
                  tag: "Article",
                  attr: { Num: "2" },
                  children: [
                    { tag: "ArticleCaption", children: ["（定義）"] },
                    { tag: "ArticleTitle", children: ["第二条"] },
                    {
                      tag: "Paragraph",
                      attr: { Num: "1" },
                      children: [
                        { tag: "ParagraphNum" },
                        {
                          tag: "ParagraphSentence",
                          children: [
                            {
                              tag: "Sentence",
                              children: [
                                "この法律において、次の各号に掲げる用語の意義は、当該各号に定めるところによる。",
                              ],
                            },
                          ],
                        },
                        {
                          tag: "Item",
                          attr: { Num: "1" },
                          children: [
                            { tag: "ItemTitle", children: ["一"] },
                            {
                              tag: "ItemSentence",
                              children: [
                                {
                                  tag: "Sentence",
                                  children: ["建築物　土地に定着する工作物"],
                                },
                              ],
                            },
                          ],
                        },
                        {
                          tag: "Item",
                          attr: { Num: "2" },
                          children: [
                            { tag: "ItemTitle", children: ["二"] },
                            {
                              tag: "ItemSentence",
                              children: [
                                {
                                  tag: "Sentence",
                                  children: ["特殊建築物　学校、病院その他"],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe("egov-parser", () => {
  describe("parseArticle", () => {
    it('finds article by number "1"', () => {
      const result = parseArticle(TEST_LAW_TREE, "1");
      expect(result).not.toBeNull();
      expect(result!.article_num).toBe("1");
      expect(result!.article_title).toBe("第一条");
      expect(result!.article_caption).toBe("（目的）");
      expect(result!.text).toContain("テストのために制定する");
    });

    it('finds article by "第一条" format', () => {
      const result = parseArticle(TEST_LAW_TREE, "第一条");
      expect(result).not.toBeNull();
      expect(result!.article_num).toBe("1");
      expect(result!.text).toContain("テストのために制定する");
    });

    it('finds article "2" with items containing expected text', () => {
      const result = parseArticle(TEST_LAW_TREE, "2");
      expect(result).not.toBeNull();
      expect(result!.article_num).toBe("2");
      expect(result!.article_title).toBe("第二条");
      expect(result!.text).toContain("建築物");
      expect(result!.text).toContain("特殊建築物");
    });

    it('returns null for non-existent article "999"', () => {
      const result = parseArticle(TEST_LAW_TREE, "999");
      expect(result).toBeNull();
    });
  });

  describe("parseAllArticles", () => {
    it("returns all articles from the law tree", () => {
      const articles = parseAllArticles(TEST_LAW_TREE);
      expect(articles).toHaveLength(2);
      expect(articles[0].article_num).toBe("1");
      expect(articles[1].article_num).toBe("2");
    });
  });

  describe("parseFullLaw", () => {
    it("returns formatted text containing the law title", () => {
      const fullText = parseFullLaw(TEST_LAW_TREE);
      expect(fullText).toContain("テスト法");
    });

    it("returns formatted text containing the law number", () => {
      const fullText = parseFullLaw(TEST_LAW_TREE);
      expect(fullText).toContain("昭和二十五年法律第二百一号");
    });

    it("includes text from both articles", () => {
      const fullText = parseFullLaw(TEST_LAW_TREE);
      expect(fullText).toContain("テストのために制定する");
      expect(fullText).toContain("建築物");
      expect(fullText).toContain("特殊建築物");
    });

    it("includes structural titles", () => {
      const fullText = parseFullLaw(TEST_LAW_TREE);
      expect(fullText).toContain("第一章　総則");
    });
  });
});
