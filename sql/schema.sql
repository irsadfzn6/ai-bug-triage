-- =========================================================================
-- AI Bug Report Triage & Deduplication Schema (PostgreSQL / Supabase)
-- =========================================================================

CREATE TABLE IF NOT EXISTS bug_tickets (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('P0', 'P1', 'P2', 'P3')),
    component VARCHAR(50) NOT NULL,
    dedup_signature VARCHAR(100) NOT NULL,
    summary TEXT NOT NULL,
    steps_to_reproduce JSONB DEFAULT '[]'::jsonb,
    suspected_root_cause TEXT,
    suggested_fix TEXT,
    labels JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'triaged', 'in_progress', 'resolved', 'closed')),
    occurrence_count INTEGER DEFAULT 1,
    reporter VARCHAR(100),
    session_id VARCHAR(100),
    environment VARCHAR(50) DEFAULT 'production',
    github_issue_number INTEGER,
    github_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index for active open issues by dedup_signature (Deduplication Lock)
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_dedup_sig 
ON bug_tickets (LOWER(dedup_signature)) 
WHERE status != 'closed';

CREATE TABLE IF NOT EXISTS bug_occurrences (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES bug_tickets(id) ON DELETE CASCADE,
    reporter VARCHAR(100),
    session_id VARCHAR(100),
    description TEXT NOT NULL,
    reported_at TIMESTAMPTZ DEFAULT NOW(),
    triage_signature VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS server_error_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    level VARCHAR(10) NOT NULL,
    service VARCHAR(50) NOT NULL,
    error_code VARCHAR(100) NOT NULL,
    session_id VARCHAR(100),
    request_id VARCHAR(100),
    http_status INTEGER,
    path TEXT,
    message TEXT,
    stack_trace TEXT
);
