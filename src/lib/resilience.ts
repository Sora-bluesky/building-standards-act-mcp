import { EgovApiError } from "./errors.js";

// --- Retry ---

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  multiplier: number;
  jitter: number; // 0.0 - 1.0 (fraction of delay to randomize)
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  multiplier: 2,
  jitter: 0.25,
};

/** HTTP status codes that should trigger a retry. */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function isRetryableError(error: unknown): boolean {
  if (error instanceof EgovApiError && error.statusCode !== undefined) {
    return RETRYABLE_STATUS_CODES.has(error.statusCode);
  }
  // Network errors (no status code) are retryable
  if (error instanceof EgovApiError && error.statusCode === undefined) {
    return true;
  }
  return false;
}

function calculateDelay(attempt: number, options: RetryOptions): number {
  const baseDelay = options.initialDelayMs * options.multiplier ** attempt;
  const jitterRange = baseDelay * options.jitter;
  const jitter = (Math.random() * 2 - 1) * jitterRange;
  return Math.max(0, baseDelay + jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with exponential backoff retry.
 * Only retries on retryable errors (5xx, 429, network errors).
 * Client errors (4xx except 429) fail immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= opts.maxRetries || !isRetryableError(error)) {
        throw error;
      }

      const delay = calculateDelay(attempt, opts);
      await sleep(delay);
    }
  }

  throw lastError;
}

// --- Circuit Breaker ---

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
}

const DEFAULT_CB_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
};

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = { ...DEFAULT_CB_OPTIONS, ...options };
  }

  getState(): CircuitState {
    if (this.state === "open") {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.options.resetTimeoutMs) {
        this.state = "half-open";
      }
    }
    return this.state;
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws immediately if circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === "open") {
      throw new EgovApiError(
        "サーキットブレーカーが作動中です。e-Gov API への接続を一時停止しています。",
        undefined,
        undefined,
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = "closed";
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = "open";
    }
  }

  /** Reset circuit breaker state (for testing). */
  reset(): void {
    this.state = "closed";
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}
