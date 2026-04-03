import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock metrics to verify recordToolCall is called
vi.mock("../../src/lib/metrics.js", () => ({
  recordToolCall: vi.fn(),
}));

import {
  handleToolError,
  wrapToolHandler,
} from "../../src/lib/tool-helpers.js";
import {
  LawNotFoundError,
  ArticleNotFoundError,
  KokujiNotFoundError,
  EgovApiError,
} from "../../src/lib/errors.js";
import { recordToolCall } from "../../src/lib/metrics.js";

describe("handleToolError", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it("passes through LawNotFoundError message", () => {
    const error = new LawNotFoundError("建築基準法");
    const result = handleToolError("get_law", error);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("法令が見つかりません");
    expect(result.content[0].text).toContain("建築基準法");
  });

  it("passes through ArticleNotFoundError message", () => {
    const error = new ArticleNotFoundError("第999条", "建築基準法");
    const result = handleToolError("get_law", error);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("第999条");
    expect(result.content[0].text).toContain("建築基準法");
  });

  it("passes through KokujiNotFoundError message", () => {
    const error = new KokujiNotFoundError("不明な告示");
    const result = handleToolError("get_kokuji", error);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("告示が見つかりません");
    expect(result.content[0].text).toContain("不明な告示");
  });

  it("sanitizes EgovApiError (hides status code and endpoint)", () => {
    const error = new EgovApiError(
      "Request failed with status 500",
      500,
      "/api/2/law_data/123",
    );
    const result = handleToolError("get_law", error);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("e-Gov API");
    expect(result.content[0].text).not.toContain("500");
    expect(result.content[0].text).not.toContain("/api/2/law_data");
  });

  it("sanitizes generic Error (hides internal details)", () => {
    const error = new Error("ECONNREFUSED localhost:3000");
    const result = handleToolError("search_law", error);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("内部エラー");
    expect(result.content[0].text).not.toContain("ECONNREFUSED");
    expect(result.content[0].text).not.toContain("localhost");
  });

  it("sanitizes non-Error throw", () => {
    const result = handleToolError("get_law", "string thrown");

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("予期しないエラー");
    expect(result.content[0].text).not.toContain("string thrown");
  });

  it("logs full error details to stderr", () => {
    const error = new EgovApiError("Server error", 500, "/api/2/laws");
    handleToolError("get_law", error);

    expect(stderrSpy).toHaveBeenCalled();
    const logOutput = stderrSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(logOutput.trimEnd());

    expect(parsed.level).toBe("error");
    expect(parsed.msg).toBe("tool_error");
    expect(parsed.data.tool).toBe("get_law");
    expect(parsed.data.errorType).toBe("EgovApiError");
    expect(parsed.data.statusCode).toBe(500);
    expect(parsed.data.endpoint).toBe("/api/2/laws");
    expect(parsed.data.message).toBe("Server error");
  });
});

describe("wrapToolHandler", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it("returns handler result on success", async () => {
    const inner = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "OK" }],
    });
    const wrapped = wrapToolHandler("test_tool", inner);

    const result = await wrapped({ key: "value" });

    expect(result.content[0].text).toBe("OK");
    expect(result.isError).toBeUndefined();
  });

  it("logs tool_call and tool_result on success", async () => {
    const inner = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "OK" }],
    });
    const wrapped = wrapToolHandler("test_tool", inner);

    await wrapped({ law_name: "建築基準法" });

    // Should have 2 log entries: tool_call + tool_result
    expect(stderrSpy).toHaveBeenCalledTimes(2);

    const callLog = JSON.parse(
      (stderrSpy.mock.calls[0][0] as string).trimEnd(),
    );
    expect(callLog.msg).toBe("tool_call");
    expect(callLog.data.tool).toBe("test_tool");
    expect(callLog.data.params.law_name).toBe("建築基準法");

    const resultLog = JSON.parse(
      (stderrSpy.mock.calls[1][0] as string).trimEnd(),
    );
    expect(resultLog.msg).toBe("tool_result");
    expect(resultLog.data.tool).toBe("test_tool");
    expect(resultLog.data.isError).toBe(false);
    expect(resultLog.data.durationMs).toBeTypeOf("number");
  });

  it("records metrics via recordToolCall on success", async () => {
    const inner = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "OK" }],
    });
    const wrapped = wrapToolHandler("test_tool", inner);

    await wrapped({});

    expect(recordToolCall).toHaveBeenCalledWith(
      "test_tool",
      expect.any(Number),
      true,
    );
  });

  it("sanitizes thrown errors and records failure", async () => {
    const inner = vi.fn().mockRejectedValue(new Error("Internal crash"));
    const wrapped = wrapToolHandler("test_tool", inner);

    const result = await wrapped({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("内部エラー");
    expect(result.content[0].text).not.toContain("Internal crash");

    expect(recordToolCall).toHaveBeenCalledWith(
      "test_tool",
      expect.any(Number),
      false,
    );
  });

  it("passes through known error messages", async () => {
    const inner = vi.fn().mockRejectedValue(new LawNotFoundError("民法"));
    const wrapped = wrapToolHandler("get_law", inner);

    const result = await wrapped({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("民法");
  });

  it("handles business error responses (isError without throw)", async () => {
    const errorText =
      "\u6CD5\u4EE4\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002";
    const inner = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: errorText }],
      isError: true,
    });
    const wrapped = wrapToolHandler("test_tool", inner);

    const result = await wrapped({});

    // Should pass through as-is (not sanitized)
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(errorText);

    // Metrics should record as failure (isError: true)
    expect(recordToolCall).toHaveBeenCalledWith(
      "test_tool",
      expect.any(Number),
      false,
    );
  });

  it("passes params to the inner handler", async () => {
    const inner = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "OK" }],
    });
    const wrapped = wrapToolHandler("test_tool", inner);

    const params = { law_name: "建築基準法", article_number: "第20条" };
    await wrapped(params);

    expect(inner).toHaveBeenCalledWith(params, undefined);
  });
});
