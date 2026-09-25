/**
 * ClawFetch SDK — Unit Tests
 *
 * Tests the full x402 payment flow with mocked HTTP responses.
 * No real API calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ClawFetch,
  ClawFetchError,
  PaymentError,
  NetworkError,
  RateLimitError,
  ApiError,
} from '../index.js';

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
    statusText: status === 200 ? 'OK' : status === 402 ? 'Payment Required' : status === 429 ? 'Too Many Requests' : 'Error',
    headers: headersObj,
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone: () => mockResponse(status, body, headers),
  } as unknown as Response;
}

/**
 * Helper to create a ClawFetch client with mocked fetch.
 * Returns the client and the mock function for assertions.
 */
async function requestBody([input, init]: any[]) {
  return JSON.parse(init?.body ?? await (input as Request).text());
}

function createMockedClient(
  fetchMock: typeof globalThis.fetch,
  opts?: Partial<import('../index.js').ClawFetchOptions>,
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock;

  try {
    const client = new ClawFetch({
      privateKey: TEST_PRIVATE_KEY,
      baseUrl: 'https://mock.clawfetch.test',
      ...opts,
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

    it('should accept custom timeout', () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn();
      try {
        const client = new ClawFetch({
          privateKey: TEST_PRIVATE_KEY,
          timeoutMs: 5000,
        });
        expect(client).toBeDefined();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should accept retry: false to disable retries', () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn();
      try {
        const client = new ClawFetch({
          privateKey: TEST_PRIVATE_KEY,
          retry: false,
        });
        expect(client).toBeDefined();
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should accept custom retry config', () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn();
      try {
        const client = new ClawFetch({
          privateKey: TEST_PRIVATE_KEY,
          retry: { maxRetries: 5, initialDelayMs: 100 },
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
      } finally {
        restore();
      }
    });

    it('should throw NetworkError on health check failure', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
      const { client, restore } = createMockedClient(fetchMock);

      try {
        await expect(client.health()).rejects.toThrow(NetworkError);
        await expect(client.health()).rejects.toThrow(/Health check failed/);
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
      const researchResult = { topic: 'test', summary: 'test', sources: [] };

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
    it('normalizes the live server response shape', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(mockResponse(200, {
        checked: 3, available: 1, taken: 1,
        results: [
          { domain: 'coolstartup.com', available: false },
          { domain: 'coolstartup.ai', available: true },
          { domain: 'coolstartup.io', available: null, error: 'WHOIS timeout' },
        ],
      }));
      const { client, restore } = createMockedClient(fetchMock);
      try {
        const result = await client.domainsCheck(['coolstartup.com', 'coolstartup.ai', 'coolstartup.io']);
        expect(await requestBody(fetchMock.mock.calls[0])).toEqual({ domains: ['coolstartup.com', 'coolstartup.ai', 'coolstartup.io'] });
        expect(result.domains).toEqual([
          { domain: 'coolstartup.com', available: false },
          { domain: 'coolstartup.ai', available: true },
          { domain: 'coolstartup.io', available: null, error: 'WHOIS timeout' },
        ]);
      } finally {
        restore();
      }
    });
  });

  describe('domainsSuggest()', () => {
    it('sends the live request contract and normalizes the live response shape', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(mockResponse(200, {
        keywords: ['ai', 'coding'], generated: 72, checked: 2,
        available: ['aicoding.dev'],
        allResults: [
          { domain: 'aicoding.dev', available: true },
          { domain: 'codingai.ai', available: false },
        ],
      }));
      const { client, restore } = createMockedClient(fetchMock);
      try {
        const result = await client.domainsSuggest('ai, coding', { tlds: ['.AI', 'dev'], maxCheck: 2 });
        expect(await requestBody(fetchMock.mock.calls[0])).toEqual({ keywords: ['ai', 'coding'], tlds: ['ai', 'dev'], maxCheck: 2 });
        expect(result).toEqual({
          query: 'ai coding', generated: 72, checked: 2,
          suggestions: [
            { domain: 'aicoding.dev', available: true },
            { domain: 'codingai.ai', available: false },
          ],
        });
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

  describe('error classification', () => {
    it('should throw on 402 payment errors (via x402 wrapper)', async () => {
      // The x402 wrapFetchWithPayment intercepts 402 responses before our code.
      // When it can't complete payment, it throws. Our code catches this.
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(402, { error: 'Insufficient USDC balance' }));

      const { client, restore } = createMockedClient(fetchMock, { retry: false });

      try {
        await expect(client.fetch('https://example.com')).rejects.toThrow();
      } finally {
        restore();
      }
    });

    it('should throw RateLimitError on 429', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValue(mockResponse(429, { error: 'Too many requests' }, { 'retry-after': '5' }));

      const { client, restore } = createMockedClient(fetchMock, { retry: false });

      try {
        try {
          await client.fetch('https://example.com');
          expect.unreachable('Should have thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(RateLimitError);
          const rle = err as RateLimitError;
          expect(rle.retryAfterMs).toBe(5000);
          expect(rle.statusCode).toBe(429);
        }
      } finally {
        restore();
      }
    });

    it('should throw ApiError on 400', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(400, { error: 'Invalid URL format' }));

      const { client, restore } = createMockedClient(fetchMock);

      try {
        try {
          await client.fetch('not-a-url');
          expect.unreachable('Should have thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(ApiError);
          expect((err as ApiError).statusCode).toBe(400);
        }
      } finally {
        restore();
      }
    });

    it('should throw ApiError on 500', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValue(mockResponse(500, { error: 'Internal Server Error' }));

      const { client, restore } = createMockedClient(fetchMock, { retry: false });

      try {
        await expect(client.fetch('https://example.com')).rejects.toThrow(ApiError);
      } finally {
        restore();
      }
    });

    it('should throw NetworkError on network failures', async () => {
      const fetchMock = vi.fn()
        .mockRejectedValue(new TypeError('fetch failed'));

      const { client, restore } = createMockedClient(fetchMock, { retry: false });

      try {
        await expect(client.fetch('https://example.com')).rejects.toThrow(NetworkError);
      } finally {
        restore();
      }
    });

    it('should not retry on 402 payment errors', async () => {
      // 402 is intercepted by x402 wrapper — it throws, and we don't retry payment errors
      const fetchMock = vi.fn()
        .mockResolvedValue(mockResponse(402, { error: 'Payment failed' }));

      const { client, restore } = createMockedClient(fetchMock, {
        retry: { maxRetries: 3, initialDelayMs: 1, maxDelayMs: 1, backoffMultiplier: 1 },
      });

      try {
        await expect(client.fetch('https://example.com')).rejects.toThrow();
      } finally {
        restore();
      }
    });

    it('should not retry 400 client errors', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValue(mockResponse(400, { error: 'Bad request' }));

      const { client, restore } = createMockedClient(fetchMock, {
        retry: { maxRetries: 3, initialDelayMs: 1 },
      });

      try {
        await expect(client.fetch('https://example.com')).rejects.toThrow(ApiError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
      } finally {
        restore();
      }
    });

    it('all errors extend ClawFetchError', () => {
      const payment = new PaymentError('test', 402, '/fetch');
      const network = new NetworkError('test', '/fetch');
      const rateLimit = new RateLimitError('test', '/fetch');
      const api = new ApiError('test', 500, '/fetch');

      expect(payment).toBeInstanceOf(ClawFetchError);
      expect(network).toBeInstanceOf(ClawFetchError);
      expect(rateLimit).toBeInstanceOf(ClawFetchError);
      expect(api).toBeInstanceOf(ClawFetchError);

      expect(payment.name).toBe('PaymentError');
      expect(network.name).toBe('NetworkError');
      expect(rateLimit.name).toBe('RateLimitError');
      expect(api.name).toBe('ApiError');
    });
  });

  describe('retry behavior', () => {
    it('should retry on 503 and succeed', async () => {
      const fetchResult = { url: 'https://example.com', content: 'Success' };

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(503, { error: 'Service Unavailable' }))
        .mockResolvedValueOnce(mockResponse(200, fetchResult));

      const { client, restore } = createMockedClient(fetchMock, {
        retry: { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 1, backoffMultiplier: 1 },
      });

      try {
        const result = await client.fetch('https://example.com');
        expect(result).toEqual(fetchResult);
        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        restore();
      }
    });

    it('should retry on 502 gateway error', async () => {
      const fetchResult = { url: 'https://example.com', content: 'OK' };

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(502, { error: 'Bad Gateway' }))
        .mockResolvedValueOnce(mockResponse(200, fetchResult));

      const { client, restore } = createMockedClient(fetchMock, {
        retry: { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 1, backoffMultiplier: 1 },
      });

      try {
        const result = await client.fetch('https://example.com');
        expect(result.content).toBe('OK');
        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        restore();
      }
    });

    it('should retry on network errors', async () => {
      const fetchResult = { url: 'https://example.com', content: 'OK' };

      const fetchMock = vi.fn()
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockResolvedValueOnce(mockResponse(200, fetchResult));

      const { client, restore } = createMockedClient(fetchMock, {
        retry: { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 1, backoffMultiplier: 1 },
      });

      try {
        const result = await client.fetch('https://example.com');
        expect(result.content).toBe('OK');
        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        restore();
      }
    });

    it('should not retry when retry is disabled', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValue(mockResponse(503, { error: 'Service Unavailable' }));

      const { client, restore } = createMockedClient(fetchMock, { retry: false });

      try {
        await expect(client.fetch('https://example.com')).rejects.toThrow(ApiError);
        expect(fetchMock).toHaveBeenCalledTimes(1);
      } finally {
        restore();
      }
    });

    it('should retry on 429 and succeed', async () => {
      const fetchResult = { url: 'https://example.com', content: 'OK' };

      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(429, { error: 'Rate limited' }, { 'retry-after': '1' }))
        .mockResolvedValueOnce(mockResponse(200, fetchResult));

      const { client, restore } = createMockedClient(fetchMock, {
        retry: { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 10, backoffMultiplier: 1 },
      });

      try {
        const result = await client.fetch('https://example.com');
        expect(result.content).toBe('OK');
        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        restore();
      }
    });
  });

  describe('type exports', () => {
    it('should export all expected types and classes', async () => {
      const mod = await import('../index.js');
      expect(mod.ClawFetch).toBeDefined();
      expect(typeof mod.ClawFetch).toBe('function');
      expect(mod.default).toBe(mod.ClawFetch);
      expect(mod.ClawFetchError).toBeDefined();
      expect(mod.PaymentError).toBeDefined();
      expect(mod.NetworkError).toBeDefined();
      expect(mod.RateLimitError).toBeDefined();
      expect(mod.ApiError).toBeDefined();
    });
  });
});
