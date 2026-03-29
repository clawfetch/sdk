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

## Pricing

| Endpoint | Price |
|----------|-------|
| `/fetch` | $0.001 |
| `/render` | $0.002 |
| `/extract` | $0.003 |
| `/research` | $0.01 |
| `/domains/check` | $0.002 |
| `/domains/suggest` | $0.002 |
| `/extractors` | $0.001 |

## Supported Extractors

CoinGecko, GitHub, SEC EDGAR, Hacker News, Reddit, Twitter/X, Product Hunt, Crunchbase, npm, PyPI, Wikipedia, arXiv, Weather, News (AP/Reuters/BBC), YouTube, and more.

## Requirements

- Node.js 18+
- A wallet with USDC on Base (even $1 gives you 1,000+ requests)

## License

MIT
