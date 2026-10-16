import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { invokeTool } from "../../src/lib/tool-invoker.js";
import { handleToolError } from "../../src/lib/tool-helpers.js";

const EXCLUDED_TOOLS = new Set(["validate_presets", "get_metrics"]);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { name } = req.query;
  if (typeof name !== "string") {
    res.status(400).json({ error: "Tool name is required" });
    return;
  }

  if (EXCLUDED_TOOLS.has(name)) {
    res
      .status(404)
      .json({ error: `Tool '${name}' is not available via REST API` });
    return;
  }

  try {
    const args =
      req.method === "GET"
        ? Object.fromEntries(
            Object.entries(req.query).filter(([k]) => k !== "name"),
          )
        : ((req.body as Record<string, unknown>) ?? {});

    const result = await invokeTool(name, args);
    res.status(200).json(result);
  } catch (error) {
    const result = handleToolError(name, error);
    if (error instanceof McpError && error.code === ErrorCode.InvalidParams) {
      result.content = [
        {
          type: "text",
          text: "エラー: 入力パラメータが不正です。OpenAPI スキーマ（/api/openapi.json）を確認してください。",
        },
      ];
      res.status(400).json(result);
    } else if (
      error instanceof McpError && error.code === ErrorCode.MethodNotFound
    ) {
      res.status(404).json({ error: `Tool '${name}' is not available via REST API` });
    } else {
      res.status(500).json(result);
    }
  }
}
