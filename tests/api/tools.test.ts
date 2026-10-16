import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

vi.mock("../../src/lib/tool-invoker.js", () => ({ invokeTool: vi.fn() }));

import handler from "../../api/tools/[name].js";
import { invokeTool } from "../../src/lib/tool-invoker.js";

function makeRequest(method = "POST", name = "get_full_law"): VercelRequest {
  return { method, query: { name }, body: { law_name: "建築基準法" } } as VercelRequest;
}

function makeResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    setHeader: vi.fn(),
    end: vi.fn(),
  };
}

describe("REST tool handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { error: new Error("boom with /internal/path"), status: 500,
      text: "エラー: 内部エラーが発生しました。時間をおいて再度お試しください。" },
    { error: new McpError(ErrorCode.InvalidParams, "boom with /internal/path"), status: 400,
      text: "エラー: 入力パラメータが不正です。OpenAPI スキーマ（/api/openapi.json）を確認してください。" },
  ])("sanitizes thrown errors with HTTP $status", async ({ error, status, text }) => {
    vi.mocked(invokeTool).mockRejectedValue(error);
    const res = makeResponse();
    await handler(makeRequest(), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ content: [{ type: "text", text }], isError: true });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("boom");
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("/internal/path");
  });

  it("returns 404 for a thrown MethodNotFound error", async () => {
    vi.mocked(invokeTool).mockRejectedValue(new McpError(ErrorCode.MethodNotFound, "boom with /internal/path"));
    const res = makeResponse();
    await handler(makeRequest("POST", "unknown_tool"), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Tool 'unknown_tool' is not available via REST API" });
  });

  it("passes successful results through with HTTP 200 and CORS headers", async () => {
    const result = { content: [{ type: "text", text: "法令本文" }] };
    vi.mocked(invokeTool).mockResolvedValue(result);
    const res = makeResponse();
    await handler(makeRequest(), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(result);
    expect(invokeTool).toHaveBeenCalledWith("get_full_law", { law_name: "建築基準法" });
    expect(res.setHeader.mock.calls).toEqual([
      ["Access-Control-Allow-Origin", "*"],
      ["Access-Control-Allow-Methods", "GET, POST, OPTIONS"],
      ["Access-Control-Allow-Headers", "Content-Type"],
    ]);
  });

  it("preserves the OPTIONS response without invoking a tool", async () => {
    const res = makeResponse();
    await handler(makeRequest("OPTIONS"), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.end).toHaveBeenCalledOnce();
    expect(invokeTool).not.toHaveBeenCalled();
  });
});
