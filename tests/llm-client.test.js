const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseAndValidateTriageJson,
  buildDeterministicFallback,
  analyzeBugWithLLM
} = require('../src/llm-client');

test('parseAndValidateTriageJson strips markdown code fences and normalizes schema fields', () => {
  const raw = '```json\n{"title":"[Checkout] Promo crash","severity":"P0","component":"checkout-service","dedup_signature":"checkout-service:ERR_PROMO_NULL_REF","matched_existing_issue_id":null,"similarity_reason":"New issue","summary":"Crash on promo","steps_to_reproduce":["Step 1"],"suspected_root_cause":"Null ref","suggested_fix":"Guard null","labels":["bug"]}\n```';
  const parsed = parseAndValidateTriageJson(raw, { report: { description: 'error' }, correlatedLogs: [], openIssues: [] });
  assert.equal(parsed.severity, 'P0');
  assert.equal(parsed.dedup_signature, 'checkout-service:ERR_PROMO_NULL_REF');
  assert.equal(Array.isArray(parsed.steps_to_reproduce), true);
});

test('parseAndValidateTriageJson falls back deterministically when LLM returns malformed non-JSON text', () => {
  const context = {
    report: { title: 'Gagal bayar voucher', description: 'Error 500 waktu klik bayar pakai KARTINI26' },
    correlatedLogs: [{ service: 'checkout-service', error_code: 'ERR_PROMO_NULL_REF', http_status: 500, message: 'Cannot read properties of null (reading maxCap)', stack_trace: 'at applyVoucher (src/pricing/voucher.js:142)' }],
    openIssues: []
  };
  const result = parseAndValidateTriageJson('Sorry I cannot process this right now.', context);
  assert.equal(result.severity, 'P0');
  assert.equal(result.component, 'checkout-service');
  assert.equal(result.dedup_signature, 'checkout-service:ERR_PROMO_NULL_REF');
});

test('analyzeBugWithLLM calls OpenAI-compatible endpoint and falls back cleanly on network rejection', async () => {
  const failingFetch = async () => { throw new Error('ECONNRESET'); };
  const res = await analyzeBugWithLLM({
    report: { description: 'Login mental balik terus setelah 5 menit' },
    correlatedLogs: [{ service: 'auth-service', error_code: 'ERR_JWT_CLOCK_SKEW', http_status: 401, message: 'jwt expired skew' }],
    openIssues: []
  }, { fetchImpl: failingFetch });
  assert.equal(res.llm_mode, 'deterministic-fallback');
  assert.equal(res.dedup_signature, 'auth-service:ERR_JWT_CLOCK_SKEW');
});
