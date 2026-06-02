"""
NUMBER9 — Python Service Security Module
=========================================
Lapisan keamanan untuk semua Python background services.

Usage:
    from security import SecureHandler, require_auth, sanitize

    class MyHandler(SecureHandler):
        def do_GET(self):
            self.send_json({"status": "ok"})

Features:
    - API Key authentication (Ops-Key header)
    - Rate limiting per IP (100 req/min)
    - IP blocklist
    - Input sanitization (SQL injection prevention)
    - Audit logging ke file
"""

import os, json, time, hashlib, hmac, datetime
from http.server import BaseHTTPRequestHandler
from functools import wraps

# ── Configuration ────────────────────────────────────────────────────────────
# Ganti ini dengan key yang aman. Simpan di environment variable.
OPS_API_KEY = os.environ.get('N9_OPS_API_KEY', 'n9-ops-default-change-me')

RATE_LIMIT = 100          # Max requests per window
RATE_WINDOW = 60          # Window in seconds

BLOCKLIST = set()         # IPs that are blocked
RATE_TRACKER = {}         # IP -> [timestamps]

AUDIT_LOG = "/home/hemo/WEBSITE/N9NY-tailwind-N9/logs/audit.log"

# ── Sanitization ────────────────────────────────────────────────────────────
def sanitize_sql(value):
    """Prevent SQL injection in values passed to supabase CLI."""
    if not isinstance(value, str):
        return str(value)
    # Remove dangerous characters for shell/SQL
    dangerous = ["'", '"', ';', '\\', '`', '$', '|', '&', '>', '<', '(', ')']
    for c in dangerous:
        value = value.replace(c, '')
    # Truncate to reasonable length
    return value[:200]

def sanitize_message(msg):
    """Sanitize maintenance message for SQL safety."""
    safe = msg.replace("'", "''")  # SQL escape
    safe = ''.join(c for c in safe if c.isprintable() or c in '\n ')
    return safe[:500]

# ── Rate Limiting ───────────────────────────────────────────────────────────
def check_rate_limit(ip):
    now = time.time()
    if ip in RATE_TRACKER:
        # Remove old entries
        RATE_TRACKER[ip] = [t for t in RATE_TRACKER[ip] if now - t < RATE_WINDOW]
        if len(RATE_TRACKER[ip]) >= RATE_LIMIT:
            return False
        RATE_TRACKER[ip].append(now)
    else:
        RATE_TRACKER[ip] = [now]
    return True

# ── Audit Logging ───────────────────────────────────────────────────────────
def write_audit(event, ip, detail=""):
    try:
        ts = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        line = f"[{ts}] {event} from {ip}: {detail}\n"
        with open(AUDIT_LOG, 'a') as f:
            f.write(line)
    except:
        pass

# ── Secure Base Handler ─────────────────────────────────────────────────────
class SecureHandler(BaseHTTPRequestHandler):
    """Base HTTP handler with auth, rate limiting, and audit."""

    def get_client_ip(self):
        ip = self.headers.get('X-Forwarded-For', self.client_address[0])
        return ip.split(',')[0].strip()

    def verify_request(self):
        ip = self.get_client_ip()

        # Blocklist check
        if ip in BLOCKLIST:
            write_audit('BLOCKED', ip, f"Blocklisted IP tried {self.path}")
            self.send_error(403, "Forbidden")
            return False

        # Rate limit check
        if not check_rate_limit(ip):
            write_audit('RATE_LIMITED', ip, f"Rate limit exceeded on {self.path}")
            self.send_error(429, "Too Many Requests")
            return False

        # API Key check (for ops endpoints)
        if self.path.startswith('/maintenance/'):
            key = self.headers.get('Ops-Key', '')
            if not hmac.compare_digest(key, OPS_API_KEY):
                write_audit('UNAUTHORIZED', ip, f"Invalid key on {self.path}")
                self.send_error(401, "Unauthorized")
                return False

        return True

    def send_json(self, data, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Ops-Key, Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_request(self, code='-', size='-'):
        ip = self.get_client_ip()
        write_audit('HTTP', ip, f"{self.command} {self.path} -> {code}")
        super().log_request(code, size)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Ops-Key, Content-Type')
        self.end_headers()
