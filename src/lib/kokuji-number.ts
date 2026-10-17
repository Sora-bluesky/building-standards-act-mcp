export interface KokujiNumber {
  era: "昭和" | "平成" | "令和";
  eraYear: number;
  year: number;
  issuer: string;
  number: number;
}

const DIGITS = "〇一二三四五六七八九";
const ERA_BASE: Record<KokujiNumber["era"], number> = { 昭和: 1925, 平成: 1988, 令和: 2018 };
const NUMERAL = "元〇一二三四五六七八九十百千0-9";
// These ministries issue the building notices covered by the MLIT amendment page.
const ISSUER_COMPONENT = ["建設省", "国土交通省", "厚生労働省", "環境省"]
  .map((issuer) => [...issuer].join("[ぁ-ゖ]*") + "[ぁ-ゖ]*").join("|");
const ISSUER_PATTERN = `(?:${ISSUER_COMPONENT})(?:・(?:${ISSUER_COMPONENT}))*`;
// Keep citation boundaries identical for page parsing, PDFs and number lookups.
export const KOKUJI_NUMBER_PATTERN_SOURCE = `(昭和|平成|令和)([${NUMERAL}]+)年(?:[${NUMERAL}]+月(?:[${NUMERAL}]+日)?)?(${ISSUER_PATTERN})告示第([${NUMERAL}]+)号`;

function canonicalIssuer(text: string): string {
  return text.replace(/[ぁ-ゖ]/g, "");
}

export function kanjiNumeralToNumber(s: string): number | null {
  s = s.normalize("NFKC").trim();
  if (s === "元") return 1;
  if (!s || !/^[〇一二三四五六七八九十百千0-9]+$/.test(s)) return null;
  const digits = s.replace(/[〇一二三四五六七八九]/g, (c) => String(DIGITS.indexOf(c)));
  if (/^\d+$/.test(digits)) {
    const value = Number(digits);
    return Number.isSafeInteger(value) ? value : null;
  }
  let total = 0;
  let pending = "";
  let previousUnit = Infinity;
  for (const c of digits) {
    const unit = ({ 十: 10, 百: 100, 千: 1000 } as Record<string, number>)[c];
    if (unit) {
      if (unit >= previousUnit) return null;
      total += (pending ? Number(pending) : 1) * unit;
      pending = "";
      previousUnit = unit;
    } else {
      pending += c;
    }
  }
  return total + Number(pending);
}

export function kokujiKey(n: KokujiNumber): string {
  return `${n.era}${n.eraYear}:${n.issuer}:${n.number}`;
}

export function parseKokujiNumber(text: string): KokujiNumber | null {
  let value = text.normalize("NFKC").replace(/\s/g, "");
  const abbreviated = value.match(new RegExp(`^(昭|平|令)([${NUMERAL}]+)(建|国交)告([${NUMERAL}]+)$`));
  if (abbreviated) {
    const [, era, year, issuer, number] = abbreviated;
    value = `${({ 昭: "昭和", 平: "平成", 令: "令和" } as Record<string, string>)[era]}${year}年${issuer === "建" ? "建設省" : "国土交通省"}告示第${number}号`;
  }
  const match = value.match(new RegExp(`^${KOKUJI_NUMBER_PATTERN_SOURCE}$`));
  if (!match) return null;
  const era = match[1];
  if (era !== "昭和" && era !== "平成" && era !== "令和") return null;
  const eraYear = kanjiNumeralToNumber(match[2]);
  const number = kanjiNumeralToNumber(match[4]);
  if (eraYear === null || eraYear < 1 || number === null || number < 1) return null;
  return { era, eraYear, year: ERA_BASE[era] + eraYear, issuer: canonicalIssuer(match[3]), number };
}

export function kokujiNumberFromDbEntry(entry: { document_number: string; date: string }): KokujiNumber | null {
  const value = entry.document_number.normalize("NFKC").replace(/\s/g, "");
  if (/^(昭和|平成|令和)/.test(value)) return parseKokujiNumber(value);
  const match = value.match(new RegExp(`^(${ISSUER_PATTERN})告示第([${NUMERAL}]+)号$`));
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) return null;
  const number = kanjiNumeralToNumber(match[2]);
  if (number === null || number < 1) return null;
  const date = new Date(`${entry.date}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== entry.date) return null;
  const era = entry.date >= "2019-05-01" ? "令和" : entry.date >= "1989-01-08" ? "平成" : "昭和";
  const year = date.getUTCFullYear();
  const eraYear = year - ERA_BASE[era];
  if (eraYear < 1) return null;
  return { era, eraYear, year, issuer: canonicalIssuer(match[1]), number };
}

export function formatKokujiNumber(n: KokujiNumber): string {
  return `${n.era}${n.eraYear === 1 ? "元" : n.eraYear}年${n.issuer}告示第${n.number}号`;
}
