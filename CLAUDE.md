# building-standards-act-mcp

Japanese building regulations MCP server. Fetches law text from e-Gov API v2 in real-time to prevent AI hallucination in building permit reviews.

## Commands

```bash
npm run build    # TypeScript compile
npm run lint     # tsc --noEmit
npm test         # vitest run
```

## Architecture

- **Tool pattern**: `src/tools/xxx.ts` exports `registerXxxTool(server)`, registered in `src/server.ts` (10 tools)
- **Lib pattern**: Business logic lives in `src/lib/`; tools handle only formatting + error wrapping via `wrapToolHandler`
- **Law resolver**: `src/lib/law-resolver.ts` — abbreviation expansion + e-Gov API search for dynamic `law_id` resolution
- **Alias map**: `src/data/law-aliases.ts` — 112 laws with `title`, `abbrev`, `group`
- **Error handling**: `src/lib/tool-helpers.ts` — centralized error sanitization + audit logging for all tools
- **Test pattern**: `vi.mock()` for egov-client/egov-parser, `mockServer.tool` to capture handlers

## API Constraints

| Endpoint                    | Cache TTL | Note               |
| --------------------------- | --------- | ------------------ |
| `/api/2/laws`               | 30min     | Keyword search     |
| `/api/2/law_data/{id}`      | 24h       | Law text retrieval |
| `/api/2/law_revisions/{id}` | 1h        | Revision history   |

- Rate limit: 200ms between concurrent API calls (5 workers), configurable via `BUILDING_LAW_RATE_LIMIT_MS` / `BUILDING_LAW_CONCURRENCY`
- e-Gov API `repeal_status` returns `"None"` (capital N) — always use case-insensitive comparison
- Anthropic MCP proxy has ~15-25s timeout — batch operations must use `mapWithConcurrency`

## Release Flow

Tag push triggers CI (`.github/workflows/release.yml`) which runs npm publish + GitHub Release automatically.

```
git tag v{version} && git push origin v{version}
```

Do NOT run `npm publish` or `gh release create` manually.

## Package Constraints

- **xlsx package is banned**: Prototype Pollution vulnerability. Use jszip + manual XML parsing instead.
- **Node.js >= 20.0.0**: Node 18 is unsupported (pdfjs-dist DOMMatrix requirement)
- **pdfjs-dist serverless**: On Vercel Node 20/22, DOMMatrix polyfill is required (top of `pdf-extractor.ts`), and `vercel.json` `includeFiles` must bundle the worker (`pdf.worker.mjs`)

## Language

- Code, comments, commit messages: English
- User-facing responses (tool output): Japanese
