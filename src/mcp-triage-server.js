const readline = require('node:readline');
const { createTriageEngine } = require('./triage-engine');
const { correlateLogs } = require('./log-correlator');
const { syncIssueToGitHub, formatGitHubIssueMarkdown } = require('./github-bridge');

const MCP_TOOLS = [
  {
    name: 'list_triaged_issues',
    description: 'List all open triaged bug issues, their deduplication signatures, and occurrence counts.',
    inputSchema: {
      type: 'object',
      properties: {
        severity: { type: 'string', description: 'Optional filter by severity: P0, P1, P2, P3' }
      }
    }
  },
  {
    name: 'triage_bug_report',
    description: 'Submit an unstructured bug report to be correlated with server logs, triaged by DeepSeek, and deduplicated against existing issues.',
    inputSchema: {
      type: 'object',
      required: ['description'],
      properties: {
        title: { type: 'string', description: 'Brief title of the bug' },
        description: { type: 'string', description: 'Raw user bug description' },
        reporter: { type: 'string', description: 'Reporter email or handle' },
        session_id: { type: 'string', description: 'Optional session_id to correlate logs' },
        environment: { type: 'string', description: 'production, staging, or development' },
        sync_github: { type: 'boolean', description: 'Whether to create or update issue on GitHub' }
      }
    }
  },
  {
    name: 'search_correlated_logs',
    description: 'Search production server error logs by session_id, timestamp, or failure keywords.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Exact session ID' },
        timestamp: { type: 'string', description: 'ISO timestamp string' },
        keywords: { type: 'array', items: { type: 'string' }, description: 'Keywords to search' }
      }
    }
  },
  {
    name: 'sync_issue_to_github',
    description: 'Manually sync or resync a triaged issue to GitHub Issues.',
    inputSchema: {
      type: 'object',
      required: ['issue_id'],
      properties: {
        issue_id: { type: 'number', description: 'Local issue ID to sync' }
      }
    }
  }
];

async function handleMcpRequest(request, engine) {
  const { id, method, params } = request;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'ai-bug-triage-mcp',
          version: '1.0.0'
        }
      }
    };
  }

  if (method === 'notifications/initialized') {
    return null; // Notification, no response
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: MCP_TOOLS }
    };
  }

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params || {};

    try {
      if (name === 'list_triaged_issues') {
        let issues = engine.listIssues();
        if (args.severity) {
          issues = issues.filter(i => i.severity === args.severity.toUpperCase());
        }
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: JSON.stringify({ count: issues.length, issues }, null, 2)
            }],
            isError: false
          }
        };
      }

      if (name === 'triage_bug_report') {
        const triageResult = await engine.triageReport(args);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: JSON.stringify(triageResult, null, 2)
            }],
            isError: false
          }
        };
      }

      if (name === 'search_correlated_logs') {
        const logs = correlateLogs(args);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: JSON.stringify(logs, null, 2)
            }],
            isError: false
          }
        };
      }

      if (name === 'sync_issue_to_github') {
        const issue = engine.getIssueById(args.issue_id);
        if (!issue) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: `Issue ID #${args.issue_id} not found.` }],
              isError: true
            }
          };
        }

        const body = formatGitHubIssueMarkdown(issue);
        const gh = await syncIssueToGitHub('create', {
          title: issue.title,
          body,
          labels: issue.labels
        });

        issue.github_issue_number = gh.issue_number;
        issue.github_url = gh.html_url;
        engine.saveState();

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(gh, null, 2) }],
            isError: false
          }
        };
      }

      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Tool not found: ${name}` }
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Error executing tool: ${err.message}` }],
          isError: true
        }
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not supported: ${method}` }
  };
}

function startStdioMcpServer(engineInstance) {
  const engine = engineInstance || createTriageEngine();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line) => {
    if (!line.trim()) return;
    try {
      const req = JSON.parse(line);
      const res = await handleMcpRequest(req, engine);
      if (res) {
        process.stdout.write(JSON.stringify(res) + '\n');
      }
    } catch {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: Invalid JSON-RPC' }
      }) + '\n');
    }
  });
}

if (require.main === module) {
  startStdioMcpServer();
}

module.exports = {
  MCP_TOOLS,
  handleMcpRequest,
  startStdioMcpServer
};
