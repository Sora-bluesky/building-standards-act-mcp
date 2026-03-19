import type { LawAlias } from "./types.js";
import { ALL_LAW_ALIASES } from "../data/law-aliases.js";

/**
 * Registry for looking up law aliases by name, abbreviation, group, or keyword.
 *
 * This is an abbreviation map — it does NOT contain law_id values.
 * Law IDs are resolved dynamically via e-Gov API search (see law-resolver.ts).
 *
 * Alias data is maintained in src/data/law-aliases.ts.
 */
export class LawRegistry {
  private readonly aliases: LawAlias[];

  constructor() {
    this.aliases = ALL_LAW_ALIASES;
  }

  /**
   * Find a single alias by exact title or abbreviation.
   * Falls back to partial match if no exact/abbreviation match is found.
   */
  findByName(name: string): LawAlias | undefined {
    // Exact match on title
    const exact = this.aliases.find((a) => a.title === name);
    if (exact) return exact;

    // Abbreviation match
    const abbr = this.aliases.find((a) => a.abbrev.some((ab) => ab === name));
    if (abbr) return abbr;

    // Partial match
    return this.aliases.find(
      (a) => a.title.includes(name) || name.includes(a.title),
    );
  }

  /**
   * Search aliases by keyword across title, abbreviations, and group.
   */
  search(keyword: string): LawAlias[] {
    return this.aliases.filter(
      (a) =>
        a.title.includes(keyword) ||
        a.abbrev.some((ab) => ab.includes(keyword)) ||
        a.group.includes(keyword),
    );
  }

  /**
   * Get all aliases belonging to a specific chapter group.
   */
  getByGroup(group: string): LawAlias[] {
    return this.aliases.filter((a) => a.group.includes(group));
  }

  /**
   * Get a defensive copy of all aliases.
   */
  getAll(): LawAlias[] {
    return [...this.aliases];
  }
}
