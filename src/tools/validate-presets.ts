import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LawRegistry } from "../lib/law-registry.js";
import { searchLaws } from "../lib/egov-client.js";
import { createCache } from "../lib/cache.js";

const registry = new LawRegistry();

const VALIDATION_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const RATE_LIMIT_DELAY_MS = 500;

interface PresetValidationResult {
  title: string;
  law_id: string;
  status: "valid" | "not_found" | "error";
}

interface ValidationResponse {
  total: number;
  valid: number;
  invalid: number;
  cached: boolean;
  validated_at: string;
  results: PresetValidationResult[];
}

const validationCache = createCache<ValidationResponse>(
  "validation",
  VALIDATION_CACHE_TTL,
);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const schema = {
  group: z
    .string()
    .optional()
    .describe(
      "検証対象の章グループ（例: 1章）。省略時は全プリセットを検証する。",
    ),
};

export function registerValidatePresetsTool(server: McpServer): void {
  server.tool(
    "validate_presets",
    "法令プリセットがe-Gov APIに存在するか検証する。グループ指定で特定の章のみ検証可能。",
    schema,
    async ({ group }) => {
      try {
        const cacheKey = group
          ? `validate_presets:${group}`
          : "validate_presets";

        // Return cached results if available
        const cached = validationCache.get(cacheKey);
        if (cached) {
          const cachedResponse = { ...cached, cached: true };
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(cachedResponse, null, 2),
              },
            ],
          };
        }

        // Get presets to validate
        const presets = group ? registry.getByGroup(group) : registry.getAll();

        if (presets.length === 0) {
          const msg = group
            ? `グループ「${group}」に該当するプリセットが見つかりませんでした。`
            : "プリセットが登録されていません。";
          return { content: [{ type: "text" as const, text: msg }] };
        }

        const results: PresetValidationResult[] = [];

        for (let i = 0; i < presets.length; i++) {
          const preset = presets[i];

          try {
            const searchResponse = await searchLaws(preset.title);

            // Check if the preset's law_id exists in the search results
            const found = searchResponse.laws.some(
              (law) => law.law_info.law_id === preset.law_id,
            );

            results.push({
              title: preset.title,
              law_id: preset.law_id,
              status: found ? "valid" : "not_found",
            });
          } catch {
            results.push({
              title: preset.title,
              law_id: preset.law_id,
              status: "error",
            });
          }

          // Rate limiting: wait between API calls (skip after the last one)
          if (i < presets.length - 1) {
            await sleep(RATE_LIMIT_DELAY_MS);
          }
        }

        const validCount = results.filter((r) => r.status === "valid").length;
        const invalidCount = results.filter(
          (r) => r.status === "not_found",
        ).length;

        const response: ValidationResponse = {
          total: results.length,
          valid: validCount,
          invalid: invalidCount,
          cached: false,
          validated_at: new Date().toISOString(),
          results,
        };

        // Cache the results
        validationCache.set(cacheKey, response);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
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
