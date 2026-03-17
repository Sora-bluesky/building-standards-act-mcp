import type { ArticleReference } from "./types.js";

// ---------------------------------------------------------------------------
// Exclusion patterns (checked FIRST to prevent false positives)
// ---------------------------------------------------------------------------

const EXCLUSION_PATTERNS: RegExp[] = [
  // Law numbers: 「昭和二十五年法律第二百一号」「平成十二年政令第三百三十八号」
  /(?:明治|大正|昭和|平成|令和)[\u4E00-\u9FFF\d]+年(?:法律|政令|省令|勅令|府令|条約|規則|内閣府令)第[\u4E00-\u9FFF\d]+号/g,

  // Zone/district names: 「第一種低層住居専用地域」「第二種中高層住居専用地域」
  /第[一二三四五\d]種[\u4E00-\u9FFF]*地域/g,

  // Ordinals: 「第○回」
  /第[\u4E00-\u9FFF\d]+回/g,

  // Table/form references: 「別表第一」「第○号様式」
  /別表第[\u4E00-\u9FFF\d]+/g,
  /第[\u4E00-\u9FFF\d]+号様式/g,
];

// ---------------------------------------------------------------------------
// Detection patterns (ordered by specificity, most specific first)
// ---------------------------------------------------------------------------

// CJK character range for matching law names
const CJK = "\u4E00-\u9FFF";
const KANA = "\u3040-\u309F\u30A0-\u30FF";
const CJK_KANA = `${CJK}${KANA}`;

// Kanji numerals used in article/paragraph/item numbers
const KANJI_NUM = "一二三四五六七八九十百千万";

// Article reference suffix: 第N条(のN)?(第N項)?(第?N号)?
// Branch numbers after の are restricted to digits/kanji numerals (not arbitrary CJK)
const ARTICLE_REF = `第[${KANJI_NUM}\\d]+条(?:の[${KANJI_NUM}\\d]+)?(?:第[${KANJI_NUM}\\d]+項)?(?:第?[${KANJI_NUM}\\d]+号)?`;

// cross_law: law_name + article reference
// Matches: 「建築基準法施行令第36条」「消防法第17条の2」「都市計画法第29条第1項」
const RE_CROSS_LAW = new RegExp(
  `([${CJK_KANA}]+?(?:法|法律|令|政令|省令|規則|条例))(${ARTICLE_REF})`,
  "g",
);

// same_law: article reference not already matched by cross_law (relies on masking)
// Matches: 「第20条」「第6条の2」「第6条第1項」
const RE_SAME_LAW = new RegExp(`(${ARTICLE_REF})`, "g");

// relative: fixed-form relative references
const RE_RELATIVE =
  /(?:前条|次条|前項|次項|同条|同項|同号|前各号|次の各号|前号|次号|各号)/g;

// delegation: references to delegated legislation
const RE_DELEGATION =
  /(?:政令|省令|国土交通省令|総務省令|主務省令|条例|内閣府令|国土交通大臣|都道府県知事|市町村長)(?:で|が|の)定め[るた]/g;

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Replace a region of text with null chars for masking. */
function maskRegion(text: string, start: number, length: number): string {
  return (
    text.substring(0, start) +
    "\0".repeat(length) +
    text.substring(start + length)
  );
}

/** Extract article number from text like 「第20条」 or 「第六条の二」. */
function extractArticleNum(refPart: string): string | undefined {
  const m = refPart.match(/第([一二三四五六七八九十百千万\d]+)条/);
  return m ? m[1] : undefined;
}

/** Extract paragraph number from text like 「第1項」. */
function extractParagraphNum(refPart: string): string | undefined {
  const m = refPart.match(/第([一二三四五六七八九十百千万\d]+)項/);
  return m ? m[1] : undefined;
}

/** Extract item number from text like 「第一号」 or 「一号」. */
function extractItemNum(refPart: string): string | undefined {
  const m = refPart.match(/([一二三四五六七八九十百千万\d]+)号$/);
  return m ? m[1] : undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect cross-references in article text.
 *
 * Scans for 4 categories of references:
 * 1. cross_law: References to other laws (e.g. "建築基準法施行令第36条")
 * 2. same_law: References within the same law (e.g. "第20条")
 * 3. relative: Relative references (e.g. "前条", "同項")
 * 4. delegation: Delegation references (e.g. "政令で定める")
 *
 * Exclusion patterns (law numbers, zone names, ordinals) are applied first
 * to prevent false positives.
 */
export function detectReferences(text: string): ArticleReference[] {
  if (!text || text.length === 0) {
    return [];
  }

  const references: ArticleReference[] = [];

  // Step 1: Mask exclusion zones to prevent false positives
  let masked = text;
  for (const pattern of EXCLUSION_PATTERNS) {
    // Reset lastIndex for global regexps
    pattern.lastIndex = 0;
    masked = masked.replace(pattern, (match) => "\0".repeat(match.length));
  }

  // Step 2: Detect cross_law (most specific first)
  RE_CROSS_LAW.lastIndex = 0;
  for (const match of masked.matchAll(RE_CROSS_LAW)) {
    const start = match.index!;
    const raw = text.substring(start, start + match[0].length);
    const articlePart = match[2];
    references.push({
      raw_text: raw,
      ref_type: "cross_law",
      target_law: match[1],
      target_article: extractArticleNum(articlePart),
      target_paragraph: extractParagraphNum(articlePart),
      target_item: extractItemNum(articlePart),
    });
    masked = maskRegion(masked, start, match[0].length);
  }

  // Step 3: Detect same_law
  RE_SAME_LAW.lastIndex = 0;
  for (const match of masked.matchAll(RE_SAME_LAW)) {
    const start = match.index!;
    const raw = text.substring(start, start + match[0].length);
    const articlePart = match[1];
    references.push({
      raw_text: raw,
      ref_type: "same_law",
      target_article: extractArticleNum(articlePart),
      target_paragraph: extractParagraphNum(articlePart),
      target_item: extractItemNum(articlePart),
    });
    masked = maskRegion(masked, start, match[0].length);
  }

  // Step 4: Detect relative
  RE_RELATIVE.lastIndex = 0;
  for (const match of masked.matchAll(RE_RELATIVE)) {
    const start = match.index!;
    const raw = text.substring(start, start + match[0].length);
    references.push({
      raw_text: raw,
      ref_type: "relative",
    });
    masked = maskRegion(masked, start, match[0].length);
  }

  // Step 5: Detect delegation
  RE_DELEGATION.lastIndex = 0;
  for (const match of masked.matchAll(RE_DELEGATION)) {
    const start = match.index!;
    const raw = text.substring(start, start + match[0].length);
    references.push({
      raw_text: raw,
      ref_type: "delegation",
    });
  }

  return references;
}
