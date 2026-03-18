import { describe, it, expect, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetMetricsTool } from "../../src/tools/get-metrics.js";
import {
  recordToolCall,
  recordApiCall,
  recordCacheHit,
  _resetMetrics,
} from "../../src/lib/metrics.js";

// Capture the tool handler
let toolHandler: (
  args: Record<string, unknown>,
) => Promise<{ content: { type: string; text: string }[] }>;

const mockServer = {
  tool: (
    _name: string,
    _description: string,
    _schema: unknown,
    handler: typeof toolHandler,
  ) => {
    toolHandler = handler;
  },
} as unknown as McpServer;

describe("get_metrics tool", () => {
  beforeEach(() => {
    _resetMetrics();
    registerGetMetricsTool(mockServer);
  });

  it("returns metrics as JSON text", async () => {
    const result = await toolHandler({});

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const metrics = JSON.parse(result.content[0].text);
    expect(metrics.uptime_seconds).toBeTypeOf("number");
    expect(metrics.tools).toBeDefined();
    expect(metrics.api).toBeDefined();
    expect(metrics.cache).toBeDefined();
  });

  it("reflects recorded metrics in output", async () => {
    recordToolCall("get_law", 150, true);
    recordApiCall("/laws", 200, 200);
    recordCacheHit("search", true);

    const result = await toolHandler({});
    const metrics = JSON.parse(result.content[0].text);

    expect(metrics.tools.get_law.calls).toBe(1);
    expect(metrics.api["/laws"].requests).toBe(1);
    expect(metrics.cache.search.hits).toBe(1);
  });

  it("returns empty metrics when nothing has been recorded", async () => {
    const result = await toolHandler({});
    const metrics = JSON.parse(result.content[0].text);

    expect(metrics.tools).toEqual({});
    expect(metrics.api).toEqual({});
    expect(metrics.cache).toEqual({});
  });
});
