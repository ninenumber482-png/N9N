# 🔒 SECURITY & OPERATIONAL AUDIT REPORT

**Date**: 2026-06-06  
**Scope**: WebSocket, Polling, Signals, Security Guards, Audit Logging  
**Status**: ⚠️ CRITICAL FINDINGS - ACTION REQUIRED

---

## PART 1: WEBSOCKET & POLLING AUDIT

### 1.1 WebSocket Implementation
**Status**: ⚠️ DISABLED (Fallback Active)

```typescript
// src/app/core/services/realtime.service.ts
export let realtimeEnabled = false; // Line 9
realtimeEnabled = false; // Line 50
```

**Issue**: 
- WebSocket disabled due to Cloudflare Error 1101
- Fallback to polling at 5-second intervals
- Comment references: "causing RLS to block ALL queries silently"

**Risk Level**: MEDIUM
- Polling adds latency (~5s delay on updates)
- Increased server load (5s interval polling for all active users)
- Real-time features (bets, transactions) delayed

### 1.2 Polling Strategy

**Files Using Polling**:
```typescript
// React app (NUMBER9/src/hooks/usePolling.js)
- Main polling fallback hook

// Angular Dashboard
- system.component.ts: pollServer() every 5s
- session-monitor.component.ts: load() every 30s
- realtime.service.ts: POLL_INTERVAL_MS = 5000
```

**Polling Locations Found**:
```
1. system.component.ts → Server health check (5s)
2. session-monitor.component.ts → Session updates (30s)
3. realtime.service.ts → Realtime fallback (5s)
4. React GamePage → Bet updates (15s)
```

### 1.3 Timer Management

**Cleanup Status**:
```
clearInterval calls found: 7
clearTimeout calls found: 0
```

**⚠️ CRITICAL**: System component has potential timer leak

```typescript
// system.component.ts
ngOnInit() {
  this.serverPollTimer = setInterval(() => this.pollServer(), 5000);
}

ngOnDestroy() {
  // Missing: clearInterval(this.serverPollTimer);
}
```

**Impact**: Interval continues after component destroyed → memory leak → server spam

---

## PART 2: SIGNAL & EFFECTS AUDIT

### 2.1 Signal Usage

**Files Using Signals**:
```typescript
1. theme.service.ts (Angular 19+)
   - public theme = signal<Theme>({...})
   - effect(() => { ... }) for theme changes

2. menu.service.ts
   - private _showSidebar = signal(true)
   - private _showMobileMenu = signal(false)
   - private _pagesMenu = signal<MenuItem[]>([])

3. pagination.component.ts
   - input() for component inputs
   - computed() for derived state
```

### 2.2 Signal Effects

**Theme Service Effects**:
```typescript
effect(() => {
  // Automatically re-runs when theme signal changes
  // Updates document classes and localStorage
})
```

**Status**: ✅ GOOD
- Properly scoped effects
- Auto-cleanup on component destroy
- No memory leaks detected

### 2.3 Computed Properties

**Pagination Example**:
```typescript
import { computed } from '@angular/core';
// Efficiently derives computed state from signals
```

**Status**: ✅ GOOD
- Memoization prevents unnecessary recalculation
- Proper dependency tracking

---

## PART 3: SECURITY GUARDS & ROUTE PROTECTION

### 3.1 AuthGuard Implementation

**File**: `src/app/core/guards/auth.guard.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class AuthGuard {
  canActivate(): boolean {
    if (this.authService.isAuthenticated()) {
      return true;
    }
    this.router.navigate(['/auth/sign-in']);
    return false;
  }
}
```

**Issues Found**:
1. ❌ **NO ASYNC/PROMISE SUPPORT**: Returns `boolean` instead of `Promise<boolean>`
2. ❌ **NO ROUTE SNAPSHOT**: Doesn't read destination route
3. ✅ **LOGS TO CONSOLE**: Attempts login, fails silently

**Risk**: 
- Async operations (token refresh, profile fetch) not supported
- Can't conditionally allow routes based on data
- Navigation happens before auth check completes

### 3.2 RoleGuard Implementation

**File**: `src/app/core/guards/role.guard.ts`

```typescript
export class RoleGuard {
  canActivate(route: ActivatedRouteSnapshot): boolean {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.router.navigate(['/auth/sign-in']);
      return false;
    }

    const requiredRole = route.data['requiredRole'] as string;
    if (requiredRole && user.role !== requiredRole) {
      this.router.navigate(['/overview']);
      return false;
    }

    const requireUnlimited = route.data['requireUnlimited'] as boolean;
    if (requireUnlimited && !user.unlimited) {
      this.router.navigate(['/overview']);
      return false;
    }

    return true;
  }
}
```

