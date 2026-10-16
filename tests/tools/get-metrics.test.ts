import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetMetricsTool } from "../../src/tools/get-metrics.js";
import * as metrics from "../../src/lib/metrics.js";

// Capture the tool handler
let toolHandler: (
  args: Record<string, unknown>,
) => Promise<{
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}>;

const mockServer = {
  registerTool: vi.fn(
    (_name: string, _config: unknown, handler: typeof toolHandler) => {
      toolHandler = handler;
    },
  ),
} as unknown as McpServer;

describe("get_metrics tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    metrics._resetMetrics();
    registerGetMetricsTool(mockServer);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers with correct name and no input schema", () => {
    expect(mockServer.registerTool).toHaveBeenCalledWith(
      "get_metrics",
      expect.objectContaining({
        annotations: expect.objectContaining({ readOnlyHint: true }),
      }),
      expect.any(Function),
    );
    expect(vi.mocked(mockServer.registerTool).mock.calls[0][1]).not.toHaveProperty(
      "inputSchema",
    );
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
    expect(result.structuredContent).toEqual(metrics);
    expect(result.structuredContent).toMatchObject({
      uptime_seconds: expect.any(Number),
      tools: {},
      api: {},
      cache: {},
    });
  });

  it("reflects recorded metrics in output", async () => {
    metrics.recordToolCall("get_law", 150, true);
    metrics.recordApiCall("/laws", 200, 200);
    metrics.recordCacheHit("search", true);

    const result = await toolHandler({});
    const snapshot = JSON.parse(result.content[0].text);

    expect(snapshot.tools.get_law.calls).toBe(1);
    expect(snapshot.api["/laws"].requests).toBe(1);
    expect(snapshot.cache.search.hits).toBe(1);
    expect(result.structuredContent).toEqual(snapshot);
  });

  it("returns an error without structuredContent when metrics fail", async () => {
    vi.spyOn(metrics, "getMetrics").mockImplementationOnce(() => {
      throw new Error("Metrics unavailable");
    });

    const result = await toolHandler({});

    expect(result.isError).toBe(true);
    expect(result).not.toHaveProperty("structuredContent");
    expect(result.content[0].text).toContain("内部エラー");
  });

  it("returns empty metrics when nothing has been recorded", async () => {
    const result = await toolHandler({});
    const metrics = JSON.parse(result.content[0].text);

    expect(metrics.tools).toEqual({});
    expect(metrics.api).toEqual({});
    expect(metrics.cache).toEqual({});
  });
});
