#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUPABASE_CLI="$(which supabase 2>/dev/null || echo '/home/hemo/.config/nvm/versions/node/v24.15.0/bin/supabase')"
PYTHON_BIN="$(which python3 2>/dev/null || echo '/usr/bin/python3')"

# ── Preflight (no sudo needed) ──────────────────────────────────────────────
echo "🔍 Preflight..."
$SUPABASE_CLI db query --linked "SELECT 1" >/dev/null 2>&1 || { echo "❌ supabase not linked"; exit 1; }
echo "  ✅ supabase"
for s in scheduler.py ops.py maintenance.py; do
  [ -f "$ROOT/scripts/$s" ] && echo "  ✅ $s" || echo "  ⚠️  $s not found"
done
echo "  ✅ python3: $($PYTHON_BIN --version 2>&1)"
$PYTHON_BIN -c "import apscheduler" 2>/dev/null && echo "  ✅ APScheduler" || echo "  ⚠️  APScheduler missing"
echo ""

# ── Write service files (sudo) ──────────────────────────────────────────────
echo "📦 Installing services..."
sudo tee /etc/systemd/system/number9-scheduler.service >/dev/null <<EOF
[Unit]
Description=NUMBER9 Scheduler
After=network.target
[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$ROOT
ExecStart=$PYTHON_BIN $ROOT/scripts/scheduler.py
Restart=always
RestartSec=10
[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/number9-ops-api.service >/dev/null <<EOF
[Unit]
Description=NUMBER9 Ops API
After=network.target
[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$ROOT
ExecStart=$PYTHON_BIN $ROOT/scripts/maintenance.py serve --port 9090
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload

echo "✅ Services installed."
echo ""
echo "Start:  systemctl enable --now number9-scheduler"
echo "        systemctl enable --now number9-ops-api"
echo ""
echo "Logs:   journalctl -u number9-scheduler -f"