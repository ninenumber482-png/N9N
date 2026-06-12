/** User app edge guard — block source/repo paths (no IP gate). */

function normalizePath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return null;
  let path = rawPath.split('?')[0].split('#')[0];
  for (let i = 0; i < 4; i++) {
    try {
      const next = decodeURIComponent(path);
      if (next === path) break;
      path = next;
    } catch {
      return null;
    }
  }
  if (/[\0\\]/.test(path)) return null;
  const lower = path.toLowerCase();
  if (lower.includes('..')) return null;
  return lower.startsWith('/') ? lower : `/${lower}`;
}

function isBlockedSourcePath(rawPath) {
  const path = normalizePath(rawPath);
  if (!path) return true;
  const blocked = [
    /\.map$/,
    /\.ts$/,
    /\.tsx$/,
    /\.mts$/,
    /\.cts$/,
    /\.sql$/,
    /\.env$/,
    /\.env\./,
    /package-lock\.json$/,
    /package\.json$/,
    /tsconfig.*\.json$/,
    /angular\.json$/,
    /vite\.config/,
    /wrangler\.toml$/,
    /^\/src(\/|$)/,
    /^\/supabase(\/|$)/,
    /^\/number9(\/|$)/,
    /\/node_modules(\/|$)/,
    /\/\.git(\/|$)/,
    /\/\.cursor(\/|$)/,
    /\/\.vscode(\/|$)/,
    /\/dist\//,
    /claude\.md$/,
    /agents\.md$/,
  ];
  return blocked.some((re) => re.test(path));
}

function blockedPathResponse() {
  return new Response('Not Found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (isBlockedSourcePath(url.pathname)) {
      return blockedPathResponse();
    }
    return env.ASSETS.fetch(request);
  },
};
