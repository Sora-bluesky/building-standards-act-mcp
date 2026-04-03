import type { KokujiPreset } from "./types.js";

/**
 * Kokuji (ministerial notification) registry.
 *
 * All kokuji are fetched dynamically from the MLIT (国土交通省) pipeline
 * using title matching. No hardcoded presets — this avoids stale data
 * after amendments and ensures hallucination checks always use live data.
 *
 * The registry class is retained for API compatibility but contains
 * no presets. It returns empty results for all lookups.
 */
const ALL_KOKUJI_PRESETS: KokujiPreset[] = [];

/**
 * Registry for looking up kokuji (ministerial notification) presets.
 *
 * Currently empty — all kokuji are fetched dynamically from the MLIT
 * database. This class is retained for API compatibility with get-kokuji.ts.
 */
export class KokujiRegistry {
  private readonly presets: KokujiPreset[];

  constructor() {
    this.presets = ALL_KOKUJI_PRESETS;
  }

  /**
   * Find a single kokuji by exact title or abbreviation.
   * Falls back to partial match if no exact/abbreviation match is found.
   */
  findByName(name: string): KokujiPreset | undefined {
    const exact = this.presets.find((p) => p.title === name);
    if (exact) return exact;

    const abbr = this.presets.find((p) => p.abbrev.some((a) => a === name));
    if (abbr) return abbr;

    return this.presets.find(
      (p) => p.title.includes(name) || name.includes(p.title),
    );
  }

  /**
   * Get a defensive copy of all kokuji presets.
   */
  getAll(): KokujiPreset[] {
    return [...this.presets];
  }

  /**
   * Search kokuji by keyword (partial match on title and abbreviations).
   */
  search(keyword: string): KokujiPreset[] {
    return this.presets.filter(
      (p) =>
        p.title.includes(keyword) ||
        p.abbrev.some((a) => a.includes(keyword)) ||
        keyword.includes(p.title),
    );
  }
}
