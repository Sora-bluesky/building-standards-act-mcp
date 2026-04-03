import { getLawRevisions } from "./egov-client.js";
import type { ResolvedLaw, LawUpdateCheckResult } from "./types.js";

const RATE_LIMIT_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if a single resolved law has revisions or has been repealed.
 */
export async function checkLawUpdate(
  resolved: ResolvedLaw,
): Promise<LawUpdateCheckResult> {
  try {
    const response = await getLawRevisions(resolved.law_id);
    const revisions = response.revisions;

    if (revisions.length === 0) {
      return {
        title: resolved.title,
        law_id: resolved.law_id,
        status: "current",
      };
    }

    // Revisions are sorted newest-first by the API
    const latest = revisions[0];

    // Check for repeal
    if (
      latest.repeal_status !== "" &&
      latest.repeal_status.toLowerCase() !== "none"
    ) {
      return {
        title: resolved.title,
        law_id: resolved.law_id,
        status: "repealed",
        latest_amendment_date: latest.amendment_promulgate_date,
        latest_amendment_law:
          latest.amendment_law_title || latest.amendment_law_num,
      };
    }

    // Report whether revisions exist
    const amendmentDate = latest.amendment_promulgate_date;
    const hasRevisions = amendmentDate !== "";

    return {
      title: resolved.title,
      law_id: resolved.law_id,
      status: hasRevisions ? "has_revisions" : "current",
      latest_amendment_date: amendmentDate || undefined,
      latest_amendment_law:
        latest.amendment_law_title || latest.amendment_law_num || undefined,
    };
  } catch (error) {
    return {
      title: resolved.title,
      law_id: resolved.law_id,
      status: "error",
      error_message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check multiple resolved laws for updates with rate limiting.
 */
export async function checkLawUpdates(
  resolvedLaws: ResolvedLaw[],
): Promise<LawUpdateCheckResult[]> {
  const results: LawUpdateCheckResult[] = [];

  for (let i = 0; i < resolvedLaws.length; i++) {
    const result = await checkLawUpdate(resolvedLaws[i]);
    results.push(result);

    // Rate limiting: wait between API calls (skip after the last one)
    if (i < resolvedLaws.length - 1) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  return results;
}

/**
 * Get full revision history for a single resolved law.
 */
export async function getLawRevisionHistory(
  resolved: ResolvedLaw,
): Promise<LawUpdateCheckResult> {
  try {
    const response = await getLawRevisions(resolved.law_id);

    const latest = response.revisions[0];
    const amendmentDate = latest?.amendment_promulgate_date ?? "";
    const isRepealed =
      latest &&
      latest.repeal_status !== "" &&
      latest.repeal_status.toLowerCase() !== "none";
    const hasRevisions = !isRepealed && amendmentDate !== "";

    return {
      title: resolved.title,
      law_id: resolved.law_id,
      status: isRepealed
        ? "repealed"
        : hasRevisions
          ? "has_revisions"
          : "current",
      latest_amendment_date: amendmentDate || undefined,
      latest_amendment_law:
        latest?.amendment_law_title || latest?.amendment_law_num || undefined,
      revisions: response.revisions,
    };
  } catch (error) {
    return {
      title: resolved.title,
      law_id: resolved.law_id,
      status: "error",
      error_message: error instanceof Error ? error.message : String(error),
    };
  }
}
