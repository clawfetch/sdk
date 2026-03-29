import { createWalletClient, createPublicClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { x402Client } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { toClientEvmSigner } from '@x402/evm';
import { wrapFetchWithPayment } from '@x402/fetch';

// Re-export for convenience
export { publicActions } from 'viem';

// ─── Types ───────────────────────────────────────────────────────────

export interface ClawFetchOptions {
  /** Ethereum private key (hex string with 0x prefix) for signing x402 payments */
  privateKey: Hex;
  /** Base URL of the ClawFetch API (default: https://api.clawfetch.ai) */
  baseUrl?: string;
  /** Chain to use (default: Base mainnet). Pass base or baseSepolia from viem/chains */
  chain?: typeof base;
  /** Network identifier override (default: eip155:8453 for Base mainnet) */
  network?: `${string}:${string}`;
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

// ─── Client ──────────────────────────────────────────────────────────

export class ClawFetch {
  private paidFetch: typeof globalThis.fetch;
  private baseUrl: string;
  public readonly walletAddress: string;

  constructor(options: ClawFetchOptions) {
    const { privateKey, baseUrl, chain: chainOpt, network } = options;
    this.baseUrl = (baseUrl || 'https://api.clawfetch.ai').replace(/\/$/, '');

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
    const res = await this.paidFetch(`${this.baseUrl}/extractors`);
    if (!res.ok) throw await this.toError(res);
    const body = await res.json() as { extractors: ExtractorInfo[] };
    return body.extractors;
  }

  /** Check service health (free) */
  async health(): Promise<Record<string, any>> {
    const res = await globalThis.fetch(`${this.baseUrl}/health`);
    return res.json() as Promise<Record<string, any>>;
  }

  // ─── Internal ───────────────────────────────────────────────

  private async post<T>(path: string, body: Record<string, any>): Promise<T> {
    const res = await this.paidFetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await this.toError(res);
    return res.json() as Promise<T>;
  }

  private async toError(res: Response): Promise<Error> {
    let detail: string;
    try {
      const body = await res.json() as { error?: string };
      detail = body.error || res.statusText;
    } catch {
      detail = res.statusText;
    }
    return new Error(`ClawFetch ${res.status}: ${detail}`);
  }
}

export default ClawFetch;
