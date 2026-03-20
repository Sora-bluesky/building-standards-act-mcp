import type {
  LawNode,
  ParsedArticle,
  StructuredArticle,
  StructuredItem,
  StructuredParagraph,
  StructuredSubitem,
} from "./types.js";
import { detectReferences } from "./reference-detector.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIGURE_PLACEHOLDER = "[図]";

/** Tags whose content should be skipped entirely. */
const SKIP_TAGS = new Set(["TOC", "Rt"]);

/** Tags that represent structural containers and produce a blank line before their content. */
const STRUCTURAL_TAGS = new Set([
  "Part",
  "Chapter",
  "Section",
  "Subsection",
  "Division",
]);

/** Tags that hold the title of a structural container. */
const STRUCTURAL_TITLE_TAGS = new Set([
  "PartTitle",
  "ChapterTitle",
  "SectionTitle",
  "SubsectionTitle",
  "DivisionTitle",
]);

/** Indentation width per subitem depth level (in full-width spaces). */
const INDENT_UNIT = "  ";

// ---------------------------------------------------------------------------
// Kanji numeral conversion
// ---------------------------------------------------------------------------

const KANJI_DIGIT_MAP: Record<string, number> = {
  〇: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/**
 * Parse a kanji numeral string into an arabic number.
 * Handles up to hundreds (e.g. "六十九" -> 69, "百二十三" -> 123).
 */
function parseKanjiNumber(kanji: string): number | null {
  if (kanji.length === 0) return null;

  // Single digit shortcut
  if (kanji.length === 1 && KANJI_DIGIT_MAP[kanji] !== undefined) {
    return KANJI_DIGIT_MAP[kanji];
  }

  let result = 0;
  let i = 0;

  // Hundreds place
  const hyakuIdx = kanji.indexOf("百");
  if (hyakuIdx !== -1) {
    if (hyakuIdx === 0) {
      result += 100;
    } else {
      const d = KANJI_DIGIT_MAP[kanji[0]];
      if (d === undefined) return null;
      result += d * 100;
    }
    i = hyakuIdx + 1;
  }

  // Tens place
  const juIdx = kanji.indexOf("十", i);
  if (juIdx !== -1) {
    if (juIdx === i) {
      result += 10;
    } else {
      const d = KANJI_DIGIT_MAP[kanji[juIdx - 1]];
      if (d === undefined) return null;
      result += d * 10;
      // Ensure we didn't skip characters
      if (juIdx - 1 !== i) return null;
    }
    i = juIdx + 1;
  }

  // Ones place
  if (i < kanji.length) {
    const d = KANJI_DIGIT_MAP[kanji[i]];
    if (d === undefined) return null;
    result += d;
    if (i + 1 !== kanji.length) return null;
  }

  return result === 0 && kanji !== "〇" ? null : result;
}

/**
 * Convert a single kanji numeral to an arabic digit string.
 * Shorthand for simple cases like table numbers (一 -> "1", 二 -> "2").
 */
function kanjiToArabic(kanji: string): string | null {
  const n = parseKanjiNumber(kanji);
  return n !== null ? String(n) : null;
}

/**
 * Normalize a string by converting all kanji numeral sequences to arabic.
 * Used for comparing amendment law numbers like "令和四年法律第六十九号" -> "令和4年法律第69号".
 */
function normalizeKanjiNumbers(s: string): string {
  return s.replace(/[〇一二三四五六七八九十百]+/g, (match) => {
    const n = parseKanjiNumber(match);
    return n !== null ? String(n) : match;
  });
}

// ---------------------------------------------------------------------------
// Special section detection (附則 / 別表)
// ---------------------------------------------------------------------------

type SpecialSectionRequest =
  | { type: "suppl_all" }
  | { type: "suppl_article"; articleNumber: string }
  | { type: "suppl_amendment"; amendLawNum: string }
  | {
      type: "suppl_amendment_article";
      amendLawNum: string;
      articleNumber: string;
    }
  | { type: "appdx_table"; tableNum: string };

/**
 * Detect if the article number input is a special section request
 * (supplementary provisions or appended tables).
 */
function detectSpecialSection(input: string): SpecialSectionRequest | null {
  const s = input.trim();

  // 別表パターン: 別表第一, 別表第1, 別表1
  const appdxMatch = s.match(/^別表[第]?([一二三四五六七八九十\d]+)/);
  if (appdxMatch) {
    const rawNum = appdxMatch[1];
    const num = /^\d+$/.test(rawNum) ? rawNum : kanjiToArabic(rawNum);
    if (num) return { type: "appdx_table", tableNum: num };
  }
  // Bare "別表" without a number
  if (s === "別表") {
    return { type: "appdx_table", tableNum: "1" };
  }

  // 附則パターン
  if (s.startsWith("附則")) {
    const rest = s.slice(2).trim();

    if (rest === "") {
      return { type: "suppl_all" };
    }

    // 附則（令和4年法律第69号） or 附則（令和4年法律第69号）第3条
    const amendMatch = rest.match(/^[（(](.+?)[）)]\s*(.*)/);
    if (amendMatch) {
      const amendLawNum = amendMatch[1];
      const afterAmend = amendMatch[2].trim();
      if (afterAmend === "") {
        return { type: "suppl_amendment", amendLawNum };
      }
      return {
        type: "suppl_amendment_article",
        amendLawNum,
        articleNumber: afterAmend,
      };
    }

    // 附則第3条 or 附則3
    return { type: "suppl_article", articleNumber: rest };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Article number normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a user-supplied article number string into the canonical form
 * used in the `Num` attribute of Article nodes (e.g. "20", "6_2").
 *
 * Accepted inputs:
 *   "20"        -> "20"
 *   "第20条"    -> "20"
 *   "20条"      -> "20"
 *   "第6条の2"  -> "6_2"
 *   "6条の2"    -> "6_2"
 *   "6_2"       -> "6_2"
 *   "第百条"    -> null  (kanji numeral — handled via title matching)
 */
function normalizeArticleNumber(input: string): string | null {
  let s = input.trim();

  // Strip leading "第" and "条" (条 may appear mid-string for "129条の2の3")
  s = s.replace(/^第/, "");
  s = s.replace(/条(の|$)/g, "$1");

  // If the string still contains kanji numerals we cannot normalize it;
  // the caller should fall back to matching against ArticleTitle text.
  if (/[一二三四五六七八九十百千万]/.test(s)) {
    return null;
  }

  // Replace "の" with "_" (e.g. "6の2" -> "6_2")
  s = s.replace(/の/g, "_");

  // At this point the string should consist of digits, underscores, and
  // possibly hyphens. Reject anything else.
  if (!/^[\d_-]+$/.test(s)) {
    return null;
  }

  return s;
}

// ---------------------------------------------------------------------------
// Helper: type guards and basic traversal
// ---------------------------------------------------------------------------

function isLawNode(child: LawNode | string): child is LawNode {
  return (
    typeof child !== "string" &&
    child !== null &&
    typeof child === "object" &&
    "tag" in child
  );
}

/**
 * Find all direct child nodes matching a given tag.
 */
function findChildrenByTag(node: LawNode, tag: string): LawNode[] {
  if (!node.children) {
    return [];
  }
  return node.children.filter(
    (c): c is LawNode => isLawNode(c) && c.tag === tag,
  );
}

/**
 * Find the first direct child node matching a given tag.
 */
function findChildByTag(node: LawNode, tag: string): LawNode | undefined {
  if (!node.children) {
    return undefined;
  }
  return node.children.find((c): c is LawNode => isLawNode(c) && c.tag === tag);
}

// ---------------------------------------------------------------------------
// Table rendering
// ---------------------------------------------------------------------------

/**
 * Extract text content from a table cell (TableColumn / TableHeaderColumn).
 * Joins multiple Sentence children with a space.
 */
function extractCellText(cell: LawNode): string {
  if (!cell.children || cell.children.length === 0) {
    return "";
  }

  const parts: string[] = [];
  for (const child of cell.children) {
    if (typeof child === "string") {
      parts.push(child);
    } else if (isLawNode(child) && child.tag === "Sentence") {
      const text =
        child.children?.map((c) => (typeof c === "string" ? c : "")).join("") ??
        "";
      if (text) {
        parts.push(text);
      }
    } else if (isLawNode(child)) {
      // Recurse into other structural elements within cells
      const text = extractCellText(child);
      if (text) {
        parts.push(text);
      }
    }
  }

  return parts.join(" ");
}

/**
 * Convert a Table node into a Markdown table string.
 *
 * Handles colspan (fills extra empty cells) and rowspan (duplicates content
 * into subsequent rows) to produce a valid rectangular Markdown table.
 */
function renderTable(node: LawNode): string {
  if (!node.children || node.children.length === 0) {
    return "";
  }

  const rows = node.children.filter(
    (c): c is LawNode =>
      isLawNode(c) && (c.tag === "TableRow" || c.tag === "TableHeaderRow"),
  );

  if (rows.length === 0) {
    return "";
  }

  // Phase 1: Build a 2D grid resolving colspan and rowspan.
  // rowspanTracker[col] = { text, remaining } tracks active rowspans.
  const rowspanTracker: Map<number, { text: string; remaining: number }> =
    new Map();
  const grid: string[][] = [];

  for (const row of rows) {
    const cells =
      row.children?.filter(
        (c): c is LawNode =>
          isLawNode(c) &&
          (c.tag === "TableColumn" || c.tag === "TableHeaderColumn"),
      ) ?? [];

    const gridRow: string[] = [];
    let cellIdx = 0;
    let col = 0;

    // Fill cells for this row
    while (cellIdx < cells.length || rowspanTracker.has(col)) {
      // Check if this column is occupied by a previous rowspan
      const span = rowspanTracker.get(col);
      if (span && span.remaining > 0) {
        gridRow.push(span.text);
        span.remaining--;
        if (span.remaining === 0) {
          rowspanTracker.delete(col);
        }
        col++;
        continue;
      }

      // No more source cells to process
      if (cellIdx >= cells.length) {
        break;
      }

      const cell = cells[cellIdx];
      const text = extractCellText(cell);
      const colspan = parseInt(cell.attr?.["colspan"] ?? "1", 10);
      const rowspan = parseInt(cell.attr?.["rowspan"] ?? "1", 10);

      // Place the cell text
      gridRow.push(text);

      // Register rowspan for subsequent rows
      if (rowspan > 1) {
        rowspanTracker.set(col, { text, remaining: rowspan - 1 });
      }

      col++;

      // Handle colspan: add empty cells for the spanned columns
      for (let i = 1; i < colspan; i++) {
        gridRow.push("");
        if (rowspan > 1) {
          rowspanTracker.set(col, { text: "", remaining: rowspan - 1 });
        }
        col++;
      }

      cellIdx++;
    }

    grid.push(gridRow);
  }

  if (grid.length === 0) {
    return "";
  }

  // Phase 2: Render the grid as Markdown.
  // Determine max column count for consistent formatting.
  const maxCols = Math.max(...grid.map((r) => r.length));

  const lines: string[] = [];
  for (let i = 0; i < grid.length; i++) {
    // Pad row to maxCols
    const row = grid[i];
    while (row.length < maxCols) {
      row.push("");
    }

    // Escape pipe characters in cell text
    const formatted = row.map((cell) => ` ${cell.replace(/\|/g, "\\|")} `);
    lines.push(`|${formatted.join("|")}|`);

    // Add separator after the first row (header)
    if (i === 0) {
      const sep = row.map(() => " --- ");
      lines.push(`|${sep.join("|")}|`);
    }
  }

  return lines.join("\n");
}

/**
 * Convert a TableStruct node (optional title + Table) into text.
 */
function renderTableStruct(node: LawNode): string {
  const parts: string[] = [];

  if (!node.children) {
    return "";
  }

  const titleNode = findChildByTag(node, "TableStructTitle");
  if (titleNode) {
    const titleText = titleNode.children
      ?.map((c) => (typeof c === "string" ? c : ""))
      .join("")
      .trim();
    if (titleText) {
      parts.push(titleText);
    }
  }

  const tableNode = findChildByTag(node, "Table");
  if (tableNode) {
    const tableText = renderTable(tableNode);
    if (tableText) {
      parts.push(tableText);
    }
  }

  return parts.join("\n");
}

/**
 * Append rendered TableStruct content to a lines array.
 * Used by full-law rendering functions that accumulate lines.
 */
function renderTableStructLines(node: LawNode, lines: string[]): void {
  const text = renderTableStruct(node);
  if (text) {
    lines.push(text);
  }
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

/**
 * Recursively extract all plain text from a node subtree.
 * Skips TOC, Rt (ruby reading), and replaces Table/FigStruct with placeholders.
 */
function extractText(node: LawNode | string): string {
  if (typeof node === "string") {
    return node;
  }

  if (SKIP_TAGS.has(node.tag)) {
    return "";
  }

  if (node.tag === "TableStruct") {
    return renderTableStruct(node);
  }
  if (node.tag === "Table") {
    return renderTable(node);
  }
  if (node.tag === "Fig" || node.tag === "FigStruct") {
    return FIGURE_PLACEHOLDER;
  }

  if (!node.children || node.children.length === 0) {
    return "";
  }

  return node.children.map(extractText).join("");
}

// ---------------------------------------------------------------------------
// Article text rendering
// ---------------------------------------------------------------------------

/**
 * Render the body of an Article node into human-readable text.
 * Handles Paragraph, Item, Subitem1..Subitem5 hierarchy.
 */
function renderArticleBody(article: LawNode): string {
  const lines: string[] = [];

  if (!article.children) {
    return "";
  }

  for (const child of article.children) {
    if (!isLawNode(child)) {
      continue;
    }
    if (child.tag === "Paragraph") {
      renderParagraph(child, lines);
    } else if (child.tag === "TableStruct") {
      const tableText = renderTableStruct(child);
      if (tableText) {
        lines.push(tableText);
      }
    } else if (child.tag === "Table") {
      const tableText = renderTable(child);
      if (tableText) {
        lines.push(tableText);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Render a Paragraph node, including its items/subitems.
 */
function renderParagraph(paragraph: LawNode, lines: string[]): void {
  // ParagraphNum: if it has text content, prefix the paragraph sentence with it.
  const numNode = findChildByTag(paragraph, "ParagraphNum");
  const numText = numNode ? extractText(numNode).trim() : "";

  const sentenceNode = findChildByTag(paragraph, "ParagraphSentence");
  const sentenceText = sentenceNode ? extractText(sentenceNode).trim() : "";

  if (sentenceText) {
    const prefix = numText ? `${numText}　` : "";
    lines.push(`${prefix}${sentenceText}`);
  }

  // Render items within this paragraph
  renderChildItems(paragraph, lines, 0);

  // Render any TableStruct children of this paragraph
  const tableStructs = findChildrenByTag(paragraph, "TableStruct");
  for (const ts of tableStructs) {
    renderTableStructLines(ts, lines);
  }
}

/**
 * Render Item / Subitem children at a given depth.
 *
 * depth 0 -> Item
 * depth 1 -> Subitem1
 * depth 2 -> Subitem2
 * ...
 */
function renderChildItems(
  parent: LawNode,
  lines: string[],
  depth: number,
): void {
  const itemTag = depth === 0 ? "Item" : `Subitem${depth}`;
  const items = findChildrenByTag(parent, itemTag);

  for (const item of items) {
    renderItem(item, lines, depth);
  }
}

/**
 * Render a single Item or Subitem node.
 */
function renderItem(item: LawNode, lines: string[], depth: number): void {
  const indent = INDENT_UNIT.repeat(depth + 1);

  // Determine tag names for title and sentence based on depth.
  const titleTag = depth === 0 ? "ItemTitle" : `Subitem${depth}Title`;
  const sentenceTag = depth === 0 ? "ItemSentence" : `Subitem${depth}Sentence`;

  const titleNode = findChildByTag(item, titleTag);
  const titleText = titleNode ? extractText(titleNode).trim() : "";

  const sentenceNode = findChildByTag(item, sentenceTag);
  const sentenceText = sentenceNode ? extractText(sentenceNode).trim() : "";

  if (sentenceText) {
    const prefix = titleText ? `${titleText}　` : "";
    lines.push(`${indent}${prefix}${sentenceText}`);
  } else if (titleText) {
    lines.push(`${indent}${titleText}`);
  }

  // Recurse into deeper subitems (Subitem1 -> Subitem2 -> ...)
  const nextDepth = depth + 1;
  renderChildItems(item, lines, nextDepth);

  // Render any TableStruct children of this item
  const tableStructs = findChildrenByTag(item, "TableStruct");
  for (const ts of tableStructs) {
    renderTableStructLines(ts, lines);
  }
}

// ---------------------------------------------------------------------------
// Article collection
// ---------------------------------------------------------------------------

/**
 * Recursively collect all Article nodes from the law tree.
 */
function collectArticleNodes(node: LawNode): LawNode[] {
  const articles: LawNode[] = [];

  if (node.tag === "Article") {
    articles.push(node);
    return articles;
  }

  if (!node.children) {
    return articles;
  }

  for (const child of node.children) {
    if (isLawNode(child)) {
      articles.push(...collectArticleNodes(child));
    }
  }

  return articles;
}

/**
 * Convert an Article node to a ParsedArticle.
 */
function articleNodeToParsed(article: LawNode): ParsedArticle {
  const num = article.attr?.["Num"] ?? "";

  const captionNode = findChildByTag(article, "ArticleCaption");
  const caption = captionNode ? extractText(captionNode).trim() : "";

  const titleNode = findChildByTag(article, "ArticleTitle");
  const title = titleNode ? extractText(titleNode).trim() : "";

  const text = renderArticleBody(article);
  const references = detectReferences(text);

  return {
    article_num: num,
    article_caption: caption,
    article_title: title,
    text,
    ...(references.length > 0 ? { references } : {}),
  };
}

// ---------------------------------------------------------------------------
// Article node search (shared by text and structured parsers)
// ---------------------------------------------------------------------------

/**
 * Find an Article node by number from the law tree.
 *
 * `articleNumber` can be in any of these formats:
 *   "20", "第20条", "20条", "6条の2", "第6条の2", "第百条"
 *
 * Returns the raw Article LawNode, or null if not found.
 */
function findArticleNode(root: LawNode, articleNumber: string): LawNode | null {
  const allArticles = collectArticleNodes(root);

  if (allArticles.length === 0) {
    return null;
  }

  const normalized = normalizeArticleNumber(articleNumber);

  if (normalized !== null) {
    // Primary match: compare against the Num attribute.
    for (const article of allArticles) {
      const num = article.attr?.["Num"];
      if (num === normalized) {
        return article;
      }
    }
  }

  // Fallback: match against ArticleTitle text.
  // This handles kanji numeral inputs like "第百条".
  const cleanedInput = articleNumber.trim();
  // Build candidate patterns to match.
  const candidates: string[] = [cleanedInput];
  // If user wrote "百条" without "第", try adding it.
  if (!cleanedInput.startsWith("第")) {
    candidates.push(`第${cleanedInput}`);
  }
  // If user wrote "第百条", also try without "第".
  if (cleanedInput.startsWith("第")) {
    candidates.push(cleanedInput.slice(1));
  }
  // Ensure all candidates end with "条" for matching against titles like "第百条".
  const patternsWithJo = candidates.flatMap((c) => {
    const result = [c];
    if (!c.endsWith("条")) {
      result.push(`${c}条`);
    }
    return result;
  });

  for (const article of allArticles) {
    const titleNode = findChildByTag(article, "ArticleTitle");
    const titleText = titleNode ? extractText(titleNode).trim() : "";

    for (const pattern of patternsWithJo) {
      if (titleText === pattern) {
        return article;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// SupplProvision / AppdxTable node search
// ---------------------------------------------------------------------------

/**
 * Collect all SupplProvision nodes from LawBody.
 */
function findSupplProvisionNodes(root: LawNode): LawNode[] {
  const lawBody = findDeep(root, "LawBody");
  if (!lawBody?.children) return [];
  return lawBody.children.filter(
    (c): c is LawNode => isLawNode(c) && c.tag === "SupplProvision",
  );
}

/**
 * Find the original (non-amendment) SupplProvision.
 * The original one has no AmendLawNum attribute.
 */
function findOriginalSupplProvision(root: LawNode): LawNode | null {
  const supplNodes = findSupplProvisionNodes(root);
  return (
    supplNodes.find((n) => !n.attr?.["AmendLawNum"]) ?? supplNodes[0] ?? null
  );
}

/**
 * Parse a law number string into structured components.
 * Handles both user input (令和4年法律第69号) and XML attribute (令和四年六月一七日法律第六九号).
 */
interface ParsedLawNum {
  era: string;
  year: number;
  lawType: string;
  number: number;
}

/**
 * Aggressively normalize kanji digits in a string.
 * First applies standard normalizeKanjiNumbers (handles 十/百 notation like 六十九 -> 69),
 * then converts remaining positional kanji digit sequences (like 一七 -> 17, 六九 -> 69)
 * that appear in e-Gov XML AmendLawNum attributes.
 */
function normalizeKanjiNumbersAggressive(s: string): string {
  const pass1 = normalizeKanjiNumbers(s);
  return pass1.replace(/[〇一二三四五六七八九]+/g, (match) => {
    return [...match]
      .map((ch) => {
        const d = KANJI_DIGIT_MAP[ch];
        return d !== undefined ? String(d) : ch;
      })
      .join("");
  });
}

function parseLawNum(s: string): ParsedLawNum | null {
  const normalized = normalizeKanjiNumbersAggressive(s);
  const m = normalized.match(
    /(明治|大正|昭和|平成|令和)(\d+)年.*?(法律|政令|勅令|省令|府令|規則)第(\d+)号/,
  );
  if (!m) return null;
  return { era: m[1], year: Number(m[2]), lawType: m[3], number: Number(m[4]) };
}

/**
 * Match two law number strings by comparing era, year, law type, and number.
 * Ignores the date portion (e.g., 六月一七日) that appears in XML AmendLawNum attributes.
 */
function matchAmendLawNum(input: string, attrValue: string): boolean {
  const a = parseLawNum(input);
  const b = parseLawNum(attrValue);
  if (!a || !b) return false;
  return (
    a.era === b.era &&
    a.year === b.year &&
    a.lawType === b.lawType &&
    a.number === b.number
  );
}

/**
 * Find an amendment SupplProvision by law number.
 * Matches against AmendLawNum attribute and SupplProvisionLabel text,
 * using structural comparison (era, year, law type, number) to ignore
 * date portions that appear in XML attributes.
 */
function findAmendmentSupplProvision(
  root: LawNode,
  amendLawNum: string,
): LawNode | null {
  const supplNodes = findSupplProvisionNodes(root);

  return (
    supplNodes.find((n) => {
      // 1. Structural match against AmendLawNum attribute
      const attrVal = n.attr?.["AmendLawNum"];
      if (attrVal && matchAmendLawNum(amendLawNum, attrVal)) {
        return true;
      }
      // 2. Fallback: match against SupplProvisionLabel text
      const label = findChildByTag(n, "SupplProvisionLabel");
      if (label) {
        const labelText = extractText(label);
        if (matchAmendLawNum(amendLawNum, labelText)) return true;
      }
      return false;
    }) ?? null
  );
}

/**
 * Find an AppdxTable node by table number.
 * Tries Num attribute first, then falls back to title text matching.
 */
function findAppdxTableNode(root: LawNode, tableNum: string): LawNode | null {
  const lawBody = findDeep(root, "LawBody");
  if (!lawBody?.children) return null;

  const appdxTables = lawBody.children.filter(
    (c): c is LawNode => isLawNode(c) && c.tag === "AppdxTable",
  );

  // Primary: match by Num attribute
  const byNum = appdxTables.find((n) => n.attr?.["Num"] === tableNum);
  if (byNum) return byNum;

  // Fallback: match by title text containing the number
  return (
    appdxTables.find((n) => {
      const titleNode = findChildByTag(n, "AppdxTableTitle");
      if (!titleNode) return false;
      const titleText = extractText(titleNode).trim();
      const normalizedTitle = normalizeKanjiNumbers(titleText);
      return normalizedTitle.includes(`別表第${tableNum}`);
    }) ?? null
  );
}

// ---------------------------------------------------------------------------
// SupplProvision / AppdxTable -> ParsedArticle conversion
// ---------------------------------------------------------------------------

/**
 * Convert a SupplProvision node to a ParsedArticle.
 */
function supplProvisionToParsed(node: LawNode): ParsedArticle {
  const labelNode = findChildByTag(node, "SupplProvisionLabel");
  const label = labelNode ? extractText(labelNode).trim() : "附則";
  const lines: string[] = [];
  renderSupplProvision(node, lines);
  const text = lines.join("\n").trim();
  const references = detectReferences(text);
  return {
    article_num: "suppl",
    article_caption: "",
    article_title: label,
    text,
    ...(references.length > 0 ? { references } : {}),
  };
}

/**
 * Convert an AppdxTable node to a ParsedArticle.
 */
function appdxTableToParsed(node: LawNode): ParsedArticle {
  const titleNode = findChildByTag(node, "AppdxTableTitle");
  const title = titleNode ? extractText(titleNode).trim() : "別表";
  const lines: string[] = [];
  renderAppdxTable(node, lines);
  const text = lines.join("\n").trim();
  const references = detectReferences(text);
  return {
    article_num: `appdx_${node.attr?.["Num"] ?? ""}`,
    article_caption: "",
    article_title: title,
    text,
    ...(references.length > 0 ? { references } : {}),
  };
}

/**
 * Convert a SupplProvision node to a StructuredArticle (pseudo).
 */
function supplProvisionToStructured(node: LawNode): StructuredArticle {
  const labelNode = findChildByTag(node, "SupplProvisionLabel");
  const label = labelNode ? extractText(labelNode).trim() : "附則";
  const lines: string[] = [];
  renderSupplProvision(node, lines);
  const text = lines.join("\n").trim();
  const references = detectReferences(text);
  return {
    article_num: "suppl",
    article_caption: "",
    article_title: label,
    paragraphs: [
      {
        paragraph_num: "1",
        paragraph_sentence: text,
        items: [],
      },
    ],
    ...(references.length > 0 ? { references } : {}),
  };
}

/**
 * Convert an AppdxTable node to a StructuredArticle (pseudo).
 */
function appdxTableToStructured(node: LawNode): StructuredArticle {
  const titleNode = findChildByTag(node, "AppdxTableTitle");
  const title = titleNode ? extractText(titleNode).trim() : "別表";
  const lines: string[] = [];
  renderAppdxTable(node, lines);
  const text = lines.join("\n").trim();
  const references = detectReferences(text);
  return {
    article_num: `appdx_${node.attr?.["Num"] ?? ""}`,
    article_caption: "",
    article_title: title,
    paragraphs: [
      {
        paragraph_num: "1",
        paragraph_sentence: text,
        items: [],
      },
    ],
    ...(references.length > 0 ? { references } : {}),
  };
}

// ---------------------------------------------------------------------------
// Special section dispatch (附則 / 別表)
// ---------------------------------------------------------------------------

/**
 * Resolve a special section request to a ParsedArticle.
 */
function resolveSpecialSectionParsed(
  root: LawNode,
  request: SpecialSectionRequest,
): ParsedArticle | null {
  switch (request.type) {
    case "suppl_all": {
      const node = findOriginalSupplProvision(root);
      return node ? supplProvisionToParsed(node) : null;
    }
    case "suppl_article": {
      const supplNode = findOriginalSupplProvision(root);
      if (!supplNode) return null;
      const article = findArticleNode(supplNode, request.articleNumber);
      return article ? articleNodeToParsed(article) : null;
    }
    case "suppl_amendment": {
      const node = findAmendmentSupplProvision(root, request.amendLawNum);
      return node ? supplProvisionToParsed(node) : null;
    }
    case "suppl_amendment_article": {
      const supplNode = findAmendmentSupplProvision(root, request.amendLawNum);
      if (!supplNode) return null;
      const article = findArticleNode(supplNode, request.articleNumber);
      return article ? articleNodeToParsed(article) : null;
    }
    case "appdx_table": {
      const node = findAppdxTableNode(root, request.tableNum);
      return node ? appdxTableToParsed(node) : null;
    }
  }
}

/**
 * Resolve a special section request to a StructuredArticle.
 */
function resolveSpecialSectionStructured(
  root: LawNode,
  request: SpecialSectionRequest,
): StructuredArticle | null {
  switch (request.type) {
    case "suppl_all": {
      const node = findOriginalSupplProvision(root);
      return node ? supplProvisionToStructured(node) : null;
    }
    case "suppl_article": {
      const supplNode = findOriginalSupplProvision(root);
      if (!supplNode) return null;
      const article = findArticleNode(supplNode, request.articleNumber);
      return article ? articleNodeToStructured(article) : null;
    }
    case "suppl_amendment": {
      const node = findAmendmentSupplProvision(root, request.amendLawNum);
      return node ? supplProvisionToStructured(node) : null;
    }
    case "suppl_amendment_article": {
      const supplNode = findAmendmentSupplProvision(root, request.amendLawNum);
      if (!supplNode) return null;
      const article = findArticleNode(supplNode, request.articleNumber);
      return article ? articleNodeToStructured(article) : null;
    }
    case "appdx_table": {
      const node = findAppdxTableNode(root, request.tableNum);
      return node ? appdxTableToStructured(node) : null;
    }
  }
}

// ---------------------------------------------------------------------------
// Structured article building
// ---------------------------------------------------------------------------

/**
 * Build a StructuredSubitem (or deeper) from an Item/Subitem node.
 */
function buildStructuredSubitems(
  parent: LawNode,
  depth: number,
): StructuredSubitem[] {
  const itemTag = `Subitem${depth}`;
  const items = findChildrenByTag(parent, itemTag);

  return items.map((item) => {
    const titleTag = `Subitem${depth}Title`;
    const sentenceTag = `Subitem${depth}Sentence`;

    const titleNode = findChildByTag(item, titleTag);
    const titleText = titleNode ? extractText(titleNode).trim() : "";

    const sentenceNode = findChildByTag(item, sentenceTag);
    const sentenceText = sentenceNode ? extractText(sentenceNode).trim() : "";

    return {
      subitem_num: item.attr?.["Num"] ?? "",
      subitem_title: titleText,
      subitem_sentence: sentenceText,
      subitems: buildStructuredSubitems(item, depth + 1),
    };
  });
}

/**
 * Build StructuredItem array from Item children of a parent node.
 */
function buildStructuredItems(parent: LawNode): StructuredItem[] {
  const items = findChildrenByTag(parent, "Item");

  return items.map((item) => {
    const titleNode = findChildByTag(item, "ItemTitle");
    const titleText = titleNode ? extractText(titleNode).trim() : "";

    const sentenceNode = findChildByTag(item, "ItemSentence");
    const sentenceText = sentenceNode ? extractText(sentenceNode).trim() : "";

    return {
      item_num: item.attr?.["Num"] ?? "",
      item_title: titleText,
      item_sentence: sentenceText,
      subitems: buildStructuredSubitems(item, 1),
    };
  });
}

/**
 * Build a StructuredParagraph from a Paragraph node.
 */
function buildStructuredParagraph(paragraph: LawNode): StructuredParagraph {
  const sentenceNode = findChildByTag(paragraph, "ParagraphSentence");
  const sentenceText = sentenceNode ? extractText(sentenceNode).trim() : "";

  return {
    paragraph_num: paragraph.attr?.["Num"] ?? "",
    paragraph_sentence: sentenceText,
    items: buildStructuredItems(paragraph),
  };
}

/**
 * Convert an Article node to a StructuredArticle.
 */
function articleNodeToStructured(article: LawNode): StructuredArticle {
  const num = article.attr?.["Num"] ?? "";

  const captionNode = findChildByTag(article, "ArticleCaption");
  const caption = captionNode ? extractText(captionNode).trim() : "";

  const titleNode = findChildByTag(article, "ArticleTitle");
  const title = titleNode ? extractText(titleNode).trim() : "";

  const paragraphs = findChildrenByTag(article, "Paragraph");
  const bodyText = renderArticleBody(article);
  const references = detectReferences(bodyText);

  return {
    article_num: num,
    article_caption: caption,
    article_title: title,
    paragraphs: paragraphs.map(buildStructuredParagraph),
    ...(references.length > 0 ? { references } : {}),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract a specific article from the law tree as plain text.
 *
 * `articleNumber` can be in any of these formats:
 *   "20", "第20条", "20条", "6条の2", "第6条の2", "第百条",
 *   "附則", "附則第3条", "附則（令和4年法律第69号）",
 *   "別表第一", "別表第1", "別表1"
 *
 * Returns null if the article is not found.
 */
export function parseArticle(
  root: LawNode,
  articleNumber: string,
): ParsedArticle | null {
  // Check for special section patterns (附則, 別表)
  const special = detectSpecialSection(articleNumber);
  if (special) {
    return resolveSpecialSectionParsed(root, special);
  }

  const node = findArticleNode(root, articleNumber);
  return node ? articleNodeToParsed(node) : null;
}

/**
 * Extract a specific article from the law tree as structured JSON.
 *
 * Same input formats as `parseArticle`. Returns hierarchical structure:
 * Article -> Paragraph -> Item -> Subitem.
 *
 * For 附則 (whole) and 別表, returns a pseudo StructuredArticle with
 * the rendered text in a single paragraph.
 */
export function parseArticleStructured(
  root: LawNode,
  articleNumber: string,
): StructuredArticle | null {
  // Check for special section patterns (附則, 別表)
  const special = detectSpecialSection(articleNumber);
  if (special) {
    return resolveSpecialSectionStructured(root, special);
  }

  const node = findArticleNode(root, articleNumber);
  return node ? articleNodeToStructured(node) : null;
}

/**
 * Extract ALL articles from the law tree as plain text.
 */
export function parseAllArticles(root: LawNode): ParsedArticle[] {
  const articleNodes = collectArticleNodes(root);
  return articleNodes.map(articleNodeToParsed);
}

/**
 * Extract ALL articles from the law tree as structured JSON.
 */
export function parseAllArticlesStructured(root: LawNode): StructuredArticle[] {
  const articleNodes = collectArticleNodes(root);
  return articleNodes.map(articleNodeToStructured);
}

/**
 * Convert entire law tree to formatted plain text.
 * Used by the `get_full_law` tool.
 *
 * Output format:
 * ```
 * {LawTitle}
 * {LawNum}
 *
 * {ChapterTitle}
 *
 * {ArticleCaption}
 * {ArticleTitle}
 * {paragraph text}
 * ...
 *
 * 附則
 * {supplement text}
 * ```
 */
export function parseFullLaw(root: LawNode): string {
  const lines: string[] = [];

  // The root should be a "Law" node with a "LawBody" child.
  const lawBody = findDeep(root, "LawBody");
  if (!lawBody) {
    // Fallback: try to render whatever we have.
    return extractText(root);
  }

  // Law title
  const lawTitle = findDeep(root, "LawTitle");
  if (lawTitle) {
    lines.push(extractText(lawTitle).trim());
  }

  // Law number
  const lawNum = findDeep(root, "LawNum");
  if (lawNum) {
    lines.push(extractText(lawNum).trim());
  }

  if (lines.length > 0) {
    lines.push("");
  }

  // Render the law body (MainProvision, SupplProvision, etc.)
  if (lawBody.children) {
    for (const child of lawBody.children) {
      if (!isLawNode(child)) {
        continue;
      }

      // Skip law title (already rendered above)
      if (child.tag === "LawTitle") {
        continue;
      }

      // Skip TOC
      if (child.tag === "TOC") {
        continue;
      }

      if (child.tag === "MainProvision") {
        renderProvision(child, lines);
      } else if (child.tag === "SupplProvision") {
        renderSupplProvision(child, lines);
      } else if (child.tag === "Preamble") {
        renderPreamble(child, lines);
      } else if (child.tag === "AppdxTable") {
        renderAppdxTable(child, lines);
      }
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Full law rendering helpers
// ---------------------------------------------------------------------------

/**
 * Find a node with the given tag anywhere in the tree (depth-first).
 */
function findDeep(node: LawNode, tag: string): LawNode | undefined {
  if (node.tag === tag) {
    return node;
  }
  if (!node.children) {
    return undefined;
  }
  for (const child of node.children) {
    if (isLawNode(child)) {
      const found = findDeep(child, tag);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/**
 * Render the MainProvision subtree into lines.
 */
function renderProvision(node: LawNode, lines: string[]): void {
  if (!node.children) {
    return;
  }

  for (const child of node.children) {
    if (!isLawNode(child)) {
      continue;
    }

    if (STRUCTURAL_TAGS.has(child.tag)) {
      renderStructural(child, lines);
    } else if (child.tag === "Article") {
      renderArticleForFullLaw(child, lines);
    } else if (child.tag === "Paragraph") {
      // Standalone paragraphs outside articles (rare but possible).
      renderParagraph(child, lines);
    } else if (child.tag === "TableStruct") {
      renderTableStructLines(child, lines);
    }
  }
}

/**
 * Render a structural container (Part, Chapter, Section, etc.).
 */
function renderStructural(node: LawNode, lines: string[]): void {
  if (!node.children) {
    return;
  }

  for (const child of node.children) {
    if (!isLawNode(child)) {
      continue;
    }

    if (STRUCTURAL_TITLE_TAGS.has(child.tag)) {
      lines.push("");
      lines.push(extractText(child).trim());
      lines.push("");
    } else if (STRUCTURAL_TAGS.has(child.tag)) {
      // Nested structural elements (e.g. Section inside Chapter).
      renderStructural(child, lines);
    } else if (child.tag === "Article") {
      renderArticleForFullLaw(child, lines);
    } else if (child.tag === "Paragraph") {
      renderParagraph(child, lines);
    } else if (child.tag === "TableStruct") {
      renderTableStructLines(child, lines);
    }
  }
}

/**
 * Render a single Article for the full law output.
 */
function renderArticleForFullLaw(article: LawNode, lines: string[]): void {
  const captionNode = findChildByTag(article, "ArticleCaption");
  const caption = captionNode ? extractText(captionNode).trim() : "";

  const titleNode = findChildByTag(article, "ArticleTitle");
  const title = titleNode ? extractText(titleNode).trim() : "";

  if (caption) {
    lines.push(caption);
  }
  if (title) {
    lines.push(title);
  }

  if (article.children) {
    for (const child of article.children) {
      if (!isLawNode(child)) {
        continue;
      }
      if (child.tag === "Paragraph") {
        renderParagraph(child, lines);
      } else if (child.tag === "TableStruct") {
        renderTableStructLines(child, lines);
      }
    }
  }

  // Blank line after each article for readability.
  lines.push("");
}

/**
 * Render SupplProvision (附則).
 */
function renderSupplProvision(node: LawNode, lines: string[]): void {
  // SupplProvision label
  const labelNode = findChildByTag(node, "SupplProvisionLabel");
  const label = labelNode ? extractText(labelNode).trim() : "附則";

  lines.push("");
  lines.push(label);
  lines.push("");

  if (!node.children) {
    return;
  }

  for (const child of node.children) {
    if (!isLawNode(child)) {
      continue;
    }

    if (child.tag === "SupplProvisionLabel") {
      // Already rendered above.
      continue;
    }

    if (child.tag === "Article") {
      renderArticleForFullLaw(child, lines);
    } else if (child.tag === "Paragraph") {
      renderParagraph(child, lines);
    } else if (STRUCTURAL_TAGS.has(child.tag)) {
      renderStructural(child, lines);
    } else if (child.tag === "TableStruct") {
      renderTableStructLines(child, lines);
    }
  }
}

/**
 * Render AppdxTable (別表).
 */
function renderAppdxTable(node: LawNode, lines: string[]): void {
  if (!node.children) return;

  lines.push("");

  for (const child of node.children) {
    if (!isLawNode(child)) continue;

    if (child.tag === "AppdxTableTitle") {
      lines.push(extractText(child).trim());
      lines.push("");
    } else if (child.tag === "TableStruct") {
      renderTableStructLines(child, lines);
    } else if (child.tag === "Table") {
      const tableText = renderTable(child);
      if (tableText) lines.push(tableText);
    } else if (child.tag === "Article") {
      renderArticleForFullLaw(child, lines);
    } else if (child.tag === "Paragraph") {
      renderParagraph(child, lines);
    } else if (child.tag === "Item") {
      // Some AppdxTable have Item children directly
      renderItem(child, lines, 0);
    }
  }
}

/**
 * Render Preamble (前文).
 */
function renderPreamble(node: LawNode, lines: string[]): void {
  if (!node.children) {
    return;
  }

  for (const child of node.children) {
    if (!isLawNode(child)) {
      continue;
    }

    if (child.tag === "Paragraph") {
      renderParagraph(child, lines);
    }
  }

  lines.push("");
}
