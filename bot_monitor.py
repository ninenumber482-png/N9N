import telebot, psutil, threading, os, subprocess, sys, time, datetime, random
from flask import Flask, jsonify, request, abort, make_response
from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton
import urllib.request, urllib.error, json

TOKEN      = os.environ['TELEGRAM_BOT_TOKEN']  # MUST be set in env
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

# ── Angular-style sessions helpers ────────────────────────────────────────────

def utc_to_wib_code(code):
    dt = datetime.datetime.strptime(code, '%Y%m%d%H%M').replace(tzinfo=datetime.timezone.utc)
    wib = dt + datetime.timedelta(hours=7)
    return f'N9K-{wib.strftime("%Y%m%d%H%M")}'

def utc_to_wib_str(code):
    dt = datetime.datetime.strptime(code, '%Y%m%d%H%M').replace(tzinfo=datetime.timezone.utc)
    wib = dt + datetime.timedelta(hours=7)
    return wib.strftime('%Y-%m-%d %H:%M')

def derive_bs_oe(d1, d2, d3):
    t = d1 + d2 + d3
    bs = 'BIG' if t >= 14 else 'SMALL'
    oe = 'ODD' if t % 2 == 1 else 'EVEN'
    return bs, oe, t

def fmt_timer(secs):
    if secs < 0:
        secs = 0
    return f'{int(secs)//60:02d}:{int(secs)%60:02d}'

def get_session_info():
    now = datetime.datetime.now(datetime.timezone.utc)
    cur_bound = session_boundary(now)
    cur_code = cur_bound.strftime('%Y%m%d%H%M')
    secs_in = (now - cur_bound).total_seconds()
    remain = SESSION_SECS - secs_in
    status = 'OPEN' if remain > 0 else 'LOCKED'

    planned = {}
    try:
        for row in supabase_get('king_planned', 'order=session_code.asc&limit=20'):
            planned[row['session_code']] = (row.get('d1'), row.get('d2'), row.get('d3'))
    except:
        pass

    upcoming = []
    for i in range(1, 11):
        s = cur_bound + datetime.timedelta(seconds=SESSION_SECS * i)
        code = s.strftime('%Y%m%d%H%M')
        p = planned.get(code)
        upcoming.append({'code': code, 'd1': p[0] if p else None, 'd2': p[1] if p else None, 'd3': p[2] if p else None})

    last_results = []
    try:
        rows = supabase_get('king_results', 'order=session_code.desc&limit=6&select=session_code,d1,d2,d3')
        for r in rows:
            last_results.append(r)
    except:
        pass

    return {'code': cur_code, 'status': status, 'remain': remain, 'secs_in': secs_in,
            'upcoming': upcoming, 'last_results': last_results, 'planned': planned}

def get_platform_stats():
    try:
        users = supabase_get('users', 'select=id,role&limit=1000')
        total = len(users)
        admins = sum(1 for u in users if u.get('role') == 'admin')
        members = total - admins
    except:
        total = admins = members = '?'
    try:
        bets = supabase_get('bets', 'select=id&limit=1000')
        total_bets = len(bets)
    except:
        total_bets = '?'
    try:
        tx = supabase_get('transactions', 'select=id,type,status&limit=1000')
        total_tx = len(tx)
        pending = sum(1 for t in tx if t.get('status') == 'PENDING')
    except:
        total_tx = pending = '?'
    return {'users': total, 'admins': admins, 'members': members, 'bets': total_bets, 'tx': total_tx, 'pending': pending}

# ── 3D King engine ────────────────────────────────────────────────────────────

