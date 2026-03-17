// e-Gov API v2 response types

export interface EgovLawSearchResponse {
  total_count: number;
  count: number;
  laws: EgovLawEntry[];
}

export interface EgovLawEntry {
  law_info: EgovLawInfo;
  revision_info: EgovRevisionInfo;
  current_revision_info: EgovRevisionInfo;
}

export interface EgovLawInfo {
  law_type: string;
  law_id: string;
  law_num: string;
  law_num_era: string;
  law_num_year: number;
  law_num_type: string;
  law_num_num: string;
  promulgation_date: string;
}

export interface EgovRevisionInfo {
  law_revision_id: string;
  law_type: string;
  law_title: string;
  law_title_kana: string;
  abbrev: string | null;
  category: string;
  updated: string;
  amendment_promulgate_date: string;
  amendment_enforcement_date: string;
  amendment_enforcement_comment: string | null;
  amendment_law_id: string;
  amendment_law_title: string;
  amendment_law_num: string;
  repeal_status: string;
  remain_in_force: boolean;
  current_revision_status: string;
}

export interface EgovLawDataResponse {
  attached_files_info: unknown;
  law_info: EgovLawInfo;
  revision_info: EgovRevisionInfo;
  law_full_text: LawNode;
}

// Recursive tree node from e-Gov API (XML-like JSON structure)
export interface LawNode {
  tag: string;
  attr?: Record<string, string>;
  children?: Array<LawNode | string>;
}

// Parsed article output (plain text)
export interface ParsedArticle {
  article_num: string;
  article_caption: string;
  article_title: string;
  text: string;
}

// Structured article output (hierarchical JSON)
export interface StructuredSubitem {
  subitem_num: string;
  subitem_title: string;
  subitem_sentence: string;
  subitems: StructuredSubitem[];
}

export interface StructuredItem {
  item_num: string;
  item_title: string;
  item_sentence: string;
  subitems: StructuredSubitem[];
}

export interface StructuredParagraph {
  paragraph_num: string;
  paragraph_sentence: string;
  items: StructuredItem[];
}

export interface StructuredArticle {
  article_num: string;
  article_caption: string;
  article_title: string;
  paragraphs: StructuredParagraph[];
}

// Law preset entry
export interface LawPreset {
  law_id: string;
  law_num: string;
  title: string;
  abbrev: string[];
  group: string;
  tier: "Act" | "CabinetOrder" | "MinisterialOrdinance" | "Other";
  verified_at: string; // ISO date string, e.g. "2026-03-17"
}

// Kokuji preset entry
export interface KokujiPreset {
  law_id: string;
  law_num: string;
  title: string;
  abbrev: string[];
  delegated_by: string;
}
