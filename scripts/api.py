"""
NUMBER9 — Supabase REST API Client
====================================
Direct HTTP calls ke Supabase REST API.
~200ms per request, bukan 5-10 detik via CLI.

Usage:
    from api import supabase
    data = supabase.get('platform_config')
    supabase.rpc('daily_reconciliation', {'p_date': '2026-06-03'})
"""

import os, json, urllib.request, urllib.error, time

# ── Supabase Project Config ──────────────────────────────────────────────────
SUPABASE_URL = "https://dqsmpdetiqsqfnidekik.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxc21wZGV0aXFzcWZuaWRla2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjUyOTMsImV4cCI6MjA5NTY0MTI5M30.e429MImfeQcj3_DMbxkYHKD_5GS0ZwYD8QyZTaD0Lv0"

# ── Simple HTTP Client ───────────────────────────────────────────────────────
HEADERS = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}",
    "Content-Type": "application/json",
}

def _request(method, path, body=None, timeout=15):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method, headers=HEADERS)
    try:
        start = time.time()
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            elapsed = (time.time() - start) * 1000
            raw = resp.read().decode()
            result = json.loads(raw) if raw else []
            return result
    except urllib.error.HTTPError as e:
        err = e.read().decode()[:200] if e.fp else str(e)
        raise RuntimeError(f"HTTP {e.code}: {err}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Connection error: {e.reason}")

def _request_count(path, timeout=15):
    """GET with count=exact preference. Returns count."""
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    req = urllib.request.Request(url, method="GET", headers={**HEADERS, "Prefer": "count=exact"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            cr = resp.headers.get('content-range', '')
            return int(cr.split('/')[-1]) if '/' in cr else 0
    except urllib.error.HTTPError as e:
        err = e.read().decode()[:200] if e.fp else str(e)
        raise RuntimeError(f"HTTP {e.code}: {err}")

class SupabaseAPI:
    def get(self, table, query=""):
        path = f"{table}?{query}" if query else table
        return _request("GET", path)

    def count(self, table, query=""):
        path = f"{table}?{query}" if query else table
        return _request_count(path)

    def insert(self, table, data):
        return _request("POST", table, body=data)

    def update(self, table, query, data):
        path = f"{table}?{query}" if query else table
        return _request("PATCH", path, body=data)

    def rpc(self, name, params=None):
        path = f"rpc/{name}"
        return _request("POST", path, body=params or {})

    def get_config(self, key):
        rows = self.get("platform_config", f"key=eq.{key}&select=value")
        return rows[0]["value"] if rows else None

    def set_config(self, key, value):
        existing = self.get("platform_config", f"key=eq.{key}&select=id")
        if existing:
            self.update("platform_config", f"key=eq.{key}", {"value": value, "updated_at": "now()"})
        else:
            self.insert("platform_config", {"key": key, "value": value})

# ── Singleton ────────────────────────────────────────────────────────────────
supabase = SupabaseAPI()
