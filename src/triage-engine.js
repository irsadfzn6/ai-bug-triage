const fs = require('node:fs');
const path = require('node:path');
const { correlateLogs } = require('./log-correlator');
const { analyzeBugWithLLM } = require('./llm-client');
const {
  formatGitHubIssueMarkdown,
  formatDuplicateCommentMarkdown,
  syncIssueToGitHub
} = require('./github-bridge');

const STATE_FILE = path.join(__dirname, '..', 'logs', 'triage-state.json');

class TriageEngine {
  constructor(options = {}) {
    this.allowLiveGitHub = options.allowLiveGitHub ?? true;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.issues = new Map();
    this.occurrences = [];
    this.idCounter = 1;
    this.loadState();
  }

  loadState() {
    if (fs.existsSync(STATE_FILE)) {
      try {
        const raw = fs.readFileSync(STATE_FILE, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.issues)) {
          this.issues.clear();
          for (const item of data.issues) {
            this.issues.set(item.id, item);
          }
          this.idCounter = Math.max(1, ...data.issues.map(i => i.id)) + 1;
        }
        if (Array.isArray(data.occurrences)) {
          this.occurrences = data.occurrences;
        }
      } catch {
        // start fresh if corrupt
      }
    }
  }

  saveState() {
    try {
      const data = {
        issues: Array.from(this.issues.values()),
        occurrences: this.occurrences
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      // non-fatal
    }
  }

  resetStore() {
    this.issues.clear();
    this.occurrences = [];
    this.idCounter = 1;
    if (fs.existsSync(STATE_FILE)) {
      try { fs.unlinkSync(STATE_FILE); } catch {}
    }
  }

  listIssues() {
    return Array.from(this.issues.values());
  }

  getIssueById(id) {
    return this.issues.get(Number(id));
  }

  getStats() {
    const list = this.listIssues();
    const p0 = list.filter(i => i.severity === 'P0').length;
    const p1 = list.filter(i => i.severity === 'P1').length;
    const totalOccurrences = this.occurrences.length;
    return {
      total_unique_issues: list.length,
      total_occurrences: totalOccurrences,
      deduplicated_count: Math.max(0, totalOccurrences - list.length),
      p0_critical_count: p0,
      p1_high_count: p1
    };
  }

  async triageReport(reportInput) {
    const report = {
      title: reportInput.title || 'User Bug Report',
      description: reportInput.description || '',
      reporter: reportInput.reporter || 'anonymous.user@kurodesk.id',
      session_id: reportInput.session_id || '',
      environment: reportInput.environment || 'production',
      timestamp: reportInput.timestamp || new Date().toISOString()
    };

    // 1. Correlate with production server logs
    const keywords = [];
    if (report.description) {
      const words = report.description.split(/\s+/).filter(w => w.length > 3);
      keywords.push(...words.slice(0, 5));
    }
    const correlatedLogs = correlateLogs({
      session_id: report.session_id,
      timestamp: report.timestamp,
      keywords
    });

    // 2. Query open active issues
    const openIssues = this.listIssues().filter(i => i.status !== 'closed');

    // 3. Run LLM Triage
    const triage = await analyzeBugWithLLM({
      report,
      correlatedLogs,
      openIssues
    }, {
      fetchImpl: this.fetchImpl
    });

    // 4. Deduplication resolution
    let existingTicket = null;

    // Check by LLM suggestion first
    if (triage.matched_existing_issue_id) {
      existingTicket = this.getIssueById(triage.matched_existing_issue_id);
    }

    // Check by canonical dedup_signature (deterministic lock)
    if (!existingTicket && triage.dedup_signature) {
      existingTicket = openIssues.find(i =>
        i.dedup_signature && i.dedup_signature.toLowerCase() === triage.dedup_signature.toLowerCase()
      );
    }

    const occurrenceRecord = {
      id: this.occurrences.length + 1,
      ticket_id: null,
      reporter: report.reporter,
      session_id: report.session_id,
      description: report.description,
      reported_at: report.timestamp,
      triage_signature: triage.dedup_signature
    };

    if (existingTicket) {
      // DUPLICATE DETECTED
      existingTicket.occurrence_count = (existingTicket.occurrence_count || 1) + 1;
      existingTicket.last_seen_at = report.timestamp;
      occurrenceRecord.ticket_id = existingTicket.id;
      this.occurrences.push(occurrenceRecord);

      // Sync duplicate comment to GitHub if requested
      const syncGitHub = reportInput.sync_github ?? true;
      let githubSync = null;

      if (syncGitHub && existingTicket.github_issue_number) {
        const commentBody = formatDuplicateCommentMarkdown(occurrenceRecord, existingTicket);
        githubSync = await syncIssueToGitHub('comment', {
          issue_number: existingTicket.github_issue_number,
          body: commentBody
        }, {
          allowLiveGitHub: this.allowLiveGitHub,
          fetchImpl: this.fetchImpl
        });
      }

      this.saveState();

      return {
        dedup_status: 'DUPLICATE_MERGED',
        ticket: existingTicket,
        occurrence: occurrenceRecord,
        triage,
        github_sync: githubSync,
        telegram_alert: null
      };
    } else {
      // NEW UNIQUE BUG
      const ticketId = this.idCounter++;
      const newTicket = {
        id: ticketId,
        title: triage.title,
        severity: triage.severity,
        component: triage.component,
        dedup_signature: triage.dedup_signature,
        summary: triage.summary,
        steps_to_reproduce: triage.steps_to_reproduce,
        suspected_root_cause: triage.suspected_root_cause,
        suggested_fix: triage.suggested_fix,
        labels: triage.labels,
        status: 'open',
        occurrence_count: 1,
        reporter: report.reporter,
        session_id: report.session_id,
        environment: report.environment,
        created_at: report.timestamp,
        last_seen_at: report.timestamp,
        correlated_logs: correlatedLogs,
        github_issue_number: null,
        github_url: null
      };

      occurrenceRecord.ticket_id = ticketId;
      this.occurrences.push(occurrenceRecord);

      // Sync Issue to GitHub
      const syncGitHub = reportInput.sync_github ?? true;
      let githubSync = null;

      if (syncGitHub) {
        const issueMarkdown = formatGitHubIssueMarkdown(newTicket);
        githubSync = await syncIssueToGitHub('create', {
          title: newTicket.title,
          body: issueMarkdown,
          labels: newTicket.labels
        }, {
          allowLiveGitHub: this.allowLiveGitHub,
          fetchImpl: this.fetchImpl
        });

        if (githubSync && githubSync.issue_number) {
          newTicket.github_issue_number = githubSync.issue_number;
          newTicket.github_url = githubSync.html_url;
        }
      }

      this.issues.set(ticketId, newTicket);
      this.saveState();

      // Telegram alert payload for P0/P1
      const isCritical = ['P0', 'P1'].includes(newTicket.severity);
      const telegramAlert = isCritical ? {
        chat_id: process.env.TELEGRAM_CHAT_ID || 'mock_dev_chat',
        text: `🚨 *[CRITICAL ${newTicket.severity}]* ${newTicket.title}\n\n• *Component:* \`${newTicket.component}\`\n• *Root Cause:* ${newTicket.suspected_root_cause}\n• *GitHub Issue:* ${newTicket.github_url || 'Simulated Issue #' + (newTicket.github_issue_number || 101)}`
      } : null;

      return {
        dedup_status: 'NEW_ISSUE',
        ticket: newTicket,
        occurrence: occurrenceRecord,
        triage,
        github_sync: githubSync,
        telegram_alert: telegramAlert
      };
    }
  }
}

function createTriageEngine(options) {
  return new TriageEngine(options);
}

module.exports = {
  TriageEngine,
  createTriageEngine
};
