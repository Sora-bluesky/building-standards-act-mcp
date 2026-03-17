import type { LawPreset } from "./types.js";
import { ALL_LAW_PRESETS } from "../data/law-presets/index.js";

/**
 * Registry for looking up pre-verified law presets by name, abbreviation,
 * group, or keyword. All law_id values have been verified against the
 * e-Gov API v2 search endpoint with exact title match.
 *
 * Preset data is maintained in src/data/law-presets/ (chapter-based files).
 */
export class LawRegistry {
  private readonly presets: LawPreset[];

  constructor() {
    this.presets = ALL_LAW_PRESETS;
  }

  /**
   * Find a single law by exact title or abbreviation.
   * Falls back to partial match if no exact/abbreviation match is found.
   */
  findByName(name: string): LawPreset | undefined {
    // Exact match on title
    const exact = this.presets.find((p) => p.title === name);
    if (exact) return exact;

    // Abbreviation match
    const abbr = this.presets.find((p) => p.abbrev.some((a) => a === name));
    if (abbr) return abbr;

    // Partial match
    return this.presets.find(
      (p) => p.title.includes(name) || name.includes(p.title),
    );
  }

  /**
   * Search presets by keyword across title, abbreviations, and group.
   */
  search(keyword: string): LawPreset[] {
    return this.presets.filter(
      (p) =>
        p.title.includes(keyword) ||
        p.abbrev.some((a) => a.includes(keyword)) ||
        p.group.includes(keyword),
    );
  }

  /**
   * Get all presets belonging to a specific chapter group.
   */
  getByGroup(group: string): LawPreset[] {
    return this.presets.filter((p) => p.group.includes(group));
  }

  /**
   * Get a defensive copy of all presets.
   */
  getAll(): LawPreset[] {
    return [...this.presets];
  }
}
