import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("../../src/lib/pdf-extractor.js", async (original) => ({
  ...await original<typeof import("../../src/lib/pdf-extractor.js")>(), extractPdfText: vi.fn(),
}));
vi.mock("../../src/lib/mlit-client.js", async (original) => ({
  ...await original<typeof import("../../src/lib/mlit-client.js")>(), fetchMlitText: vi.fn(), findHousingKokujiByTitle: vi.fn().mockResolvedValue([]),
}));
import { KOKUJI_AMENDMENT_INDEX } from "../../src/data/kokuji-amendment-index.js";
import { findAmendmentsFor, hasCompletePdfTargets, parseAmendmentPage, resolveNoticeTargets } from "../../src/lib/kokuji-amendments.js";
import { extractPdfText } from "../../src/lib/pdf-extractor.js";
import { fetchMlitText } from "../../src/lib/mlit-client.js";

describe("generated amendment index", () => {
  it("stores a target_titles object on every notice", () => {
    for (const notice of Object.values(KOKUJI_AMENDMENT_INDEX.notices)) {
      expect(notice.target_titles).toBeTypeOf("object");
      expect(notice.target_titles).not.toBeNull();
      expect(Array.isArray(notice.target_titles)).toBe(false);
    }
  });
  it.each([
    ["令和5:国土交通省:207", "平成12:建設省:1399"],
    ["令和3:国土交通省:546", "平成12:建設省:1399"],
    ["令和6:国土交通省:231", "平成12:建設省:1399"],
    ["平成30:国土交通省:472", "平成12:建設省:1399"],
    ["令和6:国土交通省:447", "昭和56:建設省:1100"],
    ["令和7:国土交通省:215", "昭和56:建設省:1100"],
    ["令和7:国土交通省:976", "昭和56:建設省:1100"],
    ["令和6:国土交通省:1005", "昭和56:建設省:1100"],
    ["令和6:国土交通省:273", "平成20:国土交通省:282"],
    ["令和6:国土交通省:273", "平成20:国土交通省:285"],
    ["令和3:国土交通省:286", "平成26:国土交通省:417"],
    ["令和6:国土交通省:325", "平成26:国土交通省:417"],
    ["令和8:国土交通省:464", "平成26:国土交通省:417"],
    ["令和6:国土交通省:57", "平成12:建設省:1417"],
    ["令和8:厚生労働省・国土交通省・環境省:2", "平成30:厚生労働省・国土交通省・環境省:1"],
    ["令和3:国土交通省:134", "平成17:国土交通省:359"],
    ["令和3:国土交通省:134", "平成26:国土交通省:1203"],
    ["令和2:国土交通省:510", "平成12:建設省:1441"],
    ["令和2:国土交通省:511", "平成12:建設省:1442"],
    ["平成30:国土交通省:1203", "平成25:国土交通省:748"],
  ])("preserves %s -> %s from the actual PDF build", (amendment, target) => {
    const notice = KOKUJI_AMENDMENT_INDEX.notices[amendment];
    expect(notice.target_keys).toContain(target);
    expect(new URL(notice.source_pdf).origin).toBe("https://www.mlit.go.jp");
  });
  it("retains empty targets for a newly established notice", () => {
    expect(KOKUJI_AMENDMENT_INDEX.notices["令和8:国土交通省:693"].target_keys).toEqual([]);
  });
  it("contains no reading or date fragments in canonical issuer fields", () => {
    for (const notice of Object.values(KOKUJI_AMENDMENT_INDEX.notices)) {
      for (const key of notice.target_keys) expect(key.split(":")[1]).toMatch(/^(?:建設省|国土交通省|厚生労働省|環境省)(?:・(?:建設省|国土交通省|厚生労働省|環境省))*$/);
    }
  });
  it("only marks an empty target set complete for a newly established notice", () => {
    const notices = parseAmendmentPage(readFileSync(new URL("../fixtures/mlit-kokuji-amendments.html", import.meta.url), "utf8"));
    const empty = notices.filter((notice) => notice.key && KOKUJI_AMENDMENT_INDEX.notices[notice.key]?.complete
      && KOKUJI_AMENDMENT_INDEX.notices[notice.key].target_keys.length === 0);
    expect(empty).toHaveLength(44);
    expect(empty.every((notice) => !/改正|改める|廃止|変更|削除/.test(notice.title) && notice.listed_target_keys.length === 0 && !notice.listed_targets_partial)).toBe(true);
    for (const key of ["令和7:国土交通省:366", "令和7:国土交通省:103", "令和2:国土交通省:1437", "令和2:国土交通省:821", "平成30:国土交通省:931"]) {
      expect(KOKUJI_AMENDMENT_INDEX.notices[key]).toMatchObject({ complete: false });
    }
  });
  it("records the unreadable 821 PDF without targets", () => {
    expect(KOKUJI_AMENDMENT_INDEX.notices["令和2:国土交通省:821"]).toMatchObject({
      source_pdf: "https://www.mlit.go.jp/jutakukentiku/build/content/001381081.pdf", target_keys: [], complete: false,
    });
  });
  it("excludes every notice's own key from page and resolved targets", async () => {
    const notices = parseAmendmentPage(readFileSync(new URL("../fixtures/mlit-kokuji-amendments.html", import.meta.url), "utf8"));
    for (const notice of notices) {
      expect(notice.listed_target_keys, notice.number).not.toContain(notice.key);
      const resolved = await resolveNoticeTargets(notice);
      expect(Object.keys(resolved.targets), notice.number).not.toContain(notice.key);
    }
    const notice = notices.find((item) => item.key === "令和6:国土交通省:227")!;
    expect(notice.listed_target_keys).toEqual(["令和1:国土交通省:193"]);
    const resolved = await resolveNoticeTargets(notice);
    expect(resolved.targets).toHaveProperty("令和1:国土交通省:193", "pdf");
    expect(resolved.complete).toBe(true);
    vi.mocked(fetchMlitText).mockResolvedValue(readFileSync(new URL("../fixtures/mlit-kokuji-amendments.html", import.meta.url), "utf8"));
    const result = await findAmendmentsFor({ key: notice.key, title: notice.title });
    expect(result.status).toBe("ok");
    expect(result.items.map((item) => item.number)).not.toContain(notice.number);
  });
  it("retains all page targets and leaves missing PDF evidence incomplete across the full fixture", async () => {
    const notices = parseAmendmentPage(readFileSync(new URL("../fixtures/mlit-kokuji-amendments.html", import.meta.url), "utf8"));
    for (const notice of notices) {
      const indexed = KOKUJI_AMENDMENT_INDEX.notices[notice.key!];
      expect(indexed, notice.number).toBeDefined();
      const resolved = await resolveNoticeTargets(notice);
      expect(Object.keys(resolved.targets), notice.number).toEqual(expect.arrayContaining(notice.listed_target_keys));
      expect(resolved.complete, notice.number).toBe(indexed.complete && hasCompletePdfTargets(notice, indexed.target_keys));
      for (const key of notice.listed_target_keys) {
        expect(resolved.targets[key], notice.number).toBe(indexed.target_keys.includes(key) ? "pdf" : "page");
        if (!indexed.target_keys.includes(key)) {
          expect(indexed.complete, notice.number).toBe(false);
          expect(resolved.complete, notice.number).toBe(false);
        }
      }
    }
    expect(extractPdfText).not.toHaveBeenCalled();
  });
  it("returns 273 when checking amendments of 282 using the fixture and generated index", async () => {
    vi.mocked(fetchMlitText).mockResolvedValue(readFileSync(new URL("../fixtures/mlit-kokuji-amendments.html", import.meta.url), "utf8"));
    const result = await findAmendmentsFor({ key: "平成20:国土交通省:282", title: "" });
    expect(result.status).toBe("ok");
    expect(result.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ number: "令和6年国土交通省告示第273号", matched_by: "pdf" }),
    ]));
    expect(result.unresolved_count).toBe(Object.values(KOKUJI_AMENDMENT_INDEX.notices).filter((notice) => !notice.complete).length);
    expect(extractPdfText).not.toHaveBeenCalled();
  });
});
