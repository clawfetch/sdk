import { createWalletClient, createPublicClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { x402Client } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { toClientEvmSigner } from '@x402/evm';
import { wrapFetchWithPayment } from '@x402/fetch';

// Re-export for convenience
export { publicActions } from 'viem';

// ─── Error Classes ───────────────────────────────────────────────

/** Base error for all ClawFetch errors */
export class ClawFetchError extends Error {
  public readonly statusCode: number;
  public readonly endpoint: string;

  constructor(message: string, statusCode: number, endpoint: string) {
    super(message);
    this.name = 'ClawFetchError';
    this.statusCode = statusCode;
    this.endpoint = endpoint;
  }
}

/** Payment-related errors (402, insufficient USDC, invalid signature) */
export class PaymentError extends ClawFetchError {
  constructor(message: string, statusCode: number, endpoint: string) {
    super(message, statusCode, endpoint);
    this.name = 'PaymentError';
  }
}

/** Network errors (connection refused, DNS failure, timeout) */
export class NetworkError extends ClawFetchError {
  public readonly cause?: Error;

  constructor(message: string, endpoint: string, cause?: Error) {
    super(message, 0, endpoint);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/** Rate limit errors (429 Too Many Requests) */
export class RateLimitError extends ClawFetchError {
  public readonly retryAfterMs?: number;

  constructor(message: string, endpoint: string, retryAfterMs?: number) {
    super(message, 429, endpoint);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/** API errors (4xx other than 402/429, 5xx) */
export class ApiError extends ClawFetchError {
  constructor(message: string, statusCode: number, endpoint: string) {
    super(message, statusCode, endpoint);
    this.name = 'ApiError';
  }
}

// ─── Types ───────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in ms before first retry (default: 500) */
  initialDelayMs?: number;
  /** Maximum delay in ms between retries (default: 10000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
}

export interface ClawFetchOptions {
  /** Ethereum private key (hex string with 0x prefix) for signing x402 payments */
  privateKey: Hex;
  /** Base URL of the ClawFetch API (default: https://api.clawfetch.ai) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Retry configuration for transient errors */
  retry?: RetryOptions | false;
  /** Chain to use (default: Base mainnet). Pass base or baseSepolia from viem/chains */
  chain?: typeof base;
  /** Network identifier override (default: eip155:8453 for Base mainnet) */
  network?: `${string}:${string}`;
  /** Enable debug logging to console (default: false) */
  debug?: boolean;
}

export interface FetchResult {
  url: string;
  title?: string;
  content: string;
  contentType?: string;
  cached?: boolean;
}

export interface RenderResult {
  url: string;
  title?: string;
  content: string;
  cached?: boolean;
}

export interface ExtractResult {
  url: string;
  extractor: string;
  data: Record<string, any>;
  cached?: boolean;
}

export interface ResearchResult {
  topic: string;
  summary: string;
  sources: Array<{ url: string; title?: string; snippet?: string }>;
  cached?: boolean;
}

export interface DomainCheckResult {
  domains: Array<{
    domain: string;
    available: boolean;
    error?: string;
  }>;
}

export interface DomainSuggestResult {
  query: string;
  suggestions: Array<{
    domain: string;
    available: boolean;
  }>;
}

export interface ExtractorInfo {
  name: string;
  domains: string[];
  description: string;
  fields: string[];
}

// ─── Internal helpers ────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 10_000,
  backoffMultiplier: 2,
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

// ─── Client ──────────────────────────────────────────────────────────

export class ClawFetch {
  private paidFetch: typeof globalThis.fetch;
  private baseUrl: string;
  private timeoutMs: number;
  private retryConfig: Required<RetryOptions> | false;
  private debug: boolean;
  public readonly walletAddress: string;

  constructor(options: ClawFetchOptions) {
    const { privateKey, baseUrl, chain: chainOpt, network, timeoutMs, retry, debug } = options;
    this.baseUrl = (baseUrl || 'https://api.clawfetch.ai').replace(/\/$/, '');
    this.timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.debug = debug ?? false;

    // Retry config: false disables, undefined uses defaults, object merges with defaults
    if (retry === false) {
      this.retryConfig = false;
    } else {
      this.retryConfig = { ...DEFAULT_RETRY, ...retry };
    }

    const chain = chainOpt || base;
    const account = privateKeyToAccount(privateKey);
    this.walletAddress = account.address;

    const publicClient = createPublicClient({ chain, transport: http() });
    const signer = toClientEvmSigner(account, publicClient);
    const evmScheme = new ExactEvmScheme(signer);

    const networkId = network || `eip155:${chain.id}` as `${string}:${string}`;
    const client = new x402Client().register(networkId, evmScheme);
    this.paidFetch = wrapFetchWithPayment(globalThis.fetch.bind(globalThis), client);
  }

  // ─── Core endpoints ─────────────────────────────────────────

  /** Fetch a URL and return clean markdown/text ($0.001) */
  async fetch(url: string, opts?: { maxChars?: number }): Promise<FetchResult> {
    return this.post<FetchResult>('/fetch', { url, ...opts });
  }

  /** Render a JS-heavy page with a stealth browser ($0.002) */
  async render(url: string, opts?: { maxChars?: number; waitFor?: string }): Promise<RenderResult> {
    return this.post<RenderResult>('/render', { url, ...opts });
  }

  /** Extract structured data from a supported URL ($0.003) */
  async extract(url: string): Promise<ExtractResult> {
    return this.post<ExtractResult>('/extract', { url });
  }

  /** Multi-source research on a topic ($0.01) */
  async research(topic: string, opts?: { sources?: number; depth?: string }): Promise<ResearchResult> {
    return this.post<ResearchResult>('/research', { topic, ...opts });
  }

  /** Check domain availability ($0.002) */
  async domainsCheck(domains: string[]): Promise<DomainCheckResult> {
    return this.post<DomainCheckResult>('/domains/check', { domains });
  }

  /** Generate and check domain suggestions ($0.002) */
  async domainsSuggest(query: string, opts?: { tlds?: string[]; count?: number }): Promise<DomainSuggestResult> {
    return this.post<DomainSuggestResult>('/domains/suggest', { query, ...opts });
  }

  /** List available extractors ($0.001) */
  async extractors(): Promise<ExtractorInfo[]> {
    return this.request<ExtractorInfo[]>('GET', '/extractors', undefined, res =>
      (res as { extractors: ExtractorInfo[] }).extractors
    );
  }

  /** Check service health (free — no payment, no retry) */
  async health(): Promise<Record<string, any>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await globalThis.fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });
      return res.json() as Promise<Record<string, any>>;
    } catch (err) {
      throw new NetworkError(
        `Health check failed: ${(err as Error).message}`,
        '/health',
        err as Error,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── Internal ───────────────────────────────────────────────

  private async post<T>(path: string, body: Record<string, any>): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  /**
   * Core request method with timeout, retry, and error classification.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, any>,
    transform?: (raw: any) => T,
  ): Promise<T> {
    const maxAttempts = this.retryConfig ? this.retryConfig.maxRetries + 1 : 1;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.log(`[${attempt}/${maxAttempts}] ${method} ${path}`);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        let res: Response;
        try {
          const fetchOpts: RequestInit = {
            method,
            signal: controller.signal,
            ...(body ? {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            } : {}),
          };

          res = await this.paidFetch(`${this.baseUrl}${path}`, fetchOpts);
        } finally {
          clearTimeout(timer);
        }

        // Success
        if (res.ok) {
          const raw = await res.json();
          return transform ? transform(raw) : raw as T;
        }

        // Classify the error
        const error = await this.classifyError(res, path);

        // Don't retry payment errors or client errors (except rate limits)
        if (error instanceof PaymentError || (error instanceof ApiError && error.statusCode < 500 && error.statusCode !== 429)) {
          throw error;
        }

        // Rate limit — respect Retry-After header
        if (error instanceof RateLimitError) {
          if (attempt < maxAttempts && this.retryConfig) {
            const waitMs = error.retryAfterMs ?? this.computeDelay(attempt);
            this.log(`Rate limited. Waiting ${waitMs}ms before retry.`);
            await sleep(waitMs);
            lastError = error;
            continue;
          }
          throw error;
        }

        // Server error — retry if allowed
        if (attempt < maxAttempts && this.retryConfig && isRetryableStatus(res.status)) {
          const delayMs = this.computeDelay(attempt);
          this.log(`Server error ${res.status}. Retrying in ${delayMs}ms...`);
          await sleep(delayMs);
          lastError = error;
          continue;
        }

        throw error;
      } catch (err) {
        // Network-level errors (timeout, DNS, connection refused)
        if (err instanceof ClawFetchError) {
          throw err; // Already classified
        }

        const isAbort = (err as Error).name === 'AbortError';
        const networkErr = new NetworkError(
          isAbort ? `Request to ${path} timed out after ${this.timeoutMs}ms` : `Network error: ${(err as Error).message}`,
          path,
          err as Error,
        );

        if (attempt < maxAttempts && this.retryConfig) {
          const delayMs = this.computeDelay(attempt);
          this.log(`${isAbort ? 'Timeout' : 'Network error'}. Retrying in ${delayMs}ms...`);
          await sleep(delayMs);
          lastError = networkErr;
          continue;
        }

        throw networkErr;
      }
    }

    // Should not reach here, but just in case
    throw lastError || new Error('Request failed after all retry attempts');
  }

  private computeDelay(attempt: number): number {
    if (!this.retryConfig) return 0;
    const { initialDelayMs, backoffMultiplier, maxDelayMs } = this.retryConfig;
    const delay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() * 2 - 1);
    return Math.min(delay + jitter, maxDelayMs);
  }

  private async classifyError(res: Response, path: string): Promise<ClawFetchError> {
    let detail: string;
    try {
      const body = await res.json() as { error?: string; message?: string };
      detail = body.error || body.message || res.statusText;
    } catch {
      detail = res.statusText;
    }

    const message = `ClawFetch ${res.status}: ${detail}`;

    if (res.status === 402) {
      return new PaymentError(message, res.status, path);
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const retryAfterMs = retryAfter
        ? (parseInt(retryAfter, 10) || 0) * 1000
        : undefined;
      return new RateLimitError(message, path, retryAfterMs);
    }

    return new ApiError(message, res.status, path);
  }

  private log(msg: string): void {
    if (this.debug) {
      console.log(`[ClawFetch] ${msg}`);
    }
  }
}

export default ClawFetch;
