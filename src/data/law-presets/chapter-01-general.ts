// Verified against e-Gov API v2: 2026-03-17
import type { LawPreset } from "../../lib/types.js";

export const CHAPTER_01_GENERAL: LawPreset[] = [
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
];
