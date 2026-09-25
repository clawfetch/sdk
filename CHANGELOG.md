# Changelog

All notable changes to `@clawfetch/sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2026-09-18

### Fixed
- `domainsCheck()` now reads the API's `results` array. Previously it returned no domains after a paid call.
- `domainsSuggest()` now reads the API's `allResults` array, sends `maxCheck`, and normalizes TLDs (`.AI` becomes `ai`). The result adds `generated` and `checked` counts.
- Domain availability may be `null` with an `error` when WHOIS is inconclusive.

## [0.2.1] - 2026-08-06

### Changed
- Documented prices updated to match the live API: `/render` $0.005, `/extract` $0.008, `/parse` $0.005, `/research` $0.02, `/domains/*` $0.003. `/fetch` and `/extractors` unchanged at $0.001.

## [0.2.0] - 2026-08-05

### Added
- `parse(source, opts?)` — parse office documents (docx, pptx, xlsx, pdf, odt, ods, odp, rtf, epub, csv, doc, ppt) into GitHub-Flavored Markdown via the new `POST /parse` endpoint ($0.002). Accepts a document URL, `Uint8Array`/`ArrayBuffer` bytes, or a base64 string; optional `filename`/`format` hints. No OCR — scanned/image-only PDFs return HTTP 422.
- `ParseResult` type export (`markdown`, `format`, `chars`, `filename?`)
- Wire-contract test coverage for both `/parse` call shapes (url and base64)

### Fixed
- `research()` now sends `query`/`maxResults` on the wire (server rejected the previous `topic`/`sources` params with HTTP 400 after payment)
- `domainsSuggest()` now sends `keywords` as an array as the server requires; accepts a convenience string and normalizes it
- `extract()` accepts an optional `type` extractor override

## [0.1.0] - 2026-03-29

### Added
- Initial release of the ClawFetch TypeScript SDK
- **7 API endpoints**: `fetch`, `render`, `extract`, `research`, `checkDomains`, `suggestDomains`, `extractors`
- Automatic x402 micropayments via USDC on Base — no API keys needed
- Full typed error hierarchy: `ClawFetchError` → `PaymentError`, `NetworkError`, `RateLimitError`, `ApiError`
- Configurable exponential backoff retry with jitter (429, 5xx, network errors)
- Configurable request timeout (default 30s)
- Debug logging mode
- OpenAPI 3.1 specification for the ClawFetch API (YAML + JSON)
- 34 vitest unit tests covering all endpoints, error handling, and retry behavior
- TypeScript type exports for all request/response types
- ESM + CJS dual output via tsup

### Fixed
- Corrected `package.json` export paths to match actual tsup output structure (`dist/index.{mjs,js,d.ts,d.cts}`)
