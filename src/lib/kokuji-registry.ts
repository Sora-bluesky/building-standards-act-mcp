import type { KokujiPreset } from "./types.js";

/**
 * Kokuji (ministerial notification) presets.
 *
 * NOTE: The e-Gov API v2 does NOT return kokuji (告示).
 * These presets are sourced from the MLIT (国土交通省) pipeline,
 * which fetches kokuji text from MLIT Excel/HTML publications
 * using title matching instead of law_id lookups.
 *
 * law_id is set to empty string for all entries because e-Gov API v2
 * does not support kokuji. The MLIT pipeline uses title matching instead.
 */
const ALL_KOKUJI_PRESETS: KokujiPreset[] = [
  {
    law_id: "",
    law_num: "平成十二年建設省告示第千三百九十九号",
    title: "耐火構造の構造方法を定める件",
    abbrev: ["耐火構造告示"],
    delegated_by: "建築基準法施行令",
  },
  {
    law_id: "",
    law_num: "平成十二年建設省告示第千三百五十八号",
    title: "準耐火構造の構造方法を定める件",
    abbrev: ["準耐火構造告示"],
    delegated_by: "建築基準法施行令",
  },
  {
    law_id: "",
    law_num: "平成十二年建設省告示第千三百五十九号",
    title: "防火構造の構造方法を定める件",
    abbrev: ["防火構造告示"],
    delegated_by: "建築基準法施行令",
  },
  {
    law_id: "",
    law_num: "平成十二年建設省告示第千四百号",
    title: "不燃材料を定める件",
    abbrev: ["不燃材料告示"],
    delegated_by: "建築基準法施行令",
  },
  {
    law_id: "",
    law_num: "昭和五十五年建設省告示第千八百号",
    title:
      "建築基準法施行令第十九条第三項ただし書の規定に基づく照明設備の設置、有効な採光方法の確保その他これらに準ずる措置の基準及び居室の窓その他の開口部で採光に有効な部分の面積のその床面積に対する割合で国土交通大臣が別に定めるもの",
    abbrev: ["採光告示", "採光面積算定告示"],
    delegated_by: "建築基準法施行令",
  },
  {
    law_id: "",
    law_num: "平成十二年建設省告示第千四百四十一号",
    title: "階避難安全検証法に関する算出方法等を定める件",
    abbrev: ["避難安全検証告示", "階避難告示"],
    delegated_by: "建築基準法施行令",
  },
  {
    law_id: "",
    law_num: "平成十九年国土交通省告示第五百九十四号",
    title: "許容応力度計算等の方法を定める件",
    abbrev: ["許容応力度告示"],
    delegated_by: "建築基準法施行令",
  },
];

/**
 * Registry for looking up kokuji (ministerial notification) presets.
 *
 * Contains 7 major kokuji relevant to building standards law.
 * These are sourced from the MLIT pipeline since e-Gov API v2
 * does not include kokuji in its law search endpoint.
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
