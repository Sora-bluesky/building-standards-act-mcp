import { TTLCache } from "./cache.js";
import { EgovApiError } from "./errors.js";
import type { EgovLawSearchResponse, EgovLawDataResponse } from "./types.js";

const BASE_URL = "https://laws.e-gov.go.jp/api/2";
const SEARCH_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const LAW_DATA_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const REQUEST_TIMEOUT = 30_000; // 30 seconds

const searchCache = new TTLCache<EgovLawSearchResponse>(SEARCH_CACHE_TTL);
const lawDataCache = new TTLCache<EgovLawDataResponse>(LAW_DATA_CACHE_TTL);

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new EgovApiError(
        `e-Gov API returned ${response.status}: ${response.statusText}`,
        response.status,
        url,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof EgovApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new EgovApiError("e-Gov API request timed out", undefined, url);
    }
    throw new EgovApiError(
      `e-Gov API request failed: ${error instanceof Error ? error.message : String(error)}`,
      undefined,
      url,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Search laws by title keyword.
 * Uses GET /api/2/laws?law_title={keyword}
 */
export async function searchLaws(
  lawTitle: string,
): Promise<EgovLawSearchResponse> {
  const cacheKey = `search:${lawTitle}`;
  const cached = searchCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `${BASE_URL}/laws?law_title=${encodeURIComponent(lawTitle)}`;
  const result = await fetchJson<EgovLawSearchResponse>(url);

  searchCache.set(cacheKey, result);
  return result;
}

/**
 * Get full law data by lawId.
 * Uses GET /api/2/law_data/{lawId}
 */
export async function getLawData(lawId: string): Promise<EgovLawDataResponse> {
  const cacheKey = `law:${lawId}`;
  const cached = lawDataCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `${BASE_URL}/law_data/${encodeURIComponent(lawId)}`;
  const result = await fetchJson<EgovLawDataResponse>(url);

  lawDataCache.set(cacheKey, result);
  return result;
}
