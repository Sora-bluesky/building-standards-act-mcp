import { describe, it, expect } from "vitest";
import {
  parseArticle,
  parseAllArticles,
  parseFullLaw,
  parseArticleStructured,
  parseAllArticlesStructured,
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
                {
                  tag: "Article",
                  attr: { Num: "3" },
                  children: [
                    {
                      tag: "ArticleCaption",
                      children: ["（適用の除外）"],
                    },
                    { tag: "ArticleTitle", children: ["第三条"] },
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
                                "次の各号のいずれかに該当する建築物については、この法律は適用しない。",
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
                                  children: [
                                    "文化財保護法の規定により国宝又は重要文化財に指定された建築物",
                                  ],
                                },
                              ],
                            },
                            {
                              tag: "Subitem1",
                              attr: { Num: "1" },
                              children: [
                                {
                                  tag: "Subitem1Title",
                                  children: ["イ"],
                                },
                                {
                                  tag: "Subitem1Sentence",
                                  children: [
                                    {
                                      tag: "Sentence",
                                      children: ["国宝に指定されたもの"],
                                    },
                                  ],
                                },
                                {
                                  tag: "Subitem2",
                                  attr: { Num: "1" },
                                  children: [
                                    {
                                      tag: "Subitem2Title",
                                      children: ["（１）"],
                                    },
                                    {
                                      tag: "Subitem2Sentence",
                                      children: [
                                        {
                                          tag: "Sentence",
                                          children: ["建造物であるもの"],
                                        },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                            {
                              tag: "Subitem1",
                              attr: { Num: "2" },
                              children: [
                                {
                                  tag: "Subitem1Title",
                                  children: ["ロ"],
                                },
                                {
                                  tag: "Subitem1Sentence",
                                  children: [
                                    {
                                      tag: "Sentence",
                                      children: ["重要文化財に指定されたもの"],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                    {
                      tag: "Paragraph",
                      attr: { Num: "2" },
                      children: [
                        {
                          tag: "ParagraphNum",
                          children: ["２"],
                        },
                        {
                          tag: "ParagraphSentence",
                          children: [
                            {
                              tag: "Sentence",
                              children: [
                                "前項の規定にかかわらず、市町村は条例で定めることができる。",
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
      expect(articles).toHaveLength(3);
      expect(articles[0].article_num).toBe("1");
      expect(articles[1].article_num).toBe("2");
      expect(articles[2].article_num).toBe("3");
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

    it("includes text from all articles", () => {
      const fullText = parseFullLaw(TEST_LAW_TREE);
      expect(fullText).toContain("テストのために制定する");
      expect(fullText).toContain("建築物");
      expect(fullText).toContain("特殊建築物");
      expect(fullText).toContain("文化財保護法");
    });

    it("includes structural titles", () => {
      const fullText = parseFullLaw(TEST_LAW_TREE);
      expect(fullText).toContain("第一章　総則");
    });
  });

  describe("parseArticleStructured", () => {
    it("returns structured article with correct hierarchy for simple article", () => {
      const result = parseArticleStructured(TEST_LAW_TREE, "1");
      expect(result).not.toBeNull();
      expect(result!.article_num).toBe("1");
      expect(result!.article_title).toBe("第一条");
      expect(result!.article_caption).toBe("（目的）");
      expect(result!.paragraphs).toHaveLength(1);
      expect(result!.paragraphs[0].paragraph_num).toBe("1");
      expect(result!.paragraphs[0].paragraph_sentence).toContain(
        "テストのために制定する",
      );
      expect(result!.paragraphs[0].items).toHaveLength(0);
    });

    it("returns structured article with items", () => {
      const result = parseArticleStructured(TEST_LAW_TREE, "2");
      expect(result).not.toBeNull();
      expect(result!.article_num).toBe("2");
      expect(result!.paragraphs).toHaveLength(1);

      const para = result!.paragraphs[0];
      expect(para.items).toHaveLength(2);
      expect(para.items[0].item_num).toBe("1");
      expect(para.items[0].item_title).toBe("一");
      expect(para.items[0].item_sentence).toContain("建築物");
      expect(para.items[0].subitems).toHaveLength(0);
      expect(para.items[1].item_num).toBe("2");
      expect(para.items[1].item_title).toBe("二");
      expect(para.items[1].item_sentence).toContain("特殊建築物");
    });

    it("returns structured article with subitems (nested hierarchy)", () => {
      const result = parseArticleStructured(TEST_LAW_TREE, "3");
      expect(result).not.toBeNull();
      expect(result!.article_num).toBe("3");
      expect(result!.article_caption).toBe("（適用の除外）");
      expect(result!.paragraphs).toHaveLength(2);

      // Paragraph 1: has items with subitems
      const para1 = result!.paragraphs[0];
      expect(para1.paragraph_num).toBe("1");
      expect(para1.items).toHaveLength(1);

      const item1 = para1.items[0];
      expect(item1.item_title).toBe("一");
      expect(item1.item_sentence).toContain("文化財保護法");
      expect(item1.subitems).toHaveLength(2);

      // Subitem1 イ has a nested Subitem2
      expect(item1.subitems[0].subitem_title).toBe("イ");
      expect(item1.subitems[0].subitem_sentence).toContain("国宝に指定");
      expect(item1.subitems[0].subitems).toHaveLength(1);
      expect(item1.subitems[0].subitems[0].subitem_title).toBe("（１）");
      expect(item1.subitems[0].subitems[0].subitem_sentence).toContain(
        "建造物であるもの",
      );
      expect(item1.subitems[0].subitems[0].subitems).toHaveLength(0);

      // Subitem1 ロ has no nested subitems
      expect(item1.subitems[1].subitem_title).toBe("ロ");
      expect(item1.subitems[1].subitem_sentence).toContain("重要文化財");
      expect(item1.subitems[1].subitems).toHaveLength(0);

      // Paragraph 2: simple, no items
      const para2 = result!.paragraphs[1];
      expect(para2.paragraph_num).toBe("2");
      expect(para2.paragraph_sentence).toContain("前項の規定にかかわらず");
      expect(para2.items).toHaveLength(0);
    });

    it("returns null for non-existent article", () => {
      const result = parseArticleStructured(TEST_LAW_TREE, "999");
      expect(result).toBeNull();
    });

    it("finds article by kanji title (第二条)", () => {
      const result = parseArticleStructured(TEST_LAW_TREE, "第二条");
      expect(result).not.toBeNull();
      expect(result!.article_num).toBe("2");
      expect(result!.paragraphs[0].items).toHaveLength(2);
    });
  });

  describe("parseAllArticlesStructured", () => {
    it("returns all articles in structured format", () => {
      const articles = parseAllArticlesStructured(TEST_LAW_TREE);
      expect(articles).toHaveLength(3);
      expect(articles[0].article_num).toBe("1");
      expect(articles[0].paragraphs).toHaveLength(1);
      expect(articles[1].article_num).toBe("2");
      expect(articles[1].paragraphs[0].items).toHaveLength(2);
      expect(articles[2].article_num).toBe("3");
      expect(articles[2].paragraphs).toHaveLength(2);
    });
  });
});
