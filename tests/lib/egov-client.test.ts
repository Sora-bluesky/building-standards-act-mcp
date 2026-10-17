import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  searchLaws,
  getLawData,
  getLawArticle,
  getLawDataByRevision,
  searchKeyword,
  normalizeKeyword,
  getLawRevisions,
  _setRetryOptions,
  _resetCircuitBreaker,
} from "../../src/lib/egov-client.js";
import { EgovApiError } from "../../src/lib/errors.js";
import * as metrics from "../../src/lib/metrics.js";
import { logger } from "../../src/lib/logger.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Disable retries in tests to avoid timeouts
_setRetryOptions({ maxRetries: 0 });

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
    _resetCircuitBreaker();
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

  describe("getLawRevisions", () => {
    it("preserves a 404001 revision error instead of returning an empty list", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ code: "404001" }, 404, "Not Found"));
      await expect(getLawRevisions("REVISIONS_NOT_FOUND")).rejects.toMatchObject({
        statusCode: 404, egovCode: "404001",
      });
    });

    it("returns parsed JSON response for a law ID", async () => {
      const mockResponse = {
        law_info: { law_id: "REVISIONS_HAPPY_PATH" },
        revisions: [
          {
            law_revision_id: "rev1",
            amendment_promulgate_date: "2025-06-01",
            amendment_enforcement_date: "2025-10-01",
          },
        ],
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await getLawRevisions("REVISIONS_HAPPY_PATH");

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("law_revisions/REVISIONS_HAPPY_PATH"),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
          headers: { Accept: "application/json" },
        }),
      );
    });

    it("returns cached result on second call with same law ID", async () => {
      const mockResponse = {
        law_info: { law_id: "REVISIONS_CACHE_TEST" },
        revisions: [],
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const first = await getLawRevisions("REVISIONS_CACHE_TEST");
      const second = await getLawRevisions("REVISIONS_CACHE_TEST");

      expect(first).toEqual(mockResponse);
      expect(second).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  describe("getLawArticle", () => {
    it("encodes the law ID and elm and caches separately by law and article", async () => {
      const response = { law_full_text: { tag: "Article", attr: { Num: "20" } } };
      mockFetch.mockResolvedValue(createMockResponse(response));
      const first = await getLawArticle("ARTICLE/URL", "MainProvision-Article_20");
      expect(await getLawArticle("ARTICLE/URL", "MainProvision-Article_20")).toBe(first);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockFetch.mock.calls[0][0]).toBe("https://laws.e-gov.go.jp/api/2/law_data/ARTICLE%2FURL?elm=MainProvision-Article_20&response_format=json");
      await getLawArticle("ARTICLE/URL", "MainProvision-Article_6_2");
      await getLawArticle("ARTICLE/OTHER", "MainProvision-Article_20");
      await getLawData("ARTICLE/URL");
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it("returns null on 400 without retrying, caching null or opening the breaker", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ code: "400021" }, 400, "Bad Request"));
      for (let i = 0; i < 6; i++) {
        expect(await getLawArticle("ARTICLE/MISSING", "MainProvision-Article_999")).toBeNull();
      }
      expect(mockFetch).toHaveBeenCalledTimes(6);
    });

    it("rethrows a 500 response", async () => {
      mockFetch.mockResolvedValue(createMockResponse(null, 500, "Internal Server Error"));
      await expect(getLawArticle("ARTICLE/ERROR", "MainProvision-Article_20")).rejects.toMatchObject({ statusCode: 500 });
    });
  });

  describe("searchKeyword", () => {
    it.each([
      ["　準耐火構造　　外壁 \t\n", "準耐火構造 外壁"],
      [" 耐火構造　 AND  外壁 ", "耐火構造 AND 外壁"],
      ["　 \t\n", ""],
    ])("normalizes whitespace in %j", (keyword, expected) => {
      expect(normalizeKeyword(keyword)).toBe(expected);
    });

    it("uses the normalized keyword for both the request and cache key", async () => {
      const response = { total_count: 0, sentence_count: 0, next_offset: null, items: [] };
      mockFetch.mockResolvedValue(createMockResponse(response));
      const params = { keyword: "　準耐火構造　　外壁\t ", limit: 10, offset: 0 };

      const first = await searchKeyword(params);
      expect(await searchKeyword({ ...params, keyword: "準耐火構造 外壁" })).toBe(first);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(new URL(mockFetch.mock.calls[0][0]).searchParams.get("keyword")).toBe("準耐火構造 外壁");
    });

    it("caches a 404001 zero-hit result while recording the HTTP 404", async () => {
      const recordApiCall = vi.spyOn(metrics, "recordApiCall");
      const warn = vi.spyOn(logger, "warn");
      mockFetch.mockResolvedValue(createMockResponse({ code: "404001", message: "取得結果が０件です。" }, 404, "Not Found"));
      const params = { keyword: "zero-hit-cache", limit: 10, offset: 0 };

      const first = await searchKeyword(params);
      expect(first).toEqual({ total_count: 0, sentence_count: 0, next_offset: null, items: [] });
      expect(await searchKeyword(params)).toBe(first);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(recordApiCall).toHaveBeenCalledExactlyOnceWith("/keyword", expect.any(Number), 404);
      expect(warn).toHaveBeenCalledWith("api call failed", expect.objectContaining({ endpoint: "/keyword", status: 404 }));
    });

    it.each([
      [404, { code: "404004" }, "404004"],
      [404, null, undefined],
      [404, { code: 404001 }, undefined],
      [400, { code: "400001" }, "400001"],
      [500, { code: "404001" }, undefined],
    ])("rejects HTTP %i with body %j", async (status, body, egovCode) => {
      mockFetch.mockResolvedValue(createMockResponse(body, status));
      await expect(searchKeyword({ keyword: `keyword-error-${status}-${egovCode}-${typeof body?.code}`, limit: 10, offset: 0 })).rejects.toMatchObject({
        statusCode: status, egovCode,
      });
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("keeps the breaker closed after six distinct zero-hit searches", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ code: "404001" }, 404, "Not Found"));
      for (let i = 0; i < 6; i++) {
        await expect(searchKeyword({ keyword: `zero-hit-breaker-${i}`, limit: 10, offset: 0 })).resolves.toEqual({
          total_count: 0, sentence_count: 0, next_offset: null, items: [],
        });
      }
      const response = { total_count: 1, sentence_count: 1, next_offset: null, items: [{ sentences: [{ text: "外壁" }] }] };
      mockFetch.mockResolvedValueOnce(createMockResponse(response));
      await expect(searchKeyword({ keyword: "success-after-zero-hits", limit: 10, offset: 0 })).resolves.toEqual(response);
      expect(mockFetch).toHaveBeenCalledTimes(7);
    });

    it("opens the breaker after five server errors", async () => {
      mockFetch.mockResolvedValue(createMockResponse(null, 500, "Internal Server Error"));
      for (let i = 0; i < 5; i++) {
        await expect(searchKeyword({ keyword: `server-error-breaker-${i}`, limit: 10, offset: 0 })).rejects.toMatchObject({ statusCode: 500 });
      }
      mockFetch.mockResolvedValueOnce(createMockResponse({ total_count: 0, sentence_count: 0, items: [] }));
      await expect(searchKeyword({ keyword: "blocked-after-server-errors", limit: 10, offset: 0 })).rejects.toThrow("サーキットブレーカー");
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it.each([0, 1])("normalizes and caches a missing next_offset with %i hits", async (totalCount) => {
      const response = {
        total_count: totalCount,
        sentence_count: totalCount,
        items: totalCount === 0 ? [] : [{ sentences: [{ text: "三百平方メートル" }] }],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(response));
      const params = { keyword: `missing-next-offset-${totalCount}`, limit: 8, offset: 0 };

      const result = await searchKeyword(params);
      const cached = await searchKeyword(params);

      expect(result.next_offset).toBe(null);
      expect(result).toEqual({ ...response, next_offset: null });
      expect(cached).toBe(result);
      expect(cached.next_offset).toBe(null);
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it.each([0, 8])("preserves a numeric next_offset of %i", async (nextOffset) => {
      const response = { total_count: 10, sentence_count: 0, next_offset: nextOffset, items: [] };
      mockFetch.mockResolvedValueOnce(createMockResponse(response));

      const result = await searchKeyword({ keyword: `numeric-next-offset-${nextOffset}`, limit: 8, offset: 0 });

      expect(result.next_offset).toBe(nextOffset);
    });

    it("builds the keyword query with law_num and caches by the complete query", async () => {
      const response = { total_count: 0, sentence_count: 0, next_offset: null, items: [] };
      mockFetch.mockResolvedValue(createMockResponse(response));
      const params = { keyword: "耐火構造 AND 壁", lawNum: "昭和二十五年法律第二百一号", limit: 2, offset: 4 };
      expect(await searchKeyword(params)).toEqual(response);
      await searchKeyword(params);
      expect(mockFetch).toHaveBeenCalledOnce();
      const url = new URL(mockFetch.mock.calls[0][0]);
      expect(url.pathname).toBe("/api/2/keyword");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        keyword: params.keyword, law_num: params.lawNum, limit: "2", offset: "4", sentence_text_size: "200", response_format: "json",
      });
      expect(url.searchParams.has("law_title")).toBe(false);
      for (const override of [{ offset: 6 }, { limit: 3 }, { lawNum: undefined }, { keyword: "避難" }, { sentenceTextSize: 100 }]) {
        await searchKeyword({ ...params, ...override });
      }
      expect(mockFetch).toHaveBeenCalledTimes(6);
      const lastUrl = new URL(mockFetch.mock.calls[5][0]);
      expect(lastUrl.searchParams.get("sentence_text_size")).toBe("100");
    });
  });

  it("shares revision data with the full-text cache", async () => {
    const response = { law_full_text: { tag: "Law", children: [] } };
    mockFetch.mockResolvedValueOnce(createMockResponse(response));
    expect(await getLawDataByRevision("REVISION_CACHE_ID")).toEqual(response);
    expect(await getLawData("REVISION_CACHE_ID")).toEqual(response);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  describe("fetchJson error handling", () => {
    it("preserves the e-Gov code on JSON 400 responses", async () => {
      mockFetch.mockResolvedValue(createMockResponse({ code: "400021" }, 400, "Bad Request"));
      await expect(getLawData("JSON_400")).rejects.toMatchObject({ statusCode: 400, egovCode: "400021" });
    });

    it.each([400, 404])("preserves HTTP %i when its body is not JSON", async (status) => {
      mockFetch.mockResolvedValue({ ...createMockResponse(null, status), json: async () => { throw new SyntaxError("not JSON"); } });
      await expect(getLawData(`NON_JSON_${status}`)).rejects.toMatchObject({ statusCode: status, egovCode: undefined });
    });
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
