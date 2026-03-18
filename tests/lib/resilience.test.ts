import { describe, it, expect, vi, beforeEach } from "vitest";
import { withRetry, CircuitBreaker } from "../../src/lib/resilience.js";
import { EgovApiError } from "../../src/lib/errors.js";

// Use real timers with minimal delays for fast tests
const FAST_RETRY = { initialDelayMs: 1, multiplier: 1, jitter: 0 };

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { maxRetries: 3, ...FAST_RETRY });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 500 error and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new EgovApiError("500", 500, "/test"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { maxRetries: 3, ...FAST_RETRY });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new EgovApiError("429", 429, "/test"))
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { maxRetries: 3, ...FAST_RETRY });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 404 (client error)", async () => {
    const fn = vi.fn().mockRejectedValue(new EgovApiError("404", 404, "/test"));

    await expect(
      withRetry(fn, { maxRetries: 3, ...FAST_RETRY }),
    ).rejects.toThrow("404");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 400 (client error)", async () => {
    const fn = vi.fn().mockRejectedValue(new EgovApiError("400", 400, "/test"));

    await expect(
      withRetry(fn, { maxRetries: 3, ...FAST_RETRY }),
    ).rejects.toThrow("400");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on network error (no status code)", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(
        new EgovApiError("network error", undefined, "/test"),
      )
      .mockResolvedValue("ok");

    const result = await withRetry(fn, { maxRetries: 3, ...FAST_RETRY });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws after max retries exceeded", async () => {
    const fn = vi.fn().mockRejectedValue(new EgovApiError("500", 500, "/test"));

    await expect(
      withRetry(fn, { maxRetries: 2, ...FAST_RETRY }),
    ).rejects.toThrow("500");
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("does not retry non-EgovApiError", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("generic error"));

    await expect(
      withRetry(fn, { maxRetries: 3, ...FAST_RETRY }),
    ).rejects.toThrow("generic error");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("CircuitBreaker", () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 100 });
  });

  it("starts in closed state", () => {
    expect(cb.getState()).toBe("closed");
  });

  it("stays closed on success", async () => {
    await cb.execute(async () => "ok");
    expect(cb.getState()).toBe("closed");
  });

  it("opens after failure threshold", async () => {
    const fail = async () => {
      throw new Error("fail");
    };

    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(fail);
      } catch {
        // expected
      }
    }

    expect(cb.getState()).toBe("open");
  });

  it("rejects immediately when open", async () => {
    const fail = async () => {
      throw new Error("fail");
    };

    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(fail);
      } catch {
        // expected
      }
    }

    await expect(cb.execute(async () => "ok")).rejects.toThrow(
      "サーキットブレーカー",
    );
  });

  it("transitions to half-open after timeout", async () => {
    const fail = async () => {
      throw new Error("fail");
    };

    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(fail);
      } catch {
        // expected
      }
    }

    expect(cb.getState()).toBe("open");

    await new Promise((r) => setTimeout(r, 150));

    expect(cb.getState()).toBe("half-open");
  });

  it("closes on success after half-open", async () => {
    const fail = async () => {
      throw new Error("fail");
    };

    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(fail);
      } catch {
        // expected
      }
    }

    await new Promise((r) => setTimeout(r, 150));
    expect(cb.getState()).toBe("half-open");

    await cb.execute(async () => "ok");
    expect(cb.getState()).toBe("closed");
  });

  it("resets failure count on success", async () => {
    const fail = async () => {
      throw new Error("fail");
    };

    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(fail);
      } catch {
        // expected
      }
    }

    await cb.execute(async () => "ok");
    expect(cb.getState()).toBe("closed");

    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(fail);
      } catch {
        // expected
      }
    }

    expect(cb.getState()).toBe("closed");
  });

  it("reset() restores initial state", async () => {
    const fail = async () => {
      throw new Error("fail");
    };

    for (let i = 0; i < 3; i++) {
      try {
        await cb.execute(fail);
      } catch {
        // expected
      }
    }

    expect(cb.getState()).toBe("open");
    cb.reset();
    expect(cb.getState()).toBe("closed");
  });
});
