# 🖥️ Server Monitor Widget Architecture

## Overview
Real-time EC2 server monitoring widget di Angular Admin Dashboard menggunakan Cloudflare Worker sebagai proxy.

---

## 🏗️ **System Architecture**

```
┌─────────────────────────────────────────────────────────────────┐
│                     Angular Admin Dashboard                      │
│                  (https://admin.mynumber9.uk)                    │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ SystemComponent (system.component.ts)                      │ │
│  │                                                             │ │
│  │  • Polling interval: 5 seconds                             │ │
│  │  • Auto-refresh on ngOnInit                                │ │
│  │  • Cleanup on ngOnDestroy                                  │ │
│  │  • Display: CPU/RAM with progress bars                     │ │
│  └────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬─────────────────────────────────┘
                                │ fetch()
                                │ GET request every 5s
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Cloudflare Worker                           │
│        (https://server-monitor.ninenumber482.workers.dev)        │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ server-monitor.js                                          │ │
│  │                                                             │ │
│  │  • CORS: Allow admin.mynumber9.uk                          │ │
│  │  • Timeout: 5 seconds                                      │ │
│  │  • Adds X-API-KEY header                                   │ │
│  │  • Returns JSON: { cpu, ram }                              │ │
│  └────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬─────────────────────────────────┘
                                │ fetch() + X-API-KEY
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         EC2 Instance                             │
│       (ec2-107-22-51-206.compute-1.amazonaws.com:5000)           │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Flask Server (bot_monitor.py)                              │ │
│  │                                                             │ │
│  │  Route: GET /status                                        │ │
│  │  Auth: X-API-KEY header validation                         │ │
│  │  Returns: { cpu: float, ram: float }                       │ │
│  │  Uses: psutil library                                      │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 **Components**

### 1. Angular Frontend (system.component.ts)

**Location:** `src/app/modules/dashboard/pages/system/system.component.ts`

**Key Features:**
- ✅ Auto-refresh every 5 seconds
- ✅ Visual progress bars with color coding
- ✅ Online/Offline status indicator
- ✅ Graceful error handling

**Implementation:**
```typescript
export class SystemComponent implements OnInit, OnDestroy {
  serverData: { cpu: number; ram: number } | null = null;
  serverStatus: 'loading' | 'online' | 'offline' = 'loading';
  private serverPollTimer: any;

  ngOnInit() {
    this.pollServer();
    this.serverPollTimer = setInterval(() => this.pollServer(), 5000);
  }

  ngOnDestroy() {
    clearInterval(this.serverPollTimer);
  }

  private async pollServer() {
    try {
      const res = await fetch(SERVER_MONITOR_URL);
      if (!res.ok) throw new Error('upstream');
      const data = await res.json();
      this.serverData = data;
      this.serverStatus = 'online';
    } catch {
      this.serverStatus = 'offline';
      this.serverData = null;
    }
    this.cdr.markForCheck();
  }
}
```

**UI Template:**
```html
<div class="bg-card border border-border rounded-lg">
  <div class="flex items-center justify-between border-b border-border px-4 py-3">
    <h3 class="text-sm font-medium text-foreground">EC2 Server Monitor</h3>
    <span class="flex items-center gap-1.5 text-[11px]"
      [class.text-green-500]="serverStatus === 'online'">
      <span class="inline-block w-1.5 h-1.5 rounded-full bg-green-500"></span>
      Online
    </span>
  </div>
  <div class="p-4">
    <div class="grid grid-cols-2 gap-4 text-[11px]">
      <div>
        <p class="text-muted-foreground mb-1">CPU Usage</p>
        <p class="font-mono text-foreground text-base font-semibold">
          {{ serverData.cpu.toFixed(1) }}%
        </p>
        <div class="mt-1.5 h-1.5 w-full bg-muted rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500"
            [style.width.%]="serverData.cpu"
            [class.bg-green-500]="serverData.cpu < 70"></div>
        </div>
      </div>
      <!-- RAM similar structure -->
    </div>
  </div>
