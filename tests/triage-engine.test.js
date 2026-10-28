const test = require('node:test');
const assert = require('node:assert/strict');
const { createTriageEngine } = require('../src/triage-engine');
const { syncIssueToGitHub } = require('../src/github-bridge');

test('triageEngine creates a new P0 issue on first report and merges duplicate on second vague report', async () => {
  const mockFetch = async () => { throw new Error('offline-test'); };
  const engine = createTriageEngine({ allowLiveGitHub: false, fetchImpl: mockFetch });
  engine.resetStore();

  const first = await engine.triageReport({
    reporter: 'rina.qa@kurodesk.id',
    session_id: 'sess_checkout_901',
    environment: 'production',
    description: 'Waktu pakai kode promo KARTINI26 dan klik Bayar Sekarang, muncul error 500.'
  });

  assert.equal(first.dedup_status, 'NEW_ISSUE');
  assert.equal(first.ticket.occurrence_count, 1);
  assert.equal(first.ticket.severity, 'P0');
  assert.equal(first.ticket.dedup_signature, 'checkout-service:ERR_PROMO_NULL_REF');

  const second = await engine.triageReport({
    reporter: 'budi.user@gmail.com',
    session_id: 'sess_checkout_902',
    environment: 'production',
    description: 'Kak, aplikasi mental gak bisa checkout kalau pasang voucher diskon.'
  });

  assert.equal(second.dedup_status, 'DUPLICATE_MERGED');
  assert.equal(second.ticket.id, first.ticket.id);
  assert.equal(second.ticket.occurrence_count, 2);
  assert.equal(engine.listIssues().length, 1);
});

test('syncIssueToGitHub falls back to local-simulated cleanly when GitHub API returns error', async () => {
  const failingFetch = async () => ({ ok: false, status: 403, text: async () => 'Forbidden' });
  const result = await syncIssueToGitHub('create', {
    title: '[Test] Issue',
    body: 'Body',
    labels: ['bug']
  }, { allowLiveGitHub: true, fetchImpl: failingFetch });

  assert.equal(result.mode, 'local-simulated');
  assert.equal(typeof result.issue_number, 'number');
});
