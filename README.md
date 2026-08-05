# @clawfetch/sdk

JavaScript/TypeScript SDK for [ClawFetch](https://api.clawfetch.ai) — Web Intelligence API for AI Agents.

Pay-per-request via [x402](https://x402.org) (gasless USDC on Base). No API keys, no subscriptions.

## Install

```bash
npm install @clawfetch/sdk
```

## Quick Start

```typescript
import { ClawFetch } from '@clawfetch/sdk';

const cf = new ClawFetch({
  privateKey: '0x...',  // Wallet with USDC on Base
});

// Fetch any URL as clean markdown ($0.001)
const page = await cf.fetch('https://example.com');

// Extract structured data ($0.003)
const btc = await cf.extract('https://coingecko.com/en/coins/bitcoin');
console.log(btc.data); // { name, price, market_cap, ... }

// JS-rendered pages ($0.002)
const rendered = await cf.render('https://app.uniswap.org');

// Multi-source research ($0.01)
const report = await cf.research('latest AI agent frameworks');

// Domain availability ($0.002)
const domains = await cf.domainsCheck(['coolstartup.com', 'coolstartup.ai']);

// Domain suggestions ($0.002)
const ideas = await cf.domainsSuggest('ai coding assistant');

// List extractors ($0.001)
const extractors = await cf.extractors();
```

## How It Works

1. SDK makes a request to ClawFetch
2. Server returns `402 Payment Required` with USDC amount
3. SDK auto-signs an EIP-3009 gasless USDC transfer on Base
4. Request is retried with payment header
5. You get structured data back

No gas fees. No API keys. Just USDC on Base.

## Configuration

```typescript
const cf = new ClawFetch({
  // Required
  privateKey: '0x...',           // Ethereum private key (hex, 0x-prefixed)

  // Optional
  baseUrl: 'https://api.clawfetch.ai', // API endpoint (default)
  timeoutMs: 30000,              // Request timeout in ms (default: 30s)
  debug: false,                  // Enable console debug logging

  // Retry configuration (enabled by default)
  retry: {
    maxRetries: 3,               // Max retry attempts (default: 3)
    initialDelayMs: 500,         // Initial backoff delay (default: 500ms)
    maxDelayMs: 10000,           // Maximum backoff delay (default: 10s)
    backoffMultiplier: 2,        // Exponential backoff factor (default: 2)
  },
  // retry: false,               // Disable retries entirely
});
```

## Error Handling

The SDK provides typed errors for precise error handling:

```typescript
import {
  ClawFetch,
  ClawFetchError,    // Base class for all errors
  PaymentError,      // 402 — insufficient USDC, invalid signature
  NetworkError,      // Connection refused, DNS failure, timeout
  RateLimitError,    // 429 — too many requests (includes retryAfterMs)
  ApiError,          // 4xx/5xx server errors
} from '@clawfetch/sdk';

try {
  const result = await cf.fetch('https://example.com');
} catch (err) {
  if (err instanceof PaymentError) {
    console.error('Payment failed:', err.message);
  } else if (err instanceof RateLimitError) {
    console.error(`Rate limited. Retry after ${err.retryAfterMs}ms`);
  } else if (err instanceof NetworkError) {
    console.error('Network issue:', err.message, err.cause);
  } else if (err instanceof ApiError) {
    console.error(`API error ${err.statusCode}:`, err.message);
  }
}
```

All errors include `statusCode`, `endpoint`, and extend `ClawFetchError`.

## Retry Behavior

By default, the SDK retries transient errors with exponential backoff + jitter:

| Error Type | Retried? | Notes |
|------------|----------|-------|
| 429 (Rate Limit) | ✅ | Respects `Retry-After` header |
| 502, 503, 504 | ✅ | Server/gateway errors |
| Network errors | ✅ | Timeouts, connection failures |
| 400, 404 | ❌ | Client errors (not transient) |
| 402 (Payment) | ❌ | Payment errors (not transient) |

## Pricing

| Endpoint | Price |
|----------|-------|
| `/fetch` | $0.001 |
| `/render` | $0.002 |
| `/extract` | $0.003 |
| `/research` | $0.01 |
| `/domains/check` | $0.002 |
| `/domains/suggest` | $0.002 |
| `/parse` | $0.002 |
| `/extractors` | $0.001 |

## Supported Extractors

CoinGecko, GitHub, SEC EDGAR, Hacker News, Reddit, Twitter/X, Product Hunt, Crunchbase, npm, PyPI, Wikipedia, arXiv, Weather, News (AP/Reuters/BBC), YouTube, Amazon, IMDb, Zillow, Redfin.

## Requirements

- Node.js 18+
- A wallet with USDC on Base (even $1 gives you 1,000+ requests)

## License

MIT
