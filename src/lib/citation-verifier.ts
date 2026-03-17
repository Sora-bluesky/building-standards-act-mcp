import { getLawData } from "./egov-client.js";
import { parseArticle } from "./egov-parser.js";
import { LawRegistry } from "./law-registry.js";
import type { CitationVerification } from "./types.js";

const registry = new LawRegistry();

const MAX_PREVIEW_LENGTH = 200;

/**
 * Normalize text for comparison: collapse whitespace, remove formatting artifacts.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, "")
    .replace(/[、。，．・]/g, "")
    .replace(/[（）()「」『』【】]/g, "");
}

/**
 * Calculate match score between claimed text and actual text.
 * Returns a value between 0.0 and 1.0.
 */
export function calculateMatchScore(claimed: string, actual: string): number {
  const normClaimed = normalizeText(claimed);
  const normActual = normalizeText(actual);

  if (normClaimed.length === 0 || normActual.length === 0) {
    return 0;
  }

  // Check if claimed text is contained in actual text
  if (normActual.includes(normClaimed)) {
    return 1.0;
  }

  // Check if actual text is contained in claimed text
  if (normClaimed.includes(normActual)) {
    return 1.0;
  }

  // Calculate longest common substring ratio
  const lcsLength = longestCommonSubstringLength(normClaimed, normActual);
  const maxLen = Math.max(normClaimed.length, normActual.length);

  return lcsLength / maxLen;
}

/**
 * Find the length of the longest common substring.
 * Uses a space-optimized DP approach.
 */
function longestCommonSubstringLength(a: string, b: string): number {
  // Limit input size to avoid excessive memory usage
  const maxLen = 500;
  const sa = a.length > maxLen ? a.slice(0, maxLen) : a;
  const sb = b.length > maxLen ? b.slice(0, maxLen) : b;

  let maxFound = 0;
  const prev = new Uint16Array(sb.length + 1);
  const curr = new Uint16Array(sb.length + 1);

  for (let i = 1; i <= sa.length; i++) {
    for (let j = 1; j <= sb.length; j++) {
      if (sa[i - 1] === sb[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > maxFound) {
          maxFound = curr[j];
        }
      } else {
        curr[j] = 0;
      }
    }
    prev.set(curr);
    curr.fill(0);
  }

  return maxFound;
}

/**
 * Truncate text for preview, adding ellipsis if needed.
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

/**
 * Verify a single citation against the actual law text.
 */
export async function verifyCitation(
  lawName: string,
  articleNumber: string,
  claimedText?: string,
): Promise<CitationVerification> {
  try {
    const preset = registry.findByName(lawName);
    if (!preset) {
      return {
        law_name: lawName,
        article_number: articleNumber,
        status: "law_not_found",
        error_message: `法令「${lawName}」がプリセットに見つかりませんでした。`,
      };
    }

    const lawData = await getLawData(preset.law_id);
    const article = parseArticle(lawData.law_full_text, articleNumber);

    if (!article) {
      return {
        law_name: preset.title,
        article_number: articleNumber,
        status: "article_not_found",
        error_message: `${preset.title}に第${articleNumber}条が見つかりませんでした。`,
      };
    }

    // If no claimed text, just verify existence
    if (!claimedText || claimedText.trim() === "") {
      return {
        law_name: preset.title,
        article_number: articleNumber,
        status: "verified",
        actual_text: truncate(article.text, MAX_PREVIEW_LENGTH),
      };
    }

    // Compare claimed text against actual text
    const score = calculateMatchScore(claimedText, article.text);

    if (score >= 0.8) {
      return {
        law_name: preset.title,
        article_number: articleNumber,
        status: "verified",
        match_score: Math.round(score * 100) / 100,
        actual_text: truncate(article.text, MAX_PREVIEW_LENGTH),
      };
    }

    return {
      law_name: preset.title,
      article_number: articleNumber,
      status: "mismatch",
      match_score: Math.round(score * 100) / 100,
      actual_text: truncate(article.text, MAX_PREVIEW_LENGTH),
      mismatch_detail:
        score < 0.3
          ? "主張されたテキストと実際の条文に大きな相違があります。"
          : "主張されたテキストと実際の条文に部分的な相違があります。",
    };
  } catch (error) {
    return {
      law_name: lawName,
      article_number: articleNumber,
      status: "error",
      error_message: error instanceof Error ? error.message : String(error),
    };
  }
}
