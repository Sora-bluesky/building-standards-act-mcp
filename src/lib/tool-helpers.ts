/**
 * Shared utilities for MCP tool handlers:
 * - Error sanitization (Measure 5: hide internal details from client)
 * - Audit logging (Measure 6: log tool invocations and results)
 */

import { logger } from "./logger.js";
import { recordToolCall } from "./metrics.js";
import {
  LawNotFoundError,
  ArticleNotFoundError,
  KokujiNotFoundError,
} from "./errors.js";
import { EgovApiError } from "./errors.js";

/** MCP CallToolResult shape (minimal interface to avoid SDK dependency). */
interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/** Generic tool handler function signature. */
type ToolHandler<T> = (params: T, extra?: unknown) => Promise<ToolResult>;

/**
 * Classify an error and return a sanitized user-facing message.
 * Known user-friendly errors pass through; unknown errors are replaced
 * with a generic message. Full details are always logged server-side.
 */
export function handleToolError(toolName: string, error: unknown): ToolResult {
  const isError = error instanceof Error;
  const message = isError ? error.message : String(error);
  const stack = isError ? error.stack : undefined;
  const errorType = isError ? error.constructor.name : typeof error;

  // Always log full details server-side
  logger.error("tool_error", {
    tool: toolName,
    errorType,
    message,
    ...(stack ? { stack } : {}),
    ...(error instanceof EgovApiError && error.statusCode !== undefined
      ? { statusCode: error.statusCode }
      : {}),
    ...(error instanceof EgovApiError && error.endpoint !== undefined
      ? { endpoint: error.endpoint }
      : {}),
  });

  // Known user-friendly errors: pass through their message
  if (
    error instanceof LawNotFoundError ||
    error instanceof ArticleNotFoundError ||
    error instanceof KokujiNotFoundError
  ) {
    return {
      content: [{ type: "text", text: `エラー: ${error.message}` }],
      isError: true,
    };
  }

  // EgovApiError: hide status code and endpoint
  if (error instanceof EgovApiError) {
    return {
      content: [
        {
          type: "text",
          text: "エラー: e-Gov APIとの通信中にエラーが発生しました。時間をおいて再度お試しください。",
        },
      ],
      isError: true,
    };
  }

  // Generic Error: hide internal details
  if (isError) {
    return {
      content: [
        {
          type: "text",
          text: "エラー: 内部エラーが発生しました。時間をおいて再度お試しください。",
        },
      ],
      isError: true,
    };
  }

  // Non-Error throw
  return {
    content: [
      { type: "text", text: "エラー: 予期しないエラーが発生しました。" },
    ],
    isError: true,
  };
}

/**
 * Wrap a tool handler with audit logging and error sanitization.
 *
 * - On entry: logs tool invocation with input params
 * - On success: logs result status and duration, records metrics
 * - On thrown error: sanitizes response, logs full details, records metrics
 */
export function wrapToolHandler<T>(
  toolName: string,
  handler: ToolHandler<T>,
): ToolHandler<T> {
  return async (params: T, extra?: unknown): Promise<ToolResult> => {
    const start = Date.now();
    logger.info("tool_call", {
      tool: toolName,
      params: params as Record<string, unknown>,
    });

    try {
      const result = await handler(params, extra);
      const durationMs = Date.now() - start;
      const hasError = result.isError === true;

      logger.info("tool_result", {
        tool: toolName,
        durationMs,
        isError: hasError,
      });
      recordToolCall(toolName, durationMs, !hasError);

      return result;
    } catch (error) {
      const durationMs = Date.now() - start;
      recordToolCall(toolName, durationMs, false);
      return handleToolError(toolName, error);
    }
  };
}
