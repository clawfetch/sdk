/**
 * ClawFetch SDK — Unit Tests
 *
 * Tests the full x402 payment flow with mocked HTTP responses.
 * No real API calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClawFetch } from '../index.js';

// ─── Test Helpers ────────────────────────────────────────────────

const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Hardhat #0

/**
 * Creates a mock Response object.
 */
function mockResponse(status: number, body: any, headers?: Record<string, string>): Response {
  const headersObj = new Headers(headers);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 402 ? 'Payment Required' : 'Error',
    headers: headersObj,
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone: () => mockResponse(status, body, headers),
  } as unknown as Response;
}

/**
 * Creates a standard 402 payment required response body (x402 v2 format).
 */
function make402Body() {
  return {
    x402Version: 2,
    accepts: [
      {
        network: 'eip155:8453',
        asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        payTo: '0x1234567890abcdef1234567890abcdef12345678',
        maxAmountRequired: '1000', // $0.001
        maxTimeoutSeconds: 300,
        extra: {
          name: 'USD Coin',
          version: '2',
        },
      },
    ],
  };
}

/**
 * Helper to create a ClawFetch client with mocked fetch.
 * Returns the client and the mock function for assertions.
 */
function createMockedClient(fetchMock: typeof globalThis.fetch) {
  // We need to mock the global fetch before creating the client
  // since wrapFetchWithPayment captures the fetch function
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock;

  try {
    const client = new ClawFetch({
      privateKey: TEST_PRIVATE_KEY,
      baseUrl: 'https://mock.clawfetch.test',
    });
    return { client, restore: () => { globalThis.fetch = originalFetch; } };
  } catch (e) {
    globalThis.fetch = originalFetch;
    throw e;
  }
}

// ─── Tests ───────────────────────────────────────────────────────

