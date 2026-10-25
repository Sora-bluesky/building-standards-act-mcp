import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const { handleRequest } = vi.hoisted(() => ({ handleRequest: vi.fn() }));
vi.mock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => ({
  StreamableHTTPServerTransport: class { handleRequest = handleRequest; },
}));
vi.mock("../../src/server.js", () => ({ createServer: () => ({ connect: vi.fn() }) }));

import handler from "../../api/mcp.js";

function makeResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
    end: vi.fn(),
  };
}

describe("MCP HTTP handler", () => {
  it.each(["GET", "DELETE", "PUT"])("rejects %s with 405 without opening a transport", async (method) => {
    handleRequest.mockClear();
    const res = makeResponse();
    await handler({ method } as VercelRequest, res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.setHeader).toHaveBeenCalledWith("Allow", "POST, OPTIONS");
    expect(res.end).toHaveBeenCalled();
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it("answers OPTIONS with 204", async () => {
    const res = makeResponse();
    await handler({ method: "OPTIONS" } as VercelRequest, res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it("passes POST to the transport", async () => {
    handleRequest.mockClear();
    const res = makeResponse();
    const req = { method: "POST", body: { jsonrpc: "2.0" } } as VercelRequest;
    await handler(req, res as unknown as VercelResponse);
    expect(handleRequest).toHaveBeenCalledWith(req, res, req.body);
    expect(res.status).not.toHaveBeenCalledWith(405);
  });
});
