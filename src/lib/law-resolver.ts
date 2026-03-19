import { findBestMatch } from "./best-match.js";
import { LawRegistry } from "./law-registry.js";
import { searchLaws } from "./egov-client.js";
import type { ResolvedLaw } from "./types.js";

const registry = new LawRegistry();

/**
 * Resolve a law name to a law_id via e-Gov API search.
 *
 * 1. Expand abbreviation using the alias registry (e.g. 建基法 → 建築基準法)
 * 2. Search e-Gov API with the (expanded) name to get the law_id
 *
 * Returns null if the law cannot be found.
 */
export async function resolveLawId(
  lawName: string,
): Promise<ResolvedLaw | null> {
  // Step 1: Expand abbreviation (instant, no network)
  const alias = registry.findByName(lawName);
  const searchName = alias?.title ?? lawName;

  // Step 2: Search e-Gov API for law_id
  try {
    const result = await searchLaws(searchName);
    if (result.count === 0) return null;

    const best = findBestMatch(result.laws, searchName);
    return {
      law_id: best.law_info.law_id,
      title:
        best.revision_info?.law_title ??
        best.current_revision_info?.law_title ??
        searchName,
      law_num: best.law_info.law_num,
      source: alias ? "alias" : "egov_search",
    };
  } catch {
    return null;
  }
}
