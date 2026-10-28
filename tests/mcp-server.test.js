const test = require('node:test');
const assert = require('node:assert/strict');
const { handleMcpRequest } = require('../src/mcp-triage-server');
const { createTriageEngine } = require('../src/triage-engine');

test('MCP server responds to initialize, tools/list, and tools/call without crashing on unknown methods', async () => {
  const engine = createTriageEngine({ allowLiveGitHub: false, fetchImpl: async () => { throw new Error('offline'); } });
  engine.resetStore();

  const initRes = await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, engine);
  assert.equal(initRes.result.serverInfo.name, 'ai-bug-triage-mcp');

  const listRes = await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, engine);
  assert.equal(listRes.result.tools.length, 4);

  const callRes = await handleMcpRequest({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'search_correlated_logs',
      arguments: { session_id: 'sess_checkout_901' }
    }
  }, engine);
  assert.equal(callRes.result.isError, false);
  assert.match(callRes.result.content[0].text, /ERR_PROMO_NULL_REF/);

  const unknownRes = await handleMcpRequest({ jsonrpc: '2.0', id: 4, method: 'unknown/method' }, engine);
  assert.equal(unknownRes.error.code, -32601);
});
