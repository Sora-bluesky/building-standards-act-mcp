import { createCache } from "./cache.js";
import { fetchMlitText, findHousingKokujiByTitle, normalizeKokujiTitle } from "./mlit-client.js";
import { extractPdfText, isAllowedPdfUrl } from "./pdf-extractor.js";
import { KOKUJI_NUMBER_PATTERN_SOURCE, kokujiKey, kokujiNumberFromDbEntry, kanjiNumeralToNumber, parseKokujiNumber } from "./kokuji-number.js";
import { mapWithConcurrency } from "./revision-tracker.js";
import { KOKUJI_AMENDMENT_INDEX } from "../data/kokuji-amendment-index.js";

export { normalizeKokujiTitle } from "./mlit-client.js";
export const AMENDMENTS_PAGE_URL = "https://www.mlit.go.jp/jutakukentiku/build/jutakukentiku_house_tk_000096.html";
export const DB_NOTICE = "※ 国交省の告示 DB には 2019 年 3 月以降の建築告示の改正が反映されていません。";
export const MAX_RUNTIME_PDF_READS = 5;
export const MAX_AMENDMENT_ITEMS = 30;
const COVERAGE = "平成30年1月1日以降に公布された告示（平成29年度分から）";
const NUMBER_PATTERN = new RegExp(KOKUJI_NUMBER_PATTERN_SOURCE, "g");

export interface AmendmentDocument { label: string; url: string }
export interface AmendmentNotice {
  fiscal_year: string;
  title: string;
  number: string;
  key: string | null;
  promulgated_on: string | null;
  effective_on: string | null;
  effective_note: string | null;
  documents: AmendmentDocument[];
  listed_target_keys: string[];
  listed_targets_partial: boolean;
}
export interface KokujiAmendmentItem {
  number: string;
  title: string;
  promulgated_on: string | null;
  effective_on: string | null;
  effective_note: string | null;
  documents: AmendmentDocument[];
  matched_by: "pdf" | "page" | "title";
}
export interface KokujiAmendments {
  status: "ok" | "unavailable";
  source_url: string;
  coverage: string;
  items: KokujiAmendmentItem[];
  omitted_count: number;
  unresolved_count: number;
}
export interface ResolvedAmendmentNotice extends AmendmentNotice {
  targets: Record<string, KokujiAmendmentItem["matched_by"]>;
  title_targets: string[];
  complete: boolean;
}

function decodeEntities(text: string): string {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (raw, entity: string) => {
    if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? raw;
    const value = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return value <= 0x10ffff ? String.fromCodePoint(value) : raw;
  });
}

function plainText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, "")).normalize("NFKC")
    .replace(/\u200b/g, "").replace(/\s+/g, " ").trim();
}

function numberKeys(text: string): string[] {
  return [...new Set([...text.replace(/\s/g, "").matchAll(NUMBER_PATTERN)].flatMap(([value]) => {
    const number = parseKokujiNumber(value);
    return number ? [kokujiKey(number)] : [];
  }))];
}

function isoDate(text: string): string | null {
  const match = text.match(/(昭和|平成|令和)(元|[〇一二三四五六七八九十百千0-9]+)年([0-9]+)月([0-9]+)日/);
  if (!match) return null;
  const eraYear = kanjiNumeralToNumber(match[2]);
  if (eraYear === null) return null;
  const year = ({ 昭和: 1925, 平成: 1988, 令和: 2018 } as Record<string, number>)[match[1]] + eraYear;
  const month = Number(match[3]);
  const day = Number(match[4]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10) : null;
}

