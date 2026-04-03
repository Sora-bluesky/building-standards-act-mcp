import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LawRegistry } from "../lib/law-registry.js";
import { resolveLawId } from "../lib/law-resolver.js";
import {
  checkLawUpdate,
  checkLawUpdates,
  getLawRevisionHistory,
  mapWithConcurrency,
  RATE_LIMIT_DELAY_MS,
  CONCURRENCY,
  sleep,
} from "../lib/revision-tracker.js";
import { hasSearchCached } from "../lib/egov-client.js";
import type { LawUpdateCheckResult, ResolvedLaw } from "../lib/types.js";
import { wrapToolHandler } from "../lib/tool-helpers.js";

const registry = new LawRegistry();

const schema = {
  law_name: z
    .string()
    .max(200)
    .optional()
    .describe(
      "法令名または略称（例: 建築基準法、建基法）。単体チェックに使用。",
    ),
  group: z
    .string()
    .max(100)
    .optional()
    .describe(
      "検証対象の章グループ（例: 1章）。省略時は全プリセットをチェック。",
    ),
  show_history: z
    .boolean()
    .optional()
    .default(false)
    .describe("true で改正履歴の詳細を表示。law_name 指定時のみ有効。"),
};

function formatSummary(results: LawUpdateCheckResult[]): string {
  const hasRevisions = results.filter((r) => r.status === "has_revisions");
  const repealed = results.filter((r) => r.status === "repealed");
  const errors = results.filter((r) => r.status === "error");
  const current = results.filter((r) => r.status === "current");

  const lines: string[] = [];
  lines.push("## 法令改正チェック結果\n");
  lines.push(`- チェック対象: ${results.length}件`);
  lines.push(`- 最新: ${current.length}件`);
  if (hasRevisions.length > 0)
    lines.push(`- **改正あり: ${hasRevisions.length}件**`);
  if (repealed.length > 0) lines.push(`- **廃止検出: ${repealed.length}件**`);
  if (errors.length > 0) lines.push(`- エラー: ${errors.length}件`);

  if (hasRevisions.length > 0) {
    lines.push("\n### 改正あり\n");
    for (const r of hasRevisions) {
      lines.push(`- **${r.title}** (${r.law_id})`);
      if (r.latest_amendment_date) {
        lines.push(`  - 最新改正公布日: ${r.latest_amendment_date}`);
      }
      if (r.latest_amendment_law) {
        lines.push(`  - 改正法令: ${r.latest_amendment_law}`);
      }
    }
  }

  if (repealed.length > 0) {
    lines.push("\n### 廃止検出\n");
    for (const r of repealed) {
      lines.push(`- **${r.title}** (${r.law_id})`);
      if (r.latest_amendment_date) {
        lines.push(`  - 改正公布日: ${r.latest_amendment_date}`);
      }
    }
  }

  if (errors.length > 0) {
    lines.push("\n### エラー\n");
    for (const r of errors) {
      lines.push(`- ${r.title}: ${r.error_message}`);
    }
  }

  return lines.join("\n");
}

function formatHistory(result: LawUpdateCheckResult): string {
  const lines: string[] = [];
  lines.push(`## ${result.title} 改正履歴\n`);
  lines.push(`- 法令ID: ${result.law_id}`);
  lines.push(`- 状態: ${result.status}\n`);

  if (result.revisions && result.revisions.length > 0) {
    lines.push("### リビジョン一覧\n");
    lines.push("| # | 改正公布日 | 施行日 | 改正法令 | 状態 |");
    lines.push("|---|-----------|--------|---------|------|");

    for (let i = 0; i < result.revisions.length; i++) {
      const rev = result.revisions[i];
      const num = i + 1;
      const promDate = rev.amendment_promulgate_date || "-";
      const enfDate = rev.amendment_enforcement_date || "-";
      const lawRef = rev.amendment_law_title || rev.amendment_law_num || "-";
      const status = rev.current_revision_status || "-";
      lines.push(
        `| ${num} | ${promDate} | ${enfDate} | ${lawRef} | ${status} |`,
      );
    }
  } else {
    lines.push("改正履歴はありません。");
  }

  return lines.join("\n");
}

export function registerCheckLawUpdatesTool(server: McpServer): void {
  server.tool(
    "check_law_updates",
    "法令の改正状況をe-Gov APIで確認する。法令名指定で単体チェック、グループ指定でバッチチェック、show_historyで改正履歴表示が可能。",
    schema,
    wrapToolHandler(
      "check_law_updates",
      async ({ law_name, group, show_history }) => {
        // Single law check with optional history
        if (law_name) {
          const resolved = await resolveLawId(law_name);
          if (!resolved) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `法令「${law_name}」が見つかりませんでした。`,
                },
              ],
            };
          }

          const result = show_history
            ? await getLawRevisionHistory(resolved)
            : await checkLawUpdate(resolved);

          const text = show_history
            ? formatHistory(result)
            : formatSummary([result]);

          return { content: [{ type: "text" as const, text }] };
        }

        // Batch check (group or all)
        const aliases = group ? registry.getByGroup(group) : registry.getAll();

        if (aliases.length === 0) {
          const msg = group
            ? `グループ「${group}」に該当する法令が見つかりませんでした。`
            : "登録済み法令がありません。";
          return { content: [{ type: "text" as const, text: msg }] };
        }

        // Resolve each alias to get law_id (concurrent with rate-limit on cache miss)
        const resolveResults = await mapWithConcurrency(
          aliases,
          async (alias) => {
            const wasCached = hasSearchCached(alias.title);
            const resolved = await resolveLawId(alias.title);
            if (!wasCached) {
              await sleep(RATE_LIMIT_DELAY_MS);
            }
            return resolved;
          },
          CONCURRENCY,
        );
        const resolvedLaws = resolveResults.filter(
          (r): r is ResolvedLaw => r !== null,
        );

        const results = await checkLawUpdates(resolvedLaws);
        const text = formatSummary(results);

        return { content: [{ type: "text" as const, text }] };
      },
    ),
  );
}
