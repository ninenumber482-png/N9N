/**
 * Generate environment.prod.ts from environment variables at build time.
 * Used by Cloudflare Pages to inject secrets during build.
 *
 * Usage: node scripts/set-env.js
 *
 * Env vars:
 *   SUPABASE_URL    (default: current value in environment.prod.ts)
 *   SUPABASE_KEY    (default: current value in environment.prod.ts)
 */

const { readFileSync, writeFileSync } = require('fs');
const { resolve } = require('path');

// Read existing to preserve defaults
const prodPath = resolve(__dirname, '../src/environments/environment.prod.ts');
const existing = readFileSync(prodPath, 'utf-8');

const currentUrl = existing.match(/supabaseUrl:\s*'([^']+)'/)?.[1] || '';
const currentKey = existing.match(/supabaseKey:\s*'([^']+)'/)?.[1] || '';

const supabaseUrl = process.env.SUPABASE_URL || currentUrl;
const supabaseKey = process.env.SUPABASE_KEY || currentKey;

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
