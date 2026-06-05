import telebot, psutil, threading, os, subprocess, sys, time, datetime, random
from flask import Flask, jsonify, request, abort, make_response
from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton
import urllib.request, urllib.error, json

TOKEN      = os.environ.get('TELEGRAM_BOT_TOKEN', '8325821326:AAGgMPSnAgi8at8hbVLO43Dq-M25Q0VKHpY')
API_KEY    = os.environ.get('MONITOR_API_KEY', '362745')
ADMIN_IDS  = set(int(x) for x in os.environ.get('ADMIN_IDS', '').split(',') if x.strip())
GROUP_ID   = -5253285983

SUPABASE_URL = 'https://dqsmpdetiqsqfnidekik.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxc21wZGV0aXFzcWZuaWRla2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNjUyOTMsImV4cCI6MjA5NTY0MTI5M30.e429MImfeQcj3_DMbxkYHKD_5GS0ZwYD8QyZTaD0Lv0'

SESSION_SECS = 300  # 5 minutes, must match Angular SESSION_MS = 300_000

bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

# ── engine state ──────────────────────────────────────────────────────────────

_settled_cache = set()          # codes we've confirmed settled this run
_last_settlement_dt = None      # datetime.datetime or None

# ── helpers ───────────────────────────────────────────────────────────────────

def is_admin(uid):
    return not ADMIN_IDS or uid in ADMIN_IDS

def is_allowed_chat(cid):
    return cid == GROUP_ID or cid > 0

def supabase_get(table, filters=''):
    url = f'{SUPABASE_URL}/rest/v1/{table}?{filters}'
    req = urllib.request.Request(url, headers={
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
    })
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read())

def supabase_upsert(table, data):
    url = f'{SUPABASE_URL}/rest/v1/{table}'
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method='POST', headers={
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
    })
    with urllib.request.urlopen(req, timeout=8):
        pass

