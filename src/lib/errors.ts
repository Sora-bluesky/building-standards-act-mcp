export class EgovApiError extends Error {
  public readonly statusCode: number | undefined;
  public readonly endpoint: string | undefined;

  constructor(message: string, statusCode?: number, endpoint?: string) {
    super(message);
    this.name = "EgovApiError";
    this.statusCode = statusCode;
    this.endpoint = endpoint;
  }
}

export class LawNotFoundError extends Error {
  public readonly lawName: string;

  constructor(lawName: string) {
    super(`法令が見つかりません: ${lawName}`);
    this.name = "LawNotFoundError";
    this.lawName = lawName;
  }
}

export class ArticleNotFoundError extends Error {
  public readonly articleNumber: string;
  public readonly lawName: string;

  constructor(articleNumber: string, lawName: string) {
    super(`${lawName}の${articleNumber}が見つかりません`);
    this.name = "ArticleNotFoundError";
    this.articleNumber = articleNumber;
    this.lawName = lawName;
  }
}

/**
 * Format an article number reference for display.
 * Ensures the output always has the form "第X条" regardless of input format.
 *
 * Examples:
 *   "20"           -> "第20条"
 *   "第20条"       -> "第20条"
 *   "第129条の2の3" -> "第129条の2の3"
 *   "6_2"          -> "第6_2条"
 */
export function formatArticleRef(input: string): string {
  let s = input.trim();
  if (!s.startsWith("第")) s = `第${s}`;
  if (!s.endsWith("条")) s = `${s}条`;
  return s;
}

export class KokujiNotFoundError extends Error {
  public readonly kokujiName: string;

  constructor(kokujiName: string) {
    super(`告示が見つかりません: ${kokujiName}`);
    this.name = "KokujiNotFoundError";
    this.kokujiName = kokujiName;
  }
}
