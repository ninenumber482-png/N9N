#!/usr/bin/env python3
"""
NUMBER9 — Maintenance System (Production)
==========================================
Supabase REST API langsung — response ~300ms bukan 5-10 detik.

CLI:
  python scripts/maintenance.py on [message]
  python scripts/maintenance.py off
  python scripts/maintenance.py status

HTTP API (Ops-Key header required for write):
  GET  /status              — public
  POST /maintenance/on      — header Ops-Key
  POST /maintenance/off     — header Ops-Key
"""

import sys, os, json, datetime
from http.server import HTTPServer

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)
from api import supabase
from security import SecureHandler, sanitize_message, write_audit, OPS_API_KEY

# ── CLI ──────────────────────────────────────────────────────────────────────
def cmd_on(msg="Scheduled maintenance."):
    safe = sanitize_message(msg)
    supabase.set_config('maintenance_mode', 'true')
    supabase.set_config('maintenance_msg', safe)
    write_audit('MAINTENANCE_ON', 'CLI', msg[:100])
    print(f"🔧 Maintenance ENABLED — {safe[:60]}")

def cmd_off():
    supabase.set_config('maintenance_mode', 'false')
    write_audit('MAINTENANCE_OFF', 'CLI', '')
    print("✅ Maintenance DISABLED")

def cmd_status():
    mode = supabase.get_config('maintenance_mode') or 'false'
    msg = supabase.get_config('maintenance_msg') or ''
    if mode == 'true':
        print(f"🔧 MAINTENANCE: ON")
        if msg: print(f"   Message: {msg}")
    else:
        print("✅ MAINTENANCE: OFF")

# ── HTTP API (Secured) ───────────────────────────────────────────────────────
class MaintenanceAPI(SecureHandler):

    def do_GET(self):
        if self.path != '/status':
            self.send_error(404); return
        mode = supabase.get_config('maintenance_mode') or 'false'
        msg = supabase.get_config('maintenance_msg') or ''
        self.send_json({"maintenance": mode == 'true', "message": msg})

    def do_POST(self):
        if not self.verify_request():
            return
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        if self.path == '/maintenance/on':
            cmd_on(body.get('message', 'Maintenance via API'))
            self.send_json({"status": "maintenance_enabled"})
        elif self.path == '/maintenance/off':
            cmd_off()
            self.send_json({"status": "maintenance_disabled"})
        else:
            self.send_error(404)

def serve(port=9090):
    print(f"🛡️  Maintenance API (production — REST API direct)")
    print(f"    Port: {port}")
    print(f"    Response: ~300ms (was 5-10s via CLI)")
    server = HTTPServer(('0.0.0.0', port), MaintenanceAPI)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    cmd = sys.argv[1]
    {
        'on': lambda: cmd_on(' '.join(sys.argv[2:])),
        'off': cmd_off,
        'status': cmd_status,
        'serve': lambda: serve(int(sys.argv[2]) if len(sys.argv) > 2 else 9090),
    }[cmd]()
