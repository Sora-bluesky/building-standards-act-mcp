import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LawRegistry } from "../lib/law-registry.js";
import {
  checkLawUpdate,
  checkLawUpdates,
  getLawRevisionHistory,
} from "../lib/revision-tracker.js";
import type { LawUpdateCheckResult } from "../lib/types.js";

const registry = new LawRegistry();

const schema = {
  law_name: z
    .string()
    .optional()
    .describe(
      "法令名または略称（例: 建築基準法、建基法）。単体チェックに使用。",
    ),
  group: z
    .string()
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
  const updated = results.filter((r) => r.status === "updated");
  const repealed = results.filter((r) => r.status === "repealed");
  const errors = results.filter((r) => r.status === "error");
  const upToDate = results.filter((r) => r.status === "up_to_date");

  const lines: string[] = [];
  lines.push("## 法令改正チェック結果\n");
  lines.push(`- チェック対象: ${results.length}件`);
  lines.push(`- 最新: ${upToDate.length}件`);
  if (updated.length > 0) lines.push(`- **更新検出: ${updated.length}件**`);
  if (repealed.length > 0) lines.push(`- **廃止検出: ${repealed.length}件**`);
  if (errors.length > 0) lines.push(`- エラー: ${errors.length}件`);

  if (updated.length > 0) {
    lines.push("\n### 更新検出\n");
    for (const r of updated) {
      lines.push(`- **${r.title}** (${r.law_id})`);
      lines.push(`  - 最終検証日: ${r.verified_at}`);
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
  lines.push(`- 検証日: ${result.verified_at}`);
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
    "法令プリセットの改正状況をe-Gov APIで確認する。法令名指定で単体チェック、グループ指定でバッチチェック、show_historyで改正履歴表示が可能。",
    schema,
    async ({ law_name, group, show_history }) => {
      try {
        // Single law check with optional history
        if (law_name) {
          const preset = registry.findByName(law_name);
          if (!preset) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `法令「${law_name}」がプリセットに見つかりませんでした。`,
                },
              ],
            };
          }

          const result = show_history
            ? await getLawRevisionHistory(preset)
            : await checkLawUpdate(preset);

          const text = show_history
            ? formatHistory(result)
            : formatSummary([result]);

          return { content: [{ type: "text" as const, text }] };
        }

        // Batch check (group or all)
        const presets = group ? registry.getByGroup(group) : registry.getAll();

        if (presets.length === 0) {
          const msg = group
            ? `グループ「${group}」に該当するプリセットが見つかりませんでした。`
            : "プリセットが登録されていません。";
          return { content: [{ type: "text" as const, text: msg }] };
        }

        const results = await checkLawUpdates(presets);
        const text = formatSummary(results);

        return { content: [{ type: "text" as const, text }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text" as const, text: `エラー: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
