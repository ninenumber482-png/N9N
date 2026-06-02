#!/usr/bin/env python3
"""
NUMBER9 — Scheduler Service (APScheduler + REST API)
=====================================================
Usage:
    python scripts/scheduler.py              # Start daemon
    python scripts/scheduler.py --once       # Run all jobs once
"""

import sys, os
from datetime import datetime, timezone, timedelta

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)
from api import supabase
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

JAKARTA_TZ = timezone(timedelta(hours=7))

def job_reconciliation():
    print(f"\n[{datetime.now():%H:%M}] Reconciliation...")
    try:
        r = supabase.rpc('daily_reconciliation', {'p_date': str(datetime.now().date())})
        for row in r:
            print(f"  {row['metric']}: {row['amount']}")
        diff = [r for r in r if r['metric'] == 'difference']
        if diff and float(diff[0]['amount']) != 0:
            print("  ⚠️ LEDGER MISMATCH")
    except Exception as e:
        print(f"  ❌ {e}")

def job_snapshot():
    try:
        supabase.rpc('snapshot_pending_counts')
        print(f"  ✅ Pending snapshot [{datetime.now():%H:%M}]")
    except Exception as e:
        print(f"  ❌ snapshot: {e}")

def job_watchdog():
    try:
        eng = supabase.get('engine_status', 'limit=1')
        if eng and eng[0].get('engine_status') == 'STALLED':
            print(f"  ⚠️ ENGINE STALLED")
            supabase.insert('security_alerts', {
                'alert_type': 'ENGINE_STALL',
                'severity': 'critical',
                'description': 'Engine stalled — last result > 7 min ago',
            })
        else:
            print(f"  ✅ Engine OK [{datetime.now():%H:%M}]")
    except Exception as e:
        print(f"  ❌ watchdog: {e}")

def job_prune():
    try:
        supabase.rpc('king_engine_prune')
        print(f"  ✅ Prune done [{datetime.now():%H:%M}]")
    except Exception as e:
        print(f"  ❌ prune: {e}")

def run_once():
    print("=== Running all jobs once ===")
    for fn in [job_reconciliation, job_snapshot, job_watchdog, job_prune]:
        fn()

def start():
    sched = BlockingScheduler(timezone=JAKARTA_TZ)
    sched.add_job(job_reconciliation, CronTrigger(hour=3, minute=0), id='reconciliation')
    sched.add_job(job_snapshot, IntervalTrigger(minutes=5), id='snapshot')
    sched.add_job(job_watchdog, IntervalTrigger(minutes=5), id='watchdog')
    sched.add_job(job_prune, CronTrigger(hour=3, minute=17), id='prune')

    print(f"NUMBER9 Scheduler started @ {datetime.now():%Y-%m-%d %H:%M}")
    print("Jobs: reconciliation(03:00) snapshot(5m) watchdog(5m) prune(03:17)")
    try:
        sched.start()
    except KeyboardInterrupt:
        sched.shutdown()

if __name__ == '__main__':
    if '--once' in sys.argv:
        run_once()
    else:
        start()
