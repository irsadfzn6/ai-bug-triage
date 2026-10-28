# AI Bug Report Triage, Semantic Deduplication & Automated Log Enrichment

A production-grade **AI Automation / Engineering Operations Pipeline** built with **DeepSeek v4.1 Flash**, **GitHub Issues REST API**, **Model Context Protocol (MCP)**, **n8n**, and **Node.js**.

This project solves three classic engineering bottlenecks:
1. **Vague End-User Bug Reports:** Translates messy complaints (*"aplikasinya error waktu klik bayar"*) into strict, actionable engineering tickets with reproduction steps and root cause hypotheses.
2. **Automated Server Log Correlation:** Automatically pulls matching production error logs and stack traces from the `±5 minute` window around the user's session without manual database grep.
3. **Semantic & Signature Deduplication (Zero Duplicate Flood):** Detects when multiple users report the same underlying issue, merges occurrences into a single canonical ticket, and appends a `+1 occurrence` comment to GitHub Issues instead of spamming developers with duplicate tickets.

---

## 🏗️ System Architecture

```
User / QA Bug Report (Web Console or n8n Webhook)
                     │
                     ▼
  [1. Log Correlator (src/log-correlator.js)]
         │   (Searches ±5m window by session_id/timestamp)
         ▼
  [2. DeepSeek v4.1 Flash Triage (api.aivokey.dev/v1)]
         │   (Extracts: Severity, Component, Dedup Signature, Fix Hypothesis)
         ▼
  [3. Deduplication Engine (src/triage-engine.js)]
      ├── If Unique: Creates new Issue in DB + GitHub Issues (Repo: irsadfzn6/ai-bug-triage)
      └── If Duplicate: Increments count + Appends comment to existing GitHub Issue
         │
         ▼
  [4. Multi-Channel Distribution]
      ├── GitHub Issues (Live REST Sync or Built-in Local Simulator)
      ├── Telegram Bot (Instant Alert for P0/P1 Outages)
      └── MCP Server (Exposes stdio JSON-RPC 2.0 tools for AI Coding Agents)
```

---

## 🚀 Quick Setup & Run

### 1. Jalankan Console Lokal (Port 3001)
```powershell
cd C:\Users\Dragon\Documents\antigravity\ai-bug-triage
npm start
```
Buka browser di **`http://localhost:3001`**.

### 2. Jalankan Automated Tests
```powershell
npm test
```
Seluruh pengujian unit dan integrasi berjalan menggunakan test runner bawaan Node.js (`node:test`).

### 3. Jalankan CLI Simulator (Uji Tembak Langsung)
```powershell
# Uji coba simulasi lokal
npm run simulate

# Uji coba tembak langsung ke Live GitHub Issues (irsadfzn6/ai-bug-triage)
node scripts/simulate-bug-reports.js --live-github
```

---

## 🛠️ Model Context Protocol (MCP) Integration

Proyek ini dilengkapi server MCP mandiri berstandar JSON-RPC 2.0 (`src/mcp-triage-server.js`) yang sudah terdaftar di Antigravity:

| MCP Tool | Deskripsi |
| :--- | :--- |
| `list_triaged_issues` | Mengambil daftar tiket bug aktif beserta signature deduplikasi dan jumlah kemunculan |
| `triage_bug_report` | Mengirim laporan bug bebas untuk dianalisis oleh DeepSeek & dicocokkan dengan log |
| `search_correlated_logs` | Mencari stack trace log server berdasarkan session ID atau kata kunci |
| `sync_issue_to_github` | Menyinkronkan tiket hasil analisis ke GitHub Issues |

---

## 📂 Struktur Repositori

- `server.js` — HTTP backend API dan static web console server.
- `public/` — Frontend web app anti-slop (HTML5, CSS3, Vanilla JS).
- `src/log-correlator.js` — Mesin pencari korelasi log server produksi (`±5m window`).
- `src/llm-client.js` — Client OpenAI-compatible DeepSeek v4.1 Flash dengan validasi schema ketat dan fallback deterministik.
- `src/github-bridge.js` — Adapter ganda (Live GitHub REST API + Local GitHub Simulator).
- `src/triage-engine.js` — Engine orkestrasi deduplikasi, severity grading, dan state manager.
- `src/mcp-triage-server.js` — Implementasi MCP Server (stdio) untuk agentic AI.
- `logs/production-errors.jsonl` — Dataset log error server produksi (Postgres deadlock, JWT skew, NullPointerException voucher).
- `sql/schema.sql` — Skema PostgreSQL / Supabase untuk persistensi tiket dan lock deduplikasi.
- `workflows/ai-bug-triage.json` — Workflow n8n siap import untuk orkestrasi no-code.
- `tests/` — Automated test suite (`node:test`).
