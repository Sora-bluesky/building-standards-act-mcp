import type { EgovLawEntry } from "./types.js";

/**
 * Extract the display title from an e-Gov law entry.
 */
function getLawTitle(law: EgovLawEntry): string {
  return (
    law.revision_info?.law_title ?? law.current_revision_info?.law_title ?? ""
  );
}

/**
 * Find the best matching law from e-Gov API search results.
 *
 * e-Gov API returns partial-match results sorted by law number (chronological),
 * NOT by relevance. Without this function, laws with long names containing
 * common phrases (e.g. バリアフリー法) get misresolved to unrelated older laws.
 *
 * Priority:
 * 1. Exact title match (handles バリアフリー法, 建築物省エネ法, etc.)
 * 2. Shortest title containing the search name (handles 消防法 vs 消防法施行令)
 * 3. First result (fallback)
 */
export function findBestMatch(
  laws: EgovLawEntry[],
  searchName: string,
): EgovLawEntry {
  // 1. Exact match — most reliable
  const exact = laws.find((law) => getLawTitle(law) === searchName);
  if (exact) return exact;

  // 2. Shortest containing match — prefer most specific law
  const containing = laws
    .filter((law) => getLawTitle(law).includes(searchName))
    .sort((a, b) => getLawTitle(a).length - getLawTitle(b).length);
  if (containing.length > 0) return containing[0];

  // 3. Fallback to first result
  return laws[0];
}