</div>
```

**Color Coding Logic:**
- 🟢 **Green:** < 70% (healthy)
- 🟡 **Yellow:** 70-90% (warning)
- 🔴 **Red:** ≥ 90% (critical)

---

### 2. Cloudflare Worker (server-monitor.js)

**Location:** `cloudflare-worker/server-monitor.js`

**Purpose:**
- Act as CORS proxy (EC2 doesn't support CORS)
- Add API key authentication
- Handle timeouts gracefully
- Cache control (no-store)

**Configuration:**
```javascript
const EC2_URL = 'http://ec2-107-22-51-206.compute-1.amazonaws.com:5000/status';
const API_KEY = '<MONITOR_API_KEY>';
```

**Request Flow:**
```javascript
export default {
  async fetch(request) {
    // 1. CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': 'https://admin.mynumber9.uk',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // 2. Fetch from EC2 with API key
    const upstream = await fetch(EC2_URL, {
      headers: { 'X-API-KEY': API_KEY },
      signal: AbortSignal.timeout(5000),
    });

    // 3. Return JSON with CORS headers
    const data = await upstream.json();
    return Response.json(data, {
      headers: {
        'Access-Control-Allow-Origin': 'https://admin.mynumber9.uk',
        'Cache-Control': 'no-store',
      },
    });
  }
};
```

**Error Handling:**
- Upstream error (502): `{ error: 'upstream error', status, body }`
- Timeout (503): `{ error: 'unreachable', detail }`
- Network error (503): `{ error: 'unreachable' }`

---

### 3. EC2 Flask Server (bot_monitor.py)

**Location:** `bot_monitor.py` (root directory)

**Endpoint:**
```python
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
```

**Dependencies:**
- `psutil`: System resource monitoring
- `Flask`: Web framework

**Security:**
- API key validation (X-API-KEY header)
- CORS enabled for all origins (worker handles strict CORS)

**Resource Measurement:**
- CPU: `psutil.cpu_percent()` - instant reading
- RAM: `psutil.virtual_memory().percent` - current usage %

---

## 🔐 **Security Considerations**

### Authentication Flow
```
Angular → Cloudflare Worker → EC2
         (no auth)             (X-API-KEY: <MONITOR_API_KEY>)
```

**Why This Architecture?**
1. ✅ **Angular doesn't expose API key** (stored in Worker env)
2. ✅ **CORS handled by Worker** (EC2 can stay simple)
3. ✅ **Cloudflare edge network** (lower latency, DDoS protection)
4. ✅ **Rate limiting** (Cloudflare automatic)

### API Key Protection
- ❌ **Don't expose** API key in Angular code
- ✅ **Store** in Cloudflare Worker environment
- ✅ **Rotate** regularly (see rotation procedure below)

### CORS Policy
```javascript
// Worker only allows admin dashboard
'Access-Control-Allow-Origin': 'https://admin.mynumber9.uk'
```

**Why strict CORS?**
- Prevents unauthorized domains from calling worker
- Reduces attack surface
- Cloudflare Workers are publicly accessible

---

## 🚀 **Deployment**

### Initial Setup

**1. Deploy Cloudflare Worker**
```bash
cd cloudflare-worker
wrangler deploy
# Output: https://server-monitor.ninenumber482.workers.dev
```

**2. Update Angular Config**
```typescript
// system.component.ts
const SERVER_MONITOR_URL = 'https://server-monitor.ninenumber482.workers.dev';
```

**3. Rebuild & Deploy Angular**
```bash
npm run build
# Deploy dist/ to Cloudflare Pages
```

**4. Verify EC2 Bot Running**
```bash
sudo systemctl status bot_monitor
curl localhost:5000/status -H "X-API-KEY: <MONITOR_API_KEY>"
```

---

### Update Workflow

**Scenario: Change Worker Logic**

1. Edit `cloudflare-worker/server-monitor.js`
2. Deploy:
   ```bash
   cd cloudflare-worker
   wrangler deploy
   ```
3. No Angular rebuild needed (URL unchanged)

**Scenario: Change Widget UI**

1. Edit `src/app/modules/dashboard/pages/system/system.component.ts`
2. Rebuild Angular:
   ```bash
   npm run build
   ```
3. Deploy to Cloudflare Pages

**Scenario: Change EC2 Endpoint**

1. No code changes needed (Flask auto-restarts)
2. If port changed, update Worker:
   ```javascript
   const EC2_URL = 'http://ec2-...:NEW_PORT/status';
   ```

---

## 🧪 **Testing**

### Manual Testing

**1. Test EC2 Endpoint Directly**
```bash
curl -H "X-API-KEY: <MONITOR_API_KEY>" \
  http://ec2-107-22-51-206.compute-1.amazonaws.com:5000/status
```

**Expected:**
```json
{
  "cpu": 0.5,
  "ram": 38.2
}
```

**2. Test Cloudflare Worker**
```bash
curl https://server-monitor.ninenumber482.workers.dev
```

**Expected:**
```json
{
  "cpu": 0.5,
  "ram": 38.2
}
```

**3. Test Angular Integration**
- Open https://admin.mynumber9.uk
- Login as admin
- Navigate to System Config
- Widget should show CPU/RAM with green status dot
- Wait 5 seconds → values should update

---

### Automated Testing

**Cloudflare Worker Test**
```javascript
// wrangler.toml test config
import { env, createExecutionContext } from 'cloudflare:test';
import worker from './server-monitor.js';

test('returns server metrics', async () => {
  const request = new Request('https://example.com/');
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, env, ctx);
  
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data).toHaveProperty('cpu');
  expect(data).toHaveProperty('ram');
});
```

**Angular Component Test**
```typescript
// system.component.spec.ts
describe('SystemComponent', () => {
  it('should poll server every 5 seconds', fakeAsync(() => {
    component.ngOnInit();
    tick(5000);
    expect(component.serverData).toBeTruthy();
    tick(5000);
    expect(component.serverStatus).toBe('online');
  }));

  it('should handle offline status', fakeAsync(() => {
    spyOn(window, 'fetch').and.returnValue(Promise.reject('error'));
    component.pollServer();
    tick();
    expect(component.serverStatus).toBe('offline');
  }));
});
```

---

## 🐛 **Troubleshooting**

### Widget Shows "Offline"

**Check 1: EC2 Bot Running?**
```bash
sudo systemctl status bot_monitor
# If not running:
sudo systemctl start bot_monitor
```

**Check 2: Flask Listening on Port 5000?**
```bash
sudo netstat -tlnp | grep 5000
# Should show: python ... :5000
```

**Check 3: API Key Correct?**
```bash
# Test with correct key
curl -H "X-API-KEY: <MONITOR_API_KEY>" http://localhost:5000/status