def roll_digits(bs=None, oe=None):
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
    m = (utc_dt.minute // 5) * 5
    return utc_dt.replace(minute=m, second=0, microsecond=0)

def king_engine_loop():
    global _settled_cache, _last_settlement_dt
    print('[ENGINE] King engine started — 24/7 server-side settlement')
    while True:
        try:
            now_utc   = datetime.datetime.now(datetime.timezone.utc)
            cur_bound = session_boundary(now_utc)

            for n in range(12):
                settle_time = cur_bound - datetime.timedelta(seconds=SESSION_SECS * n)
                if settle_time > now_utc:
                    continue
                code = settle_time.strftime('%Y%m%d%H%M')
                if code in _settled_cache:
                    continue
                try:
                    if supabase_get('king_results', f'session_code=eq.{code}&select=session_code'):
                        _settled_cache.add(code)
                        continue
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
        InlineKeyboardButton('📊 Status',           callback_data='status'),
        InlineKeyboardButton('📊 Stats',            callback_data='stats'),
        InlineKeyboardButton('🎲 Sessions',         callback_data='sessions'),
        InlineKeyboardButton('📋 Logs',             callback_data='logs'),
        InlineKeyboardButton('🔄 Sync',             callback_data='sync'),
        InlineKeyboardButton('🔧 Maintenance ON',   callback_data='maint_on'),
        InlineKeyboardButton('✅ Maintenance OFF',  callback_data='maint_off'),
        InlineKeyboardButton('📢 Broadcast',        callback_data='broadcast'),
        InlineKeyboardButton('ℹ️ Tech Info',        callback_data='info'),
        InlineKeyboardButton('🔄 Restart Bot',      callback_data='restart'),
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
            last_ts = eng.get('last_result') or eng.get('last_settlement') or ''
            if last_ts:
                lr  = datetime.datetime.fromisoformat(last_ts.replace('Z', '+00:00'))
                if lr.tzinfo is None:
                    lr = lr.replace(tzinfo=datetime.timezone.utc)
                age = int((datetime.datetime.now(datetime.timezone.utc) - lr).total_seconds())
                lr_wib = lr + datetime.timedelta(hours=7)
                last_set = lr_wib.strftime('%Y-%m-%d %H:%M:%S WIB')
            elif _last_settlement_dt:
                age = int((datetime.datetime.now(datetime.timezone.utc) - _last_settlement_dt).total_seconds())
                lr_wib = _last_settlement_dt + datetime.timedelta(hours=7)
                last_set = lr_wib.strftime('%Y-%m-%d %H:%M:%S WIB')
            else:
                age = '?'
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

def send_stats(chat_id):
    try:
        s = get_platform_stats()
        u = s['users']; a = s['admins']; m = s['members']
        b = s['bets']; t = s['tx']; p = s['pending']
        text = (
            '📊 *Platform Statistics*\n\n'
            f'👥 Total Users:  `{u}`\n'
            f'   Admin: `{a}` | Member: `{m}`\n'
            f'🎲 Total Bets:   `{b}`\n'
            f'💳 Transactions: `{t}` (Pending: `{p}`)\n'
        )
        bot.send_message(chat_id, text, parse_mode='Markdown', reply_markup=main_keyboard())
    except Exception as e:
        bot.send_message(chat_id, '❌ Stats error: %s' % e)

def send_sessions(chat_id):
    try:
        s = get_session_info()
    except Exception as e:
        bot.send_message(chat_id, f'❌ Sessions error: {e}')
        return

    c = s['code']; cs = s['status']; cv = s['remain']
    icon = '🟢' if cs == 'OPEN' else '🔴'
    timer = fmt_timer(cv)

    planned = s['planned']

    lines = [
        f'🎲 *3D King* ({(datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=7)).strftime("%H:%M WIB")})',
        '\u2501' * 25,
        f'{icon} `{utc_to_wib_code(c)}`  `{utc_to_wib_str(c)}`  `{cs}`  `{timer}`',
    ]
    p = planned.get(c)
    if p:
        bs, oe, t = derive_bs_oe(p[0], p[1], p[2])
        lines.append(f'   {p[0]} {p[1]} {p[2]}  N9:{t}  {bs}  {oe}')
    else:
        lines.append(f'   —  —  —')

    lines.extend(['', '📜 *Hasil Terakhir:*'])
    for r in s['last_results']:
        rc = r['session_code']
        d1, d2, d3 = r.get('d1', 0), r.get('d2', 0), r.get('d3', 0)
        bs, oe, t = derive_bs_oe(d1, d2, d3)
        lines.append(f'  `{utc_to_wib_code(rc)}` `{utc_to_wib_str(rc)}`  {d1} {d2} {d3}  {bs} {oe}  N9:{t}')

    lines.extend(['', '🔜 *Next:*'])
    for i, u in enumerate(s['upcoming'][:10], 1):
        ud = planned.get(u['code'])
        if ud:
            bs, oe, t = derive_bs_oe(ud[0], ud[1], ud[2])
            lines.append(f'  {i}. `{utc_to_wib_code(u["code"])}` `{utc_to_wib_str(u["code"])}`  {ud[0]} {ud[1]} {ud[2]}  {bs} {oe}  N9:{t}')
        else:
            lines.append(f'  {i}. `{utc_to_wib_code(u["code"])}` `{utc_to_wib_str(u["code"])}`')

    bot.send_message(chat_id, '\n'.join(lines), parse_mode='Markdown', reply_markup=main_keyboard())

# ── Broadcast state ───────────────────────────────────────────────────────────

# Store admin user IDs who are in "broadcast mode" (awaiting message text)
_broadcast_sessions = set()

def cancel_broadcast(uid):
    _broadcast_sessions.discard(uid)

# ── Telegram handlers ─────────────────────────────────────────────────────────

@bot.message_handler(commands=['start', 'menu'])
def cmd_start(msg):
    if not is_allowed_chat(msg.chat.id):
        return
    if is_admin(msg.from_user.id):
        bot.send_message(msg.chat.id, '🤖 *NUMBER9 Control Panel*\n\n'
                         '`/broadcast` — Kirim pengumuman ke grup\n'
                         '`/sync` — Sinkronkan data terbaru\n'
                         '`/stats` — Statistik platform',
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

@bot.message_handler(commands=['stats'])
def cmd_stats(msg):
    if not is_allowed_chat(msg.chat.id):
        return
    if not is_admin(msg.from_user.id):
        bot.reply_to(msg, '⛔ Admin only.')
        return
    send_stats(msg.chat.id)

@bot.message_handler(commands=['sessions'])
def cmd_sessions(msg):
    if not is_allowed_chat(msg.chat.id):
        return
    if not is_admin(msg.from_user.id):
        bot.reply_to(msg, '⛔ Admin only.')
        return
    send_sessions(msg.chat.id)

@bot.message_handler(commands=['broadcast'])
def cmd_broadcast(msg):
    if not is_allowed_chat(msg.chat.id):
        return
    if not is_admin(msg.from_user.id):
        bot.reply_to(msg, '⛔ Admin only.')
        return

    text = msg.text[len('/broadcast'):].strip()
    if text:
        # Send directly if message is included in command
        bot.send_message(GROUP_ID,
            f'📢 *Pengumuman*\n\n{text}',
            parse_mode='Markdown')
        bot.reply_to(msg, '✅ Broadcast terkirim ke grup.')
    else:
        # Enter broadcast mode — next message will be broadcast
        _broadcast_sessions.add(msg.from_user.id)
        bot.reply_to(msg,
            '📢 *Mode Broadcast*\n\n'
            'Ketik pesan yang ingin dikirim ke grup.\n'
            'Atau ketik `/cancel` untuk membatalkan.',
            parse_mode='Markdown')

@bot.message_handler(commands=['cancel'])
def cmd_cancel(msg):
    if msg.from_user.id in _broadcast_sessions:
        cancel_broadcast(msg.from_user.id)
        bot.reply_to(msg, '❌ Broadcast dibatalkan.')
    else:
        bot.reply_to(msg, 'Tidak ada sesi broadcast aktif.')

@bot.message_handler(commands=['sync'])
def cmd_sync(msg):
    if not is_allowed_chat(msg.chat.id):
        return
    if not is_admin(msg.from_user.id):
        bot.reply_to(msg, '⛔ Admin only.')
        return

    # Clear engine cache so it refetches
    global _settled_cache
    _settled_cache.clear()

    # Fetch fresh platform data
    try:
        maint     = get_maintenance()
        maint_str = '🔴 ON' if maint == 'true' else '🟢 OFF'
    except:
        maint_str = '❓'

    try:
        eng = get_engine_status()
        es = '🟢 RUNNING' if eng and eng.get('engine_status') == 'RUNNING' else '🔴 ?'
    except:
        es = '❓'

    try:
        market  = get_king_marketplace()
        mkt_str = '🟢 OPEN' if market == 'OPEN' else '🟡 CLOSED'
    except:
        mkt_str = '❓'

    try:
        s = get_platform_stats()
        stats_line = f'👥 {s["users"]} users | 🎲 {s["bets"]} bets | 💳 {s["tx"]} tx'
    except:
        stats_line = 'Stats unavailable'

    now = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=7)).strftime('%H:%M:%S WIB')
    text = (
        f'🔄 *Sync Completed* `{now}`\n\n'
        f'🔧 Maintenance: {maint_str}\n'
        f'🎮 Marketplace: {mkt_str}\n'
        f'⚙️ Engine:      {es}\n\n'
        f'{stats_line}\n\n'
        f'_Cache cleared, data refreshed._'
    )
    bot.send_message(msg.chat.id, text, parse_mode='Markdown', reply_markup=main_keyboard())

