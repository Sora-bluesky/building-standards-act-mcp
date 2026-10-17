/**
 * Shared utilities for MCP tool handlers:
 * - Error sanitization (Measure 5: hide internal details from client)
 * - Audit logging (Measure 6: log tool invocations and results)
 */

import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { logger } from "./logger.js";
import { recordToolCall } from "./metrics.js";
import {
  LawNotFoundError,
  ArticleNotFoundError,
  KokujiNotFoundError,
} from "./errors.js";
import { EgovApiError } from "./errors.js";

export const ARTICLE_DEFAULT_MAX_CHARS = 20_000;
export const ARTICLE_MAX_CHARS_LIMIT = 24_000;
export const TEXT_DEFAULT_MAX_CHARS = 30_000;
export const TEXT_MAX_CHARS_LIMIT = 48_000;

function paginate(
  text: string,
  offset: number,
  maxChars: number,
  atLineBoundary: boolean,
): {
  text: string;
  total_chars: number;
  offset: number;
  next_offset: number | null;
} {
  const total_chars = text.length;
  if (offset >= total_chars && total_chars > 0) {
    return {
      text: `指定された offset=${offset} は本文の末尾以降です（全体 ${total_chars} 文字）。`,
      total_chars,
      offset,
      next_offset: null,
    };
  }

  const splitsSurrogatePair = (index: number): boolean => {
    const previous = text.charCodeAt(index - 1);
    const current = text.charCodeAt(index);
    return (
      previous >= 0xd800 && previous <= 0xdbff &&
      current >= 0xdc00 && current <= 0xdfff
    );
  };
  if (splitsSurrogatePair(offset)) offset--;
  let end = Math.min(offset + maxChars, total_chars);
  if (splitsSurrogatePair(end)) {
    // A one-unit page must still advance past a complete pair.
    end += end - offset === 1 ? 1 : -1;
  }

  if (atLineBoundary && end < total_chars) {
    const newline = text.lastIndexOf("\n", end - 1);
    if (newline > offset + maxChars / 2) end = newline + 1;
  }

  const next_offset = end < total_chars ? end : null;
  return { text: text.slice(offset, end), total_chars, offset, next_offset };
}

/** Paginate UTF-16 text without cutting a surrogate pair. */
export function paginateText(text: string, offset: number, maxChars: number) {
  const page = paginate(text, offset, maxChars, false);
  const note = page.next_offset === null
    ? ""
    : `\n\n（続きがあります。offset=${page.next_offset} を指定して続きを取得してください。全体 ${page.total_chars} 文字）`;
  return { ...page, text: page.text + note };
}

/** Prefer a line boundary in the second half of the page, without adding a note. */
export function paginateAtLineBoundary(text: string, offset: number, maxChars: number) {
  return paginate(text, offset, maxChars, true);
}

export const TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const satisfies ToolAnnotations;

/** MCP CallToolResult shape (minimal interface to avoid SDK dependency). */
interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
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
