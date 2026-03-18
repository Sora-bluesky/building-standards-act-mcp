/**
 * In-memory metrics collector for tool calls, API requests, and cache hits.
 * Resets on server restart (intentional — lightweight, no external deps).
 */

interface CallStats {
  count: number;
  total_ms: number;
  errors: number;
}

interface CacheStats {
  hits: number;
  misses: number;
}

const toolCalls = new Map<string, CallStats>();
const apiCalls = new Map<string, CallStats>();
const cacheStats = new Map<string, CacheStats>();

let startedAt = Date.now();

function getOrCreate<T>(map: Map<string, T>, key: string, init: () => T): T {
  let entry = map.get(key);
  if (!entry) {
    entry = init();
    map.set(key, entry);
  }
  return entry;
}

/** Record a tool call (duration in ms, success/failure). */
export function recordToolCall(
  toolName: string,
  durationMs: number,
  success: boolean,
): void {
  const stats = getOrCreate(toolCalls, toolName, () => ({
    count: 0,
    total_ms: 0,
    errors: 0,
  }));
  stats.count++;
  stats.total_ms += durationMs;
  if (!success) {
    stats.errors++;
  }
}

/** Record an API call (duration in ms, HTTP status code). */
export function recordApiCall(
  endpoint: string,
  durationMs: number,
  statusCode?: number,
): void {
  const stats = getOrCreate(apiCalls, endpoint, () => ({
    count: 0,
    total_ms: 0,
    errors: 0,
  }));
  stats.count++;
  stats.total_ms += durationMs;
  if (statusCode === undefined || statusCode >= 400) {
    stats.errors++;
  }
}

/** Record a cache hit or miss. */
export function recordCacheHit(cacheName: string, hit: boolean): void {
  const stats = getOrCreate(cacheStats, cacheName, () => ({
    hits: 0,
    misses: 0,
  }));
  if (hit) {
    stats.hits++;
  } else {
    stats.misses++;
  }
}

/** Return aggregated metrics snapshot. */
export function getMetrics(): Record<string, unknown> {
  const tools: Record<string, unknown> = {};
  for (const [name, stats] of toolCalls) {
    tools[name] = {
      calls: stats.count,
      avg_ms: stats.count > 0 ? Math.round(stats.total_ms / stats.count) : 0,
      errors: stats.errors,
    };
  }

  const api: Record<string, unknown> = {};
  for (const [endpoint, stats] of apiCalls) {
    api[endpoint] = {
      requests: stats.count,
      avg_ms: stats.count > 0 ? Math.round(stats.total_ms / stats.count) : 0,
      errors: stats.errors,
      error_rate:
        stats.count > 0
          ? `${((stats.errors / stats.count) * 100).toFixed(1)}%`
          : "0.0%",
    };
  }

  const cache: Record<string, unknown> = {};
  for (const [name, stats] of cacheStats) {
    const total = stats.hits + stats.misses;
    cache[name] = {
      hits: stats.hits,
      misses: stats.misses,
      hit_rate:
        total > 0 ? `${((stats.hits / total) * 100).toFixed(1)}%` : "0.0%",
    };
  }

  return {
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    tools,
    api,
    cache,
  };
}

/** Reset all metrics (for testing). */
export function _resetMetrics(): void {
  toolCalls.clear();
  apiCalls.clear();
  cacheStats.clear();
  startedAt = Date.now();
}
