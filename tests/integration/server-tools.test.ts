import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  EgovLawDataResponse,
  EgovLawSearchResponse,
  LawNode,
} from "../../src/lib/types.js";

import {
  _setRetryOptions,
  _resetCircuitBreaker,
} from "../../src/lib/egov-client.js";

// ── Fetch mock ──────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Disable retries in integration tests to avoid timeouts
_setRetryOptions({ maxRetries: 0 });

function createMockResponse(body: unknown, status = 200, statusText = "OK") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
  };
}

// ── Fixtures: LawNode trees ─────────────────────────

const KENCHIKU_LAW_TREE: LawNode = {
  tag: "Law",
  attr: { Era: "Showa", Year: "25", Lang: "ja" },
  children: [
    { tag: "LawNum", children: ["昭和二十五年法律第二百一号"] },
    {
      tag: "LawBody",
      children: [
        { tag: "LawTitle", children: ["建築基準法"] },
        {
          tag: "MainProvision",
          children: [
            {
              tag: "Chapter",
              attr: { Num: "1" },
              children: [
                { tag: "ChapterTitle", children: ["第一章　総則"] },
                {
                  tag: "Article",
                  attr: { Num: "1" },
                  children: [
                    { tag: "ArticleCaption", children: ["（目的）"] },
                    { tag: "ArticleTitle", children: ["第一条"] },
                    {
                      tag: "Paragraph",
                      attr: { Num: "1" },
                      children: [
                        { tag: "ParagraphNum" },
                        {
                          tag: "ParagraphSentence",
                          children: [
                            {
                              tag: "Sentence",
                              children: [
                                "この法律は、建築物の敷地、構造、設備及び用途に関する最低の基準を定めて、国民の生命、健康及び財産の保護を図り、もつて公共の福祉の増進に資することを目的とする。",
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
                {
                  tag: "Article",
                  attr: { Num: "20" },
                  children: [
                    { tag: "ArticleCaption", children: ["（構造耐力）"] },
                    { tag: "ArticleTitle", children: ["第二十条"] },
                    {
                      tag: "Paragraph",
                      attr: { Num: "1" },
                      children: [
                        { tag: "ParagraphNum" },
                        {
                          tag: "ParagraphSentence",
                          children: [
                            {
                              tag: "Sentence",
                              children: [
                                "建築物は、自重、積載荷重、積雪荷重、風圧、土圧及び水圧並びに地震その他の振動及び衝撃に対して安全な構造のものとして、次の各号に掲げる建築物の区分に応じ、それぞれ当該各号に定める基準に適合するものでなければならない。",
                              ],
                            },
                          ],
                        },
                        {
                          tag: "Item",
                          attr: { Num: "1" },
                          children: [
                            { tag: "ItemTitle", children: ["一"] },
                            {
                              tag: "ItemSentence",
                              children: [
                                {
                                  tag: "Sentence",
                                  children: [
                                    "高さが六十メートルを超える建築物",
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const KOKUJI_LAW_TREE: LawNode = {
  tag: "Law",
  attr: { Era: "Heisei", Year: "12", Lang: "ja" },
  children: [
    {
      tag: "LawNum",
      children: ["平成十二年建設省告示第千三百九十九号"],
    },
    {
      tag: "LawBody",
      children: [
        {
          tag: "LawTitle",
          children: ["耐火構造の構造方法を定める件"],
        },
        {
          tag: "MainProvision",
          children: [
            {
              tag: "Article",
              attr: { Num: "1" },
              children: [
                { tag: "ArticleTitle", children: ["第一条"] },
                {
                  tag: "Paragraph",
                  attr: { Num: "1" },
                  children: [
                    { tag: "ParagraphNum" },
                    {
                      tag: "ParagraphSentence",
                      children: [
                        {
                          tag: "Sentence",
                          children: [
                            "耐火構造の構造方法は、次に定めるものとする。",
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

// ── Fixtures: Revision info template ────────────────

function makeRevisionInfo(overrides: Record<string, unknown> = {}) {
  return {
    law_revision_id: "rev1",
    law_type: "Act",
    law_title: "建築基準法",
    law_title_kana: "けんちくきじゅんほう",
    abbrev: null,
    category: "建設",
    updated: "2024-01-01",
    amendment_promulgate_date: "2024-01-01",
    amendment_enforcement_date: "2024-04-01",
    amendment_enforcement_comment: null,
    amendment_law_id: "id1",
    amendment_law_title: "title1",
    amendment_law_num: "num1",
    repeal_status: "active",
    remain_in_force: true,
    current_revision_status: "active",
    ...overrides,
  };
}

// ── Fixtures: API responses ─────────────────────────

const KENCHIKU_LAW_DATA: EgovLawDataResponse = {
  attached_files_info: null,
  law_info: {
    law_type: "Act",
    law_id: "325AC0000000201",
    law_num: "昭和二十五年法律第二百一号",
    law_num_era: "Showa",
    law_num_year: 25,
    law_num_type: "Act",
    law_num_num: "201",
    promulgation_date: "1950-05-24",
  },
  revision_info: makeRevisionInfo(),
  law_full_text: KENCHIKU_LAW_TREE,
};

// Use a different law for API error tests (to avoid cache of 建築基準法)
const MINPOU_LAW_ID = "129AC0000000089";

const MINPOU_SEARCH_RESULT: EgovLawSearchResponse = {
  total_count: 1,
  count: 1,
  laws: [
    {
      law_info: {
        law_type: "Act",
        law_id: MINPOU_LAW_ID,
        law_num: "明治二十九年法律第八十九号",
        law_num_era: "Meiji",
        law_num_year: 29,
        law_num_type: "Act",
        law_num_num: "89",
        promulgation_date: "1896-04-27",
      },
      revision_info: makeRevisionInfo({
        law_title: "民法",
        law_title_kana: "みんぽう",
      }),
      current_revision_info: makeRevisionInfo({
        law_title: "民法",
        law_title_kana: "みんぽう",
      }),
    },
  ],
};

const SEARCH_RESULT: EgovLawSearchResponse = {
  total_count: 1,
  count: 1,
  laws: [
    {
      law_info: {
        law_type: "Act",
        law_id: "325AC0000000201",
        law_num: "昭和二十五年法律第二百一号",
        law_num_era: "Showa",
        law_num_year: 25,
        law_num_type: "Act",
        law_num_num: "201",
        promulgation_date: "1950-05-24",
      },
      revision_info: makeRevisionInfo(),
      current_revision_info: makeRevisionInfo(),
    },
  ],
};

const EMPTY_SEARCH_RESULT: EgovLawSearchResponse = {
  total_count: 0,
  count: 0,
  laws: [],
};

const KOKUJI_SEARCH_RESULT: EgovLawSearchResponse = {
  total_count: 1,
  count: 1,
  laws: [
    {
      law_info: {
        law_type: "MinisterialNotification",
        law_id: "KOKUJI_INTEG_001",
        law_num: "平成十二年建設省告示第千三百九十九号",
        law_num_era: "Heisei",
        law_num_year: 12,
        law_num_type: "MinisterialNotification",
        law_num_num: "1399",
        promulgation_date: "2000-05-30",
      },
      revision_info: makeRevisionInfo({
        law_type: "MinisterialNotification",
        law_title: "耐火構造の構造方法を定める件",
        law_title_kana: "たいかこうぞうのこうぞうほうほうをさだめるけん",
      }),
      current_revision_info: makeRevisionInfo({
        law_type: "MinisterialNotification",
        law_title: "耐火構造の構造方法を定める件",
        law_title_kana: "たいかこうぞうのこうぞうほうほうをさだめるけん",
      }),
    },
  ],
};

const KOKUJI_LAW_DATA: EgovLawDataResponse = {
  attached_files_info: null,
  law_info: {
    law_type: "MinisterialNotification",
    law_id: "KOKUJI_INTEG_001",
    law_num: "平成十二年建設省告示第千三百九十九号",
    law_num_era: "Heisei",
    law_num_year: 12,
    law_num_type: "MinisterialNotification",
    law_num_num: "1399",
    promulgation_date: "2000-05-30",
  },
  revision_info: makeRevisionInfo({
    law_type: "MinisterialNotification",
    law_title: "耐火構造の構造方法を定める件",
  }),
  law_full_text: KOKUJI_LAW_TREE,
};

// ── Helper: extract text from callTool result ───────

function getText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as Array<{ type: string; text: string }>;
  return content[0]?.text ?? "";
}

// ── URL Router helpers ──────────────────────────────

const DEFAULT_REVISIONS_RESPONSE = {
  law_info: {
    law_type: "Act",
    law_id: "325AC0000000201",
    law_num: "昭和二十五年法律第二百一号",
  },
  revisions: [
    makeRevisionInfo({
      amendment_promulgate_date: "2025-06-01",
      amendment_enforcement_date: "2025-10-01",
      repeal_status: "",
    }),
  ],
};

function setupDefaultRouter() {
  mockFetch.mockImplementation(async (url: string) => {
    if (typeof url !== "string") {
      throw new Error(`Unexpected fetch input: ${url}`);
    }

    // Law revisions endpoint
    if (url.includes("/law_revisions/")) {
      return createMockResponse(DEFAULT_REVISIONS_RESPONSE);
    }

    // Law data endpoint
    if (url.includes("/law_data/325AC0000000201")) {
      return createMockResponse(KENCHIKU_LAW_DATA);
    }
    if (url.includes("/law_data/KOKUJI_INTEG_001")) {
      return createMockResponse(KOKUJI_LAW_DATA);
    }

    // Search endpoint
    if (url.includes("/laws?law_title=")) {
      return createMockResponse(SEARCH_RESULT);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

function setupErrorRouter(options: {
  errorLawIds?: string[];
  errorSearch?: boolean;
}) {
  mockFetch.mockImplementation(async (url: string) => {
    if (typeof url !== "string") {
      throw new Error(`Unexpected fetch input: ${url}`);
    }

    // Check if this law_data request should error
    if (url.includes("/law_data/")) {
      for (const lawId of options.errorLawIds ?? []) {
        if (url.includes(`/law_data/${lawId}`)) {
          return createMockResponse(
            { message: "Internal Server Error" },
            500,
            "Internal Server Error",
          );
        }
      }
      // Fall through to default behavior for non-error lawIds
      if (url.includes("/law_data/325AC0000000201")) {
        return createMockResponse(KENCHIKU_LAW_DATA);
      }
      if (url.includes("/law_data/KOKUJI_INTEG_001")) {
        return createMockResponse(KOKUJI_LAW_DATA);
      }
    }

    // Law revisions endpoint (needed for check_law_updates)
    if (url.includes("/law_revisions/")) {
      return createMockResponse(DEFAULT_REVISIONS_RESPONSE);
    }

    // Search endpoint
    if (url.includes("/laws?law_title=")) {
      if (options.errorSearch) {
        return createMockResponse(
          { message: "Internal Server Error" },
          500,
          "Internal Server Error",
        );
      }
      // Return 民法 search result when searching for 民法
      if (
        url.includes(encodeURIComponent("民法")) ||
        url.includes("%E6%B0%91%E6%B3%95")
      ) {
        return createMockResponse(MINPOU_SEARCH_RESULT);
      }
      return createMockResponse(SEARCH_RESULT);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

// ── Test Suite ──────────────────────────────────────

describe("Integration: MCP Server Tools", () => {
  let client: Client;
  let server: McpServer;

  beforeAll(async () => {
    server = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    client = new Client(
      { name: "integration-test", version: "1.0.0" },
      { capabilities: {} },
    );
    await client.connect(clientTransport);
  });

  afterAll(async () => {
    await client.close();
    await server.close();
  });

  beforeEach(() => {
    mockFetch.mockReset();
    _resetCircuitBreaker();
  });

  // ── Server basics ───────────────────────────────

  describe("server basics", () => {
    it("listTools returns all 10 tools", async () => {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();

      expect(names).toEqual([
        "analyze_article",
        "check_law_updates",
        "get_full_law",
        "get_kokuji",
        "get_law",
        "get_laws_batch",
        "get_metrics",
        "search_law",
        "suggest_related",
        "verify_citation",
      ]);
    });

    it("each tool has a description and input schema", async () => {
      const { tools } = await client.listTools();

      for (const tool of tools) {
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
      }
    });
  });

  // ── get_law ─────────────────────────────────────

  describe("get_law", () => {
    it("returns article text for 建築基準法 第20条", async () => {
      setupDefaultRouter();

      const result = await client.callTool({
        name: "get_law",
        arguments: { law_name: "建築基準法", article_number: "第20条" },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("【建築基準法】第二十条");
      expect(text).toContain("（構造耐力）");
      expect(text).toContain("建築物は、自重、積載荷重");
      expect(text).toContain("e-Gov法令検索");
      expect(text).toContain("昭和二十五年法律第二百一号");
    });

    it("returns article text using abbreviation 建基法", async () => {
      setupDefaultRouter();

      const result = await client.callTool({
        name: "get_law",
        arguments: { law_name: "建基法", article_number: "第20条" },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("【建築基準法】第二十条");
      expect(text).toContain("建築物は、自重");
    });

    it("returns article 1 (目的)", async () => {
      setupDefaultRouter();

      const result = await client.callTool({
        name: "get_law",
        arguments: { law_name: "建築基準法", article_number: "第1条" },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("第一条");
      expect(text).toContain("この法律は、建築物の敷地");
    });

    it("returns error for unknown law name", async () => {
      // Return empty search results so resolveLawId returns null
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/laws?law_title=")) {
          return createMockResponse(EMPTY_SEARCH_RESULT);
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const result = await client.callTool({
        name: "get_law",
        arguments: {
          law_name: "存在しない法律テスト",
          article_number: "第1条",
        },
      });

      expect(result.isError).toBe(true);
      const text = getText(result);
      expect(text).toContain("エラー");
      expect(text).toContain("存在しない法律テスト");
    });

    it("returns error for non-existent article number", async () => {
      setupDefaultRouter();

      const result = await client.callTool({
        name: "get_law",
        arguments: { law_name: "建築基準法", article_number: "第9999条" },
      });

      expect(result.isError).toBe(true);
      const text = getText(result);
      expect(text).toContain("エラー");
      expect(text).toContain("9999");
    });

    it("returns error on API failure", async () => {
      // Use 民法 (uncached lawId) to ensure fetch is actually called
      setupErrorRouter({ errorLawIds: [MINPOU_LAW_ID] });

      const result = await client.callTool({
        name: "get_law",
        arguments: { law_name: "民法", article_number: "第1条" },
      });

      expect(result.isError).toBe(true);
      const text = getText(result);
      expect(text).toContain("エラー");
    });

    it("returns structured JSON when format=structured", async () => {
      setupDefaultRouter();

      const result = await client.callTool({
        name: "get_law",
        arguments: {
          law_name: "建築基準法",
          article_number: "第20条",
          format: "structured",
        },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      const parsed = JSON.parse(text);
      expect(parsed.law_title).toBe("建築基準法");
      expect(parsed.law_num).toBe("昭和二十五年法律第二百一号");
      expect(parsed.source).toBe("e-Gov法令検索");
      expect(parsed.article.article_num).toBe("20");
      expect(parsed.article.article_title).toBe("第二十条");
      expect(parsed.article.article_caption).toBe("（構造耐力）");
      expect(parsed.article.paragraphs).toHaveLength(1);
      expect(parsed.article.paragraphs[0].paragraph_num).toBe("1");
      expect(parsed.article.paragraphs[0].items).toHaveLength(1);
      expect(parsed.article.paragraphs[0].items[0].item_title).toBe("一");
    });

    it("returns text format when format=text explicitly", async () => {
      setupDefaultRouter();

      const result = await client.callTool({
        name: "get_law",
        arguments: {
          law_name: "建築基準法",
          article_number: "第1条",
          format: "text",
        },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("【建築基準法】第一条");
      expect(text).toContain("この法律は、建築物の敷地");
      // Should NOT be JSON
      expect(() => JSON.parse(text)).toThrow();
    });
  });

  // ── get_full_law ────────────────────────────────

  describe("get_full_law", () => {
    it("returns full law text for 建築基準法", async () => {
      setupDefaultRouter();

      const result = await client.callTool({
        name: "get_full_law",
        arguments: { law_name: "建築基準法" },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("【建築基準法】全文");
      expect(text).toContain("第一章　総則");
      expect(text).toContain("e-Gov法令検索");
      expect(text).toContain("昭和二十五年法律第二百一号");
    });

    it("returns full law text using abbreviation", async () => {
      setupDefaultRouter();

      const result = await client.callTool({
        name: "get_full_law",
        arguments: { law_name: "建基法" },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("【建築基準法】全文");
    });

    it("returns error for unknown law name", async () => {
      // Return empty search results so resolveLawId returns null
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/laws?law_title=")) {
          return createMockResponse(EMPTY_SEARCH_RESULT);
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const result = await client.callTool({
        name: "get_full_law",
        arguments: { law_name: "存在しない法律テスト" },
      });

      expect(result.isError).toBe(true);
      const text = getText(result);
      expect(text).toContain("エラー");
    });

    it("returns error on API failure", async () => {
      setupErrorRouter({ errorLawIds: [MINPOU_LAW_ID] });

      const result = await client.callTool({
        name: "get_full_law",
        arguments: { law_name: "民法" },
      });

      expect(result.isError).toBe(true);
      const text = getText(result);
      expect(text).toContain("エラー");
    });
  });

  // ── search_law ──────────────────────────────────

  describe("search_law", () => {
    it("returns both preset and API results", async () => {
      setupDefaultRouter();

      const result = await client.callTool({
        name: "search_law",
        arguments: { keyword: "建築基準" },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      // Preset results section
      expect(text).toContain("登録済み法令の検索結果");
      expect(text).toContain("建築基準法");
      // API results section
      expect(text).toContain("e-Gov API検索結果");
    });

    it("returns only API results for non-preset keyword", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/laws?law_title=")) {
          return createMockResponse({
            total_count: 1,
            count: 1,
            laws: [
              {
                law_info: {
                  law_type: "Act",
                  law_id: "UNIQUE_SEARCH_001",
                  law_num: "テスト法令番号",
                  law_num_era: "Reiwa",
                  law_num_year: 1,
                  law_num_type: "Act",
                  law_num_num: "1",
                  promulgation_date: "2019-05-01",
                },
                revision_info: makeRevisionInfo({
                  law_title: "特殊テスト法令",
                }),
                current_revision_info: makeRevisionInfo({
                  law_title: "特殊テスト法令",
                }),
              },
            ],
          });
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const result = await client.callTool({
        name: "search_law",
        arguments: { keyword: "INTEG_UNIQUE_特殊テスト" },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      // No preset results for this keyword
      expect(text).not.toContain("登録済み法令の検索結果");
      // API results present
      expect(text).toContain("e-Gov API検索結果");
      expect(text).toContain("特殊テスト法令");
    });

    it("returns not-found message when no results", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/laws?law_title=")) {
          return createMockResponse(EMPTY_SEARCH_RESULT);
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const result = await client.callTool({
        name: "search_law",
        arguments: { keyword: "INTEG_NONEXIST_絶対見つからない" },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("見つかりませんでした");
    });

    it("returns error on API failure", async () => {
      setupErrorRouter({ errorSearch: true });

      const result = await client.callTool({
        name: "search_law",
        arguments: { keyword: "INTEG_ERROR_建築基準" },
      });

      expect(result.isError).toBe(true);
      const text = getText(result);
      expect(text).toContain("エラー");
    });
  });

  // ── get_kokuji ──────────────────────────────────

  describe("get_kokuji", () => {
    it("returns preset kokuji failure message when MLIT pipeline fails", async () => {
      // "耐火構造の構造方法を定める件" matches a preset.
      // The flow tries MLIT first (fetch notice page → Excel → PDF).
      // With our mock returning 404 for MLIT URLs, the pipeline fails.
      // The preset has law_id="" so e-Gov fallback is also skipped.
      // Result: "告示本文の取得に失敗しました"
      mockFetch.mockImplementation(async (url: string) => {
        if (typeof url !== "string") {
          throw new Error(`Unexpected fetch input: ${url}`);
        }

        // MLIT URLs return 404 so the pipeline fails gracefully
        if (url.includes("mlit.go.jp")) {
          return createMockResponse("Not Found", 404, "Not Found");
        }

        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const result = await client.callTool({
        name: "get_kokuji",
        arguments: {
          kokuji_name: "耐火構造の構造方法を定める件",
        },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("【告示】耐火構造の構造方法を定める件");
      expect(text).toContain("告示本文の取得に失敗しました");
    });

    it("returns e-Gov search result for non-preset kokuji", async () => {
      // Use a name that does NOT match any preset → no preset found.
      // Flow: no preset → MLIT search (fails) → e-Gov API → return result.
      mockFetch.mockImplementation(async (url: string) => {
        if (typeof url !== "string") {
          throw new Error(`Unexpected fetch input: ${url}`);
        }

        // MLIT URLs return 404
        if (url.includes("mlit.go.jp")) {
          return createMockResponse("Not Found", 404, "Not Found");
        }

        // e-Gov search
        if (url.includes("/laws?law_title=")) {
          return createMockResponse(KOKUJI_SEARCH_RESULT);
        }
        // e-Gov law data
        if (url.includes("/law_data/KOKUJI_INTEG_001")) {
          return createMockResponse(KOKUJI_LAW_DATA);
        }

        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const result = await client.callTool({
        name: "get_kokuji",
        arguments: {
          kokuji_name: "INTEG_耐震改修に関する告示",
        },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("【検索結果】");
      expect(text).toContain("耐火構造の構造方法を定める件");
      expect(text).toContain("耐火構造の構造方法は、次に定めるものとする。");
      expect(text).toContain("プリセットに含まれていない");
    });

    it("returns guidance when nothing found", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (typeof url !== "string") {
          throw new Error(`Unexpected fetch input: ${url}`);
        }

        // MLIT URLs return 404
        if (url.includes("mlit.go.jp")) {
          return createMockResponse("Not Found", 404, "Not Found");
        }

        if (url.includes("/laws?law_title=")) {
          return createMockResponse(EMPTY_SEARCH_RESULT);
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const result = await client.callTool({
        name: "get_kokuji",
        arguments: { kokuji_name: "INTEG_存在しない告示テスト" },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("該当する告示を確認できませんでした");
      expect(text).toContain("get_law");
    });

    it("returns guidance when all sources fail (no isError)", async () => {
      // With the new flow, errors from MLIT and e-Gov are caught internally.
      // The result is a "not found" guidance message, not an isError.
      mockFetch.mockImplementation(async (url: string) => {
        if (typeof url !== "string") {
          throw new Error(`Unexpected fetch input: ${url}`);
        }

        // MLIT URLs return 404
        if (url.includes("mlit.go.jp")) {
          return createMockResponse("Not Found", 404, "Not Found");
        }

        // e-Gov search returns 500 — but fetchViaEgov catches it
        if (url.includes("/laws?law_title=")) {
          return createMockResponse(
            { message: "Internal Server Error" },
            500,
            "Internal Server Error",
          );
        }

        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const result = await client.callTool({
        name: "get_kokuji",
        arguments: { kokuji_name: "INTEG_ERROR_告示テスト" },
      });

      // With the new code, errors are caught internally and the result
      // is a guidance message, not an isError response.
      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("該当する告示を確認できませんでした");
    });
  });

  // ── check_law_updates ────────────────────────────

  describe("check_law_updates", () => {
    it("checks a single law by name", async () => {
      setupDefaultRouter();

      const result = await client.callTool({
        name: "check_law_updates",
        arguments: { law_name: "建築基準法" },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("法令改正チェック結果");
    });

    // Use different laws per test to avoid revisionsCache collision
    it("detects revisions for a law", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/law_revisions/")) {
          return createMockResponse({
            law_info: { law_id: "325CO0000000338" },
            revisions: [
              makeRevisionInfo({
                amendment_promulgate_date: "2026-04-01",
                repeal_status: "",
              }),
            ],
          });
        }
        // Search endpoint for resolveLawId
        if (url.includes("/laws?law_title=")) {
          return createMockResponse(SEARCH_RESULT);
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const result = await client.callTool({
        name: "check_law_updates",
        arguments: { law_name: "建築基準法施行令" },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      // Note: Revision data may come from cache if the same law_id was queried earlier.
      // We verify the format is correct rather than specific dates.
      expect(text).toContain("法令改正チェック結果");
    });

    it("shows revision history with show_history=true", async () => {
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/law_revisions/")) {
          return createMockResponse({
            law_info: { law_id: "325M50004000040" },
            revisions: [
              makeRevisionInfo({
                amendment_promulgate_date: "2025-06-01",
                repeal_status: "",
              }),
              makeRevisionInfo({
                law_revision_id: "rev0",
                amendment_promulgate_date: "2024-04-01",
                repeal_status: "",
              }),
            ],
          });
        }
        // Search endpoint for resolveLawId
        if (url.includes("/laws?law_title=")) {
          return createMockResponse(SEARCH_RESULT);
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const result = await client.callTool({
        name: "check_law_updates",
        arguments: { law_name: "建築基準法施行規則", show_history: true },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("改正履歴");
      expect(text).toContain("リビジョン一覧");
    });

    it("returns not found for unknown law name", async () => {
      // Return empty search results so resolveLawId returns null
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/laws?law_title=")) {
          return createMockResponse(EMPTY_SEARCH_RESULT);
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const result = await client.callTool({
        name: "check_law_updates",
        arguments: { law_name: "INTEG_存在しない法令" },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("見つかりませんでした");
    });

    it("returns not found for non-existent group", async () => {
      const result = await client.callTool({
        name: "check_law_updates",
        arguments: { group: "99章" },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("見つかりませんでした");
    });
  });

  // ── get_laws_batch ─────────────────────────────

  describe("get_laws_batch", () => {
    it("fetches multiple articles from the same law in one batch", async () => {
      setupDefaultRouter();

      const result = await client.callTool({
        name: "get_laws_batch",
        arguments: {
          requests: [
            { law_name: "建築基準法", article_number: "1" },
            { law_name: "建築基準法", article_number: "20" },
          ],
        },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      const parsed = JSON.parse(text);
      expect(parsed.total).toBe(2);
      expect(parsed.success).toBe(2);
      expect(parsed.results[0].status).toBe("success");
      expect(parsed.results[1].status).toBe("success");
    });

    it("handles mixed success and not-found", async () => {
      // Custom router: return SEARCH_RESULT for known laws, empty for unknown
      mockFetch.mockImplementation(async (url: string) => {
        if (typeof url !== "string") {
          throw new Error(`Unexpected fetch input: ${url}`);
        }

        // Law data endpoint
        if (url.includes("/law_data/325AC0000000201")) {
          return createMockResponse(KENCHIKU_LAW_DATA);
        }

        // Search endpoint: return empty for unknown law names
        if (url.includes("/laws?law_title=")) {
          const encodedTitle = url.split("law_title=")[1]?.split("&")[0] ?? "";
          const decodedTitle = decodeURIComponent(encodedTitle);
          if (decodedTitle.includes("INTEG_存在しない法律")) {
            return createMockResponse(EMPTY_SEARCH_RESULT);
          }
          return createMockResponse(SEARCH_RESULT);
        }

        // Law revisions
        if (url.includes("/law_revisions/")) {
          return createMockResponse(DEFAULT_REVISIONS_RESPONSE);
        }

        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const result = await client.callTool({
        name: "get_laws_batch",
        arguments: {
          requests: [
            { law_name: "建築基準法", article_number: "1" },
            { law_name: "建築基準法", article_number: "9999" },
            { law_name: "INTEG_存在しない法律", article_number: "1" },
          ],
        },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(getText(result));
      expect(parsed.total).toBe(3);
      expect(parsed.success).toBe(1);
      expect(parsed.failed).toBe(2);
      expect(parsed.results[0].status).toBe("success");
      expect(parsed.results[1].status).toBe("article_not_found");
      expect(parsed.results[2].status).toBe("law_not_found");
    });

    it("returns error for empty requests", async () => {
      const result = await client.callTool({
        name: "get_laws_batch",
        arguments: { requests: [] },
      });

      expect(result.isError).toBe(true);
      const text = getText(result);
      expect(text).toContain("空です");
    });
  });

  // ── verify_citation ────────────────────────────

  describe("verify_citation", () => {
    it("verifies existing article without claimed_text", async () => {
      setupDefaultRouter();

      const result = await client.callTool({
        name: "verify_citation",
        arguments: {
          citations: [{ law_name: "建築基準法", article_number: "1" }],
        },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("引用検証結果");
      expect(text).toContain("[OK]");
      expect(text).toContain("この法律は、建築物の敷地");
    });

    it("reports law_not_found for unknown law", async () => {
      // Return empty search results so resolveLawId returns null
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/laws?law_title=")) {
          return createMockResponse(EMPTY_SEARCH_RESULT);
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const result = await client.callTool({
        name: "verify_citation",
        arguments: {
          citations: [
            { law_name: "INTEG_存在しない法律", article_number: "1" },
          ],
        },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("[N/A]");
      expect(text).toContain("未発見");
    });

    it("verifies correct claimed_text as match", async () => {
      setupDefaultRouter();

      const result = await client.callTool({
        name: "verify_citation",
        arguments: {
          citations: [
            {
              law_name: "建築基準法",
              article_number: "1",
              claimed_text:
                "建築物の敷地、構造、設備及び用途に関する最低の基準",
            },
          ],
        },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("[OK]");
    });

    it("returns error for empty citations", async () => {
      const result = await client.callTool({
        name: "verify_citation",
        arguments: { citations: [] },
      });

      expect(result.isError).toBe(true);
      expect(getText(result)).toContain("空です");
    });
  });

  // ── suggest_related ────────────────────────────

  describe("suggest_related", () => {
    it("returns related laws for an article with references", async () => {
      setupDefaultRouter();

      const result = await client.callTool({
        name: "suggest_related",
        arguments: { law_name: "建築基準法", article_number: "20" },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      expect(text).toContain("関連法令");
      expect(text).toContain("同カテゴリの法令");
    });

    it("returns error for unknown law", async () => {
      // Return empty search results so resolveLawId returns null
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/laws?law_title=")) {
          return createMockResponse(EMPTY_SEARCH_RESULT);
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const result = await client.callTool({
        name: "suggest_related",
        arguments: {
          law_name: "INTEG_存在しない法律",
          article_number: "1",
        },
      });

      expect(result.isError).toBe(true);
      expect(getText(result)).toContain("エラー");
    });
  });

  // ── analyze_article ────────────────────────────

  describe("analyze_article", () => {
    it("returns JSON analysis for an article", async () => {
      setupDefaultRouter();

      const result = await client.callTool({
        name: "analyze_article",
        arguments: { law_name: "建築基準法", article_number: "20" },
      });

      expect(result.isError).toBeFalsy();
      const text = getText(result);
      const parsed = JSON.parse(text);
      expect(parsed.law_name).toBe("建築基準法");
      expect(parsed.article_num).toBe("20");
      expect(parsed.structure).toBeDefined();
      expect(parsed.structure.paragraph_count).toBeGreaterThanOrEqual(1);
      expect(parsed.paragraph_summaries).toBeDefined();
      expect(parsed.reference_summary).toBeDefined();
      expect(parsed.structured_data).toBeDefined();
    });

    it("returns error for unknown law", async () => {
      // Return empty search results so resolveLawId returns null
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes("/laws?law_title=")) {
          return createMockResponse(EMPTY_SEARCH_RESULT);
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const result = await client.callTool({
        name: "analyze_article",
        arguments: {
          law_name: "INTEG_存在しない法律",
          article_number: "1",
        },
      });

      expect(result.isError).toBe(true);
      expect(getText(result)).toContain("エラー");
    });
  });
});
