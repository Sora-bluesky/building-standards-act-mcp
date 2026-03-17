// Verified against e-Gov API v2: 2026-03-17
import type { LawPreset } from "../../lib/types.js";
import { CHAPTER_01_GENERAL } from "./chapter-01-general.js";
import { CHAPTER_02_PROCEDURES } from "./chapter-02-procedures.js";
import { CHAPTER_03_COLLECTIVE } from "./chapter-03-collective.js";
import { CHAPTER_04_FIRE } from "./chapter-04-fire.js";
import { CHAPTER_05_STRUCTURE } from "./chapter-05-structure.js";
import { CHAPTER_06_MATERIALS } from "./chapter-06-materials.js";
import { CHAPTER_07_EQUIPMENT } from "./chapter-07-equipment.js";
import { CHAPTER_08_OTHER } from "./chapter-08-other.js";
import { CHAPTER_09_RELATED } from "./chapter-09-related.js";
import { CHAPTER_10_ENERGY } from "./chapter-10-energy.js";
import { CHAPTER_11_EXISTING } from "./chapter-11-existing.js";

export const ALL_LAW_PRESETS: LawPreset[] = [
  ...CHAPTER_01_GENERAL,
  ...CHAPTER_02_PROCEDURES,
  ...CHAPTER_03_COLLECTIVE,
  ...CHAPTER_04_FIRE,
  ...CHAPTER_05_STRUCTURE,
  ...CHAPTER_06_MATERIALS,
  ...CHAPTER_07_EQUIPMENT,
  ...CHAPTER_08_OTHER,
  ...CHAPTER_09_RELATED,
  ...CHAPTER_10_ENERGY,
  ...CHAPTER_11_EXISTING,
];

// Re-export individual chapters for selective imports
export {
  CHAPTER_01_GENERAL,
  CHAPTER_02_PROCEDURES,
  CHAPTER_03_COLLECTIVE,
  CHAPTER_04_FIRE,
  CHAPTER_05_STRUCTURE,
  CHAPTER_06_MATERIALS,
  CHAPTER_07_EQUIPMENT,
  CHAPTER_08_OTHER,
  CHAPTER_09_RELATED,
  CHAPTER_10_ENERGY,
  CHAPTER_11_EXISTING,
};
