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
                {
                  tag: "Article",
                  attr: { Num: "6_3" },
                  children: [
                    { tag: "ArticleTitle", children: ["第六条の三"] },
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
                              children: ["確認審査等に関する指針の準用規定。"],
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

    it("includes references when present (article 3 has relative and delegation refs)", () => {
      const result = parseArticle(TEST_LAW_TREE, "3");
      expect(result).not.toBeNull();
      expect(result!.references).toBeDefined();
      expect(result!.references!.length).toBeGreaterThan(0);
      const relRefs = result!.references!.filter(
        (r) => r.ref_type === "relative",
      );
      expect(relRefs.length).toBeGreaterThanOrEqual(1);
      expect(relRefs.some((r) => r.raw_text === "前項")).toBe(true);
    });

    it("omits references field when no references found (article 1)", () => {
      const result = parseArticle(TEST_LAW_TREE, "1");
      expect(result).not.toBeNull();
      expect(result!.references).toBeUndefined();
    });

    it('finds article by "第6条の3" format (条 in the middle)', () => {
      const result = parseArticle(TEST_LAW_TREE, "第6条の3");
      expect(result).not.toBeNull();
      expect(result!.article_num).toBe("6_3");
      expect(result!.text).toContain("確認審査等に関する指針の準用規定");
    });

    it('finds article by "6条の3" format (no 第 prefix)', () => {
      const result = parseArticle(TEST_LAW_TREE, "6条の3");
      expect(result).not.toBeNull();
      expect(result!.article_num).toBe("6_3");
    });

    it('finds article by "6_3" format (already normalized)', () => {
      const result = parseArticle(TEST_LAW_TREE, "6_3");
      expect(result).not.toBeNull();
      expect(result!.article_num).toBe("6_3");
    });
  });

  describe("parseAllArticles", () => {
    it("returns all articles from the law tree", () => {
      const articles = parseAllArticles(TEST_LAW_TREE);
      expect(articles).toHaveLength(4);
      expect(articles[0].article_num).toBe("1");
      expect(articles[1].article_num).toBe("2");
      expect(articles[2].article_num).toBe("3");
      expect(articles[3].article_num).toBe("6_3");
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

    it("includes references in structured output", () => {
      const result = parseArticleStructured(TEST_LAW_TREE, "3");
      expect(result).not.toBeNull();
      expect(result!.references).toBeDefined();
      expect(result!.references!.some((r) => r.ref_type === "relative")).toBe(
        true,
      );
    });

    it("omits references in structured output when none found", () => {
      const result = parseArticleStructured(TEST_LAW_TREE, "1");
      expect(result).not.toBeNull();
      expect(result!.references).toBeUndefined();
    });
  });

  describe("parseAllArticlesStructured", () => {
    it("returns all articles in structured format", () => {
      const articles = parseAllArticlesStructured(TEST_LAW_TREE);
      expect(articles).toHaveLength(4);
      expect(articles[0].article_num).toBe("1");
      expect(articles[0].paragraphs).toHaveLength(1);
      expect(articles[1].article_num).toBe("2");
      expect(articles[1].paragraphs[0].items).toHaveLength(2);
      expect(articles[2].article_num).toBe("3");
      expect(articles[2].paragraphs).toHaveLength(2);
      expect(articles[3].article_num).toBe("6_3");
      expect(articles[3].paragraphs).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------
  // Table rendering tests
  // -----------------------------------------------------------------

  describe("table rendering", () => {
    // Simple 2x2 table (mimicking e-Gov API structure)
    const SIMPLE_TABLE: LawNode = {
      tag: "Table",
      children: [
        {
          tag: "TableRow",
          children: [
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["地域"] }],
            },
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["基準値"] }],
            },
          ],
        },
        {
          tag: "TableRow",
          children: [
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["1地域"] }],
            },
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["0.46"] }],
            },
          ],
        },
        {
          tag: "TableRow",
          children: [
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["2地域"] }],
            },
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["0.46"] }],
            },
          ],
        },
      ],
    };

    // Table with colspan
    const TABLE_WITH_COLSPAN: LawNode = {
      tag: "Table",
      children: [
        {
          tag: "TableRow",
          children: [
            {
              tag: "TableColumn",
              attr: { colspan: "2" },
              children: [{ tag: "Sentence", children: ["居室の種類"] }],
            },
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["面積"] }],
            },
          ],
        },
        {
          tag: "TableRow",
          children: [
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["住宅"] }],
            },
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["居室"] }],
            },
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["20㎡"] }],
            },
          ],
        },
      ],
    };

    // Table with rowspan
    const TABLE_WITH_ROWSPAN: LawNode = {
      tag: "Table",
      children: [
        {
          tag: "TableRow",
          children: [
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["構造"] }],
            },
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["用途"] }],
            },
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["基準"] }],
            },
          ],
        },
        {
          tag: "TableRow",
          children: [
            {
              tag: "TableColumn",
              attr: { rowspan: "2" },
              children: [{ tag: "Sentence", children: ["木造"] }],
            },
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["住宅"] }],
            },
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["A"] }],
            },
          ],
        },
        {
          tag: "TableRow",
          children: [
            // No first column — rowspan from previous row fills it
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["事務所"] }],
            },
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["B"] }],
            },
          ],
        },
      ],
    };

    // TableStruct with title
    const TABLE_STRUCT_WITH_TITLE: LawNode = {
      tag: "TableStruct",
      children: [
        { tag: "TableStructTitle", children: ["別表第一"] },
        SIMPLE_TABLE,
      ],
    };

    // TableStruct without title
    const TABLE_STRUCT_NO_TITLE: LawNode = {
      tag: "TableStruct",
      children: [SIMPLE_TABLE],
    };

    // Cell with multiple Sentences
    const TABLE_MULTI_SENTENCE: LawNode = {
      tag: "Table",
      children: [
        {
          tag: "TableRow",
          children: [
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["項目"] }],
            },
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["備考"] }],
            },
          ],
        },
        {
          tag: "TableRow",
          children: [
            {
              tag: "TableColumn",
              children: [{ tag: "Sentence", children: ["A"] }],
            },
            {
              tag: "TableColumn",
              children: [
                {
                  tag: "Sentence",
                  attr: { Num: "1" },
                  children: ["第一文。"],
                },
                {
                  tag: "Sentence",
                  attr: { Num: "2" },
                  children: ["第二文。"],
                },
              ],
            },
          ],
        },
      ],
    };

    // Empty table
    const EMPTY_TABLE: LawNode = {
      tag: "Table",
      children: [],
    };

    // Article containing a TableStruct (as sibling of Paragraph)
    const ARTICLE_WITH_TABLE: LawNode = {
      tag: "Law",
      attr: { Era: "Heisei", Year: "28", Lang: "ja" },
      children: [
        {
          tag: "LawBody",
          children: [
            { tag: "LawTitle", children: ["テーブルテスト法"] },
            {
              tag: "MainProvision",
              children: [
                {
                  tag: "Article",
                  attr: { Num: "1" },
                  children: [
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
                                "次の表に掲げる地域区分に応じた基準値とする。",
                              ],
                            },
                          ],
                        },
                      ],
                    },
                    TABLE_STRUCT_WITH_TITLE,
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    // Law tree with table in structural element (for parseFullLaw)
    const LAW_WITH_TABLE_IN_CHAPTER: LawNode = {
      tag: "Law",
      attr: { Era: "Heisei", Year: "28", Lang: "ja" },
      children: [
        {
          tag: "LawBody",
          children: [
            { tag: "LawTitle", children: ["テーブルテスト法"] },
            {
              tag: "MainProvision",
              children: [
                {
                  tag: "Chapter",
                  attr: { Num: "1" },
                  children: [
                    {
                      tag: "ChapterTitle",
                      children: ["第一章　総則"],
                    },
                    {
                      tag: "Article",
                      attr: { Num: "1" },
                      children: [
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
                                  children: ["テスト条文。"],
                                },
                              ],
                            },
                          ],
                        },
                        TABLE_STRUCT_NO_TITLE,
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

    it("renders a simple table as markdown", () => {
      const result = parseArticle(ARTICLE_WITH_TABLE, "1");
      expect(result).not.toBeNull();
      // Should contain markdown table, not [表] placeholder
      expect(result!.text).not.toContain("[表]");
      expect(result!.text).toContain("| 地域 | 基準値 |");
      expect(result!.text).toContain("| --- | --- |");
      expect(result!.text).toContain("| 1地域 | 0.46 |");
      expect(result!.text).toContain("| 2地域 | 0.46 |");
    });

    it("renders TableStruct title before the table", () => {
      const result = parseArticle(ARTICLE_WITH_TABLE, "1");
      expect(result).not.toBeNull();
      expect(result!.text).toContain("別表第一");
      // Title should appear before the table
      const titleIdx = result!.text.indexOf("別表第一");
      const tableIdx = result!.text.indexOf("| 地域");
      expect(titleIdx).toBeLessThan(tableIdx);
    });

    it("handles colspan by adding empty cells", () => {
      const lawWithColspan: LawNode = {
        tag: "Law",
        children: [
          {
            tag: "LawBody",
            children: [
              { tag: "LawTitle", children: ["テスト"] },
              {
                tag: "MainProvision",
                children: [
                  {
                    tag: "Article",
                    attr: { Num: "1" },
                    children: [
                      { tag: "ArticleTitle", children: ["第一条"] },
                      {
                        tag: "Paragraph",
                        attr: { Num: "1" },
                        children: [
                          { tag: "ParagraphNum" },
                          {
                            tag: "ParagraphSentence",
                            children: [{ tag: "Sentence", children: ["表。"] }],
                          },
                        ],
                      },
                      { tag: "TableStruct", children: [TABLE_WITH_COLSPAN] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      const result = parseArticle(lawWithColspan, "1");
      expect(result).not.toBeNull();
      // colspan=2 header row should have 3 columns total
      expect(result!.text).toContain("| 居室の種類 |  | 面積 |");
      expect(result!.text).toContain("| 住宅 | 居室 | 20㎡ |");
    });

    it("handles rowspan by duplicating cell content", () => {
      const lawWithRowspan: LawNode = {
        tag: "Law",
        children: [
          {
            tag: "LawBody",
            children: [
              { tag: "LawTitle", children: ["テスト"] },
              {
                tag: "MainProvision",
                children: [
                  {
                    tag: "Article",
                    attr: { Num: "1" },
                    children: [
                      { tag: "ArticleTitle", children: ["第一条"] },
                      {
                        tag: "Paragraph",
                        attr: { Num: "1" },
                        children: [
                          { tag: "ParagraphNum" },
                          {
                            tag: "ParagraphSentence",
                            children: [{ tag: "Sentence", children: ["表。"] }],
                          },
                        ],
                      },
                      { tag: "TableStruct", children: [TABLE_WITH_ROWSPAN] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      const result = parseArticle(lawWithRowspan, "1");
      expect(result).not.toBeNull();
      expect(result!.text).toContain("| 構造 | 用途 | 基準 |");
      expect(result!.text).toContain("| 木造 | 住宅 | A |");
      // rowspan=2: "木造" should appear in the next row too
      expect(result!.text).toContain("| 木造 | 事務所 | B |");
    });

    it("joins multiple Sentences in a cell with space", () => {
      const lawWithMultiSentence: LawNode = {
        tag: "Law",
        children: [
          {
            tag: "LawBody",
            children: [
              { tag: "LawTitle", children: ["テスト"] },
              {
                tag: "MainProvision",
                children: [
                  {
                    tag: "Article",
                    attr: { Num: "1" },
                    children: [
                      { tag: "ArticleTitle", children: ["第一条"] },
                      {
                        tag: "Paragraph",
                        attr: { Num: "1" },
                        children: [
                          { tag: "ParagraphNum" },
                          {
                            tag: "ParagraphSentence",
                            children: [{ tag: "Sentence", children: ["表。"] }],
                          },
                        ],
                      },
                      {
                        tag: "TableStruct",
                        children: [TABLE_MULTI_SENTENCE],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      const result = parseArticle(lawWithMultiSentence, "1");
      expect(result).not.toBeNull();
      expect(result!.text).toContain("第一文。 第二文。");
    });

    it("renders empty table as empty string", () => {
      const lawWithEmpty: LawNode = {
        tag: "Law",
        children: [
          {
            tag: "LawBody",
            children: [
              { tag: "LawTitle", children: ["テスト"] },
              {
                tag: "MainProvision",
                children: [
                  {
                    tag: "Article",
                    attr: { Num: "1" },
                    children: [
                      { tag: "ArticleTitle", children: ["第一条"] },
                      {
                        tag: "Paragraph",
                        attr: { Num: "1" },
                        children: [
                          { tag: "ParagraphNum" },
                          {
                            tag: "ParagraphSentence",
                            children: [
                              { tag: "Sentence", children: ["条文。"] },
                            ],
                          },
                        ],
                      },
                      { tag: "TableStruct", children: [EMPTY_TABLE] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
      const result = parseArticle(lawWithEmpty, "1");
      expect(result).not.toBeNull();
      // Empty table should not produce [表] placeholder
      expect(result!.text).not.toContain("[表]");
    });

    it("renders table in parseFullLaw output", () => {
      const fullText = parseFullLaw(LAW_WITH_TABLE_IN_CHAPTER);
      expect(fullText).toContain("テーブルテスト法");
      expect(fullText).toContain("第一章　総則");
      // Table should be rendered, not placeholder
      expect(fullText).not.toContain("[表]");
      expect(fullText).toContain("| 地域 | 基準値 |");
      expect(fullText).toContain("| 1地域 | 0.46 |");
    });

    it("renders table in structured article paragraph_sentence", () => {
      // When a table is inside ParagraphSentence (via extractText),
      // the structured output should include the rendered table
      const lawWithInlineTable: LawNode = {
        tag: "Law",
        children: [
          {
            tag: "LawBody",
            children: [
              { tag: "LawTitle", children: ["テスト"] },
              {
                tag: "MainProvision",
                children: [
                  {
                    tag: "Article",
                    attr: { Num: "1" },
                    children: [
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
                                children: ["次の表による。"],
                              },
                              SIMPLE_TABLE,
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
      const result = parseArticleStructured(lawWithInlineTable, "1");
      expect(result).not.toBeNull();
      expect(result!.paragraphs[0].paragraph_sentence).toContain(
        "| 地域 | 基準値 |",
      );
      expect(result!.paragraphs[0].paragraph_sentence).not.toContain("[表]");
    });

    it("renders TableStruct that is a direct child of Paragraph", () => {
      const lawWithParagraphTable: LawNode = {
        tag: "Law",
        children: [
          {
            tag: "LawBody",
            children: [
              { tag: "LawTitle", children: ["テスト"] },
              {
                tag: "MainProvision",
                children: [
                  {
                    tag: "Article",
                    attr: { Num: "1" },
                    children: [
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
                                children: ["次の表のとおりとする。"],
                              },
                            ],
                          },
                          {
                            tag: "TableStruct",
                            children: [SIMPLE_TABLE],
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
      const result = parseArticle(lawWithParagraphTable, "1");
      expect(result).not.toBeNull();
      expect(result!.text).toContain("| 地域 | 基準値 |");
      expect(result!.text).toContain("| 1地域 | 0.46 |");
    });

    it("renders TableStruct that is a direct child of Item", () => {
      const lawWithItemTable: LawNode = {
        tag: "Law",
        children: [
          {
            tag: "LawBody",
            children: [
              { tag: "LawTitle", children: ["テスト"] },
              {
                tag: "MainProvision",
                children: [
                  {
                    tag: "Article",
                    attr: { Num: "1" },
                    children: [
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
                                children: ["次の各号に掲げるとおりとする。"],
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
                                    children: ["次の表による。"],
                                  },
                                ],
                              },
                              {
                                tag: "TableStruct",
                                children: [SIMPLE_TABLE],
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
      const result = parseArticle(lawWithItemTable, "1");
      expect(result).not.toBeNull();
      expect(result!.text).toContain("| 地域 | 基準値 |");
      expect(result!.text).toContain("| 1地域 | 0.46 |");
    });

    it("renders AppdxTable in parseFullLaw output", () => {
      const lawWithAppdxTable: LawNode = {
        tag: "Law",
        attr: { Era: "Showa", Year: "25", Lang: "ja" },
        children: [
          {
            tag: "LawBody",
            children: [
              { tag: "LawTitle", children: ["別表テスト法"] },
              {
                tag: "MainProvision",
                children: [
                  {
                    tag: "Article",
                    attr: { Num: "1" },
                    children: [
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
                                  "別表第一に掲げる用途に供する建築物。",
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
              {
                tag: "AppdxTable",
                children: [
                  {
                    tag: "AppdxTableTitle",
                    children: ["別表第一（第六条関係）"],
                  },
                  {
                    tag: "TableStruct",
                    children: [SIMPLE_TABLE],
                  },
                ],
              },
            ],
          },
        ],
      };
      const fullText = parseFullLaw(lawWithAppdxTable);
      expect(fullText).toContain("別表テスト法");
      expect(fullText).toContain("別表第一（第六条関係）");
      expect(fullText).toContain("| 地域 | 基準値 |");
      expect(fullText).toContain("| 1地域 | 0.46 |");
    });
  });
});
