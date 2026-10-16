/** A reference and its source span; numeral strings retain kanji spelling. */
export interface ArticleRef {
  law?: string;
  article: string;
  branches: string[];
  paragraph?: string;
  item?: string;
  start: number;
  end: number;
}

const NUMERAL = "[0-9０-９〇零一二三四五六七八九十百千万億兆]+";
const LAW = "[\\u4E00-\\u9FFF]+(?:法(?:施行令|施行規則)?|施行令|規則)|施行令|規則|法|令";

/** Parse bare references and explicit law names without assuming a law context. */
export function parseArticleRefs(text: string): ArticleRef[] {
  const pattern = new RegExp(
    `(?:(${LAW})\\s*)?第?(${NUMERAL})条((?:の第?${NUMERAL})*)(?:第?(${NUMERAL})項)?(?:第?(${NUMERAL})号)?`,
    "g",
  );
  return [...text.matchAll(pattern)].map((match) => {
    const prefix = match[1];
    const law = prefix === "法"
      ? "建築基準法"
      : prefix === "令" || prefix === "施行令"
        ? "建築基準法施行令"
        : prefix;
    return {
      law,
      article: match[2],
      branches: match[3] ? match[3].split("の").slice(1) : [],
      paragraph: match[4],
      item: match[5],
      start: match.index,
      end: match.index + match[0].length,
    };
  });
}

function integerToKanji(value: number): string {
  const digits = "〇一二三四五六七八九";
  for (const [unit, label] of [
    [1_0000_0000_0000, "兆"], [1_0000_0000, "億"], [1_0000, "万"],
    [1000, "千"], [100, "百"], [10, "十"],
  ] satisfies [number, string][]) {
    if (value < unit) continue;
    const count = Math.floor(value / unit);
    const prefix = count === 1 && unit <= 1000 ? "" : integerToKanji(count);
    const remainder = value % unit;
    return prefix + label + (remainder ? integerToKanji(remainder) : "");
  }
  return digits[value];
}

function formatNumeral(value: string): string {
  const normalized = value.replace(/^第/, "").replace(/[０-９]/g, (digit) =>
    String(digit.charCodeAt(0) - "０".charCodeAt(0)),
  );
  return /^\d+$/.test(normalized)
    ? integerToKanji(Number(normalized))
    : normalized;
}

/** Render the kanji reference form used in notice titles, without the law name. */
export function formatArticleRef(ref: ArticleRef): string {
  return `第${formatNumeral(ref.article)}条`
    + ref.branches.map((branch) => `の${formatNumeral(branch)}`).join("")
    + (ref.paragraph ? `第${formatNumeral(ref.paragraph)}項` : "")
    + (ref.item ? `第${formatNumeral(ref.item)}号` : "");
}
