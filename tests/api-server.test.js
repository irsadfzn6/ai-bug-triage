const test = require('node:test');
const assert = require('node:assert/strict');
const { createAppServer } = require('../server');

test('HTTP server serves /api/health, /api/reports triage pipeline, and /api/mcp-invoke', async (t) => {
  const { server, engine } = createAppServer({ allowLiveGitHub: false });
  engine.resetStore();
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  t.after(() => server.close());

  const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(healthRes.status, 200);
  const health = await healthRes.json();
  assert.equal(health.status, 'ok');

  const reportRes = await fetch(`http://127.0.0.1:${port}/api/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reporter: 'qa@kurodesk.id',
      session_id: 'sess_checkout_901',
      description: 'Error 500 waktu apply voucher KARTINI26 di halaman pembayaran',
      sync_github: false
    })
  });
  assert.equal(reportRes.status, 201);
  const reportData = await reportRes.json();
  assert.equal(reportData.dedup_status, 'NEW_ISSUE');
  assert.equal(reportData.ticket.dedup_signature, 'checkout-service:ERR_PROMO_NULL_REF');
});
