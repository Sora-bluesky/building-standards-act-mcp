import type { VercelRequest, VercelResponse } from "@vercel/node";
import { invokeTool } from "../../src/lib/tool-invoker.js";

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
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      content: [{ type: "text", text: message }],
      isError: true,
    });
  }
}
