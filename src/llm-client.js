const { loadEnv } = require('./env-loader');

loadEnv();

function stripMarkdownFences(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```$/im, '')
    .trim();
}

function buildDeterministicFallback(context) {
  const { report = {}, correlatedLogs = [], openIssues = [] } = context;
  const primaryLog = correlatedLogs[0] || {};
  const service = primaryLog.service || 'frontend-ui';
  const errCode = primaryLog.error_code || 'ERR_UNCLASSIFIED';

  // Severity derivation
  let severity = 'P2';
  if (primaryLog.http_status >= 500 || errCode.includes('DEADLOCK') || errCode.includes('NULL_REF')) {
    severity = 'P0';
  } else if (primaryLog.http_status === 401 || primaryLog.http_status === 403) {
    severity = 'P1';
  } else if (!primaryLog.http_status && !primaryLog.error_code) {
    severity = 'P3';
  }

  const dedupSignature = `${service}:${errCode}`;

  // Check if matches existing open issue
  const matchedIssue = openIssues.find(issue =>
    (issue.dedup_signature && issue.dedup_signature.toLowerCase() === dedupSignature.toLowerCase()) ||
    (issue.title && issue.title.toLowerCase().includes(errCode.toLowerCase()))
  );

  return {
    title: `[${service}] ${primaryLog.message || report.title || report.description || 'Unexpected Application Error'}`,
    severity,
    component: service,
    dedup_signature: dedupSignature,
    matched_existing_issue_id: matchedIssue ? matchedIssue.id : null,
    similarity_reason: matchedIssue
      ? `Matches active open issue #${matchedIssue.id} by error signature (${dedupSignature})`
      : 'New unique error signature',
    summary: report.description || report.summary || primaryLog.message || 'No description provided.',
    steps_to_reproduce: [
      report.session_id ? `Reproduce with user session: ${report.session_id}` : 'Open user report context',
      report.description ? `Trigger action: ${report.description.slice(0, 100)}` : 'Observe error',
      primaryLog.path ? `Inspect HTTP path: ${primaryLog.path}` : 'Check application logs'
    ],
    suspected_root_cause: primaryLog.stack_trace
      ? primaryLog.stack_trace.split('\n').slice(0, 2).join(' ')
      : primaryLog.message || 'Requires code review in ' + service,
    suggested_fix: `Inspect error handler in ${service} for ${errCode}. Add null-guards and error boundaries.`,
    labels: ['bug', `${severity}-critical`, service, primaryLog.stack_trace ? 'has-stacktrace' : 'user-reported']
  };
}

function parseAndValidateTriageJson(rawText, context) {
  try {
    const cleaned = stripMarkdownFences(rawText);
    const parsed = JSON.parse(cleaned);

    const fallback = buildDeterministicFallback(context);

    return {
      title: String(parsed.title || fallback.title),
      severity: ['P0', 'P1', 'P2', 'P3'].includes(parsed.severity) ? parsed.severity : fallback.severity,
      component: String(parsed.component || fallback.component),
      dedup_signature: String(parsed.dedup_signature || fallback.dedup_signature),
      matched_existing_issue_id: parsed.matched_existing_issue_id !== undefined ? parsed.matched_existing_issue_id : fallback.matched_existing_issue_id,
      similarity_reason: String(parsed.similarity_reason || fallback.similarity_reason),
      summary: String(parsed.summary || fallback.summary),
      steps_to_reproduce: Array.isArray(parsed.steps_to_reproduce) && parsed.steps_to_reproduce.length > 0
        ? parsed.steps_to_reproduce.map(String)
        : fallback.steps_to_reproduce,
      suspected_root_cause: String(parsed.suspected_root_cause || fallback.suspected_root_cause),
      suggested_fix: String(parsed.suggested_fix || fallback.suggested_fix),
      labels: Array.isArray(parsed.labels) && parsed.labels.length > 0
        ? parsed.labels.map(String)
        : fallback.labels
    };
  } catch {
    return buildDeterministicFallback(context);
  }
}

async function analyzeBugWithLLM(context, options = {}) {
  const { fetchImpl = globalThis.fetch, timeoutMs = 12000 } = options;
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.aivokey.dev/v1';
  const apiKey = process.env.LLM_API_KEY || '';
  const model = process.env.LLM_MODEL || 'deepseek-v4.1-flash';

  if (!apiKey) {
    const fallback = buildDeterministicFallback(context);
    return { ...fallback, llm_mode: 'deterministic-fallback' };
  }

  const promptSystem = `You are a Principal Site Reliability & AI Triage Engineer.
Analyze the user's bug report and correlated production server stack traces.
Compare them against the list of active open issues to perform deduplication.

Respond ONLY with a valid JSON object matching this schema:
{
  "title": "[Service] Short informative title",
  "severity": "P0" | "P1" | "P2" | "P3",
  "component": "service-name",
  "dedup_signature": "service-name:CANONICAL_ERROR_CODE",
  "matched_existing_issue_id": number or null,
  "similarity_reason": "Why this matches an existing issue or is a new bug",
  "summary": "Clear summary of user impact",
  "steps_to_reproduce": ["Step 1", "Step 2"],
  "suspected_root_cause": "Line/function causing the fault based on stack trace",
  "suggested_fix": "Concrete engineering recommendation",
  "labels": ["bug", "severity-label", "component-name"]
}`;

  const promptUser = JSON.stringify({
    incoming_report: context.report,
    correlated_server_logs: context.correlatedLogs,
    active_open_issues: (context.openIssues || []).map(i => ({
      id: i.id,
      title: i.title,
      dedup_signature: i.dedup_signature,
      component: i.component
    }))
  }, null, 2);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: promptSystem },
          { role: 'user', content: promptUser }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!res.ok) {
      const fallback = buildDeterministicFallback(context);
      return { ...fallback, llm_mode: 'deterministic-fallback' };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = parseAndValidateTriageJson(content, context);
    return { ...parsed, llm_mode: 'live-llm' };
  } catch {
    clearTimeout(timer);
    const fallback = buildDeterministicFallback(context);
    return { ...fallback, llm_mode: 'deterministic-fallback' };
  }
}

module.exports = {
  stripMarkdownFences,
  buildDeterministicFallback,
  parseAndValidateTriageJson,
  analyzeBugWithLLM
};
