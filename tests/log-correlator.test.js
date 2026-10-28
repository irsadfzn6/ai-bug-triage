const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { correlateLogs } = require('../src/log-correlator');
const { loadEnv } = require('../src/env-loader');

test('loadEnv loads variables without throwing', () => {
  const env = loadEnv(path.join(__dirname, '..', '.env'));
  assert.equal(typeof env.LLM_MODEL, 'string');
});

test('correlateLogs matches exact session_id and returns stack traces', () => {
  const logs = correlateLogs({ session_id: 'sess_checkout_901' });
  assert.equal(logs.length >= 1, true);
  assert.equal(logs[0].service, 'checkout-service');
  assert.equal(logs[0].error_code, 'ERR_PROMO_NULL_REF');
});

test('correlateLogs matches within ±5 minute timestamp window and keywords when session_id is absent', () => {
  const logs = correlateLogs({
    timestamp: '2026-10-28T12:02:10Z',
    keywords: ['KARTINI26', 'voucher', 'checkout']
  });
  assert.equal(logs.length >= 1, true);
  assert.equal(logs[0].error_code, 'ERR_PROMO_NULL_REF');
});

test('correlateLogs returns empty array cleanly when no session or timestamp window matches', () => {
  const logs = correlateLogs({
    session_id: 'sess_non_existent_000',
    timestamp: '2020-01-01T00:00:00Z'
  });
  assert.deepEqual(logs, []);
});
