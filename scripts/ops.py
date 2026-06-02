#!/usr/bin/env python3
"""
NUMBER9 — Operations Toolkit (Production)
==========================================
Supabase REST API langsung — respons cepat.

Usage:
  python ops.py health          # Check all systems
  python ops.py reconcile       # Run reconciliation
  python ops.py pending         # Show pending deposits/WDs
  python ops.py users           # List active users
  python ops.py engine          # Engine status
  python ops.py metrics         # Show ops metrics
  python ops.py maintenance on  # Enable maintenance
  python ops.py maintenance off # Disable maintenance
"""

import sys, os, json
from datetime import datetime

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)
from api import supabase

NOW = datetime.now().strftime("%Y-%m-%d %H:%M WIB")

def cmd_health():
    print(f"\n{'='*50}")
    print(f"  NUMBER9 Health Check  —  {NOW}")
    print(f"{'='*50}")

    try:
        engine = supabase.get('engine_status', 'limit=1')
        s = engine[0]['engine_status'] if engine else 'UNKNOWN'
        print(f"  Engine:     {'🔴 STALLED' if s == 'STALLED' else '🟢 RUNNING' if s == 'RUNNING' else '⚪ ' + s}")
    except: print("  Engine:     ⚪ UNKNOWN")

    dp = supabase.count('transactions', "type=eq.DEPOSIT&status=eq.PENDING")
    wd = supabase.count('transactions', "type=eq.WITHDRAWAL&status=eq.PENDING")
    print(f"  Pending DP: {dp}")
    print(f"  Pending WD: {wd}")

    users = supabase.count('users', "role=eq.user")
    print(f"  Users:      {users}")

    mode = supabase.get_config('maintenance_mode') or 'false'
    print(f"  Maintenance: {'🔧 ON' if mode == 'true' else '🟢 OFF'}")
    print(f"{'='*50}\n")

def cmd_reconcile():
    r = supabase.rpc('daily_reconciliation')
    for row in r:
        print(f"{row['metric']}: {row['amount']}")

def cmd_pending():
    for t in ['DEPOSIT', 'WITHDRAWAL']:
        rows = supabase.get('transactions', f"type=eq.{t}&status=eq.PENDING&select=id,amount,created_at")
        print(f"\n{t} PENDING: {len(rows)}")
        for r in rows[:5]:
            print(f"  {r['amount']} — {r['created_at'][:16]}")

def cmd_users():
    rows = supabase.get('users', "role=eq.user&select=username,account_status,created_at&order=created_at.desc")
    for r in rows:
        print(f"{r['username']:12} {r['account_status']:8} {r['created_at'][:10]}")

def cmd_engine():
    rows = supabase.get('engine_status', 'limit=1')
    if rows:
        for k, v in rows[0].items():
            print(f"{k:20} {v}")
        if rows[0].get('engine_status') == 'STALLED':
            print("\n⚠️  ENGINE STALLED")

def cmd_metrics():
    rows = supabase.rpc('get_ops_metrics') if False else supabase.get('metrics', 'order=recorded_at.desc&limit=20')
    for r in rows[:10]:
        print(f"{r.get('metric_name','?'):30} {r.get('metric_value','?')}")

def cmd_maintenance(args):
    if not args: print("Usage: ops.py maintenance {on|off}"); return
    a = args[0]
    if a == 'on':
        msg = ' '.join(args[1:]) if len(args) > 1 else 'Maintenance'
        supabase.set_config('maintenance_mode', 'true')
        supabase.set_config('maintenance_msg', msg)
        print("🔧 Maintenance ENABLED")
    elif a == 'off':
        supabase.set_config('maintenance_mode', 'false')
        print("✅ Maintenance DISABLED")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    cmd = sys.argv[1]
    rest = sys.argv[2:]
    {
        'health': cmd_health, 'reconcile': cmd_reconcile,
        'pending': cmd_pending, 'users': cmd_users,
        'engine': cmd_engine, 'metrics': cmd_metrics,
        'maintenance': lambda: cmd_maintenance(rest),
    }.get(cmd, lambda: print(f"Unknown: {cmd}"))()
