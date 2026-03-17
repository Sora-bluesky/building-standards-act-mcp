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

export interface EgovLawRevisionsResponse {
  law_info: EgovLawInfo;
  revisions: EgovRevisionInfo[];
}

export interface LawUpdateCheckResult {
  title: string;
  law_id: string;
  status: "up_to_date" | "updated" | "repealed" | "error";
  verified_at: string;
  latest_amendment_date?: string;
  latest_amendment_law?: string;
  revisions?: EgovRevisionInfo[];
  error_message?: string;
}

// Recursive tree node from e-Gov API (XML-like JSON structure)
export interface LawNode {
  tag: string;
  attr?: Record<string, string>;
  children?: Array<LawNode | string>;
}

// Article cross-reference types
export type ReferenceType =
  | "same_law"
  | "cross_law"
  | "relative"
  | "delegation"
  | "unknown";

export interface ArticleReference {
  raw_text: string;
  ref_type: ReferenceType;
  target_law?: string;
  target_article?: string;
  target_paragraph?: string;
  target_item?: string;
}

// Parsed article output (plain text)
export interface ParsedArticle {
  article_num: string;
  article_caption: string;
  article_title: string;
  text: string;
  references?: ArticleReference[];
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
  references?: ArticleReference[];
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

// Batch fetch result
export interface BatchFetchItem {
  law_name: string;
  article_number: string;
  status: "success" | "law_not_found" | "article_not_found" | "error";
  text?: string;
  structured?: StructuredArticle;
  error_message?: string;
}

export interface BatchFetchResult {
  total: number;
  success: number;
  failed: number;
  results: BatchFetchItem[];
}

// Citation verification result
export interface CitationVerification {
  law_name: string;
  article_number: string;
  status:
    | "verified"
    | "mismatch"
    | "article_not_found"
    | "law_not_found"
    | "error";
  actual_text?: string;
  match_score?: number;
  mismatch_detail?: string;
  error_message?: string;
}

// Kokuji preset entry
export interface KokujiPreset {
  law_id: string;
  law_num: string;
  title: string;
  abbrev: string[];
  delegated_by: string;
}
