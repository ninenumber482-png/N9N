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

// Check both VITE_ prefix (from CI) and non-prefixed variants
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || currentUrl;
const supabaseKey = process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_KEY || currentKey;

const content = `export const environment = {
  production: true,
  supabaseUrl: '${supabaseUrl}',
  supabaseKey: '${supabaseKey}',
};
`;

writeFileSync(prodPath, content, 'utf-8');
console.log('[set-env] Generated environment.prod.ts');
console.log(`  SUPABASE_URL: ${supabaseUrl.slice(0, 20)}...`);
console.log(`  SUPABASE_KEY: ${supabaseKey.slice(0, 20)}...`);
