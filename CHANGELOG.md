# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.0]: https://github.com/Sora-bluesky/building-standards-act-mcp/releases/tag/v0.1.0
[0.2.0]: https://github.com/Sora-bluesky/building-standards-act-mcp/releases/tag/v0.2.0
[0.3.0]: https://github.com/Sora-bluesky/building-standards-act-mcp/releases/tag/v0.3.0