export function parseAmendmentPage(html: string): AmendmentNotice[] {
  const contents = html.match(/<!-- #contents start -->([\s\S]*?)<!-- #contents end -->/);
  if (!contents) return [];
  const notices: AmendmentNotice[] = [];
  let fiscalYear = "";
  let dates = { promulgated_on: null as string | null, effective_on: null as string | null, effective_note: null as string | null };
  let current: AmendmentNotice | undefined;
  for (const block of contents[1].split(/(<h4\b[^>]*>[\s\S]*?<\/h4>)/i)) {
    if (/^<h4\b/i.test(block)) {
      fiscalYear = plainText(block).match(/^(?:令和|平成)(?:元|\d+)年度/)?.[0] ?? "";
      current = undefined;
      dates = { promulgated_on: null, effective_on: null, effective_note: null };
      continue;
    }
    if (!fiscalYear) continue;
    for (const line of block.split(/<br\b[^>]*>|<\/?p\b[^>]*>/i)) {
      const text = plainText(line);
      const header = text.match(/【([^】]+)】/);
      if (header) {
        const compact = header[1].replace(/\s/g, "");
        const split = compact.indexOf("公布");
        const promulgation = compact.slice(0, split);
        const enforcement = compact.slice(split + "公布".length);
        const promulgated = isoDate(promulgation);
        dates = {
          promulgated_on: promulgated,
          effective_on: /[・･]施行/.test(enforcement) ? promulgated : isoDate(enforcement),
          effective_note: enforcement.match(/施行(\(.*\))$/)?.[1] ?? null,
        };
        current = undefined; // Header links belong to the group, not the preceding notice.
        continue;
      }
      if (/^[○〇]/.test(text)) {
        const ownNumber = text.match(/^[○〇](.*)\(((?:昭和|平成|令和)[^()]+?告示第[^()]+号)\)$/);
        current = undefined;
        if (!ownNumber) continue;
        const parsed = parseKokujiNumber(ownNumber[2]);
        current = {
          fiscal_year: fiscalYear, title: ownNumber[1].trim(), number: ownNumber[2],
          key: parsed ? kokujiKey(parsed) : null, ...dates, documents: [],
          listed_target_keys: numberKeys(ownNumber[1]), listed_targets_partial: false,
        };
        notices.push(current);
      }
      if (!current) continue;
      if (!/^[○〇]/.test(text)) {
        current.listed_target_keys = [...new Set([...current.listed_target_keys, ...numberKeys(text)])];
        if (/他\d+件/.test(text)) current.listed_targets_partial = true;
      }
      for (const link of line.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        try {
          const url = new URL(decodeEntities(link[1]), AMENDMENTS_PAGE_URL);
          url.protocol = "https:";
          if (url.origin !== "https://www.mlit.go.jp" || url.username || url.password || !isAllowedPdfUrl(url.href)) continue;
          const document = { label: plainText(link[2]), url: url.href };
          if (!current.documents.some((doc) => doc.url === document.url && doc.label === document.label)) current.documents.push(document);
        } catch {
          // Ignore malformed or external document links.
        }
      }
    }
  }
  for (const notice of notices) {
    notice.listed_target_keys = notice.listed_target_keys.filter((key) => key !== notice.key);
  }
  return notices;
}

export function extractAmendedKokujiKeys(pdfText: string): string[] {
  const text = pdfText.replace(/︵/g, "（").replace(/︶/g, "）").replace(/︑/g, "、").replace(/︒/g, "。")
    .normalize("NFKC").replace(/\s/g, "");
  const citations = [...text.matchAll(NUMBER_PATTERN)];
  const enumeratedTargets = new Set<number>();
  // A substitution can apply to the provisions listed below it, within one article.
  const articleNumber = "[〇一二三四五六七八九十百千0-9]+";
  const listHeader = new RegExp(`第${articleNumber}条(?:の${articleNumber})?次に掲げる告示の規定中「[^「」]*」を「[^「」]*」に改める。`, "g");
  for (const header of text.matchAll(listHeader)) {
    const start = header.index + header[0].length;
    const rest = text.slice(start);
    const boundary = rest.search(new RegExp(`第${articleNumber}条|附則`));
    const list = boundary < 0 ? rest : rest.slice(0, boundary);
    // Require a numbered item, a titled citation and a provision/table selector.
    // Quoted references and citations in subsequent articles are not list targets.
    const item = new RegExp(`[一二三四五六七八九十](?!${articleNumber})(?:[^()「」]|\\([^()]*\\))*?\\((${KOKUJI_NUMBER_PATTERN_SOURCE})\\)(?=別表|第|付録)`, "g");
    for (const match of list.matchAll(item)) {
      enumeratedTargets.add(start + match.index + match[0].lastIndexOf(match[1]));
    }
  }
  const keys: string[] = [];
  for (let first = 0; first < citations.length; first++) {
    let last = first;
    // A direct-number clause can amend several notices joined by a legal conjunction.
    while (last + 1 < citations.length) {
      const end = citations[last].index + citations[last][0].length;
      const between = text.slice(end, citations[last + 1].index);
      if (!/^\)?(?:及び|並びに|又は|、)\(?$/.test(between)) break;
      last++;
    }
    const end = citations[last].index + citations[last][0].length;
    const direct = /^\)?(?:の(?:一部|全部)を(?:次のように)?改正|は、?廃止する)/.test(text.slice(end));
    for (const citation of citations.slice(first, last + 1)) {
      if (direct || enumeratedTargets.has(citation.index)) {
        const number = parseKokujiNumber(citation[0]);
        if (number) keys.push(kokujiKey(number));
      }
    }
    first = last;
  }
  return [...new Set(keys)];
}

