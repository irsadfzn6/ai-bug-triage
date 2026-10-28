const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_LOG_FILE = path.join(__dirname, '..', 'logs', 'production-errors.jsonl');

function parseLogEntries(filePath) {
  const target = filePath || DEFAULT_LOG_FILE;
  if (!fs.existsSync(target)) return [];

  const raw = fs.readFileSync(target, 'utf8');
  const lines = raw.split(/\r?\n/).filter(line => line.trim().length > 0);
  const entries = [];

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip invalid lines cleanly
    }
  }

  return entries;
}

function correlateLogs(options = {}) {
  const {
    session_id,
    timestamp,
    keywords = [],
    windowMinutes = 5,
    logFilePath
  } = options;

  const allEntries = parseLogEntries(logFilePath);
  if (allEntries.length === 0) return [];

  // 1. If session_id is provided, prioritize exact match
  if (session_id) {
    const sessionMatches = allEntries.filter(e => e.session_id === session_id);
    if (sessionMatches.length > 0) {
      return sessionMatches;
    }
  }

  // 2. If timestamp is provided, filter within windowMinutes
  let candidateEntries = allEntries;
  if (timestamp) {
    const targetTime = new Date(timestamp).getTime();
    if (!Number.isNaN(targetTime)) {
      const windowMs = windowMinutes * 60 * 1000;
      candidateEntries = allEntries.filter(e => {
        const entryTime = new Date(e.timestamp).getTime();
        return Math.abs(entryTime - targetTime) <= windowMs;
      });
    }
  }

  // 3. Keyword matching across error message, stack trace, service, and error_code
  if (keywords.length > 0) {
    const lowerKeywords = keywords.map(k => String(k).toLowerCase());
    const matched = candidateEntries.filter(entry => {
      const corpus = [
        entry.service || '',
        entry.error_code || '',
        entry.message || '',
        entry.path || '',
        entry.stack_trace || ''
      ].join(' ').toLowerCase();

      return lowerKeywords.some(kw => corpus.includes(kw));
    });

    if (matched.length > 0) {
      return matched;
    }
  }

  // If no session_id matched, no keywords matched, or window was empty
  if (session_id && !timestamp) return [];
  if (keywords.length > 0) return [];

  return candidateEntries;
}

module.exports = {
  correlateLogs,
  parseLogEntries
};
