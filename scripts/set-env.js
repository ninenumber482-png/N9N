/**
 * Generate environment.prod.ts from environment variables at build time.
 * Used by Cloudflare Pages to inject secrets during build.
 *
 * Usage: node scripts/set-env.js
 *
 * Env vars (checked in order of precedence):
 *   VITE_SUPABASE_URL  / SUPABASE_URL       (CI provides VITE_ prefix)
 *   VITE_SUPABASE_KEY  / SUPABASE_KEY       (CI provides VITE_ prefix)
 *   Defaults to current values in environment.prod.ts if not set
 */

const { readFileSync, writeFileSync } = require('fs');
const { resolve } = require('path');

// Read existing to preserve defaults
const prodPath = resolve(__dirname, '../src/environments/environment.prod.ts');
const existing = readFileSync(prodPath, 'utf-8');

const currentUrl = existing.match(/supabaseUrl:\s*'([^']+)'/)?.[1] || '';
const currentKey = existing.match(/supabaseKey:\s*'([^']+)'/)?.[1] || '';
const currentMonitor = existing.match(/serverMonitorUrl:\s*'([^']+)'/)?.[1] || '';

// Check both VITE_ prefix (from CI) and non-prefixed variants
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || currentUrl;
const supabaseKey = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_KEY || currentKey;
// serverMonitorUrl is consumed by system.component.ts; must be present in prod env
// or the production build fails with TS2339. Preserve existing, allow env override,
// fall back to the known worker URL.
const serverMonitorUrl =
  process.env.VITE_SERVER_MONITOR_URL ||
  process.env.SERVER_MONITOR_URL ||
  currentMonitor ||
  'https://server-monitor.ninenumber482.workers.dev';

// Build version stamp (auto — no manual bump needed)
const { execSync } = require('child_process');
const pkgVersion = require('../package.json').version || '0.0.0';
let buildHash = 'dev';
try {
  buildHash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {
  buildHash = (process.env.CF_PAGES_COMMIT_SHA || 'dev').slice(0, 7);
}
const buildTime = new Date().toISOString();

const content = `export const environment = {
  production: true,
  supabaseUrl: '${supabaseUrl}',
  supabaseKey: '${supabaseKey}',
  serverMonitorUrl: '${serverMonitorUrl}',
  appVersion: '${pkgVersion}',
  buildHash: '${buildHash}',
  buildTime: '${buildTime}',
};
`;

writeFileSync(prodPath, content, 'utf-8');
console.log('[set-env] Generated environment.prod.ts');
console.log(`  SUPABASE_URL: ${supabaseUrl.slice(0, 20)}...`);
console.log(`  SUPABASE_KEY: ${supabaseKey.slice(0, 20)}...`);
console.log(`  VERSION: v${pkgVersion} · ${buildHash} · ${buildTime}`);