export function targetTitlesFromName(title: string): { titles: string[]; complete: boolean } {
  const match = title.match(/^(.+?)(等)?の一部を改正する(件|告示)$/);
  if (!match) return { titles: [], complete: false };
  const parts = match[1].split("件及び");
  return { titles: parts.map((part, index) => index < parts.length - 1 ? part + "件" : part), complete: !match[2] };
}

export function preferredAmendmentDocument(notice: AmendmentNotice): AmendmentDocument | undefined {
  for (const label of ["新旧対照表", "案文", "条文"]) {
    const document = notice.documents.find((doc) => doc.label === label);
    if (document) return document;
  }
  return undefined;
}

/** Reading text is not proof that a change notice has no amendment targets. */
export function hasCompletePdfTargets(notice: AmendmentNotice, targetKeys: string[]): boolean {
  if (!notice.listed_target_keys.every((key) => targetKeys.includes(key))) return false;
  if (targetKeys.length > 0) return true;
  return !/改正|改める|廃止|変更|削除/.test(notice.title)
    && notice.listed_target_keys.length === 0 && !notice.listed_targets_partial;
}

/** The read counter is shared by a resolution pass, including concurrent workers. */
export async function resolveNoticeTargets(
  notice: AmendmentNotice,
  runtime = { remaining: MAX_RUNTIME_PDF_READS },
): Promise<ResolvedAmendmentNotice> {
  const indexed = notice.key ? KOKUJI_AMENDMENT_INDEX.notices[notice.key] : undefined;
  const targets: ResolvedAmendmentNotice["targets"] = {};
  for (const key of notice.listed_target_keys) targets[key] = "page";
  if (indexed) {
    for (const key of indexed.target_keys) targets[key] = "pdf";
    return { ...notice, targets, title_targets: [], complete: indexed.complete && hasCompletePdfTargets(notice, indexed.target_keys) };
  }
  const named = targetTitlesFromName(notice.title);
  const titleTargets: string[] = [];
  let allUnique = named.titles.length > 0;
  for (const title of named.titles) {
    const normalized = normalizeKokujiTitle(title);
    const matches = await findHousingKokujiByTitle(normalized);
    if (matches.length !== 1) { allUnique = false; continue; }
    titleTargets.push(normalized);
    const number = kokujiNumberFromDbEntry(matches[0]);
    if (number) targets[kokujiKey(number)] ??= "title";
  }
  let complete = named.complete && allUnique && notice.listed_target_keys.length === 0;
  const document = preferredAmendmentDocument(notice);
  if (!complete && document && runtime.remaining > 0) {
    runtime.remaining--;
    try {
      const pdf = await extractPdfText(document.url);
      if (pdf.text.trim()) {
        const keys = extractAmendedKokujiKeys(pdf.text);
        for (const key of keys) targets[key] = "pdf";
        complete = hasCompletePdfTargets(notice, keys);
      }
    } catch {
      // Preserve page and unique title evidence when a PDF cannot be read.
    }
  }
  return { ...notice, targets, title_targets: titleTargets, complete };
}

