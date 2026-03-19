# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-03-19

### Fixed

- **get_kokuji: MLIT PDF pipeline fully restored** — Excel cell parser regex failed to capture `t="s"` attribute, causing all shared strings (titles, PDF URLs) to be returned as numeric indices instead of resolved text. Two-phase attribute parsing eliminates attribute-order dependency.
- **get_kokuji: Excel column alignment** — Self-closing cells (`<c r="G4" s="9"/>`) were ignored, causing column misalignment. Parser now uses `r` attribute for position-based column placement.
- **Article number parsing for branched articles** — `normalizeArticleNumber` failed for "第129条の2の3" and "第6条の3" formats because `条$` only stripped trailing 条. Changed to `条(の|$)` to handle mid-string 条.
- **Error message duplication** — "第第129条の2の3条" fixed via `formatArticleRef()` helper that normalizes display formatting across 6 files.

### Added

- **Markdown table rendering in law text** — e-Gov API XML `<Table>` elements are now converted to Markdown tables instead of `[表]` placeholder. Handles `colspan` (up to 11) and `rowspan` (up to 14).
- **AppdxTable (別表) rendering** — `parseFullLaw()` now processes appended tables (別表第一 etc.) in law bodies.
- **Table rendering in nested structures** — Tables inside Paragraph, Item, and Subitem nodes are now rendered.
- Tests expanded: 373 → 379 across 29 test files

## [1.0.1] - 2026-03-18

### Added

- UA value related presets: 建築物エネルギー消費性能基準等を定める省令
- 2 kokuji presets: UA値算出方法告示, 断熱等性能等級告示
- Law presets: 115 → 116, kokuji presets: 7 → 9

## [1.0.0] - 2026-03-18

### Added

- Official v1.0.0 release: all 5 phases / 19 tasks complete
- stdio + HTTP dual transport stable operation confirmed

## [0.5.0] - 2026-03-18

### Added

- Vercel deploy support: MCP-over-HTTP + REST API + OpenAPI 3.1 spec
- `/api/mcp` endpoint: Streamable HTTP transport (stateless) for Claude.ai / Gemini CLI
- `/api/tools/[name]` endpoint: REST API with dynamic routing for ChatGPT custom GPTs
- `/api/openapi.json` endpoint: auto-generated OpenAPI 3.1 spec for GPTs Actions
- `tool-invoker.ts`: Client ↔ InMemoryTransport ↔ McpServer adapter
- `openapi-spec.ts`: OpenAPI spec generator from MCP tool definitions
- `vercel.json`: maxDuration 30s, CORS headers
- `BUILDING_LAW_REQUEST_TIMEOUT` environment variable for configurable API timeout
- Deploy to Vercel button in README
- Setup guides for ChatGPT, Claude.ai, and Gemini CLI
- Hallucination prevention workflow documentation with 4-stage diagram

### Changed

- Tests expanded: 349 → 362 across 29 test files
- `egov-client.ts`: `REQUEST_TIMEOUT` now configurable via environment variable

## [0.4.0] - 2026-03-18

### Added

- `get_metrics` tool: server usage metrics (tool calls, API requests, cache hit rates, uptime)
- Persistent file-based cache (`FileCache`): survives server restarts via `BUILDING_LAW_CACHE=file`
- `ICache<T>` interface: polymorphic cache abstraction with `createCache()` factory
- Structured JSON logger (`logger.ts`): stderr output, configurable via `BUILDING_LAW_LOG_LEVEL`
- Metrics collector (`metrics.ts`): tool/API/cache statistics with `_resetMetrics()` for testing
- Retry with exponential backoff and jitter for e-Gov API calls (`resilience.ts`)
- Circuit breaker pattern: auto-opens after 5 consecutive failures, half-open after 30s

### Changed

- MCP tools expanded: 10 → 11
- Tests expanded: 310 → 349 across 27 test files
- All 7 cache instances migrated from `new TTLCache()` to `createCache()` factory
- `egov-client.ts`: API call logging and metrics instrumentation added
- `index.ts`: startup log added

## [0.3.0] - 2026-03-18

### Added

- `get_laws_batch` tool: batch fetch up to 20 articles in one call
- `verify_citation` tool: verify law citations in AI responses (hallucination detection)
- `suggest_related` tool: auto-extract related laws from article cross-references
- `analyze_article` tool: structural metadata for AI summarization support
- `citation-verifier.ts`: text normalization + LCS-based match scoring
- `related-law-finder.ts`: reference categorization (cross_law, delegation, same_law)
- `article-analyzer.ts`: paragraph/item counting, reference stats, preview generation

### Changed

- MCP tools expanded: 6 → 10
- Tests expanded: 225 → 294 across 23 test files

## [0.2.0] - 2026-03-17

### Added

- `validate_presets` tool: verify preset law_ids exist in e-Gov API
- `check_law_updates` tool: detect law amendments via e-Gov revision history API
- Law preset expansion: 70 → 115 presets across 11 chapters
- Structured article output (`format: "structured"`) with hierarchical JSON
- Cross-reference detection in article text (same_law, cross_law, relative, delegation)
- MLIT kokuji pipeline: dynamic PDF retrieval from national notice database
- Revision tracking: compare amendment dates against preset verified_at
- Node.js 18 dropped; engines now require >=20.0.0

### Changed

- CI updated to Node.js 20/22 only (macOS + Ubuntu)
- Tests expanded: 107 → 225 across 17 test files

## [0.1.0] - 2026-03-17

### Added

- MCP server for Japanese building regulations (building-standards-act-mcp)
- 4 MCP tools: `get_law`, `get_full_law`, `search_law`, `get_kokuji`
- 70 law presets covering building standards, fire prevention, urban planning, and more
- 7 kokuji (ministerial notice) presets
- Alias support for common abbreviations (e.g., `建基法`, `都計法`)
- In-memory cache with TTL (search: 30 min, law data: 24 hours)
- e-Gov API v2 integration for real-time law text retrieval
- Markdown-formatted law text output via egov-parser
- Cross-platform CI (macOS + Ubuntu, Node.js 18/20/22)
- Automated npm publish and GitHub Release via release.yml
- Unit and integration tests (107 tests, 92.45% coverage)

[1.1.0]: https://github.com/Sora-bluesky/building-standards-act-mcp/releases/tag/v1.1.0
[1.0.1]: https://github.com/Sora-bluesky/building-standards-act-mcp/releases/tag/v1.0.1
[1.0.0]: https://github.com/Sora-bluesky/building-standards-act-mcp/releases/tag/v1.0.0
[0.5.0]: https://github.com/Sora-bluesky/building-standards-act-mcp/releases/tag/v0.5.0
[0.4.0]: https://github.com/Sora-bluesky/building-standards-act-mcp/releases/tag/v0.4.0
[0.3.0]: https://github.com/Sora-bluesky/building-standards-act-mcp/releases/tag/v0.3.0
[0.2.0]: https://github.com/Sora-bluesky/building-standards-act-mcp/releases/tag/v0.2.0
[0.1.0]: https://github.com/Sora-bluesky/building-standards-act-mcp/releases/tag/v0.1.0
