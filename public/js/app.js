const SCENARIOS = {
  'p0-checkout': {
    reporter: 'rina.qa@kurodesk.id',
    sessionId: 'sess_checkout_901',
    environment: 'production',
    description: 'Waktu saya coba masukkan kode voucher KARTINI26 di keranjang dan klik Bayar Sekarang, muncul pop-up error 500 dan aplikasi langsung mental ke halaman login.'
  },
  'p0-checkout-dup': {
    reporter: 'budi.santoso@gmail.com',
    sessionId: 'sess_checkout_902',
    environment: 'production',
    description: 'Halo admin, aplikasi error parah gak bisa checkout kalau pakai kupon promo. Uang saya gak kepotong tapi belanjaan nyangkut.'
  },
  'p1-auth': {
    reporter: 'kevin.devops@kurodesk.id',
    sessionId: 'sess_auth_404',
    environment: 'staging',
    description: 'User terlempar session expired setelah 3 menit login. Padahal token baru di-generate. Muncul peringatan clock skew mismatch.'
  },
  'p0-deadlock': {
    reporter: 'automated-monitor@internal.system',
    sessionId: 'sess_inv_771',
    environment: 'production',
    description: 'Critical inventory worker alert: High concurrency burst during flash sale caused database transaction deadlock on SKU-OAK-01.'
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('bugReportForm');
  const btnSubmit = document.getElementById('btnSubmitReport');
  const executionTracker = document.getElementById('executionTracker');
  const issuesList = document.getElementById('issuesList');
  const btnReset = document.getElementById('btnResetStore');

  // Load Initial State
  fetchIssues();

  // Scenario Buttons
  document.querySelectorAll('.btn-scenario').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.scenario;
      const data = SCENARIOS[key];
      if (!data) return;

      document.getElementById('reporter').value = data.reporter;
      document.getElementById('sessionId').value = data.sessionId;
      document.getElementById('environment').value = data.environment;
      document.getElementById('description').value = data.description;
    });
  });

  // Reset Button
  btnReset.addEventListener('click', async () => {
    if (!confirm('Reset local triage store and clear all issues?')) return;
    await fetch('/api/reset', { method: 'POST' });
    fetchIssues();
  });

  // Form Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span>Triaging via DeepSeek...</span>';
    executionTracker.classList.remove('hidden');

    setTrackerStep('stepCorrelate');

    const payload = {
      reporter: document.getElementById('reporter').value,
      session_id: document.getElementById('sessionId').value,
      environment: document.getElementById('environment').value,
      description: document.getElementById('description').value,
      sync_github: document.getElementById('syncGithubCheckbox').checked
    };

    try {
      setTimeout(() => setTrackerStep('stepLLM'), 400);

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      setTrackerStep('stepDedup');

      const data = await res.json();
      setTimeout(() => setTrackerStep('stepGitHub'), 400);

      await fetchIssues();

      setTimeout(() => {
        executionTracker.classList.add('hidden');
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<span>Execute AI Triage Pipeline</span>';
      }, 1000);
    } catch (err) {
      alert('Error triaging bug: ' + err.message);
      executionTracker.classList.add('hidden');
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '<span>Execute AI Triage Pipeline</span>';
    }
  });

  // MCP Tester Buttons
  document.querySelectorAll('[data-mcp-tool]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const toolName = btn.dataset.mcpTool;
      const out = document.getElementById('mcpOutput');
      out.textContent = `Invoking tool: ${toolName}...`;

      try {
        const res = await fetch('/api/mcp-invoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: {
              name: toolName,
              arguments: toolName === 'search_correlated_logs' ? { session_id: 'sess_checkout_901' } : {}
            }
          })
        });
        const data = await res.json();
        out.textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        out.textContent = 'MCP Error: ' + err.message;
      }
    });
  });
});

function setTrackerStep(stepId) {
  const steps = ['stepCorrelate', 'stepLLM', 'stepDedup', 'stepGitHub'];
  let reached = false;
  steps.forEach(id => {
    const el = document.getElementById(id);
    if (!reached) {
      el.classList.add('done');
      el.classList.remove('active');
    }
    if (id === stepId) {
      reached = true;
      el.classList.remove('done');
      el.classList.add('active');
    } else if (reached) {
      el.classList.remove('done', 'active');
    }
  });
}

async function fetchIssues() {
  try {
    const res = await fetch('/api/issues');
    const data = await res.json();

    // Update Stats
    document.getElementById('statTotalIssues').textContent = data.stats.total_unique_issues || 0;
    document.getElementById('statDeduplicated').textContent = data.stats.deduplicated_count || 0;
    document.getElementById('statP0').textContent = data.stats.p0_critical_count || 0;

    const list = document.getElementById('issuesList');
    if (!data.issues || data.issues.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <p>No bugs triaged yet.</p>
          <p class="empty-hint">Click one of the Quick Production Scenarios on the left or submit a report to test the AI pipeline.</p>
        </div>`;
      return;
    }

    list.innerHTML = data.issues.map(issue => {
      const sevClass = (issue.severity || 'p2').toLowerCase();
      const logs = issue.correlated_logs || [];
      const primaryLog = logs[0] || {};

      return `
        <article class="issue-card ${sevClass}">
          <div class="issue-top">
            <h3 class="issue-title">${escapeHtml(issue.title)}</h3>
            <div class="issue-badges">
              <span class="pill-badge ${sevClass}">${issue.severity}</span>
              ${issue.occurrence_count > 1 ? `<span class="pill-badge dup-count">${issue.occurrence_count}x reported</span>` : ''}
            </div>
          </div>
          <div class="issue-meta">
            <span>Component: <strong>${escapeHtml(issue.component)}</strong></span> • 
            <span>Dedup Sig: <code>${escapeHtml(issue.dedup_signature)}</code></span>
          </div>
          <div class="issue-body-box">
            <strong>Suspected Root Cause (AI Hypothesized):</strong>
            <p>${escapeHtml(issue.suspected_root_cause)}</p>
          </div>
          <div class="issue-body-box">
            <strong>Suggested Engineering Fix:</strong>
            <p>${escapeHtml(issue.suggested_fix)}</p>
          </div>
          ${primaryLog.stack_trace ? `
            <details>
              <summary style="font-size:0.75rem; cursor:pointer; color:var(--text-muted);">View Correlated Server Stack Trace (${primaryLog.service})</summary>
              <pre class="trace-box">${escapeHtml(primaryLog.stack_trace)}</pre>
            </details>
          ` : ''}
          <div class="issue-footer">
            <span>Reported by: ${escapeHtml(issue.reporter)}</span>
            ${issue.github_url ? `<a class="gh-link" href="${issue.github_url}" target="_blank" rel="noopener">GitHub Issue #${issue.github_issue_number || 101} ↗</a>` : '<span style="color:var(--text-muted)">Local Simulated</span>'}
          </div>
        </article>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to fetch issues:', err);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
