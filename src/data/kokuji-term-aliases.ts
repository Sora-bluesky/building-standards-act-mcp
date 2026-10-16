/** Terms absent from the legacy MLIT titles; keep aliases tied to provisions. */
const KOKUJI_TERM_ALIASES: Readonly<Record<string, string>> = {
  // Reiwa 6 MLIT Notice 447 moved wall-quantity rules to Showa 56 Notice 1100, titled with Order Article 46(4).
  壁量: "令46条4項",
  // Required wall quantity is governed by the same Order Article 46(4) rule in Showa 56 Notice 1100.
  必要壁量: "令46条4項",
  // Wall-quantity calculations use Order Article 46(4), named in the legacy title of Showa 56 Notice 1100.
  壁量計算: "令46条4項",
  // Wall-quantity standards moved under Showa 56 Notice 1100 through Reiwa 6 MLIT Notice 447.
  壁量基準: "令46条4項",
  // Existing wall quantity is assessed against the Order Article 46(4) wall-quantity rule.
  存在壁量: "令46条4項",
};

/** Append distinct provision aliases while preserving the user's original text. */
export function expandKokujiAliases(text: string): string {
  const targets = new Set(
    Object.entries(KOKUJI_TERM_ALIASES)
      .filter(([term]) => text.includes(term))
      .map(([, target]) => target),
  );
  return [text, ...targets].join(" ");
}
