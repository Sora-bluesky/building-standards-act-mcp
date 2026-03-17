import { getLawRevisions } from "./egov-client.js";
import type { LawPreset, LawUpdateCheckResult } from "./types.js";

const RATE_LIMIT_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if a single law preset has been updated since its last verification.
 * Compares the latest revision's amendment_promulgate_date against preset.verified_at.
 */
export async function checkLawUpdate(
  preset: LawPreset,
): Promise<LawUpdateCheckResult> {
  try {
    const response = await getLawRevisions(preset.law_id);
    const revisions = response.revisions;

    if (revisions.length === 0) {
      return {
        title: preset.title,
        law_id: preset.law_id,
        status: "up_to_date",
        verified_at: preset.verified_at,
      };
    }

    // Revisions are sorted newest-first by the API
    const latest = revisions[0];

    // Check for repeal
    if (latest.repeal_status !== "" && latest.repeal_status !== "none") {
      return {
        title: preset.title,
        law_id: preset.law_id,
        status: "repealed",
        verified_at: preset.verified_at,
        latest_amendment_date: latest.amendment_promulgate_date,
        latest_amendment_law:
          latest.amendment_law_title || latest.amendment_law_num,
      };
    }

    // Compare amendment date against verified_at
    const amendmentDate = latest.amendment_promulgate_date;
    const isUpdated =
      amendmentDate !== "" && amendmentDate > preset.verified_at;

    return {
      title: preset.title,
      law_id: preset.law_id,
      status: isUpdated ? "updated" : "up_to_date",
      verified_at: preset.verified_at,
      latest_amendment_date: amendmentDate || undefined,
      latest_amendment_law:
        latest.amendment_law_title || latest.amendment_law_num || undefined,
    };
  } catch (error) {
    return {
      title: preset.title,
      law_id: preset.law_id,
      status: "error",
      verified_at: preset.verified_at,
      error_message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check multiple presets for updates with rate limiting.
 */
export async function checkLawUpdates(
  presets: LawPreset[],
): Promise<LawUpdateCheckResult[]> {
  const results: LawUpdateCheckResult[] = [];

  for (let i = 0; i < presets.length; i++) {
    const result = await checkLawUpdate(presets[i]);
    results.push(result);

    // Rate limiting: wait between API calls (skip after the last one)
    if (i < presets.length - 1) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  return results;
}

/**
 * Get full revision history for a single law.
 */
export async function getLawRevisionHistory(
  preset: LawPreset,
): Promise<LawUpdateCheckResult> {
  try {
    const response = await getLawRevisions(preset.law_id);

    const latest = response.revisions[0];
    const amendmentDate = latest?.amendment_promulgate_date ?? "";
    const isRepealed =
      latest && latest.repeal_status !== "" && latest.repeal_status !== "none";
    const isUpdated =
      !isRepealed && amendmentDate !== "" && amendmentDate > preset.verified_at;

    return {
      title: preset.title,
      law_id: preset.law_id,
      status: isRepealed ? "repealed" : isUpdated ? "updated" : "up_to_date",
      verified_at: preset.verified_at,
      latest_amendment_date: amendmentDate || undefined,
      latest_amendment_law:
        latest?.amendment_law_title || latest?.amendment_law_num || undefined,
      revisions: response.revisions,
    };
  } catch (error) {
    return {
      title: preset.title,
      law_id: preset.law_id,
      status: "error",
      verified_at: preset.verified_at,
      error_message: error instanceof Error ? error.message : String(error),
    };
  }
}
