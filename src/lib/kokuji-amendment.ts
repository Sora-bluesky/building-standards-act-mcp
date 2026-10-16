/** Extract the last amendment listed in the PDF header, preserving its numerals. */
export function extractLatestAmendment(pdfText: string): string | null {
  const beginning = pdfText.slice(0, 1500);
  const amendmentStart = beginning.indexOf("改正");
  if (amendmentStart === -1) return null;

  const remaining = beginning.slice(amendmentStart + "改正".length);
  const bodyStart = remaining.search(/建築基準法施行令（|建築基準法（|の規定に基づき|(?<=号)[^\S\r\n]*[\r\n]/u);
  const header = (bodyStart === -1 ? remaining : remaining.slice(0, bodyStart))
    .replace(/\s/g, "");
  const entries = header.matchAll(/(昭和|平成|令和|同)?([〇一二三四五六七八九十百千0-9]+)年([〇一二三四五六七八九十百千0-9]+)月([〇一二三四五六七八九十百千0-9]+)日(建設省告示|国土交通省告示|同)?第([〇一二三四五六七八九十百千0-9]+)号/g);

  let era: string | null = null;
  let ministry: string | null = null;
  let latest: string | null = null;
  for (const [, entryEra, year, month, day, entryMinistry, number] of entries) {
    if (entryEra && entryEra !== "同") era = entryEra;
    if (entryMinistry && entryMinistry !== "同") ministry = entryMinistry;
    if (era && ministry) {
      latest = `${era}${year}年${month}月${day}日${ministry}第${number}号`;
    }
  }
  return latest;
}
