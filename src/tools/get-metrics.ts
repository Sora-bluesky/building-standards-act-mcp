import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getMetrics } from "../lib/metrics.js";
import { TOOL_ANNOTATIONS, wrapToolHandler } from "../lib/tool-helpers.js";

const outputSchema = {
  uptime_seconds: z.number(),
  tools: z.record(
    z.string(),
    z.object({
      calls: z.number(),
      avg_ms: z.number(),
      errors: z.number(),
    }),
  ),
  api: z.record(
    z.string(),
    z.object({
      requests: z.number(),
      avg_ms: z.number(),
      errors: z.number(),
      error_rate: z.string(),
    }),
  ),
  cache: z.record(
    z.string(),
    z.object({
      hits: z.number(),
      misses: z.number(),
      hit_rate: z.string(),
    }),
  ),
} satisfies z.ZodRawShape;

export function registerGetMetricsTool(server: McpServer): void {
  server.registerTool(
    "get_metrics",
    {
      title: "使用量メトリクス",
      description: "サーバーの使用量メトリクスを返す（ツール呼び出し回数・APIリクエスト数・キャッシュヒット率・稼働時間）",
      annotations: TOOL_ANNOTATIONS,
      outputSchema,
    },
    wrapToolHandler("get_metrics", async () => {
      const metrics = getMetrics();
      return {
        structuredContent: metrics,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(metrics, null, 2),
          },
        ],
      };
    }),
  );
}