@bot.message_handler(func=lambda m: True)
def handle_broadcast_message(msg):
    """If user is in broadcast mode, send their message to the group."""
    if msg.from_user.id in _broadcast_sessions:
        cancel_broadcast(msg.from_user.id)
        bot.send_message(GROUP_ID,
            f'📢 *Pengumuman*\n\n{msg.text}',
            parse_mode='Markdown')
        bot.reply_to(msg, '✅ Broadcast terkirim ke grup.')

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

    elif call.data == 'stats':
        send_stats(cid)

    elif call.data == 'sync':
        # Re-trigger the sync command logic
        global _settled_cache
        _settled_cache.clear()
        try:
            maint     = get_maintenance()
            maint_str = '🔴 ON' if maint == 'true' else '🟢 OFF'
        except:
            maint_str = '❓'
        try:
            eng = get_engine_status()
            es = '🟢 RUNNING' if eng and eng.get('engine_status') == 'RUNNING' else '🔴 ?'
        except:
            es = '❓'
        try:
            market  = get_king_marketplace()
            mkt_str = '🟢 OPEN' if market == 'OPEN' else '🟡 CLOSED'
        except:
            mkt_str = '❓'
        try:
            s = get_platform_stats()
            stats_line = f'👥 {s["users"]} users | 🎲 {s["bets"]} bets | 💳 {s["tx"]} tx'
        except:
            stats_line = 'Stats unavailable'
        now = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=7)).strftime('%H:%M:%S WIB')
        bot.send_message(cid,
            f'🔄 *Sync Completed* `{now}`\n\n'
            f'🔧 Maintenance: {maint_str}\n'
            f'🎮 Marketplace: {mkt_str}\n'
            f'⚙️ Engine:      {es}\n\n'
            f'{stats_line}\n\n'
            f'_Cache cleared, data refreshed._',
            parse_mode='Markdown', reply_markup=main_keyboard())

    elif call.data == 'broadcast':
        _broadcast_sessions.add(call.from_user.id)
        bot.send_message(cid,
            '📢 *Mode Broadcast*\n\n'
            'Ketik pesan yang ingin dikirim ke grup.\n'
            'Atau ketik /cancel untuk membatalkan.',
            parse_mode='Markdown', reply_markup=main_keyboard())

    elif call.data == 'sessions':
        send_sessions(cid)

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
