import { getLawData } from "./egov-client.js";
import { parseArticleStructured } from "./egov-parser.js";
import { formatArticleRef } from "./errors.js";
import { resolveLawId } from "./law-resolver.js";
import type { ArticleAnalysis, StructuredArticle } from "./types.js";

const PREVIEW_LENGTH = 100;

/**
 * Remove parentheses from caption text.
 * "（構造耐力）" → "構造耐力"
 */
function stripParentheses(caption: string): string {
  return caption.replace(/^[（(]/, "").replace(/[）)]$/, "");
}

/**
 * Count total characters in a structured article.
 */
function countCharacters(article: StructuredArticle): number {
  let count = 0;
  for (const para of article.paragraphs) {
    count += para.paragraph_sentence.length;
    for (const item of para.items) {
      count += item.item_sentence.length;
      for (const sub of item.subitems) {
        count += countSubitemChars(sub);
      }
    }
  }
  return count;
}

function countSubitemChars(
  sub: StructuredArticle["paragraphs"][0]["items"][0]["subitems"][0],
): number {
  let count = sub.subitem_sentence.length;
  for (const child of sub.subitems) {
    count += countSubitemChars(child);
  }
  return count;
}

/**
 * Count total subitems recursively.
 */
function countSubitems(article: StructuredArticle): number {
  let count = 0;
  for (const para of article.paragraphs) {
    for (const item of para.items) {
      count += countSubitemsRecursive(item.subitems);
    }
  }
  return count;
}

function countSubitemsRecursive(
  subs: StructuredArticle["paragraphs"][0]["items"][0]["subitems"],
): number {
  let count = subs.length;
  for (const sub of subs) {
    count += countSubitemsRecursive(sub.subitems);
  }
  return count;
}

/**
 * Analyze a single article and return structured metadata.
 */
export async function analyzeArticle(
  lawName: string,
  articleNumber: string,
): Promise<ArticleAnalysis> {
  const resolved = await resolveLawId(lawName);
  if (!resolved) {
    throw new Error(`法令「${lawName}」が見つかりませんでした。`);
  }

  const lawData = await getLawData(resolved.law_id);
  const article = parseArticleStructured(lawData.law_full_text, articleNumber);

  if (!article) {
    throw new Error(
      `${resolved.title}に${formatArticleRef(articleNumber)}が見つかりませんでした。`,
    );
  }

  const itemCount = article.paragraphs.reduce(
    (sum, p) => sum + p.items.length,
    0,
  );

  const refs = article.references ?? [];
  const crossLawRefs = refs.filter((r) => r.ref_type === "cross_law");
  const referencedLaws = [
    ...new Set(
      crossLawRefs
        .map((r) => r.target_law)
        .filter((l): l is string => l !== undefined),
    ),
  ];

  return {
    law_name: resolved.title,
    law_num: resolved.law_num,
    article_num: article.article_num,
    article_title: article.article_title,
    caption: stripParentheses(article.article_caption),
    structure: {
      paragraph_count: article.paragraphs.length,
      item_count: itemCount,
      subitem_count: countSubitems(article),
      total_characters: countCharacters(article),
    },
    paragraph_summaries: article.paragraphs.map((p) => ({
      paragraph_num: p.paragraph_num,
      preview:
        p.paragraph_sentence.length > PREVIEW_LENGTH
          ? p.paragraph_sentence.slice(0, PREVIEW_LENGTH) + "…"
          : p.paragraph_sentence,
      item_count: p.items.length,
    })),
    reference_summary: {
      total: refs.length,
      cross_law: crossLawRefs.length,
      same_law: refs.filter((r) => r.ref_type === "same_law").length,
      relative: refs.filter((r) => r.ref_type === "relative").length,
      delegation: refs.filter((r) => r.ref_type === "delegation").length,
      referenced_laws: referencedLaws,
    },
    structured_data: article,
  };
}
