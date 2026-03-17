import type { LawNode, ParsedArticle } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABLE_PLACEHOLDER = "[表]";
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

  // Strip leading "第" and trailing "条"
  s = s.replace(/^第/, "");
  s = s.replace(/条$/, "");

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

  if (node.tag === "Table" || node.tag === "TableStruct") {
    return TABLE_PLACEHOLDER;
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

  const paragraphs = findChildrenByTag(article, "Paragraph");

  for (const paragraph of paragraphs) {
    renderParagraph(paragraph, lines);
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

  return {
    article_num: num,
    article_caption: caption,
    article_title: title,
    text,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract a specific article from the law tree.
 *
 * `articleNumber` can be in any of these formats:
 *   "20", "第20条", "20条", "6条の2", "第6条の2", "第百条"
 *
 * Returns null if the article is not found.
 */
export function parseArticle(
  root: LawNode,
  articleNumber: string,
): ParsedArticle | null {
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
        return articleNodeToParsed(article);
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
        return articleNodeToParsed(article);
      }
    }
  }

  return null;
}

/**
 * Extract ALL articles from the law tree.
 */
export function parseAllArticles(root: LawNode): ParsedArticle[] {
  const articleNodes = collectArticleNodes(root);
  return articleNodes.map(articleNodeToParsed);
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

  const paragraphs = findChildrenByTag(article, "Paragraph");
  for (const paragraph of paragraphs) {
    renderParagraph(paragraph, lines);
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
