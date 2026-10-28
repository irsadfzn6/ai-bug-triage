const fs = require('node:fs');
const path = require('node:path');

function loadEnv(envPath) {
  const targetPath = envPath || path.join(process.cwd(), '.env');
  const result = {};

  if (!fs.existsSync(targetPath)) {
    return result;
  }

  const content = fs.readFileSync(targetPath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let val = line.slice(eqIndex + 1).trim();

    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    result[key] = val;
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }

  return result;
}

module.exports = { loadEnv };
