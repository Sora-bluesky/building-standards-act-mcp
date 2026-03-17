/**
 * verify-law-ids.ts
 *
 * Verifies lawIds for Japanese building laws via the e-Gov API v2.
 * Usage: npx tsx scripts/verify-law-ids.ts
 */

const BASE_URL = "https://laws.e-gov.go.jp/api/2";
const DELAY_MS = 500;

interface LawCandidate {
  title: string;
  group: string;
  tier: "Act" | "CabinetOrder" | "MinisterialOrdinance" | "Other";
  abbrev: string[];
  isKokuji?: boolean;
  delegated_by?: string;
}

interface VerifiedResult {
  title: string;
  group: string;
  tier: string;
  abbrev: string[];
  law_id: string | null;
  law_num: string | null;
  match_title: string | null;
  status: "found" | "not_found" | "error";
  error?: string;
  isKokuji?: boolean;
  delegated_by?: string;
}

// All laws to verify, organized by chapter
const LAW_CANDIDATES: LawCandidate[] = [
  // 1章 総則
  {
    title: "建築基準法",
    group: "1章 総則",
    tier: "Act",
    abbrev: ["建基法", "基準法"],
  },
  {
    title: "建築基準法施行令",
    group: "1章 総則",
    tier: "CabinetOrder",
    abbrev: ["建基令", "基準法施行令"],
  },
  {
    title: "建築基準法施行規則",
    group: "1章 総則",
    tier: "MinisterialOrdinance",
    abbrev: ["建基規則"],
  },
  { title: "民法", group: "1章 総則", tier: "Act", abbrev: ["民法"] },

  // 2章 手続関連規定
  {
    title: "建築士法",
    group: "2章 手続関連規定",
    tier: "Act",
    abbrev: ["士法"],
  },
  {
    title: "建築士法施行令",
    group: "2章 手続関連規定",
    tier: "CabinetOrder",
    abbrev: ["士法施行令"],
  },
  {
    title: "建築士法施行規則",
    group: "2章 手続関連規定",
    tier: "MinisterialOrdinance",
    abbrev: ["士法施行規則"],
  },
  {
    title: "建設業法",
    group: "2章 手続関連規定",
    tier: "Act",
    abbrev: ["建設業法"],
  },
  {
    title: "建設業法施行令",
    group: "2章 手続関連規定",
    tier: "CabinetOrder",
    abbrev: ["建設業法施行令"],
  },

  // 3章 集団規定・街づくり規定
  {
    title: "都市計画法",
    group: "3章 集団規定・街づくり規定",
    tier: "Act",
    abbrev: ["都計法"],
  },
  {
    title: "都市計画法施行令",
    group: "3章 集団規定・街づくり規定",
    tier: "CabinetOrder",
    abbrev: ["都計令"],
  },
  {
    title: "都市再開発法",
    group: "3章 集団規定・街づくり規定",
    tier: "Act",
    abbrev: ["再開発法"],
  },
  {
    title: "景観法",
    group: "3章 集団規定・街づくり規定",
    tier: "Act",
    abbrev: ["景観法"],
  },
  {
    title: "密集市街地における防災街区の整備の促進に関する法律",
    group: "3章 集団規定・街づくり規定",
    tier: "Act",
    abbrev: ["密集法"],
  },
  {
    title: "都市の低炭素化の促進に関する法律",
    group: "3章 集団規定・街づくり規定",
    tier: "Act",
    abbrev: ["低炭素法"],
  },
  {
    title: "屋外広告物法",
    group: "3章 集団規定・街づくり規定",
    tier: "Act",
    abbrev: ["屋外広告物法"],
  },
  {
    title: "文化財保護法",
    group: "3章 集団規定・街づくり規定",
    tier: "Act",
    abbrev: ["文化財保護法"],
  },

  // 4章 防火規定・耐火規定
  {
    title: "消防法",
    group: "4章 防火規定・耐火規定",
    tier: "Act",
    abbrev: ["消防法"],
  },
  {
    title: "消防法施行令",
    group: "4章 防火規定・耐火規定",
    tier: "CabinetOrder",
    abbrev: ["消防令"],
  },

  // 7章 設備関連規定
  {
    title: "浄化槽法",
    group: "7章 設備関連規定",
    tier: "Act",
    abbrev: ["浄化槽法"],
  },

  // 9章 建築基準関係規定・建築関連法令
  {
    title: "旅館業法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["旅館業法"],
  },
  {
    title: "食品衛生法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["食品衛生法"],
  },
  {
    title: "風俗営業等の規制及び業務の適正化等に関する法律",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["風営法", "風適法"],
  },
  {
    title: "興行場法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["興行場法"],
  },
  {
    title: "公衆浴場法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["公衆浴場法"],
  },
  {
    title: "医療法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["医療法"],
  },
  {
    title: "児童福祉法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["児童福祉法"],
  },
  {
    title: "社会福祉法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["社会福祉法"],
  },
  {
    title: "老人福祉法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["老人福祉法"],
  },
  {
    title: "学校教育法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["学校教育法"],
  },
  {
    title: "駐車場法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["駐車場法"],
  },
  {
    title: "火薬類取締法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["火薬類取締法"],
  },
  {
    title: "高圧ガス保安法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["高圧ガス保安法"],
  },
  {
    title: "液化石油ガスの保安の確保及び取引の適正化に関する法律",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["液石法", "LPガス法"],
  },
  {
    title: "ガス事業法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["ガス事業法"],
  },
  {
    title: "電気事業法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["電気事業法"],
  },
  {
    title: "宅地造成及び特定盛土等規制法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["盛土規制法", "宅造法"],
  },
  {
    title: "宅地建物取引業法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["宅建業法"],
  },
  {
    title: "道路法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["道路法"],
  },
  {
    title: "土地収用法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["土地収用法"],
  },
  {
    title: "農地法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["農地法"],
  },
  {
    title: "森林法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["森林法"],
  },
  {
    title: "河川法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["河川法"],
  },
  {
    title: "港湾法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["港湾法"],
  },
  {
    title: "地すべり等防止法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["地すべり防止法"],
  },
  {
    title: "急傾斜地の崩壊による災害の防止に関する法律",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["急傾斜地法"],
  },
  {
    title: "土砂災害警戒区域等における土砂災害防止対策の推進に関する法律",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["土砂災害防止法"],
  },
  {
    title: "危険物の規制に関する政令",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "CabinetOrder",
    abbrev: ["危険物政令"],
  },
  {
    title: "水道法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["水道法"],
  },
  {
    title: "下水道法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["下水道法"],
  },
  {
    title: "廃棄物の処理及び清掃に関する法律",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["廃棄物処理法", "廃掃法"],
  },
  {
    title: "土壌汚染対策法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["土壌汚染対策法"],
  },
  {
    title: "労働安全衛生法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["安衛法", "労安法"],
  },
  {
    title: "建設工事に係る資材の再資源化等に関する法律",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["建設リサイクル法"],
  },
  {
    title: "大気汚染防止法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["大気汚染防止法"],
  },
  {
    title: "水質汚濁防止法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["水質汚濁防止法"],
  },
  {
    title: "騒音規制法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["騒音規制法"],
  },
  {
    title: "振動規制法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["振動規制法"],
  },
  {
    title: "悪臭防止法",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["悪臭防止法"],
  },
  {
    title: "高齢者、障害者等の移動等の円滑化の促進に関する法律",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "Act",
    abbrev: ["バリアフリー法"],
  },
  {
    title: "高齢者、障害者等の移動等の円滑化の促進に関する法律施行令",
    group: "9章 建築基準関係規定・建築関連法令",
    tier: "CabinetOrder",
    abbrev: ["バリアフリー法施行令"],
  },

  // 10章 省エネ法・住宅関連法
  {
    title: "建築物のエネルギー消費性能の向上等に関する法律",
    group: "10章 省エネ法・住宅関連法",
    tier: "Act",
    abbrev: ["建築物省エネ法"],
  },
  {
    title: "建築物のエネルギー消費性能の向上等に関する法律施行令",
    group: "10章 省エネ法・住宅関連法",
    tier: "CabinetOrder",
    abbrev: ["建築物省エネ法施行令"],
  },
  {
    title: "エネルギーの使用の合理化及び非化石エネルギーへの転換等に関する法律",
    group: "10章 省エネ法・住宅関連法",
    tier: "Act",
    abbrev: ["省エネ法"],
  },
  {
    title: "住宅の品質確保の促進等に関する法律",
    group: "10章 省エネ法・住宅関連法",
    tier: "Act",
    abbrev: ["品確法", "住宅品質確保法"],
  },
  {
    title: "長期優良住宅の普及の促進に関する法律",
    group: "10章 省エネ法・住宅関連法",
    tier: "Act",
    abbrev: ["長期優良住宅法"],
  },
  {
    title: "マンションの管理の適正化の推進に関する法律",
    group: "10章 省エネ法・住宅関連法",
    tier: "Act",
    abbrev: ["マンション管理適正化法"],
  },
  {
    title: "マンションの建替え等の円滑化に関する法律",
    group: "10章 省エネ法・住宅関連法",
    tier: "Act",
    abbrev: ["マンション建替え法"],
  },
  {
    title: "建物の区分所有等に関する法律",
    group: "10章 省エネ法・住宅関連法",
    tier: "Act",
    abbrev: ["区分所有法"],
  },

  // 11章 既存建築物関連
  {
    title: "建築物の耐震改修の促進に関する法律",
    group: "11章 既存建築物関連",
    tier: "Act",
    abbrev: ["耐震改修促進法"],
  },

  // Kokuji (告示)
  {
    title: "耐火構造の構造方法を定める件",
    group: "告示",
    tier: "Other",
    abbrev: ["耐火構造告示"],
    isKokuji: true,
    delegated_by: "建築基準法施行令",
  },
  {
    title: "準耐火構造の構造方法を定める件",
    group: "告示",
    tier: "Other",
    abbrev: ["準耐火構造告示"],
    isKokuji: true,
    delegated_by: "建築基準法施行令",
  },
  {
    title: "防火構造の構造方法を定める件",
    group: "告示",
    tier: "Other",
    abbrev: ["防火構造告示"],
    isKokuji: true,
    delegated_by: "建築基準法施行令",
  },
  {
    title: "不燃材料を定める件",
    group: "告示",
    tier: "Other",
    abbrev: ["不燃材料告示"],
    isKokuji: true,
    delegated_by: "建築基準法施行令",
  },
  {
    title: "採光に有効な部分の面積の算定方法を定める件",
    group: "告示",
    tier: "Other",
    abbrev: ["採光告示"],
    isKokuji: true,
    delegated_by: "建築基準法施行令",
  },
  {
    title: "避難安全検証法に関する算出方法等を定める件",
    group: "告示",
    tier: "Other",
    abbrev: ["避難安全検証法告示"],
    isKokuji: true,
    delegated_by: "建築基準法施行令",
  },
  {
    title: "許容応力度計算等の方法を定める件",
    group: "告示",
    tier: "Other",
    abbrev: ["許容応力度告示"],
    isKokuji: true,
    delegated_by: "建築基準法施行令",
  },
];

