const { loadEnv } = require('./env-loader');

loadEnv();

let simulatedIssueCounter = 100;
const localSimulatedIssues = new Map();
const localSimulatedComments = new Map();

function formatGitHubIssueMarkdown(ticket) {
  const logs = ticket.correlated_logs || [];
  const primaryLog = logs[0] || {};

  return `## 🚨 AI Triaged Bug Report: ${ticket.title}

| Attribute | Details |
| :--- | :--- |
| **Severity** | \`${ticket.severity}\` |
| **Component** | \`${ticket.component}\` |
| **Dedup Signature** | \`${ticket.dedup_signature}\` |
| **Reporter** | ${ticket.reporter || 'Anonymous'} |
| **Occurrences** | **${ticket.occurrence_count || 1}** |
| **Session ID** | \`${ticket.session_id || 'N/A'}\` |
| **Environment** | \`${ticket.environment || 'production'}\` |

---

### 📝 Summary
${ticket.summary}

### 🔁 Steps to Reproduce
${(ticket.steps_to_reproduce || []).map((s, idx) => `${idx + 1}. ${s}`).join('\n')}

### 🔍 Suspected Root Cause
> ${ticket.suspected_root_cause}

### 💡 Suggested Fix
${ticket.suggested_fix}

---

### 🪵 Correlated Production Server Stack Trace (${logs.length} matched events)
${primaryLog.stack_trace ? `<details>
<summary>Click to view stack trace from <code>${primaryLog.service}</code> (HTTP ${primaryLog.http_status})</summary>

\`\`\`
${primaryLog.stack_trace}
\`\`\`
</details>` : '_No stack trace captured for this event._'}

*Triaged automatically by AI Bug Triage Pipeline (deepseek-v4.1-flash)*`;
}

function formatDuplicateCommentMarkdown(occurrence, ticket) {
  return `### 🔁 Duplicate Occurrence Reported (+1)
- **Reporter:** ${occurrence.reporter || 'Anonymous'}
- **Session:** \`${occurrence.session_id || 'N/A'}\`
- **Reported at:** ${new Date().toISOString()}
- **Raw User Note:**
> "${occurrence.description}"

*Total recorded occurrences for this issue: **${ticket.occurrence_count}**.*`;
}

async function syncIssueToGitHub(action, payload, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    allowLiveGitHub = true
  } = options;

  const token = process.env.GITHUB_TOKEN || '';
  const repo = process.env.GITHUB_REPO || 'irsadfzn6/ai-bug-triage';

  // If live sync is not allowed or no token provided, return local-simulated
  if (!allowLiveGitHub || !token) {
    if (action === 'create') {
      simulatedIssueCounter += 1;
      const issueNum = simulatedIssueCounter;
      const issueObj = {
        issue_number: issueNum,
        html_url: `https://github.com/${repo}/issues/${issueNum}#simulated`,
        title: payload.title,
        body: payload.body,
        labels: payload.labels || [],
        mode: 'local-simulated'
      };
      localSimulatedIssues.set(issueNum, issueObj);
      return issueObj;
    } else {
      const issueNum = payload.issue_number;
      const comments = localSimulatedComments.get(issueNum) || [];
      comments.push(payload.body);
      localSimulatedComments.set(issueNum, comments);
      return {
        issue_number: issueNum,
        html_url: `https://github.com/${repo}/issues/${issueNum}#issuecomment-simulated`,
        mode: 'local-simulated'
      };
    }
  }

  // Attempt Live GitHub REST API call
  try {
    if (action === 'create') {
      const res = await fetchImpl(`https://api.github.com/repos/${repo}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'antigravity-ai-bug-triage',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: payload.title,
          body: payload.body,
          labels: payload.labels
        })
      });

      if (!res.ok) {
        return syncIssueToGitHub('create', payload, { allowLiveGitHub: false });
      }

      const data = await res.json();
      return {
        issue_number: data.number,
        html_url: data.html_url,
        title: data.title,
        mode: 'live-github'
      };
    } else {
      const issueNum = payload.issue_number;
      const res = await fetchImpl(`https://api.github.com/repos/${repo}/issues/${issueNum}/comments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'antigravity-ai-bug-triage',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ body: payload.body })
      });

      if (!res.ok) {
        return syncIssueToGitHub('comment', payload, { allowLiveGitHub: false });
      }

      const data = await res.json();
      return {
        issue_number: issueNum,
        comment_id: data.id,
        html_url: data.html_url,
        mode: 'live-github'
      };
    }
  } catch {
    return syncIssueToGitHub(action, payload, { allowLiveGitHub: false });
  }
}

module.exports = {
  formatGitHubIssueMarkdown,
  formatDuplicateCommentMarkdown,
  syncIssueToGitHub,
  localSimulatedIssues
};
