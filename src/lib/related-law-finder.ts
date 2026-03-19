import { getLawData } from "./egov-client.js";
import { parseArticle } from "./egov-parser.js";
import { formatArticleRef } from "./errors.js";
import { LawRegistry } from "./law-registry.js";
import type { ArticleReference, RelatedLawSuggestion } from "./types.js";

const registry = new LawRegistry();

/**
 * Infer delegation target type from raw reference text.
 */
function inferDelegationType(rawText: string): string {
  if (rawText.includes("政令")) return "政令";
  if (rawText.includes("省令")) return "省令";
  if (rawText.includes("国土交通大臣")) return "告示";
  if (rawText.includes("条例")) return "条例";
  return "その他";
}

/**
 * Find related laws for a given article by analyzing its cross-references.
 */
export async function findRelatedLaws(
  lawName: string,
  articleNumber: string,
): Promise<RelatedLawSuggestion> {
  const preset = registry.findByName(lawName);
  if (!preset) {
    throw new Error(`法令「${lawName}」がプリセットに見つかりませんでした。`);
  }

  const lawData = await getLawData(preset.law_id);
  const article = parseArticle(lawData.law_full_text, articleNumber);

  if (!article) {
    throw new Error(
      `${preset.title}に${formatArticleRef(articleNumber)}が見つかりませんでした。`,
    );
  }

  const refs = article.references ?? [];

  // Categorize references
  const directlyReferenced = extractCrossLawRefs(refs);
  const delegatedTo = extractDelegationRefs(refs);
  const sameLawRefs = extractSameLawRefs(refs);

  // Get same-group laws (excluding the source law itself)
  const sameGroupLaws = registry
    .getByGroup(preset.group)
    .filter((p) => p.law_id !== preset.law_id)
    .map((p) => ({ law_name: p.title, law_id: p.law_id }));

  return {
    source_law: preset.title,
    source_article: articleNumber,
    directly_referenced: directlyReferenced,
    delegated_to: delegatedTo,
    same_law_references: sameLawRefs,
    same_group_laws: sameGroupLaws,
  };
}

function extractCrossLawRefs(
  refs: ArticleReference[],
): RelatedLawSuggestion["directly_referenced"] {
  const seen = new Set<string>();
  const results: RelatedLawSuggestion["directly_referenced"] = [];

  for (const ref of refs) {
    if (ref.ref_type !== "cross_law" || !ref.target_law) continue;

    const key = `${ref.target_law}:${ref.target_article ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const preset = registry.findByName(ref.target_law);
    results.push({
      law_name: ref.target_law,
      article: ref.target_article,
      raw_text: ref.raw_text,
      preset_available: preset !== null,
    });
  }

  return results;
}

function extractDelegationRefs(
  refs: ArticleReference[],
): RelatedLawSuggestion["delegated_to"] {
  const seen = new Set<string>();
  const results: RelatedLawSuggestion["delegated_to"] = [];

  for (const ref of refs) {
    if (ref.ref_type !== "delegation") continue;
    if (seen.has(ref.raw_text)) continue;
    seen.add(ref.raw_text);

    results.push({
      raw_text: ref.raw_text,
      target_type: inferDelegationType(ref.raw_text),
    });
  }

  return results;
}

function extractSameLawRefs(
  refs: ArticleReference[],
): RelatedLawSuggestion["same_law_references"] {
  const seen = new Set<string>();
  const results: RelatedLawSuggestion["same_law_references"] = [];

  for (const ref of refs) {
    if (ref.ref_type !== "same_law" || !ref.target_article) continue;

    if (seen.has(ref.target_article)) continue;
    seen.add(ref.target_article);

    results.push({
      article: ref.target_article,
      raw_text: ref.raw_text,
    });
  }

  return results;
}