interface EgovSearchResult {
  total_count: number;
  count: number;
  laws: Array<{
    law_info: {
      law_type: string;
      law_id: string;
      law_num: string;
      law_num_era: string;
      law_num_year: number;
      law_num_type: string;
      law_num_num: string;
      promulgation_date: string;
    };
    revision_info: {
      law_revision_id: string;
      law_type: string;
      law_title: string;
      law_title_kana: string;
      abbrev: string | null;
      category: string;
      repeal_status: string;
      current_revision_status: string;
    };
  }>;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchLaw(title: string): Promise<EgovSearchResult | null> {
  const url = `${BASE_URL}/laws?law_title=${encodeURIComponent(title)}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`  HTTP ${response.status} for: ${title}`);
      return null;
    }

    return (await response.json()) as EgovSearchResult;
  } catch (err) {
    console.error(
      `  Error fetching: ${title} - ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

function pickBestMatch(
  searchTitle: string,
  result: EgovSearchResult,
): { law_id: string; law_num: string; match_title: string } | null {
  if (!result.laws || result.laws.length === 0) {
    return null;
  }

  // Priority 1: Exact title match + CurrentEnforced
  for (const law of result.laws) {
    if (
      law.revision_info.law_title === searchTitle &&
      law.revision_info.current_revision_status === "CurrentEnforced"
    ) {
      return {
        law_id: law.law_info.law_id,
        law_num: law.law_info.law_num,
        match_title: law.revision_info.law_title,
      };
    }
  }

  // Priority 2: Exact title match (any status)
  for (const law of result.laws) {
    if (law.revision_info.law_title === searchTitle) {
      return {
        law_id: law.law_info.law_id,
        law_num: law.law_info.law_num,
        match_title: law.revision_info.law_title,
      };
    }
  }

  // Priority 3: CurrentEnforced with closest title
  const enforced = result.laws.filter(
    (l) => l.revision_info.current_revision_status === "CurrentEnforced",
  );
  if (enforced.length > 0) {
    // Pick shortest title that contains the search title, or vice versa
    const containing = enforced.filter(
      (l) =>
        l.revision_info.law_title.includes(searchTitle) ||
        searchTitle.includes(l.revision_info.law_title),
    );
    if (containing.length > 0) {
      // Pick the one with the shortest title (closest match)
      containing.sort(
        (a, b) =>
          a.revision_info.law_title.length - b.revision_info.law_title.length,
      );
      return {
        law_id: containing[0].law_info.law_id,
        law_num: containing[0].law_info.law_num,
        match_title: containing[0].revision_info.law_title,
      };
    }
    // If no containment match, just return first enforced
    return {
      law_id: enforced[0].law_info.law_id,
      law_num: enforced[0].law_info.law_num,
      match_title: enforced[0].revision_info.law_title,
    };
  }

  // Priority 4: First result
  const first = result.laws[0];
  return {
    law_id: first.law_info.law_id,
    law_num: first.law_info.law_num,
    match_title: first.revision_info.law_title,
  };
}

async function main(): Promise<void> {
  console.log("=== e-Gov API v2 Law ID Verification ===");
  console.log(`Total candidates: ${LAW_CANDIDATES.length}`);
  console.log("");

  const results: VerifiedResult[] = [];
  let foundCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;

  for (let i = 0; i < LAW_CANDIDATES.length; i++) {
    const candidate = LAW_CANDIDATES[i];
    const progress = `[${i + 1}/${LAW_CANDIDATES.length}]`;
    process.stdout.write(`${progress} Searching: ${candidate.title} ... `);

    const searchResult = await searchLaw(candidate.title);

    if (searchResult === null) {
      console.log("ERROR");
      results.push({
        title: candidate.title,
        group: candidate.group,
        tier: candidate.tier,
        abbrev: candidate.abbrev,
        law_id: null,
        law_num: null,
        match_title: null,
        status: "error",
        error: "API request failed",
        isKokuji: candidate.isKokuji,
        delegated_by: candidate.delegated_by,
      });
      errorCount++;
    } else {
      const match = pickBestMatch(candidate.title, searchResult);
      if (match) {
        const exactMatch = match.match_title === candidate.title;
        console.log(
          `FOUND (${exactMatch ? "exact" : "partial"}) -> ${match.law_id} [${match.law_num}]`,
        );
        if (!exactMatch) {
          console.log(`    Matched title: ${match.match_title}`);
        }
        results.push({
          title: candidate.title,
          group: candidate.group,
          tier: candidate.tier,
          abbrev: candidate.abbrev,
          law_id: match.law_id,
          law_num: match.law_num,
          match_title: match.match_title,
          status: "found",
          isKokuji: candidate.isKokuji,
          delegated_by: candidate.delegated_by,
        });
        foundCount++;
      } else {
        console.log(
          `NOT FOUND (${searchResult.total_count} results, no match)`,
        );
        results.push({
          title: candidate.title,
          group: candidate.group,
          tier: candidate.tier,
          abbrev: candidate.abbrev,
          law_id: null,
          law_num: null,
          match_title: null,
          status: "not_found",
          isKokuji: candidate.isKokuji,
          delegated_by: candidate.delegated_by,
        });
        notFoundCount++;
      }
    }

    // Rate limiting delay
    if (i < LAW_CANDIDATES.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // Summary
  console.log("\n=== SUMMARY ===");
  console.log(`Found:     ${foundCount}`);
  console.log(`Not Found: ${notFoundCount}`);
  console.log(`Errors:    ${errorCount}`);
  console.log(`Total:     ${LAW_CANDIDATES.length}`);

  // List not found
  const notFoundResults = results.filter((r) => r.status !== "found");
  if (notFoundResults.length > 0) {
    console.log("\n=== NOT FOUND / ERRORS ===");
    for (const r of notFoundResults) {
      console.log(
        `  [${r.status}] ${r.title} ${r.error ? `(${r.error})` : ""}`,
      );
    }
  }

  // Write JSON output
  const fs = await import("fs");
  const path = await import("path");
  const outputPath = path.join(
    import.meta.dirname ?? ".",
    "verified-law-ids.json",
  );
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf-8");
  console.log(`\nResults saved to: ${outputPath}`);
}

main().catch(console.error);