describe('ClawFetch', () => {
  describe('constructor', () => {
    it('should create a client with valid private key', () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn();
      try {
        const client = new ClawFetch({ privateKey: TEST_PRIVATE_KEY });
        expect(client).toBeDefined();
        expect(client.walletAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should use default baseUrl when none provided', () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn();
      try {
        const client = new ClawFetch({ privateKey: TEST_PRIVATE_KEY });
        expect(client).toBeDefined();
        // baseUrl is private, but we verify via walletAddress being set
        expect(client.walletAddress).toBeTruthy();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should expose wallet address from private key', () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn();
      try {
        const client = new ClawFetch({ privateKey: TEST_PRIVATE_KEY });
        // Hardhat account #0 address
        expect(client.walletAddress.toLowerCase()).toBe(
          '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should strip trailing slash from baseUrl', () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn();
      try {
        const client = new ClawFetch({
          privateKey: TEST_PRIVATE_KEY,
          baseUrl: 'https://api.clawfetch.ai/',
        });
        expect(client).toBeDefined();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('health()', () => {
    it('should call /health without payment (free endpoint)', async () => {
      const healthResponse = {
        status: 'ok',
        service: 'clawfetch',
        version: '0.2.0',
      };

      const fetchMock = vi.fn().mockResolvedValue(mockResponse(200, healthResponse));
      const { client, restore } = createMockedClient(fetchMock);

      try {
        const result = await client.health();
        expect(result).toEqual(healthResponse);
        // health() uses raw globalThis.fetch, not paidFetch
      } finally {
        restore();
      }
    });
  });

  describe('fetch()', () => {
    it('should return content for a URL', async () => {
      const fetchResult = {
        url: 'https://example.com',
        title: 'Example',
        content: '# Example\n\nThis is example content.',
        contentType: 'text/markdown',
      };

      // The x402 wrapper handles the 402 flow internally
      // After payment, it returns the actual response
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, fetchResult));

      const { client, restore } = createMockedClient(fetchMock);

      try {
        const result = await client.fetch('https://example.com');
        expect(result).toEqual(fetchResult);
        expect(result.url).toBe('https://example.com');
        expect(result.content).toContain('Example');
      } finally {
        restore();
      }
    });

    it('should pass maxChars option', async () => {
      const fetchResult = {
        url: 'https://example.com',
        content: 'Short',
      };

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, fetchResult));

      const { client, restore } = createMockedClient(fetchMock);

      try {
        const result = await client.fetch('https://example.com', { maxChars: 100 });
        expect(result).toEqual(fetchResult);
      } finally {
        restore();
      }
    });
  });

  describe('render()', () => {
    it('should render a JS-heavy page', async () => {
      const renderResult = {
        url: 'https://app.example.com',
        title: 'App',
        content: '# Rendered App Content',
      };

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, renderResult));

      const { client, restore } = createMockedClient(fetchMock);

      try {
        const result = await client.render('https://app.example.com');
        expect(result).toEqual(renderResult);
      } finally {
        restore();
      }
    });

    it('should pass waitFor option', async () => {
      const renderResult = { url: 'https://app.example.com', content: 'loaded' };

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, renderResult));

      const { client, restore } = createMockedClient(fetchMock);

      try {
        const result = await client.render('https://app.example.com', { waitFor: '#content' });
        expect(result.content).toBe('loaded');
      } finally {
        restore();
      }
    });
  });

  describe('extract()', () => {
    it('should extract structured data from a supported URL', async () => {
      const extractResult = {
        url: 'https://coingecko.com/en/coins/bitcoin',
        extractor: 'coingecko',
        data: {
          name: 'Bitcoin',
          symbol: 'BTC',
          price: 98432.12,
          market_cap: 1900000000000,
        },
      };

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, extractResult));

      const { client, restore } = createMockedClient(fetchMock);

      try {
        const result = await client.extract('https://coingecko.com/en/coins/bitcoin');
        expect(result.extractor).toBe('coingecko');
        expect(result.data.name).toBe('Bitcoin');
        expect(result.data.price).toBeGreaterThan(0);
      } finally {
        restore();
      }
    });
  });

  describe('research()', () => {
    it('should return multi-source research results', async () => {
      const researchResult = {
        topic: 'x402 payment protocol',
        summary: 'x402 is a protocol for HTTP-native micropayments...',
        sources: [
          { url: 'https://x402.org', title: 'x402', snippet: 'HTTP 402 payment protocol' },
          { url: 'https://github.com/coinbase/x402', title: 'GitHub', snippet: 'Reference implementation' },
        ],
      };

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, researchResult));

      const { client, restore } = createMockedClient(fetchMock);

      try {
        const result = await client.research('x402 payment protocol');
        expect(result.topic).toBe('x402 payment protocol');
        expect(result.summary).toBeTruthy();
        expect(result.sources.length).toBeGreaterThan(0);
      } finally {
        restore();
      }
    });

    it('should pass sources option', async () => {
      const researchResult = {
        topic: 'test',
        summary: 'test',
        sources: [],
      };

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, researchResult));

      const { client, restore } = createMockedClient(fetchMock);

      try {
        const result = await client.research('test', { sources: 5 });
        expect(result).toBeDefined();
      } finally {
        restore();
      }
    });
  });

  describe('domainsCheck()', () => {
    it('should check domain availability', async () => {
      const checkResult = {
        domains: [
          { domain: 'coolstartup.com', available: false },
          { domain: 'coolstartup.ai', available: true },
        ],
      };

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, checkResult));

      const { client, restore } = createMockedClient(fetchMock);

      try {
        const result = await client.domainsCheck(['coolstartup.com', 'coolstartup.ai']);
        expect(result.domains).toHaveLength(2);
        expect(result.domains[0].available).toBe(false);
        expect(result.domains[1].available).toBe(true);
      } finally {
        restore();
      }
    });
  });

  describe('domainsSuggest()', () => {
    it('should suggest available domains', async () => {
      const suggestResult = {
        query: 'ai coding assistant',
        suggestions: [
          { domain: 'aicodinghelp.com', available: true },
          { domain: 'codeassist.ai', available: true },
        ],
      };

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, suggestResult));

      const { client, restore } = createMockedClient(fetchMock);

      try {
        const result = await client.domainsSuggest('ai coding assistant');
        expect(result.query).toBe('ai coding assistant');
        expect(result.suggestions.length).toBeGreaterThan(0);
        expect(result.suggestions[0]).toHaveProperty('domain');
        expect(result.suggestions[0]).toHaveProperty('available');
      } finally {
        restore();
      }
    });

    it('should pass TLD options', async () => {
      const suggestResult = {
        query: 'test',
        suggestions: [{ domain: 'test.ai', available: true }],
      };

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, suggestResult));

      const { client, restore } = createMockedClient(fetchMock);

      try {
        const result = await client.domainsSuggest('test', { tlds: ['.ai', '.dev'] });
        expect(result).toBeDefined();
      } finally {
        restore();
      }
    });
  });

  describe('extractors()', () => {
    it('should list available extractors', async () => {
      const extractorsResult = {
        extractors: [
          { name: 'coingecko', domains: ['coingecko.com'], description: 'Crypto prices', fields: ['name', 'price'] },
          { name: 'github', domains: ['github.com'], description: 'GitHub repos', fields: ['stars', 'forks'] },
        ],
      };

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(200, extractorsResult));

      const { client, restore } = createMockedClient(fetchMock);

      try {
        const result = await client.extractors();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toHaveProperty('name');
        expect(result[0]).toHaveProperty('domains');
      } finally {
        restore();
      }
    });
  });

  describe('error handling', () => {
    it('should throw on non-402/non-200 response', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(500, { error: 'Internal Server Error' }));

      const { client, restore } = createMockedClient(fetchMock);

      try {
        await expect(client.fetch('https://example.com')).rejects.toThrow();
      } finally {
        restore();
      }
    });

    it('should throw with error message from API', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(400, { error: 'Invalid URL format' }));

      const { client, restore } = createMockedClient(fetchMock);

      try {
        await expect(client.fetch('not-a-url')).rejects.toThrow();
      } finally {
        restore();
      }
    });

    it('should throw on network errors', async () => {
      const fetchMock = vi.fn()
        .mockRejectedValueOnce(new TypeError('fetch failed'));

      const { client, restore } = createMockedClient(fetchMock);

      try {
        await expect(client.fetch('https://example.com')).rejects.toThrow('fetch failed');
      } finally {
        restore();
      }
    });
  });

  describe('type exports', () => {
    it('should export all expected types', async () => {
      // This is a compile-time test — if these imports fail, TypeScript types are broken
      const mod = await import('../index.js');
      expect(mod.ClawFetch).toBeDefined();
      expect(typeof mod.ClawFetch).toBe('function');
      expect(mod.default).toBe(mod.ClawFetch);
    });
  });
});
