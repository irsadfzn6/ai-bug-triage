const { createTriageEngine } = require('../src/triage-engine');

async function runSimulation() {
  const allowLiveGitHub = process.argv.includes('--live-github');
  console.log('========================================================================');
  console.log(`🤖 Running AI Bug Triage CLI Simulator (Live GitHub: ${allowLiveGitHub})`);
  console.log('========================================================================\n');

  const engine = createTriageEngine({ allowLiveGitHub });

  // Scenario 1: P0 Voucher Crash
  console.log('📌 Scenario 1: Submitting initial user report for Voucher Crash (P0)...');
  const res1 = await engine.triageReport({
    reporter: 'rina.qa@kurodesk.id',
    session_id: 'sess_checkout_901',
    environment: 'production',
    description: 'Waktu saya coba masukkan kode voucher KARTINI26 di keranjang dan klik Bayar Sekarang, muncul error 500.',
    sync_github: true
  });

  console.log(`-> Status: ${res1.dedup_status}`);
  console.log(`-> Title: ${res1.ticket.title}`);
  console.log(`-> Severity: ${res1.ticket.severity}`);
  console.log(`-> Dedup Signature: ${res1.ticket.dedup_signature}`);
  console.log(`-> GitHub Issue: ${res1.ticket.github_url || 'Simulated'}\n`);

  // Scenario 2: Duplicate report by another user
  console.log('📌 Scenario 2: Submitting vague duplicate report from another user...');
  const res2 = await engine.triageReport({
    reporter: 'budi.santoso@gmail.com',
    session_id: 'sess_checkout_902',
    environment: 'production',
    description: 'Halo admin, aplikasi belanja error gak bisa bayar pas pakai voucher promo.',
    sync_github: true
  });

  console.log(`-> Status: ${res2.dedup_status} (Merged into Issue #${res2.ticket.id})`);
  console.log(`-> Total Occurrences: ${res2.ticket.occurrence_count}`);
  console.log(`-> GitHub Comment Synced: ${res2.github_sync?.html_url || 'Simulated'}\n`);

  // Scenario 3: Distinct Auth P1 Bug
  console.log('📌 Scenario 3: Submitting distinct Auth Bug (P1)...');
  const res3 = await engine.triageReport({
    reporter: 'kevin.devops@kurodesk.id',
    session_id: 'sess_auth_404',
    environment: 'staging',
    description: 'User sering mental session expired sesaat setelah login karena clock skew.',
    sync_github: true
  });

  console.log(`-> Status: ${res3.dedup_status}`);
  console.log(`-> Title: ${res3.ticket.title}`);
  console.log(`-> Severity: ${res3.ticket.severity}`);
  console.log(`-> GitHub Issue: ${res3.ticket.github_url || 'Simulated'}\n`);

  console.log('========================================================================');
  console.log('📊 Simulation Summary Stats:');
  console.log(JSON.stringify(engine.getStats(), null, 2));
  console.log('========================================================================\n');
}

if (require.main === module) {
  runSimulation().catch(err => {
    console.error('Simulation failed:', err);
    process.exit(1);
  });
}
