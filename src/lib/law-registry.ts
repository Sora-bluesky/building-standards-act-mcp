import type { LawPreset } from "./types.js";

/**
 * All law presets verified against e-Gov API v2 (2026-03-09).
 * Each law_id and law_num has been confirmed via exact title match
 * with CurrentEnforced status.
 */
const ALL_LAW_PRESETS: LawPreset[] = [
  // --- 1章 総則 ---
  {
    law_id: "325AC0000000201",
    law_num: "昭和二十五年法律第二百一号",
    title: "建築基準法",
    abbrev: ["建基法", "基準法"],
    group: "1章 総則",
    tier: "Act",
  },
  {
    law_id: "325CO0000000338",
    law_num: "昭和二十五年政令第三百三十八号",
    title: "建築基準法施行令",
    abbrev: ["建基令", "基準法施行令"],
    group: "1章 総則",
    tier: "CabinetOrder",
  },
  {
    law_id: "325M50004000040",
    law_num: "昭和二十五年建設省令第四十号",
    title: "建築基準法施行規則",
    abbrev: ["建基規則"],
    group: "1章 総則",
    tier: "MinisterialOrdinance",
  },
  {
    law_id: "129AC0000000089",
    law_num: "明治二十九年法律第八十九号",
    title: "民法",
    abbrev: ["民法"],
    group: "1章 総則",
    tier: "Act",
  },

  // --- 2章 手続関連規定 ---
  {
    law_id: "325AC1000000202",
    law_num: "昭和二十五年法律第二百二号",
    title: "建築士法",
    abbrev: ["士法"],
    group: "2章 手続関連規定",
    tier: "Act",
  },
  {
    law_id: "325CO0000000201",
    law_num: "昭和二十五年政令第二百一号",
    title: "建築士法施行令",
    abbrev: ["士法施行令"],
    group: "2章 手続関連規定",
    tier: "CabinetOrder",
  },
  {
    law_id: "325M50004000038",
    law_num: "昭和二十五年建設省令第三十八号",
    title: "建築士法施行規則",
    abbrev: ["士法施行規則"],
    group: "2章 手続関連規定",
    tier: "MinisterialOrdinance",
  },
  {
    law_id: "324AC0000000100",
    law_num: "昭和二十四年法律第百号",
    title: "建設業法",
    abbrev: ["建設業法"],
    group: "2章 手続関連規定",
    tier: "Act",
  },
  {
    law_id: "331CO0000000273",
    law_num: "昭和三十一年政令第二百七十三号",
    title: "建設業法施行令",
    abbrev: ["建設業法施行令"],
    group: "2章 手続関連規定",
    tier: "CabinetOrder",
  },

  // --- 3章 集団規定・街づくり規定 ---
  {
    law_id: "343AC0000000100",
    law_num: "昭和四十三年法律第百号",
    title: "都市計画法",
    abbrev: ["都計法"],
    group: "3章 集団規定・街づくり規定",
    tier: "Act",
  },
  {
    law_id: "344CO0000000158",
    law_num: "昭和四十四年政令第百五十八号",
    title: "都市計画法施行令",
    abbrev: ["都計令"],
    group: "3章 集団規定・街づくり規定",
    tier: "CabinetOrder",
  },
  {
    law_id: "344AC0000000038",
    law_num: "昭和四十四年法律第三十八号",
    title: "都市再開発法",
    abbrev: ["再開発法"],
    group: "3章 集団規定・街づくり規定",
    tier: "Act",
  },
  {
    law_id: "416AC0000000110",
    law_num: "平成十六年法律第百十号",
    title: "景観法",
    abbrev: ["景観法"],
    group: "3章 集団規定・街づくり規定",
    tier: "Act",
  },
  {
    law_id: "409AC0000000049",
    law_num: "平成九年法律第四十九号",
    title: "密集市街地における防災街区の整備の促進に関する法律",
    abbrev: ["密集法"],
    group: "3章 集団規定・街づくり規定",
    tier: "Act",
  },
  {
    law_id: "424AC0000000084",
    law_num: "平成二十四年法律第八十四号",
    title: "都市の低炭素化の促進に関する法律",
    abbrev: ["低炭素法"],
    group: "3章 集団規定・街づくり規定",
    tier: "Act",
  },
  {
    law_id: "324AC0000000189",
    law_num: "昭和二十四年法律第百八十九号",
    title: "屋外広告物法",
    abbrev: ["屋外広告物法"],
    group: "3章 集団規定・街づくり規定",
    tier: "Act",
  },
  {
    law_id: "325AC0100000214",
    law_num: "昭和二十五年法律第二百十四号",
    title: "文化財保護法",
    abbrev: ["文化財保護法"],
    group: "3章 集団規定・街づくり規定",
    tier: "Act",
  },

  // --- 4章 防火規定・耐火規定 ---
  {
    law_id: "323AC1000000186",
    law_num: "昭和二十三年法律第百八十六号",
    title: "消防法",
    abbrev: ["消防法"],
    group: "4章 防火規定・耐火規定",
    tier: "Act",
  },
  {
    law_id: "336CO0000000037",
    law_num: "昭和三十六年政令第三十七号",
    title: "消防法施行令",
    abbrev: ["消防令"],
    group: "4章 防火規定・耐火規定",
    tier: "CabinetOrder",
  },

  // --- 7章 設備関連規定 ---
  {
    law_id: "358AC1000000043",
    law_num: "昭和五十八年法律第四十三号",
    title: "浄化槽法",
    abbrev: ["浄化槽法"],
    group: "7章 設備関連規定",
    tier: "Act",
  },

  // --- 9章 建築基準関係規定・建築関連法令 ---
  {
    law_id: "323AC0000000138",
    law_num: "昭和二十三年法律第百三十八号",
    title: "旅館業法",
    abbrev: ["旅館業法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "322AC0000000233",
    law_num: "昭和二十二年法律第二百三十三号",
    title: "食品衛生法",
    abbrev: ["食品衛生法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "323AC0000000122",
    law_num: "昭和二十三年法律第百二十二号",
    title: "風俗営業等の規制及び業務の適正化等に関する法律",
    abbrev: ["風営法", "風適法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "323AC0000000137",
    law_num: "昭和二十三年法律第百三十七号",
    title: "興行場法",
    abbrev: ["興行場法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "323AC0000000139",
    law_num: "昭和二十三年法律第百三十九号",
    title: "公衆浴場法",
    abbrev: ["公衆浴場法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "323AC0000000205",
    law_num: "昭和二十三年法律第二百五号",
    title: "医療法",
    abbrev: ["医療法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "322AC0000000164",
    law_num: "昭和二十二年法律第百六十四号",
    title: "児童福祉法",
    abbrev: ["児童福祉法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "326AC0000000045",
    law_num: "昭和二十六年法律第四十五号",
    title: "社会福祉法",
    abbrev: ["社会福祉法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "338AC0000000133",
    law_num: "昭和三十八年法律第百三十三号",
    title: "老人福祉法",
    abbrev: ["老人福祉法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "322AC0000000026",
    law_num: "昭和二十二年法律第二十六号",
    title: "学校教育法",
    abbrev: ["学校教育法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "332AC0000000106",
    law_num: "昭和三十二年法律第百六号",
    title: "駐車場法",
    abbrev: ["駐車場法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "325AC0000000149",
    law_num: "昭和二十五年法律第百四十九号",
    title: "火薬類取締法",
    abbrev: ["火薬類取締法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "326AC0000000204",
    law_num: "昭和二十六年法律第二百四号",
    title: "高圧ガス保安法",
    abbrev: ["高圧ガス保安法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "342AC0000000149",
    law_num: "昭和四十二年法律第百四十九号",
    title: "液化石油ガスの保安の確保及び取引の適正化に関する法律",
    abbrev: ["液石法", "LPガス法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "329AC0000000051",
    law_num: "昭和二十九年法律第五十一号",
    title: "ガス事業法",
    abbrev: ["ガス事業法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "339AC0000000170",
    law_num: "昭和三十九年法律第百七十号",
    title: "電気事業法",
    abbrev: ["電気事業法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "336AC0000000191",
    law_num: "昭和三十六年法律第百九十一号",
    title: "宅地造成及び特定盛土等規制法",
    abbrev: ["盛土規制法", "宅造法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "327AC1000000176",
    law_num: "昭和二十七年法律第百七十六号",
    title: "宅地建物取引業法",
    abbrev: ["宅建業法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "327AC1000000180",
    law_num: "昭和二十七年法律第百八十号",
    title: "道路法",
    abbrev: ["道路法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "326AC0100000219",
    law_num: "昭和二十六年法律第二百十九号",
    title: "土地収用法",
    abbrev: ["土地収用法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "327AC0000000229",
    law_num: "昭和二十七年法律第二百二十九号",
    title: "農地法",
    abbrev: ["農地法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "326AC1000000249",
    law_num: "昭和二十六年法律第二百四十九号",
    title: "森林法",
    abbrev: ["森林法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "339AC0000000167",
    law_num: "昭和三十九年法律第百六十七号",
    title: "河川法",
    abbrev: ["河川法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "325AC0000000218",
    law_num: "昭和二十五年法律第二百十八号",
    title: "港湾法",
    abbrev: ["港湾法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "333AC0000000030",
    law_num: "昭和三十三年法律第三十号",
    title: "地すべり等防止法",
    abbrev: ["地すべり防止法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "344AC0000000057",
    law_num: "昭和四十四年法律第五十七号",
    title: "急傾斜地の崩壊による災害の防止に関する法律",
    abbrev: ["急傾斜地法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "412AC0000000057",
    law_num: "平成十二年法律第五十七号",
    title: "土砂災害警戒区域等における土砂災害防止対策の推進に関する法律",
    abbrev: ["土砂災害防止法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "334CO0000000306",
    law_num: "昭和三十四年政令第三百六号",
    title: "危険物の規制に関する政令",
    abbrev: ["危険物政令"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "CabinetOrder",
  },
  {
    law_id: "332AC0000000177",
    law_num: "昭和三十二年法律第百七十七号",
    title: "水道法",
    abbrev: ["水道法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "333AC0000000079",
    law_num: "昭和三十三年法律第七十九号",
    title: "下水道法",
    abbrev: ["下水道法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "345AC0000000137",
    law_num: "昭和四十五年法律第百三十七号",
    title: "廃棄物の処理及び清掃に関する法律",
    abbrev: ["廃棄物処理法", "廃掃法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "414AC0000000053",
    law_num: "平成十四年法律第五十三号",
    title: "土壌汚染対策法",
    abbrev: ["土壌汚染対策法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "347AC0000000057",
    law_num: "昭和四十七年法律第五十七号",
    title: "労働安全衛生法",
    abbrev: ["安衛法", "労安法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "412AC0000000104",
    law_num: "平成十二年法律第百四号",
    title: "建設工事に係る資材の再資源化等に関する法律",
    abbrev: ["建設リサイクル法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "343AC0000000097",
    law_num: "昭和四十三年法律第九十七号",
    title: "大気汚染防止法",
    abbrev: ["大気汚染防止法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "345AC0000000138",
    law_num: "昭和四十五年法律第百三十八号",
    title: "水質汚濁防止法",
    abbrev: ["水質汚濁防止法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "343AC0000000098",
    law_num: "昭和四十三年法律第九十八号",
    title: "騒音規制法",
    abbrev: ["騒音規制法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "351AC0000000064",
    law_num: "昭和五十一年法律第六十四号",
    title: "振動規制法",
    abbrev: ["振動規制法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "346AC0000000091",
    law_num: "昭和四十六年法律第九十一号",
    title: "悪臭防止法",
    abbrev: ["悪臭防止法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "418AC0000000091",
    law_num: "平成十八年法律第九十一号",
    title: "高齢者、障害者等の移動等の円滑化の促進に関する法律",
    abbrev: ["バリアフリー法"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
  },
  {
    law_id: "418CO0000000379",
    law_num: "平成十八年政令第三百七十九号",
    title: "高齢者、障害者等の移動等の円滑化の促進に関する法律施行令",
    abbrev: ["バリアフリー法施行令"],
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "CabinetOrder",
  },

  // --- 10章 省エネ法・住宅関連法 ---
  {
    law_id: "427AC0000000053",
    law_num: "平成二十七年法律第五十三号",
    title: "建築物のエネルギー消費性能の向上等に関する法律",
    abbrev: ["建築物省エネ法"],
    group: "10章 省エネ法・住宅関連法",
    tier: "Act",
  },
  {
    law_id: "428CO0000000008",
    law_num: "平成二十八年政令第八号",
    title: "建築物のエネルギー消費性能の向上等に関する法律施行令",
    abbrev: ["建築物省エネ法施行令"],
    group: "10章 省エネ法・住宅関連法",
    tier: "CabinetOrder",
  },
  {
    law_id: "354AC0000000049",
    law_num: "昭和五十四年法律第四十九号",
    title: "エネルギーの使用の合理化及び非化石エネルギーへの転換等に関する法律",
    abbrev: ["省エネ法"],
    group: "10章 省エネ法・住宅関連法",
    tier: "Act",
  },
  {
    law_id: "411AC0000000081",
    law_num: "平成十一年法律第八十一号",
    title: "住宅の品質確保の促進等に関する法律",
    abbrev: ["品確法", "住宅品質確保法"],
    group: "10章 省エネ法・住宅関連法",
    tier: "Act",
  },
  {
    law_id: "420AC0000000087",
    law_num: "平成二十年法律第八十七号",
    title: "長期優良住宅の普及の促進に関する法律",
    abbrev: ["長期優良住宅法"],
    group: "10章 省エネ法・住宅関連法",
    tier: "Act",
  },
  {
    law_id: "412AC1000000149",
    law_num: "平成十二年法律第百四十九号",
    title: "マンションの管理の適正化の推進に関する法律",
    abbrev: ["マンション管理適正化法"],
    group: "10章 省エネ法・住宅関連法",
    tier: "Act",
  },
  {
    law_id: "414AC0000000078",
    law_num: "平成十四年法律第七十八号",
    title: "マンションの建替え等の円滑化に関する法律",
    abbrev: ["マンション建替え法"],
    group: "10章 省エネ法・住宅関連法",
    tier: "Act",
  },
  {
    law_id: "337AC0000000069",
    law_num: "昭和三十七年法律第六十九号",
    title: "建物の区分所有等に関する法律",
    abbrev: ["区分所有法"],
    group: "10章 省エネ法・住宅関連法",
    tier: "Act",
  },

  // --- 11章 既存建築物関連 ---
  {
    law_id: "407AC0000000123",
    law_num: "平成七年法律第百二十三号",
    title: "建築物の耐震改修の促進に関する法律",
    abbrev: ["耐震改修促進法"],
    group: "11章 既存建築物関連",
    tier: "Act",
  },
];

/**
 * Registry for looking up pre-verified law presets by name, abbreviation,
 * group, or keyword. All law_id values have been verified against the
 * e-Gov API v2 search endpoint with exact title match.
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
