const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadEnv } = require('./src/env-loader');
const { createTriageEngine } = require('./src/triage-engine');
const { handleMcpRequest } = require('./src/mcp-triage-server');
const { parseLogEntries } = require('./src/log-correlator');

loadEnv();

function createAppServer(options = {}) {
  const engine = options.engine || createTriageEngine({
    allowLiveGitHub: options.allowLiveGitHub ?? (Boolean(process.env.GITHUB_TOKEN)),
    fetchImpl: options.fetchImpl || globalThis.fetch
  });

  const publicDir = path.join(__dirname, 'public');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    const sendJson = (status, data) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end(JSON.stringify(data));
    };

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      return res.end();
    }

    // API Routes
    if (pathname === '/api/health' && req.method === 'GET') {
      return sendJson(200, {
        status: 'ok',
        version: '1.0.0',
        uptime: process.uptime(),
        llm_model: process.env.LLM_MODEL || 'deepseek-v4.1-flash',
        github_repo: process.env.GITHUB_REPO || 'irsadfzn6/ai-bug-triage',
        has_github_token: Boolean(process.env.GITHUB_TOKEN)
      });
    }

    if (pathname === '/api/issues' && req.method === 'GET') {
      return sendJson(200, {
        stats: engine.getStats(),
        issues: engine.listIssues(),
        occurrences: engine.occurrences
      });
    }

    if (pathname === '/api/logs' && req.method === 'GET') {
      const logs = parseLogEntries();
      return sendJson(200, { total: logs.length, logs });
    }

    if (pathname === '/api/reset' && req.method === 'POST') {
      engine.resetStore();
      return sendJson(200, { message: 'Triage store reset successfully' });
    }

    if (pathname === '/api/reports' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const result = await engine.triageReport(payload);
          return sendJson(201, result);
        } catch (err) {
          return sendJson(400, { error: err.message });
        }
      });
      return;
    }

    if (pathname === '/api/mcp-invoke' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const reqBody = JSON.parse(body || '{}');
          const mcpResponse = await handleMcpRequest(reqBody, engine);
          return sendJson(200, mcpResponse);
        } catch (err) {
          return sendJson(400, { error: err.message });
        }
      });
      return;
    }

    // Static File Serving
    let filePath = path.join(publicDir, pathname === '/' ? 'index.html' : pathname);

    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.svg': 'image/svg+xml'
    };

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      return fs.createReadStream(filePath).pipe(res);
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  return { server, engine };
}

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  const { server } = createAppServer();
  server.listen(PORT, () => {
    console.log(`[AI Bug Triage Console] Running on http://localhost:${PORT}`);
    console.log(`[Model] ${process.env.LLM_MODEL || 'deepseek-v4.1-flash'}`);
    console.log(`[GitHub Repo] ${process.env.GITHUB_REPO || 'irsadfzn6/ai-bug-triage'}`);
  });
}

module.exports = { createAppServer };