# Test with wrong key (should fail)
curl -H "X-API-KEY: wrong" http://localhost:5000/status
```

**Check 4: Cloudflare Worker Responding?**
```bash
curl https://server-monitor.ninenumber482.workers.dev
```

**Check 5: CORS Error in Browser?**
- Open DevTools → Network tab
- Refresh System Config page
- Look for CORS errors on worker request

---

### Widget Shows Stale Data

**Symptom:** CPU/RAM values don't change

**Diagnosis:**
```typescript
// Add console.log to pollServer()
private async pollServer() {
  console.log('[POLL] Starting poll...');
  const res = await fetch(SERVER_MONITOR_URL);
  const data = await res.json();
  console.log('[POLL] Got data:', data);
  this.serverData = data;
}
```

**Common Causes:**
1. Timer cleared prematurely → Check ngOnDestroy
2. Component not re-rendering → Add `this.cdr.markForCheck()`
3. Fetch cached → Check Cache-Control headers

---

### High CPU on EC2

**Symptom:** Widget shows CPU > 90%

**Investigate:**
```bash
# Top processes
top -b -n 1 | head -20

# Bot CPU usage
ps aux | grep python

# Kill rogue processes
sudo kill -9 <PID>
```

**Common Causes:**
- Bot engine in tight loop (check logs)
- Database connection leak
- Runaway pg_cron job

---

## 📊 **Performance Optimization**

### Current Performance

| Metric | Value |
|--------|-------|
| Worker latency | ~50ms (edge) |
| EC2 response time | ~30ms |
| Total round-trip | ~80-100ms |
| Polling interval | 5000ms |
| Data transfer | ~50 bytes/request |

### Cost Analysis

**Cloudflare Workers:**
- Free tier: 100,000 requests/day
- Current usage: ~17,280 requests/day (1 request/5s × 24h)
- **Cost:** $0/month ✅

**EC2 Bandwidth:**
- Outbound: ~50 bytes × 17,280 = 0.83 MB/day
- **Cost:** Negligible (< $0.01/month) ✅

### Optimization Strategies

**1. Increase Polling Interval (if needed)**
```typescript
// Change from 5s to 10s
this.serverPollTimer = setInterval(() => this.pollServer(), 10000);
```

**2. Add Response Caching**
```javascript
// In worker: cache for 2 seconds
const cache = caches.default;
const cacheKey = new Request(EC2_URL, request);
let response = await cache.match(cacheKey);

if (!response) {
  response = await fetch(EC2_URL, { headers: { 'X-API-KEY': API_KEY } });
  await cache.put(cacheKey, response.clone());
}
```

**3. WebSocket (Future Enhancement)**
- Replace HTTP polling with WebSocket
- Real-time push updates
- Lower latency, less bandwidth

---

## 🔄 **API Key Rotation**

### Rotation Schedule
- **Frequency:** Every 90 days
- **Emergency:** On suspected compromise
- **Automation:** TODO (add to ops.py)

### Rotation Steps

**1. Generate New Key**
```bash
NEW_KEY=$(openssl rand -hex 16)
echo "New API key: $NEW_KEY"
```

**2. Update Cloudflare Worker**
```javascript
// server-monitor.js
const API_KEY = 'NEW_KEY_HERE';
```

**3. Deploy Worker**
```bash
cd cloudflare-worker
wrangler deploy
```

**4. Update Bot**
```python
# bot_monitor.py
API_KEY = os.environ.get('MONITOR_API_KEY', 'NEW_KEY_HERE')
```

**5. Restart Bot**
```bash
sudo systemctl restart bot_monitor
```

**6. Verify**
```bash
# Should work with new key
curl -H "X-API-KEY: NEW_KEY" http://localhost:5000/status

# Should fail with old key
curl -H "X-API-KEY: <MONITOR_API_KEY>" http://localhost:5000/status
```

---

## 📈 **Future Enhancements**

### Phase 2: Extended Metrics
- Disk I/O usage
- Network bandwidth
- Database connection count
- Active user sessions

### Phase 3: Historical Data
- Store metrics in Supabase
- 24-hour CPU/RAM graphs
- Alert thresholds
- Email notifications on critical usage

### Phase 4: Multi-Server Support
- Monitor multiple EC2 instances
- Load balancer health checks
- Geographic distribution map

---

**Last Updated:** 2026-06-05  
**Architecture Version:** v1.0  
**Status:** ✅ Production Ready
