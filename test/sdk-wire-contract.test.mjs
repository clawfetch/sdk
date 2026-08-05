#!/usr/bin/env node
/**
 * SDK wire-contract test.
 *
 * WHY THIS EXISTS
 * ---------------
 * The MCP test suite (34 tests) passed for months while the SDK was posting
 * parameters the server rejects, because every one of those tests MOCKS the
 * SDK. A mock returns whatever shape you tell it to — it can never catch
 * "we send `topic` but the server wants `query`".
 *
 * Bugs this would have caught (all live in production on 2026-07-26):
 *   - research()       posted { topic }            → server requires `query`
 *   - domainsSuggest() posted { query: string }    → server requires `keywords` ARRAY
 *   - extract()        had no way to pass `type`
 *
 * These fail AFTER payment is taken, so the caller pays and gets a 400.
 *
 * HOW IT WORKS
 * ------------
 * We don't pay. We intercept the SDK's outbound request and assert the BODY
 * satisfies what the live server's manifest declares as required. No USDC
 * spent, real contract coverage.
 *
 * USAGE
 *   node test/sdk-wire-contract.test.mjs
 */

import { ClawFetch } from '../dist/index.mjs';

const API_BASE = process.env.CLAWFETCH_API_BASE ?? 'https://api.clawfetch.ai';

let failures = 0;
const fail = (m) => { console.log(`   ❌ ${m}`); failures++; };
const pass = (m) => console.log(`   ✅ ${m}`);

// Capture the outbound body without completing a payment.
function makeSpyClient() {
  const captured = [];
  const client = new ClawFetch({
    privateKey: '0x' + '11'.repeat(32), // throwaway, never used to sign
    baseUrl: API_BASE,
  });
  client.paidFetch = async (url, opts = {}) => {
    captured.push({ url: String(url), body: JSON.parse(opts.body ?? '{}') });
    return new Response(JSON.stringify({ ok: true, sources: [], data: {}, domains: [] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  return { client, captured };
}

async function main() {
  console.log(`🧪 ClawFetch SDK wire-contract tests (ground truth: ${API_BASE})\n`);

  const manifest = await (await fetch(`${API_BASE}/.well-known/x402`)).json();
  const required = Object.fromEntries(
    manifest.resources.map((r) => [r.url.split('.ai')[1], r.inputSchema?.required ?? []]),
  );

  console.log('SDK methods send the parameters the server actually requires:');

  const checks = [
    { label: 'fetch()',          route: '/fetch',           run: (c) => c.fetch('https://example.com') },
    { label: 'render()',         route: '/render',          run: (c) => c.render('https://example.com') },
    { label: 'extract()',        route: '/extract',         run: (c) => c.extract('https://github.com/coinbase/x402', { type: 'github' }) },
    { label: 'research()',       route: '/research',        run: (c) => c.research('x402 agent payments', { maxResults: 5 }) },
    { label: 'domainsCheck()',   route: '/domains/check',   run: (c) => c.domainsCheck(['example.com']) },
    { label: 'domainsSuggest()', route: '/domains/suggest', run: (c) => c.domainsSuggest(['agent', 'grid']) },
    { label: 'parse(url)',       route: '/parse',           run: (c) => c.parse('https://example.com/report.docx') },
  ];

  for (const { label, route, run } of checks) {
    const { client, captured } = makeSpyClient();
    try { await run(client); } catch (e) { fail(`${label} threw: ${e.message}`); continue; }
    if (!captured.length) { fail(`${label} sent no request`); continue; }
    const body = captured[0].body;
    const missing = (required[route] ?? []).filter((k) => body[k] === undefined);
    if (missing.length) fail(`${label} → ${route} missing required param(s): ${missing.join(', ')} (sent: ${Object.keys(body).join(', ')})`);
    else pass(`${label} → ${route} sends [${Object.keys(body).join(', ')}]`);
  }

  console.log('\nType-shape checks:');
  {
    const { client, captured } = makeSpyClient();
    await client.domainsSuggest('agent grid');
    const kw = captured[0]?.body?.keywords;
    Array.isArray(kw)
      ? pass(`domainsSuggest('agent grid') normalizes to array ${JSON.stringify(kw)}`)
      : fail(`domainsSuggest sent keywords as ${typeof kw} — server requires an array`);
  }
  {
    const { client, captured } = makeSpyClient();
    await client.research('some topic');
    'query' in (captured[0]?.body ?? {})
      ? pass("research() maps its `topic` argument to the server's `query` field")
      : fail(`research() sent [${Object.keys(captured[0]?.body ?? {}).join(', ')}] — server requires 'query'`);
  }
  {
    // /parse accepts url XOR base64 (anyOf in the schema, so the generic
    // required-params loop above can't see it). Assert both call shapes.
    const { client, captured } = makeSpyClient();
    await client.parse('https://example.com/report.docx');
    await client.parse(new Uint8Array([0x61, 0x2c, 0x62]), { filename: 'data.csv', format: 'csv' });
    const [byUrl, byBytes] = captured.map((c) => c.body);
    byUrl?.url && !byUrl?.base64
      ? pass('parse(url) sends { url } on the wire')
      : fail(`parse(url) sent [${Object.keys(byUrl ?? {}).join(', ')}]`);
    byBytes?.base64 === 'YSxi' && byBytes?.format === 'csv' && !byBytes?.url
      ? pass('parse(bytes) base64-encodes and sends { base64, filename, format }')
      : fail(`parse(bytes) sent [${Object.keys(byBytes ?? {}).join(', ')}] base64=${byBytes?.base64}`);
  }

  console.log(failures === 0 ? '\n✅ SDK wire contracts hold.\n' : `\n❌ ${failures} wire-contract violation(s).\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`💥 ${e.stack}`); process.exit(1); });
