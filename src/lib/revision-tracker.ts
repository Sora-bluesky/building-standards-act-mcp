import { getLawRevisions, hasRevisionsCached } from "./egov-client.js";
import type { ResolvedLaw, LawUpdateCheckResult } from "./types.js";

const DEFAULT_RATE_LIMIT_MS = 200;
export const RATE_LIMIT_DELAY_MS =
  Number(process.env.BUILDING_LAW_RATE_LIMIT_MS) || DEFAULT_RATE_LIMIT_MS;
const DEFAULT_CONCURRENCY = 5;
export const CONCURRENCY =
  Number(process.env.BUILDING_LAW_CONCURRENCY) || DEFAULT_CONCURRENCY;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run an async mapper over items with bounded concurrency.
 * Preserves input order in the returned results array.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
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
 * Check multiple resolved laws for updates with bounded concurrency.
 * Rate-limit delay is applied only when the revisions response was NOT cached.
 */
export async function checkLawUpdates(
  resolvedLaws: ResolvedLaw[],
): Promise<LawUpdateCheckResult[]> {
  return mapWithConcurrency(
    resolvedLaws,
    async (resolved) => {
      const wasCached = hasRevisionsCached(resolved.law_id);
      const result = await checkLawUpdate(resolved);
      if (!wasCached) {
        await sleep(RATE_LIMIT_DELAY_MS);
      }
      return result;
    },
    CONCURRENCY,
  );
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
