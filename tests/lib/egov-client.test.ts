import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchLaws, getLawData } from "../../src/lib/egov-client.js";
import { EgovApiError } from "../../src/lib/errors.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function createMockResponse(body: unknown, status = 200, statusText = "OK") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
  };
}

describe("egov-client", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("searchLaws", () => {
    it("returns parsed JSON response for a title search", async () => {
      const mockResponse = {
        laws: [
          {
            law_info: {
              law_id: "325AC0000000201",
              law_num: "昭和二十五年法律第二百一号",
              law_title: "建築基準法",
            },
          },
        ],
        total_count: 1,
        count: 1,
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await searchLaws("建築基準法_test_happy");

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "laws?law_title=" + encodeURIComponent("建築基準法_test_happy"),
        ),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
          headers: { Accept: "application/json" },
        }),
      );
    });

    it("returns cached result on second call with same title", async () => {
      const mockResponse = {
        laws: [
          {
            law_info: {
              law_id: "325AC0000000201",
              law_num: "昭和二十五年法律第二百一号",
              law_title: "建築基準法",
            },
          },
        ],
        total_count: 1,
        count: 1,
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const first = await searchLaws("建築基準法_cache_test");
      const second = await searchLaws("建築基準法_cache_test");

      expect(first).toEqual(mockResponse);
      expect(second).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("caches different titles separately", async () => {
      const responseA = {
        laws: [
          {
            law_info: {
              law_id: "AAA",
              law_num: "A号",
              law_title: "法律A",
            },
          },
        ],
        total_count: 1,
        count: 1,
      };
      const responseB = {
        laws: [
          {
            law_info: {
              law_id: "BBB",
              law_num: "B号",
              law_title: "法律B",
            },
          },
        ],
        total_count: 1,
        count: 1,
      };

      mockFetch
        .mockResolvedValueOnce(createMockResponse(responseA))
        .mockResolvedValueOnce(createMockResponse(responseB));

      const resultA = await searchLaws("法律A_separate_cache");
      const resultB = await searchLaws("法律B_separate_cache");

      expect(resultA).toEqual(responseA);
      expect(resultB).toEqual(responseB);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("getLawData", () => {
    it("returns parsed JSON response for a law ID", async () => {
      const mockResponse = {
        law_full_text: { tag: "Law", children: [] },
        law_info: { law_id: "HAPPY_PATH_ID" },
        attached_files_info: null,
        revision_info: {},
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await getLawData("HAPPY_PATH_ID");

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("law_data/HAPPY_PATH_ID"),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
          headers: { Accept: "application/json" },
        }),
      );
    });

    it("returns cached result on second call with same law ID", async () => {
      const mockResponse = {
        law_full_text: { tag: "Law", children: [] },
        law_info: { law_id: "CACHE_TEST_ID" },
        attached_files_info: null,
        revision_info: {},
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const first = await getLawData("CACHE_TEST_ID");
      const second = await getLawData("CACHE_TEST_ID");

      expect(first).toEqual(mockResponse);
      expect(second).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  describe("fetchJson error handling", () => {
    it("throws EgovApiError with statusCode on HTTP 404", async () => {
      mockFetch.mockResolvedValue(createMockResponse(null, 404, "Not Found"));

      await expect(searchLaws("not_found_404_test")).rejects.toThrow(
        EgovApiError,
      );
      await expect(searchLaws("not_found_404_test_2")).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("throws EgovApiError with statusCode on HTTP 500", async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse(null, 500, "Internal Server Error"),
      );

      await expect(searchLaws("server_error_500_test")).rejects.toThrow(
        EgovApiError,
      );
    });

    it("throws EgovApiError with timed out message on AbortError", async () => {
      const abortError = new DOMException(
        "The operation was aborted",
        "AbortError",
      );
      mockFetch.mockRejectedValue(abortError);

      await expect(searchLaws("timeout_test")).rejects.toThrow(EgovApiError);
      await expect(searchLaws("timeout_test_2")).rejects.toThrow("timed out");
    });

    it("throws EgovApiError on network error", async () => {
      mockFetch.mockRejectedValue(new TypeError("fetch failed"));

      await expect(searchLaws("network_error_test")).rejects.toThrow(
        EgovApiError,
      );
      await expect(searchLaws("network_error_test_2")).rejects.toThrow(
        "fetch failed",
      );
    });
  });
});