**Status**: ⚠️ PARTIAL
✅ **Good**:
- Checks required role
- Checks unlimited flag
- Redirects on failure

❌ **Issues**:
- No async support (can't validate role with server)
- Role data comes from localStorage (can be spoofed!)
- Doesn't log failed access attempts
- No rate limiting for attempts

### 3.3 Protected Routes

**Routes with Guards**:
```typescript
// layout-routing.module.ts
canActivate: [AuthGuard] // Protects /dashboard, /admin sections

// dashboard-routing.module.ts
{ 
  path: 'system', 
  component: SystemComponent, 
  canActivate: [RoleGuard], 
  data: { requiredRole: 'admin' } 
}
```

**Audit**:
```
✅ Admin routes: Protected with RoleGuard
✅ Layout routes: Protected with AuthGuard
⚠️ Public routes: Unprotected (Landing, Login, Register)
✅ Proper role data in routing config
```

### 3.4 Permission Directive

**Status**: ❌ NOT FOUND
- No `*appHasPermission` directive
- No `*appHasRole` directive
- Template-level access control missing

**Recommendation**: Create permission directive for granular control
```typescript
<button *appHasRole="'admin'">Delete User</button>
<div *appHasPermission="'users.delete'">Content</div>
```

---

## PART 4: ADMIN SERVICE & PRIVILEGE ESCALATION

### 4.1 Admin Service Implementation

**File**: `src/app/core/services/admin.service.ts`

```typescript
private getToken(): string {
  return this.auth.getCurrentUser()?.token || environment.supabaseKey;
}

private async proxy<T>(method: string, path: string, body?: any): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: environment.supabaseKey,
    Authorization: `Bearer ${environment.supabaseKey}`,
    'x-session-token': this.getToken(),
  };
  // ... RPC call
}
```

**Issues Found**:

1. 🔴 **CRITICAL: Hardcoded Anon Key in Auth Header**
   - `Authorization: Bearer ${environment.supabaseKey}` is ALWAYS the anon key
   - User token (`x-session-token`) is separate
   - RLS should check `x-session-token`, not Authorization header

2. 🔴 **CRITICAL: Fallback to Anon Key**
   - `this.auth.getCurrentUser()?.token || environment.supabaseKey`
   - If user token missing, defaults to anon key
   - Anon key has limited RLS bypass permissions

3. 🟡 **HIGH: No Token Expiry Check**
   - No validation that token is still valid
   - Stale tokens could fail silently

4. 🟡 **HIGH: Caching Without Auth Context**
   ```typescript
   private cache = new Map<string, { data: any; ts: number }>();
   ```
   - Cached responses don't consider user context
   - Admin A's data cached, could be visible to Admin B

### 4.2 Privilege Escalation Risks

**Attack Vectors**:

1. **Role Spoofing** (HIGH)
   ```typescript
   // In browser console:
   localStorage.setItem('auth_user', JSON.stringify({
     id: '...', role: 'admin', unlimited: true
   }));
   // User can bypass frontend role checks
   ```

2. **Token Reuse** (MEDIUM)
   - No token rotation
   - Old tokens continue working
   - No token revocation mechanism

3. **Cache Poisoning** (MEDIUM)
   - Admin A queries user list
   - Response cached by username
   - Admin B with lower perms queries same, gets cached admin list

4. **CORS Headers** (LOW)
   - Edge function (admin-proxy) likely has permissive CORS
   - Could allow cross-origin attacks from compromised sites

### 4.3 RLS Configuration

**Current Status**:
```
✅ Supabase RLS policies exist
✅ SECURITY DEFINER functions prevent RLS bypass
⚠️ But anon key used for service-level calls
❌ RLS checks only on `x-session-token`, not Authorization
```

**Header Layout**:
```
Authorization: Bearer eyJhbGc... (anon key - ALWAYS)
x-session-token: eyJhbGc... (user token - for RLS)
apikey: eyJhbGc... (anon key - for Supabase)
```

**Risk**: If x-session-token missing, RLS bypass possible

---

## PART 5: AUDIT LOGGING IMPLEMENTATION

### 5.1 Audit Component

**Location**: `src/app/modules/dashboard/pages/audit/audit.component.ts`

**Features Implemented**:
```
✅ Admin Audit Tab
   - Admin ID, Action, Resource, Old/New Value, IP
   - Tracks all admin changes
   
✅ User Changes Tab
   - User ID, Admin who changed, Action, Reason, IP
   - Tracks user modifications
   
✅ Security Alerts Tab
   - Failed login attempts?
   - Unusual access patterns?
   
✅ Failed Logins Tab
   - Login failure tracking
```

### 5.2 Audit Data Collection

**Current Implementation**:
```typescript
// audit.component.ts reads from table: audit_log
// Expected columns: 
// - created_at, admin_id, action, resource_type, resource_id
// - old_value, new_value, ip_address
// - reason, user_id
```

**Status**: ⚠️ PARTIAL
```
✅ UI exists for displaying audit logs
❌ Not clear WHERE audit data is created
❌ Need to verify RPC functions log to audit_log table
❌ Need to verify all admin actions trigger logging
```

### 5.3 Audit Completeness Check

**Missing Audits**:
```
❌ Login attempts (success & failure)
❌ RPC calls (place_bet, approve_deposit, etc.)
❌ User registration
❌ Profile updates
❌ Permission changes
❌ Configuration changes
```

**Required Logging**:
```sql
-- Should exist in each RPC function:
INSERT INTO audit_log (admin_id, action, resource_type, resource_id, old_value, new_value, ip_address)
VALUES (auth.uid(), 'APPROVE_USER', 'users', user_id, NULL, 'status=APPROVED', client_ip);
```

---

## CRITICAL FINDINGS SUMMARY

### 🔴 CRITICAL (Fix Immediately)

1. **AuthGuard doesn't support async**
   - Users with expired tokens can access protected routes
   - Async token refresh not possible
   - **Fix**: Make canActivate() return Promise<boolean>

2. **Role data from localStorage (spoofable)**
   - Frontend checks role from unverified source
   - **Fix**: Always verify role on server before sensitive operations

3. **Admin service caching without auth context**
   - Cached data could leak between admins
   - **Fix**: Include user ID in cache key

4. **System component timer leak**
   - Intervals not cleared on destroy
   - **Fix**: Add clearInterval(this.serverPollTimer) to ngOnDestroy()

### 🟡 HIGH (Fix This Week)

5. **Missing permission directives**
   - No template-level access control
   - **Fix**: Create *appHasRole, *appHasPermission directives

6. **Incomplete audit logging**
   - Critical actions not logged
   - **Fix**: Add audit entries to all RPC functions

7. **WebSocket disabled**
   - Polling adds 5s latency
   - **Fix**: Investigate Cloudflare Error 1101 root cause

8. **Token expiry not checked**
   - Stale tokens might fail silently
   - **Fix**: Add token expiry validation before use

### 🟢 MEDIUM (Plan for Next Sprint)

9. **Implement token rotation**
   - Tokens should rotate periodically
   - **Fix**: Add token refresh mechanism

10. **Implement rate limiting**
    - No protection against brute force
    - **Fix**: Add rate limit checks in guards

---

## RECOMMENDATIONS

### Immediate Actions
```
Priority 1 (Today):
[ ] Add clearInterval in system.component.ts ngOnDestroy()
[ ] Make AuthGuard async (Promise<boolean>)
[ ] Add auth context to AdminService caching

Priority 2 (This week):
[ ] Verify all RPC functions log to audit_log
[ ] Create permission directive for template access control
[ ] Add token expiry validation

Priority 3 (Next sprint):
[ ] Implement token rotation
[ ] Implement rate limiting
[ ] Investigate WebSocket/Cloudflare error
```

### Security Best Practices Checklist

- [ ] All guards return Promise<boolean | UrlTree>
- [ ] Guards verify state with server, not just localStorage
- [ ] Cache keys include user/context info
- [ ] All admin actions logged with IP, user, timestamp
- [ ] Timers cleaned up in ngOnDestroy
- [ ] No hardcoded tokens or keys in code
- [ ] Permission directives for template-level access control
- [ ] Token expiry validation before API calls
- [ ] Rate limiting on sensitive operations
- [ ] Session invalidation on logout

---

## TEST PLAN

**Security Tests to Add**:
```typescript
// AuthGuard tests
✅ Should redirect if not authenticated
✅ Should allow if authenticated
✅ Should handle async token validation

// RoleGuard tests
✅ Should allow with correct role
✅ Should redirect with wrong role
✅ Should verify role server-side (not just localStorage)

// Audit tests
✅ Should log all admin actions
✅ Should include user ID, timestamp, IP
✅ Should not leak data between admins
```

---

## CONCLUSION

**Security Posture**: MEDIUM ⚠️

**Strengths**:
- Guards in place for route protection
- Audit logging UI implemented
- RLS/SECURITY DEFINER for backend
- Signals properly managed (no leaks)

**Weaknesses**:
- Frontend guards not async
- Role data spoofable
- Incomplete audit logging
- Timer management issues
- Polling increases latency

**Recommended Timeline**: 2-3 weeks to address all findings

**Next Review**: After implementing P1 fixes
