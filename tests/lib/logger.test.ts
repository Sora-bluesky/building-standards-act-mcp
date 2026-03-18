import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../../src/lib/logger.js";

describe("logger", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    delete process.env.BUILDING_LAW_LOG_LEVEL;
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    delete process.env.BUILDING_LAW_LOG_LEVEL;
  });

  it("outputs JSON to stderr", () => {
    logger.info("test message");

    expect(stderrSpy).toHaveBeenCalledOnce();
    const output = stderrSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output.trimEnd());
    expect(parsed.level).toBe("info");
    expect(parsed.msg).toBe("test message");
    expect(parsed.ts).toBeDefined();
  });

  it("includes data when provided", () => {
    logger.info("with data", { key: "value" });

    const output = stderrSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output.trimEnd());
    expect(parsed.data).toEqual({ key: "value" });
  });

  it("omits data field when not provided", () => {
    logger.warn("no data");

    const output = stderrSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output.trimEnd());
    expect(parsed.data).toBeUndefined();
  });

  it("filters messages below configured log level", () => {
    process.env.BUILDING_LAW_LOG_LEVEL = "warn";

    logger.debug("should not appear");
    logger.info("should not appear");
    logger.warn("should appear");
    logger.error("should appear");

    expect(stderrSpy).toHaveBeenCalledTimes(2);
  });

  it("defaults to info level", () => {
    logger.debug("should not appear");
    logger.info("should appear");

    expect(stderrSpy).toHaveBeenCalledOnce();
  });

  it("supports debug level when configured", () => {
    process.env.BUILDING_LAW_LOG_LEVEL = "debug";

    logger.debug("should appear");

    expect(stderrSpy).toHaveBeenCalledOnce();
  });
});
