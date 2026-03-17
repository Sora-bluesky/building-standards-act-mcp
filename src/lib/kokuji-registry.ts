import type { KokujiPreset } from "./types.js";

/**
 * Kokuji (ministerial notification) presets.
 *
 * NOTE: As of 2026-03-09, the e-Gov API v2 law search endpoint
 * does NOT return kokuji (告示). Searches for all 7 kokuji titles
 * returned 0 results. Broader keyword searches also returned 0.
 *
 * This registry is kept as a placeholder for future use, in case:
 * - The e-Gov API adds kokuji support
 * - A separate kokuji data source is integrated
 * - Manual law_id mapping becomes available
 *
 * Known kokuji that would be relevant to building law:
 * - 耐火構造の構造方法を定める件 (delegated by 建築基準法施行令)
 * - 準耐火構造の構造方法を定める件 (delegated by 建築基準法施行令)
 * - 防火構造の構造方法を定める件 (delegated by 建築基準法施行令)
 * - 不燃材料を定める件 (delegated by 建築基準法施行令)
 * - 採光に有効な部分の面積の算定方法を定める件 (delegated by 建築基準法施行令)
 * - 避難安全検証法に関する算出方法等を定める件 (delegated by 建築基準法施行令)
 * - 許容応力度計算等の方法を定める件 (delegated by 建築基準法施行令)
 */
const ALL_KOKUJI_PRESETS: KokujiPreset[] = [
  // No verified kokuji available via e-Gov API v2 at this time.
  // When law_id values become available, add entries in this format:
  // {
  //   law_id: '...',
  //   law_num: '...',
  //   title: '耐火構造の構造方法を定める件',
  //   abbrev: ['耐火構造告示'],
  //   delegated_by: '建築基準法施行令',
  // },
];

/**
 * Registry for looking up kokuji (ministerial notification) presets.
 * Currently empty as the e-Gov API v2 does not include kokuji in
 * its law search endpoint.
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
}
