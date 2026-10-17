import { normalizeKeyword } from "./egov-client.js";

function normalizeCharacter(character: string): string {
  return character.normalize("NFKC").replace(/\s/g, "");
}

/** Find normalized matches in the original text's UTF-16 coordinates. */
export function findAllMatches(text: string, query: string): { start: number; end: number }[] {
  const needle = Array.from(normalizeKeyword(query), normalizeCharacter).join("");
  if (needle.length === 0) return [];

  let normalized = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  for (const character of text) {
    const value = normalizeCharacter(character);
    normalized += value;
    for (let i = 0; i < value.length; i++) {
      starts.push(offset);
      ends.push(offset + character.length);
    }
    offset += character.length;
  }

  const matches: { start: number; end: number }[] = [];
  let position = normalized.indexOf(needle);
  while (position !== -1) {
    matches.push({ start: starts[position], end: ends[position + needle.length - 1] });
    position = normalized.indexOf(needle, position + needle.length);
  }
  return matches;
}
