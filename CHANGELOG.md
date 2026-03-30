# Changelog

All notable changes to `@clawfetch/sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
