// Both entry points must expose the real API through the package's own exports map.
// Guards the 0.1.0–0.3.0 bug: under "type":"module" the CJS build was treated as ESM
// and require('@clawfetch/sdk') silently returned {}.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cjs = require('@clawfetch/sdk');
const esm = await import('@clawfetch/sdk');
assert.equal(typeof cjs.ClawFetch, 'function', 'require() must expose ClawFetch');
assert.equal(typeof esm.ClawFetch, 'function', 'import must expose ClawFetch');
assert.deepEqual(Object.keys(cjs).sort(), Object.keys(esm).sort(), 'CJS and ESM export the same names');
console.log('✅ package exports: require and import both expose', Object.keys(cjs).length, 'names');