def supabase_rpc(func_name, params):
    url = f'{SUPABASE_URL}/rest/v1/rpc/{func_name}'
    body = json.dumps(params).encode()
    req = urllib.request.Request(url, data=body, method='POST', headers={
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        data = r.read()
        return json.loads(data) if data else None

def get_maintenance():
    rows = supabase_get('platform_config', 'key=eq.maintenance_mode&select=value')
    return rows[0]['value'] if rows else 'false'

def set_maintenance(val):
    supabase_upsert('platform_config', {'key': 'maintenance_mode', 'value': val})

def get_engine_status():
    rows = supabase_get('engine_status', 'limit=1')
    return rows[0] if rows else None

def get_king_marketplace():
    rows = supabase_get('platform_config', 'key=eq.king_marketplace&select=value')
    return rows[0]['value'] if rows else 'OPEN'

# ── 3D King engine ────────────────────────────────────────────────────────────

def roll_digits(bs=None, oe=None):
    """Random digits 0-9 each, constrained by BIG/SMALL (sum>=14/<=13) and ODD/EVEN."""
    for _ in range(500):
        d = [random.randint(0, 9) for _ in range(3)]
        total = sum(d)
        if bs == 'BIG'   and total < 14: continue
        if bs == 'SMALL' and total > 13: continue
        if oe == 'ODD'   and total % 2 == 0: continue
        if oe == 'EVEN'  and total % 2 == 1: continue
        return d
    return [random.randint(0, 9) for _ in range(3)]

def session_boundary(utc_dt: datetime.datetime) -> datetime.datetime:
    """UTC datetime rounded down to nearest 5-minute boundary."""
    m = (utc_dt.minute // 5) * 5
    return utc_dt.replace(minute=m, second=0, microsecond=0)

def king_engine_loop():
    global _settled_cache, _last_settlement_dt
    print('[ENGINE] King engine started — 24/7 server-side settlement')
    while True:
        try:
            now_utc   = datetime.datetime.now(datetime.timezone.utc)
            cur_bound = session_boundary(now_utc)

            # Sweep last 12 sessions (1 hour) for unsettled results.
            # Session code convention: END boundary time (matching pg_cron's king_engine_tick).
            # E.g. session 15:45-15:50 has code "202606051550" settled at 15:50.
            # settle_session RPC reads king_planned internally — admin BIG/SMALL overrides
            # set via Angular dashboard are respected automatically.
            for n in range(12):
                settle_time = cur_bound - datetime.timedelta(seconds=SESSION_SECS * n)
                if settle_time > now_utc:
                    continue  # boundary hasn't passed yet
                code = settle_time.strftime('%Y%m%d%H%M')
                if code in _settled_cache:
                    continue
                try:
                    if supabase_get('king_results', f'session_code=eq.{code}&select=session_code'):
                        _settled_cache.add(code)
                        continue
                    # Generate random digits; engine_settle (SECURITY DEFINER) calls
                    # settle_session which also checks king_planned for admin overrides
                    digits = roll_digits()
                    supabase_rpc('engine_settle', {
                        'p_api_key': API_KEY,
                        'p_code': code,
                        'p_d1': digits[0], 'p_d2': digits[1], 'p_d3': digits[2],
                    })
                    _settled_cache.add(code)
                    _last_settlement_dt = now_utc
                    print(f'[ENGINE] Settled  {code}: {digits}')
                except Exception as e:
                    print(f'[ENGINE] Settle err {code}: {e}')

            # Keep cache bounded (keep last 200 codes, ~17 hours)
            if len(_settled_cache) > 200:
                _settled_cache = set(sorted(_settled_cache)[-200:])

        except Exception as e:
            print(f'[ENGINE] Loop error: {e}')

        time.sleep(10)

# ── Flask /status ─────────────────────────────────────────────────────────────

@app.route('/status', methods=['GET'])
def flask_status():
    if request.headers.get('X-API-KEY') != API_KEY:
        abort(401)
    resp = make_response(jsonify({
        'cpu': psutil.cpu_percent(),
        'ram': psutil.virtual_memory().percent,
    }))
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp

# ── UI helpers ────────────────────────────────────────────────────────────────

def main_keyboard():
    kb = InlineKeyboardMarkup(row_width=2)
    kb.add(
        InlineKeyboardButton('📊 Status',            callback_data='status'),
        InlineKeyboardButton('📋 Logs',              callback_data='logs'),
        InlineKeyboardButton('🔧 Maintenance ON',    callback_data='maint_on'),
        InlineKeyboardButton('✅ Maintenance OFF',   callback_data='maint_off'),
        InlineKeyboardButton('ℹ️ Tech Info',         callback_data='info'),
        InlineKeyboardButton('🔄 Restart Bot',       callback_data='restart'),
    )
    return kb

TECH_INFO = (
    '🏗 *NUMBER9 Tech Stack*\n\n'
    '☁️ *Cloud Infrastructure*\n'
    '`AWS EC2` — Bot monitor & backend server\n\n'
    '🌐 *CDN & Edge*\n'
    '`Cloudflare Pages` — Hosting React & Angular\n'
    '`Cloudflare Workers` — API proxy (EC2 monitor)\n\n'
    '🗄 *Database & Realtime*\n'
    '`Supabase PostgreSQL` — Data platform\n'
    '`Supabase Realtime` — Live updates\n'
    '`Supabase RPC` — Atomic settlement functions\n\n'
    '⚛️ *Frontend*\n'
    '`React + Vite` — User betting app (app.mynumber9.uk)\n'
    '`Angular` — Admin dashboard (admin.mynumber9.uk)\n'
    '`Tailwind CSS` — Styling\n\n'
    '🤖 *Bot*\n'
    '`pyTelegramBotAPI` — Telegram control panel\n'
    '`Flask` — REST API server\n'
    '`psutil` — System monitoring'
)

# ── shared senders ────────────────────────────────────────────────────────────

def send_status(chat_id):
    cpu  = psutil.cpu_percent(interval=1)
    ram  = psutil.virtual_memory()
    disk = psutil.disk_usage('/')

    try:
        maint     = get_maintenance()
        maint_str = '🔴 ON (platform closed)' if maint == 'true' else '🟢 OFF (platform open)'
    except:
        maint_str = '❓ unknown'

    try:
        eng = get_engine_status()
        if eng:
            status  = eng.get('engine_status', '?')
            eng_str = '🟢 RUNNING' if status == 'RUNNING' else f'🔴 {status}'
            # Use last_result (view column) or last_settlement (older alias)
            last_ts = eng.get('last_result') or eng.get('last_settlement') or ''
            if last_ts:
                lr  = datetime.datetime.fromisoformat(last_ts.replace('Z', '+00:00'))
                if lr.tzinfo is None:
                    lr = lr.replace(tzinfo=datetime.timezone.utc)
                age = int((datetime.datetime.now(datetime.timezone.utc) - lr).total_seconds())
            elif _last_settlement_dt:
                age = int((datetime.datetime.now(datetime.timezone.utc) - _last_settlement_dt).total_seconds())
                last_ts = _last_settlement_dt.isoformat()
            else:
                age = '?'
            last_set = last_ts[:19].replace('T', ' ') if last_ts else '—'
            engine_block = (
                f'\n\n⚙️ *Engine Status*\n'
                f'Status:       `{eng_str}`\n'
                f'Last result:  `{age}s ago`\n'
                f'Last settle:  `{last_set}`'
            )
        else:
            engine_block = '\n\n⚙️ *Engine Status*\n`No data`'
    except Exception as e:
        engine_block = f'\n\n⚙️ *Engine Status*\n`Error: {e}`'

    try:
        market  = get_king_marketplace()
        mkt_str = '🟢 OPEN' if market == 'OPEN' else '🟡 CLOSED'
    except:
        mkt_str = '❓ unknown'

    text = (
        f'📊 *Server Status*\n\n'
        f'🖥 CPU:  `{cpu}%`\n'
        f'🧠 RAM:  `{ram.percent}%` ({ram.used//1024//1024}MB / {ram.total//1024//1024}MB)\n'
        f'💾 Disk: `{disk.percent}%` ({disk.used//1024//1024//1024}GB / {disk.total//1024//1024//1024}GB)\n\n'
        f'🔧 Maintenance: {maint_str}\n'
        f'🎮 Marketplace: {mkt_str}'
        f'{engine_block}'
    )
    bot.send_message(chat_id, text, parse_mode='Markdown', reply_markup=main_keyboard())

def send_logs(chat_id):
    try:
        result = subprocess.run(
            ['journalctl', '-n', '30', '--no-pager', '-u', 'bot_monitor'],
            capture_output=True, text=True, timeout=5
        )
        logs = result.stdout or result.stderr
    except:
        try:
            result = subprocess.run(
                ['tail', '-n', '30', '/var/log/syslog'],
                capture_output=True, text=True, timeout=5
            )
            logs = result.stdout
        except:
            logs = 'No logs available'
    logs = logs[-3000:] if len(logs) > 3000 else logs
    bot.send_message(chat_id, f'📋 *Recent Logs:*\n```\n{logs}\n```', parse_mode='Markdown')

# ── Telegram handlers ─────────────────────────────────────────────────────────

@bot.message_handler(commands=['start', 'menu'])
def cmd_start(msg):
    if not is_allowed_chat(msg.chat.id):
        return
    if is_admin(msg.from_user.id):
        bot.send_message(msg.chat.id, '🤖 *NUMBER9 Control Panel*',
                         parse_mode='Markdown', reply_markup=main_keyboard())
    else:
        bot.reply_to(msg,
            '🤖 *NUMBER9 Bot*\n\n`/ping` — cek bot\n`/status` — status server',
            parse_mode='Markdown')

@bot.message_handler(commands=['info'])
def cmd_info(msg):
    if not is_allowed_chat(msg.chat.id):
        return
    bot.send_message(msg.chat.id, TECH_INFO, parse_mode='Markdown')

@bot.message_handler(commands=['ping'])
def cmd_ping(msg):
    if not is_allowed_chat(msg.chat.id):
        return
    bot.reply_to(msg, '🟢 Bot online!')

@bot.message_handler(commands=['status'])
def cmd_status(msg):
    if not is_allowed_chat(msg.chat.id):
        return
    if is_admin(msg.from_user.id):
        send_status(msg.chat.id)
    else:
        cpu = psutil.cpu_percent(interval=1)
        ram = psutil.virtual_memory().percent
        try:
            maint     = get_maintenance()
            maint_str = '🔴 Maintenance (platform closed)' if maint == 'true' else '🟢 Platform open'
        except:
            maint_str = '❓ unknown'
        bot.reply_to(msg, f'📊 CPU: `{cpu}%` | RAM: `{ram}%`\n{maint_str}', parse_mode='Markdown')

@bot.message_handler(commands=['logs'])
def cmd_logs(msg):
    if not is_allowed_chat(msg.chat.id):
        return
    if not is_admin(msg.from_user.id):
        bot.reply_to(msg, '⛔ Admin only.')
        return
    send_logs(msg.chat.id)

@bot.message_handler(func=lambda m: m.new_chat_members is not None)
def on_new_member(msg):
    if msg.chat.id != GROUP_ID:
        return
    for member in msg.new_chat_members:
        if not member.is_bot:
            bot.send_message(msg.chat.id,
                f'👋 Selamat datang, *{member.first_name}*!\n'
                f'Ketik /ping untuk cek bot atau /status untuk lihat server.',
                parse_mode='Markdown')

# ── Callback buttons ──────────────────────────────────────────────────────────

@bot.callback_query_handler(func=lambda c: True)
def on_callback(call):
    if not is_admin(call.from_user.id):
        bot.answer_callback_query(call.id, '⛔ Admin only.')
        return

    bot.answer_callback_query(call.id)
    cid = call.message.chat.id

    if call.data == 'status':
        send_status(cid)

    elif call.data == 'logs':
        send_logs(cid)

    elif call.data == 'maint_on':
        try:
            set_maintenance('true')
            bot.send_message(cid, '🔴 *Maintenance ON* — platform closed.',
                             parse_mode='Markdown', reply_markup=main_keyboard())
        except Exception as e:
            bot.send_message(cid, f'❌ Failed: {e}')

    elif call.data == 'maint_off':
        try:
            set_maintenance('false')
            bot.send_message(cid, '✅ *Maintenance OFF* — platform open.',
                             parse_mode='Markdown', reply_markup=main_keyboard())
        except Exception as e:
            bot.send_message(cid, f'❌ Failed: {e}')

    elif call.data == 'info':
        bot.send_message(cid, TECH_INFO, parse_mode='Markdown')

    elif call.data == 'restart':
        bot.send_message(cid, '🔄 Restarting bot...')
        threading.Timer(1.5, lambda: os.execv(sys.executable, [sys.executable] + sys.argv)).start()

# ── Main ──────────────────────────────────────────────────────────────────────

def run_flask():
    app.run(host='0.0.0.0', port=5000)

if __name__ == '__main__':
    threading.Thread(target=run_flask, daemon=True).start()
    threading.Thread(target=king_engine_loop, daemon=True).start()
    print('Bot started.')
    bot.polling(none_stop=True)