const cache = createCache<ResolvedAmendmentNotice[]>("kokuji-amendments", 24 * 60 * 60 * 1000);
let inFlight: Promise<ResolvedAmendmentNotice[] | null> | undefined;

export async function getKokujiAmendmentNotices(): Promise<ResolvedAmendmentNotice[] | null> {
  const cached = cache.get(AMENDMENTS_PAGE_URL);
  if (cached) return cached;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const html = await fetchMlitText(AMENDMENTS_PAGE_URL);
    const notices = html ? parseAmendmentPage(html) : [];
    if (notices.length === 0) return null;
    const runtime = { remaining: MAX_RUNTIME_PDF_READS };
    const resolved = await mapWithConcurrency(notices, (notice) => resolveNoticeTargets(notice, runtime), 5);
    cache.set(AMENDMENTS_PAGE_URL, resolved);
    return resolved;
  })();
  try { return await inFlight; } finally { inFlight = undefined; }
}

export function unavailableAmendments(): KokujiAmendments {
  return { status: "unavailable", source_url: AMENDMENTS_PAGE_URL, coverage: COVERAGE, items: [], omitted_count: 0, unresolved_count: 0 };
}

export async function findAmendmentsFor(target: { key: string | null; title: string }): Promise<KokujiAmendments> {
  const notices = await getKokujiAmendmentNotices();
  if (!notices) return unavailableAmendments();
  const matches = notices.flatMap((notice): KokujiAmendmentItem[] => {
    const matchedBy = target.key !== null ? notice.targets[target.key]
      : notice.title_targets.includes(normalizeKokujiTitle(target.title)) ? "title" : undefined;
    if (!matchedBy) return [];
    return [{ number: notice.number, title: notice.title, promulgated_on: notice.promulgated_on,
      effective_on: notice.effective_on, effective_note: notice.effective_note,
      documents: notice.documents.filter((doc) => ["新旧対照表", "案文", "条文", "技術的助言"].includes(doc.label)), matched_by: matchedBy }];
  }).sort((a, b) => (b.promulgated_on ?? "").localeCompare(a.promulgated_on ?? ""));
  return { status: "ok", source_url: AMENDMENTS_PAGE_URL, coverage: COVERAGE,
    items: matches.slice(0, MAX_AMENDMENT_ITEMS), omitted_count: Math.max(0, matches.length - MAX_AMENDMENT_ITEMS),
    unresolved_count: notices.filter((notice) => !notice.complete).length };
}

export function formatAmendmentsSection(result: KokujiAmendments, options: { includeDbNotice: boolean }): string {
  const lines = options.includeDbNotice ? [DB_NOTICE] : [];
  if (result.status === "unavailable") {
    lines.push(`改正一覧を取得できませんでした（国交省「建築基準法等に基づく告示の制定・改正について」: ${result.source_url}）。最新の改正は官報で確認してください。`);
  } else if (result.items.length === 0) {
    lines.push("平成30年以降の改正は見つかりませんでした（改正一覧は平成29年度分から）。");
  } else {
    lines.push("改正告示（国交省「建築基準法等に基づく告示の制定・改正について」より・平成30年以降公布分）:");
    for (const item of result.items) {
      const dates = `公布 ${item.promulgated_on ?? "公布日記載なし"}・${item.effective_on ? `施行 ${item.effective_on}` : "施行日記載なし"}`;
      lines.push(`- ${item.number} ${item.title}（${dates}）${item.effective_note ?? ""}${item.documents.map((doc) => ` ${doc.label}: ${doc.url}`).join("")}`);
    }
    if (result.omitted_count > 0) lines.push(`※ このほか ${result.omitted_count} 件の改正告示は省略しました。`);
  }
  if (result.unresolved_count > 0) lines.push(`※ 改正対象を確定できなかった改正告示が ${result.unresolved_count} 件あり、この一覧から漏れている可能性があります。`);
  return lines.join("\n");
}
