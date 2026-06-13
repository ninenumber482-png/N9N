import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from 'src/environments/environment';
import { AuthService } from 'src/app/core/services/auth.service';

export class AdminRpcError extends Error {
  constructor(
    message: string,
    public readonly code: 'FORBIDDEN' | 'TX_NOT_FOUND' | 'TX_NOT_PENDING' | 'UNKNOWN',
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'AdminRpcError';
  }

  static fromMessage(msg: string): AdminRpcError {
    if (msg.startsWith('FORBIDDEN:'))
      return new AdminRpcError(
        'Akses ditolak. Hanya admin yang dapat melakukan tindakan ini.',
        'FORBIDDEN',
        msg.slice(10).trim(),
      );
    if (msg === 'TX_NOT_FOUND')
      return new AdminRpcError('Transaksi tidak ditemukan atau sudah diproses.', 'TX_NOT_FOUND');
    if (msg === 'TX_NOT_PENDING') return new AdminRpcError('Transaksi sudah diproses sebelumnya.', 'TX_NOT_PENDING');
    if (msg === 'CANNOT_SELF_APPROVE') return new AdminRpcError('Tidak dapat menyetujui akun sendiri.', 'FORBIDDEN');
    if (msg === 'CANNOT_SELF_REJECT') return new AdminRpcError('Tidak dapat menolak akun sendiri.', 'FORBIDDEN');
    if (msg === 'USER_NOT_FOUND_OR_NOT_PENDING')
      return new AdminRpcError('User tidak ditemukan atau sudah diproses.', 'TX_NOT_FOUND');
    return new AdminRpcError(msg, 'UNKNOWN');
  }
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private auth = inject(AuthService);
  private router = inject(Router);

  private proxyUrl = `${environment.supabaseUrl}/functions/v1/admin-proxy`;

  /** In-memory cache with TTL (5s) and user context to prevent data leakage */
  private cache = new Map<string, { data: unknown; ts: number }>();
  private readonly CACHE_TTL = 5000;
  private logoutInProgress = false;

  // Only READ operations may be cached — mutating RPCs must always execute
  private readonly CACHEABLE_RPCS = new Set([
    'count_kyc_by_status',
    'get_platform_stats',
    'get_kyc_documents_admin_list',
    'get_kyc_documents_by_user',
    'get_kyc_document_url',
  ]);

  private getCacheKey(baseKey: string): string {
    // Include user ID in cache key to prevent cross-user data leakage
    const user = this.auth.getCurrentUser();
    const userId = user?.username || 'anonymous';
    return `${userId}:${baseKey}`;
  }

  private cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cacheKey = this.getCacheKey(key);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL) {
      return Promise.resolve(cached.data as T);
    }
    return fetcher().then((data) => {
      this.cache.set(cacheKey, { data, ts: Date.now() });
      return data;
    });
  }

  private handle401(): never {
    if (!this.logoutInProgress) {
      this.logoutInProgress = true;
      this.auth.logout();
      this.router.navigate(['/auth/sign-in'], {
        queryParams: { reason: 'session-expired', message: 'Your session has expired. Please log in again.' },
      });
    }
    throw new AdminRpcError('Session expired', 'FORBIDDEN');
  }

  private async proxy<T>(method: string, path: string, body?: unknown, prefer?: string): Promise<T> {
    const user = this.auth.getCurrentUser();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: environment.supabaseKey,
      Authorization: `Bearer ${environment.supabaseKey}`,
    };
    if (user?.token) headers['x-session-token'] = user.token;
    if (prefer) headers['Prefer'] = prefer;

    try {
      const res = await fetch(this.proxyUrl, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ method, path, body, prefer }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        if (res.status === 401) return this.handle401();
        if (res.status === 403) {
          try {
            const parsed = JSON.parse(errorText) as { code?: string };
            if (parsed.code === 'MFA_REQUIRED') {
              this.auth.requireMfa('verify');
              this.router.navigate(['/auth/two-factor']);
              throw new AdminRpcError('MFA verification required', 'FORBIDDEN');
            }
            if (parsed.code === 'MFA_SETUP_REQUIRED') {
              this.auth.requireMfa('setup');
              this.router.navigate(['/auth/two-factor']);
              throw new AdminRpcError('MFA setup required', 'FORBIDDEN');
            }
          } catch (e) {
            if (e instanceof AdminRpcError) throw e;
          }
          throw new AdminRpcError('Access denied. Insufficient permissions.', 'FORBIDDEN', errorText);
        }
        if (res.status >= 500)
          throw new AdminRpcError('Server error. Please try again later.', 'UNKNOWN', `${res.status}: ${errorText}`);
        throw AdminRpcError.fromMessage(errorText.length < 200 ? errorText : `HTTP ${res.status}`);
      }

      const text = await res.text();
      if (!text) return undefined as unknown as T;
      try {
        return JSON.parse(text);
      } catch {
        return text as unknown as T;
      }
    } catch (error) {
      if (error instanceof AdminRpcError) throw error;
      console.error('Admin proxy error:', error);
      throw new AdminRpcError(
        'Network error. Please check your connection and try again.',
        'UNKNOWN',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async get<T>(table: string, query = ''): Promise<T[]> {
    const sep = table.includes('?') ? '&' : '?';
    const path = query ? `/${table}${sep}${query}` : `/${table}`;
    const cacheKey = `GET:${path}`;
    return this.cached(cacheKey, () => this.proxy<T[]>('GET', path));
  }

  async getPaginated<T>(table: string, query = '', page = 1, pageSize = 20): Promise<{ data: T[]; total: number }> {
    const start = (page - 1) * pageSize;
    const sep = table.includes('?') ? '&' : '?';
    const basePath = query
      ? `/${table}${sep}${query}${query.includes('limit=') ? '' : `&limit=${pageSize}`}`
      : `/${table}?limit=${pageSize}`;
    const path = `${basePath.startsWith('/') ? '' : '/'}${basePath}&offset=${start}`;

    const user = this.auth.getCurrentUser();
    const res = await fetch(this.proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: environment.supabaseKey,
        Authorization: `Bearer ${environment.supabaseKey}`,
        ...(user?.token ? { 'x-session-token': user.token } : {}),
        Prefer: 'count=exact',
      },
      credentials: 'include',
      body: JSON.stringify({ method: 'GET', path, prefer: 'count=exact' }),
    });

    if (!res.ok) {
      if (res.status === 401) return this.handle401();
      const text = await res.text();
      throw AdminRpcError.fromMessage(text.length < 200 ? text : `${res.status}`);
    }

    let total = 0;
    const range = res.headers.get('content-range');
    if (range) {
      const match = range.match(/\/(\d+)$/);
      total = match ? Number(match[1]) : 0;
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : [];
    return { data, total };
  }

  async count(table: string, query = '', fresh = false): Promise<number> {
    const path = `/${table}?${query}&select=count`;
    const cacheKey = `COUNT:${path}`;
    const scopedKey = this.getCacheKey(cacheKey);
    if (!fresh) {
      const hit = this.cache.get(scopedKey);
      if (hit && Date.now() - hit.ts < this.CACHE_TTL) return hit.data as number;
    }

    const user = this.auth.getCurrentUser();
    const res = await fetch(this.proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: environment.supabaseKey,
        Authorization: `Bearer ${environment.supabaseKey}`,
        ...(user?.token ? { 'x-session-token': user.token } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ method: 'GET', path, prefer: 'count=exact' }),
    });

    if (!res.ok) {
      if (res.status === 401) return this.handle401();
      return 0;
    }

    const val = Number(res.headers.get('content-range')?.split('/')[1] || 0);
    this.cache.set(scopedKey, { data: val, ts: Date.now() });
    return val;
  }

  private async updateRow<T>(table: string, id: string, data: Partial<T>): Promise<T[]> {
    return this.proxy<T[]>('PATCH', `/${table}?id=eq.${id}`, data);
  }

  async insertRow<T>(table: string, data: Partial<T>): Promise<T[]> {
    return this.proxy<T[]>('POST', `/${table}`, data);
  }

  private async deleteRow(table: string, id: string): Promise<void> {
    await this.proxy<void>('DELETE', `/${table}?id=eq.${id}`);
  }

  private adminIdCache: Record<string, string> = {};
  private async resolveAdminId(usernameOrId: string): Promise<string> {
    if (this.adminIdCache[usernameOrId]) return this.adminIdCache[usernameOrId];
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usernameOrId)) {
      return usernameOrId;
    }
    const rows = await this.get<any>(`users?username=eq.${usernameOrId}&select=id&limit=1`);
    const id = rows[0]?.['id'] as string | undefined;
    if (!id) throw new Error(`Admin not found: ${usernameOrId}`);
    this.adminIdCache[usernameOrId] = id;
    return id;
  }

  async rpc(name: string, params: Record<string, unknown> = {}): Promise<any> {
    if (!this.CACHEABLE_RPCS.has(name)) {
      return this.proxy<any>('POST', `/rpc/${name}`, params);
    }
    const cacheKey = `RPC:${name}:${JSON.stringify(params)}`;
    return this.cached(cacheKey, () => this.proxy<any>('POST', `/rpc/${name}`, params));
  }

  // ── USERS ──
  // getUsers unused — getUsersWithWallets is used instead
  getUsersWithWallets(limit = 100) {
    // Exclude admin/superadmin — they live in n9_users (admin registry); their
    // users-row is only a session/MFA anchor and must NOT appear among members.
    return this.get<any>(
      'users',
      `role=not.in.(admin,superadmin)&select=id,username,display_name,email,phone,country,role,registration_status,login_status,account_status,kyc_status,referral_code,bank_name,bank_account_number,bank_account_name,created_at,approved_at,last_login_ip,last_login_geo,wallet(balance_main,balance_bonus)&order=created_at.desc&limit=${limit}`,
    );
  }
  // getUser unused — queries by UUID
  updateUser(id: string, data: Record<string, unknown>) {
    return this.updateRow('users', id, data);
  }
  // deleteUser unused — no delete UI
  countUsers() {
    return this.count('users');
  }
  getUserSessionsForUser(userId: string, limit = 5) {
    return this.get<any>(`sessions?user_id=eq.${userId}&order=last_activity.desc&limit=${limit}`);
  }
  getActiveSessionsForUsers(userIds: string[]) {
    const filter = userIds.map((id) => `user_id=eq.${id}`).join(',');
    return this.get<any>(`sessions?or=(${filter})&logged_out_at=is.null&order=last_activity.desc`);
  }
  getAuditLogsByResource(resourceId: string, limit = 10) {
    return this.get<any>(`audit_log?resource_id=eq.${resourceId}&order=created_at.desc&limit=${limit}`);
  }
  getKycDocsByUser(userId: string) {
    return this.rpc('get_kyc_documents_by_user', { p_user_id: userId });
  }

  // ── WALLET ──
  getWallets(limit = 100) {
    return this.get<any>(
      'wallet',
      `select=user_id,balance_main,balance_bonus,total_deposited,total_withdrawn,total_turnover,updated_at,user:users!inner(username,display_name,role)&user.role=eq.user&order=updated_at.desc&limit=${limit}`,
    );
  }
  getWallet(userId: string) {
    return this.get<any>(`wallet?user_id=eq.${userId}`, 'limit=1');
  }
  updateWalletRow(userId: string, data: Record<string, unknown>) {
    return this.proxy<any>('PATCH', `/wallet?user_id=eq.${userId}`, data);
  }

  // ── PLATFORM ACCOUNTS ──
  getPlatformAccounts() {
    return this.get<any>('platform_accounts', 'order=created_at.asc');
  }
  createPlatformAccount(data: Record<string, unknown>) {
    return this.insertRow<any>('platform_accounts', data);
  }
  updatePlatformAccount(id: string, data: Record<string, unknown>) {
    return this.updateRow('platform_accounts', id, { ...data, updated_at: new Date().toISOString() });
  }

  // ── TRANSACTIONS (used for deposits, withdrawals, all tx) ──
  getTransactions(type?: string, limit = 100) {
    const typeFilter = type ? `&type=eq.${type}` : '';
    return this.get<any>(
      'transactions',
      `select=*,user:users!transactions_user_id_fkey(username,display_name)&order=created_at.desc&limit=${limit}${typeFilter}`,
    );
  }
  getDeposits() {
    return this.getTransactions('DEPOSIT');
  }
  getWithdrawals() {
    return this.getTransactions('WITHDRAWAL');
  }
  updateTransaction(id: string, data: Record<string, unknown>) {
    return this.updateRow('transactions', id, data);
  }
  countTransactions() {
    return this.count('transactions');
  }
  countPending(type: string, fresh = false) {
    return this.count('transactions', `type=eq.${type}&status=eq.PENDING`, fresh);
  }
  getPendingTransactions(type: 'DEPOSIT' | 'WITHDRAWAL', limit = 20) {
    return this.get<{ id: string; amount: number; user?: { username?: string; display_name?: string } }>(
      'transactions',
      `type=eq.${type}&status=eq.PENDING&order=created_at.desc&limit=${limit}&select=id,amount,user:users!transactions_user_id_fkey(username,display_name)`,
    );
  }
  // resolveUserId unused (identical to resolveAdminId)
  async approveDeposit(txId: string, usernameOrId: string) {
    const adminId = await this.resolveAdminId(usernameOrId);
    return this.rpc('approve_deposit', { p_tx_id: txId, p_admin_id: adminId });
  }
  async rejectDeposit(txId: string, usernameOrId: string, reason?: string) {
    const adminId = await this.resolveAdminId(usernameOrId);
    return this.rpc('reject_deposit', { p_tx_id: txId, p_admin_id: adminId, p_reason: reason || null });
  }
  async approveWithdrawal(txId: string, usernameOrId: string) {
    const adminId = await this.resolveAdminId(usernameOrId);
    return this.rpc('approve_withdrawal', { p_tx_id: txId, p_admin_id: adminId });
  }
  async rejectWithdrawal(txId: string, usernameOrId: string, reason?: string) {
    const adminId = await this.resolveAdminId(usernameOrId);
    return this.rpc('reject_withdrawal', { p_tx_id: txId, p_admin_id: adminId, p_reason: reason || null });
  }

  // ── BETS ──
  getBets(limit = 100) {
    return this.get<any>(
      `bets?select=*,user:users!bets_user_id_fkey(username,display_name)&order=created_at.desc&limit=${limit}`,
    );
  }
  getBetsByUser(userId: string, limit = 50) {
    return this.get<any>(`bets?user_id=eq.${userId}&order=created_at.desc&limit=${limit}`);
  }
  getTransactionsByUser(userId: string, limit = 50) {
    return this.get<any>(`transactions?user_id=eq.${userId}&order=created_at.desc&limit=${limit}`);
  }
  // getBetsBySession unused
  // updateBet unused — bets are read-only

  // ── 3D KING ENGINE ──
  getKingResults(limit = 50) {
    return this.get<any>(`king_results?order=session_code.desc&limit=${limit}`);
  }
  settleSession(code: string, d1: number, d2: number, d3: number) {
    return this.rpc('settle_session', { p_code: code, p_d1: d1, p_d2: d2, p_d3: d3 });
  }
  getPlanned(limit = 100) {
    return this.get<any>(`king_planned?order=session_code.desc&limit=${limit}`);
  }
  setPlanned(code: string, d1: number, d2: number, d3: number) {
    return this.proxy<any>(
      'POST',
      '/king_planned?on_conflict=session_code',
      {
        session_code: code,
        d1,
        d2,
        d3,
        updated_at: new Date().toISOString(),
      },
      'resolution=merge-duplicates,return=representation',
    );
  }
  getDepositLocks() {
    return this.get<any>('deposit_locks', 'select=user_id,turnover_required,turnover_applied');
  }
  getEngineStatus() {
    return this.proxy<any>('GET', '/engine_status?limit=1');
  }

  // ── KYC DOCUMENTS ──
  getKycDocuments() {
    return this.rpc('get_kyc_documents_admin_list');
  }
  getKycDocumentUrl(id: string) {
    return this.rpc('get_kyc_document_url', { p_id: id });
  }
  updateKycStatus(id: string, status: string, rejectionReason?: string) {
    return this.updateRow('kyc_documents', id, {
      status,
      rejection_reason: rejectionReason || null,
      reviewed_at: new Date().toISOString(),
    });
  }

  // ── REFERRALS ──
  getReferrals() {
    return this.get<any>(
      'referrals',
      'select=*,creator:users!referrals_created_by_fkey(username,display_name)&order=created_at.desc',
    );
  }
  // getReferralStats unused — data from referrals table directly
  async generateReferralCode(usernameOrId: string): Promise<string> {
    const adminId = await this.resolveAdminId(usernameOrId);
    const result = await this.rpc('generate_referral_code', { p_admin_id: adminId });
    if (Array.isArray(result) && result.length > 0) {
      const row = result[0] as Record<string, unknown> | undefined;
      return String(row?.['generate_referral_code'] || result[0]);
    }
    return String(result);
  }
  updateReferral(id: string, data: Record<string, unknown>) {
    return this.updateRow('referrals', id, { ...data, updated_at: new Date().toISOString() });
  }
  getUsersByReferral(referralId: string) {
    return this.get<any>(`users?referred_by=eq.${referralId}&order=created_at.desc`);
  }
  async updateReferralStatus(id: string, status: string) {
    return this.updateRow('referrals', id, { status, updated_at: new Date().toISOString() });
  }

  getUserByUsername(username: string) {
    return this.get<any>(
      'users',
      `username=eq.${encodeURIComponent(username)}&select=id,username,display_name,email,role&limit=1`,
    );
  }

  getAdminUsers() {
    return this.get<any>(
      'users',
      'or=(role.eq.admin,role.eq.superadmin)&select=id,username,email,role,login_status&order=username.asc',
    );
  }

  // ── ADMIN REGISTRY (n9_users = source of truth for who can log into Angular) ──
  // Writes are dual: n9_users (registry/gate) + the `users` anchor row (session/MFA
  // + the users-path auth gate) so both auth-login paths stay consistent.
  getAdminRegistry() {
    return this.get<any>(
      'n9_users',
      'select=id,username,email,full_name,role,is_active,permissions&order=username.asc&limit=200',
    );
  }
  /** Set per-page access limits for an admin (null/[] = full access). */
  setAdminPermissions(username: string, keys: string[] | null) {
    return this.proxy('PATCH', `/n9_users?username=eq.${encodeURIComponent(username)}`, {
      permissions: keys && keys.length ? keys : null,
    });
  }
  /** Member account (with hash) used when promoting a member to admin. */
  getMemberForGrant(username: string) {
    return this.get<any>(
      'users',
      `username=eq.${encodeURIComponent(username)}&select=id,username,display_name,email,role,password_hash&limit=1`,
    );
  }
  async setAdminRole(username: string, role: 'admin' | 'superadmin') {
    const u = encodeURIComponent(username);
    await this.proxy('PATCH', `/n9_users?username=eq.${u}`, { role });
    await this.proxy('PATCH', `/users?username=eq.${u}`, { role });
  }
  async setAdminActive(username: string, active: boolean) {
    const u = encodeURIComponent(username);
    await this.proxy('PATCH', `/n9_users?username=eq.${u}`, { is_active: active });
    await this.proxy('PATCH', `/users?username=eq.${u}`, { login_status: active ? 'ACTIVE' : 'SUSPENDED' });
  }
  async revokeAdmin(username: string) {
    const u = encodeURIComponent(username);
    await this.proxy('DELETE', `/n9_users?username=eq.${u}`);
    await this.proxy('PATCH', `/users?username=eq.${u}`, { role: 'user' });
  }
  async grantAdminFromMember(member: {
    id: string;
    username: string;
    email?: string;
    display_name?: string;
    password_hash: string;
  }) {
    await this.proxy('POST', '/n9_users', {
      id: member.id,
      username: member.username,
      email: member.email ?? null,
      password_hash: member.password_hash,
      full_name: member.display_name ?? member.username,
      role: 'admin',
      is_active: true,
    });
    await this.proxy('PATCH', `/users?username=eq.${encodeURIComponent(member.username)}`, {
      role: 'admin',
      login_status: 'ACTIVE',
    });
  }

  // ── MEMBER MANAGEMENT ──
  async resetPassword(userIdentifier: string, adminUsernameOrId: string, newPassword: string) {
    const userId = await this.resolveUserId(userIdentifier);
    const adminId = await this.resolveAdminId(adminUsernameOrId);
    return this.rpc('admin_reset_password', { p_admin_id: adminId, p_user_id: userId, p_new_password: newPassword });
  }

  /**
   * Change the currently-authenticated admin's OWN password.
   * Verifies the current password first (verify_password), then writes the new
   * bcrypt hash (admin_reset_password). Both RPCs run through the service-role proxy.
   * Throws Error('Current password is incorrect') when the old password is wrong.
   */
  async changeOwnPassword(username: string, oldPassword: string, newPassword: string) {
    const userId = await this.resolveUserId(username);
    const valid = await this.rpc('verify_password', { user_id: userId, password: oldPassword });
    if (valid !== true) {
      throw new Error('Current password is incorrect');
    }
    return this.rpc('admin_reset_password', {
      p_admin_id: userId,
      p_user_id: userId,
      p_new_password: newPassword,
    });
  }

  private async resolveUserId(usernameOrId: string): Promise<string> {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(usernameOrId)) {
      return usernameOrId;
    }
    const rows = await this.get<any>(`users?username=eq.${usernameOrId}&select=id&limit=1`);
    const id = rows[0]?.['id'] as string | undefined;
    if (!id) throw new Error(`User not found: ${usernameOrId}`);
    return id;
  }

  async adjustBalance(adminUsernameOrId: string, userId: string, amount: number, reason?: string) {
    const adminId = await this.resolveAdminId(adminUsernameOrId);
    return this.rpc('admin_adjust_balance', {
      p_admin_id: adminId,
      p_user_id: userId,
      p_amount: amount,
      p_reason: reason || null,
    });
  }

  async resetTurnover(userId: string, adminUsernameOrId: string) {
    const adminId = await this.resolveAdminId(adminUsernameOrId);
    return this.rpc('admin_reset_turnover', { p_user_id: userId, p_admin_id: adminId });
  }
  async adjustTurnover(userId: string, adminUsernameOrId: string, amount: number) {
    const adminId = await this.resolveAdminId(adminUsernameOrId);
    return this.rpc('admin_adjust_turnover', { p_user_id: userId, p_admin_id: adminId, p_amount: amount });
  }

  // ── USER APPROVAL ──
  async approveUser(userId: string, usernameOrId: string) {
    const adminId = await this.resolveAdminId(usernameOrId);
    return this.rpc('approve_user', { p_user_id: userId, p_admin_id: adminId });
  }
  async rejectUser(userId: string, usernameOrId: string, reason?: string) {
    const adminId = await this.resolveAdminId(usernameOrId);
    return this.rpc('reject_user', { p_user_id: userId, p_admin_id: adminId, p_reason: reason || null });
  }
  lockUser(userId: string) {
    return this.updateRow('users', userId, { login_status: 'LOCKED' });
  }
  unlockUser(userId: string) {
    return this.updateRow('users', userId, { login_status: 'ACTIVE' });
  }

  // ── USER SESSIONS (login sessions) ──
  getUserSessions(limit = 50) {
    return this.get<any>(`sessions?order=last_activity.desc&limit=${limit}`);
  }
  /** Latest settled draw (for auto-engine health + last-settlement readout). */
  getLatestKingResult() {
    return this.get<any>('king_results', 'select=session_code,created_at&order=session_code.desc&limit=1');
  }
  /** Admin-planned draw for a session (manual override readout). */
  getPlannedForSession(code: string) {
    return this.get<any>(
      'king_planned',
      `session_code=eq.${encodeURIComponent(code)}&select=session_code,d1,d2,d3&limit=1`,
    );
  }
  /** Users active in the last 5 min (RPC get_online_users, via service_role). */
  getOnlineUsers() {
    return this.proxy<
      { user_id: string; last_activity: string; ip_address: string; device_info?: { model?: string } | null }[]
    >('POST', '/rpc/get_online_users', {});
  }
  endUserSession(sessionId: string) {
    return this.updateRow('sessions', sessionId, {
      logged_out_at: new Date().toISOString(),
      logout_reason: 'Admin terminated',
    });
  }

  // ── AUDIT LOGS ──
  getAuditLogs(limit = 50) {
    return this.get<any>(`audit_log?order=created_at.desc&limit=${limit}`);
  }
  /** Recent audit excluding admin-proxy self-log (every REST call inserts an audit_log row) — surfaces real admin actions. */
  getRecentAudit(limit = 100) {
    return this.get<any>(`audit_log?resource_type=neq.admin_proxy&order=created_at.desc&limit=${limit}`);
  }
  getAuditLogsByResourceType(resourceType: string, limit = 20) {
    return this.get<any>(`audit_log?resource_type=eq.${encodeURIComponent(resourceType)}&order=created_at.desc&limit=${limit}`);
  }
  async logAction(
    usernameOrId: string,
    action: string,
    resourceType: string,
    resourceId?: string,
    oldValue?: string,
    newValue?: string,
  ) {
    const adminId = await this.resolveAdminId(usernameOrId);
    return this.rpc('log_admin_action', {
      p_admin_id: adminId,
      p_action: action,
      p_resource_type: resourceType,
      p_resource_id: resourceId || null,
      p_old_value: oldValue || null,
      p_new_value: newValue || null,
    });
  }

  // ── TRANSACTION AUDIT ──
  getTransactionAudit(limit = 100) {
    return this.get<any>(`transaction_audit?order=created_at.desc&limit=${limit}`);
  }
  getUserAudit(limit = 50) {
    return this.get<any>(`user_audit?order=created_at.desc&limit=${limit}`);
  }
  getSecurityAlerts(limit = 50) {
    return this.get<any>(`security_alerts?order=created_at.desc&limit=${limit}`);
  }
  getFailedLogins(limit = 50) {
    return this.get<any>(`failed_logins?order=attempted_at.desc&limit=${limit}`);
  }
  // getTransactionAudit unused — audit_component uses getUserAudit instead
  // getMetrics unused

  // ── SECURITY CENTER ACTIONS (live writes via admin-proxy service_role) ──
  /** Bust cached GETs whose key contains a table fragment, so the post-action reload is fresh. */
  private invalidate(fragment: string) {
    for (const k of [...this.cache.keys()]) {
      if (k.includes(fragment)) this.cache.delete(k);
    }
  }

  async resolveAlert(id: string): Promise<void> {
    await this.updateRow('security_alerts', id, { resolved_at: new Date().toISOString() });
    this.invalidate('security_alerts');
  }

  async resolveAllOpenAlerts(): Promise<void> {
    await this.proxy('PATCH', '/security_alerts?resolved_at=is.null', { resolved_at: new Date().toISOString() });
    this.invalidate('security_alerts');
  }

  async clearFailedLogins(username: string): Promise<void> {
    await this.proxy('DELETE', `/failed_logins?username=eq.${encodeURIComponent(username)}`);
    this.invalidate('failed_logins');
  }

  async clearOldFailedLogins(cutoffISO: string): Promise<void> {
    await this.proxy('DELETE', `/failed_logins?attempted_at=lt.${encodeURIComponent(cutoffISO)}`);
    this.invalidate('failed_logins');
  }

  /** id → username map for display (alerts.user_id, audit.admin_id). */
  async getUserNameMap(): Promise<Record<string, string>> {
    const rows = await this.get<any>('users', 'select=id,username,display_name&limit=1000');
    const map: Record<string, string> = {};
    for (const r of rows) map[r['id']] = r['username'] || r['display_name'] || r['id'];
    return map;
  }

  // ── GAME SESSIONS (grouped from bets table by session_code) ──
  async getGameSessions() {
    const bets = await this.getBets(1000);
    const grouped: Record<string, any[]> = {};
    bets.forEach((b: any) => {
      const sc = b.session_code || b['session_code'];
      if (!sc) return;
      if (!grouped[sc]) grouped[sc] = [];
      grouped[sc].push(b);
    });
    return Object.entries(grouped)
      .map(([code, sessionBets]) => {
        const totalStake = (sessionBets as any[]).reduce((s: number, b: any) => s + Number(b.stake || b['stake']), 0);
        const totalPayout = (sessionBets as any[]).reduce(
          (s: number, b: any) => s + Number(b.actual_payout || b['actual_payout'] || 0),
          0,
        );
        const settled = (sessionBets as any[]).every((b: any) => (b.status || b['status']) === 'SETTLED');
        return {
          session_code: code,
          status: settled ? 'SETTLED' : 'OPEN',
          bet_count: (sessionBets as any[]).length,
          total_stake: totalStake,
          total_payout: totalPayout,
          created_at: (sessionBets as any[])[0]?.created_at || (sessionBets as any[])[0]?.['created_at'],
        };
      })
      .sort(
        (a: any, b: any) =>
          new Date(b.created_at || b['created_at']).getTime() - new Date(a.created_at || a['created_at']).getTime(),
      );
  }

  // ── PLATFORM CONFIG (CS Contact, etc.) ──
  async getConfigs(query = '') {
    const path = query ? `/platform_config?${query}` : '/platform_config';
    return this.proxy<any[]>('GET', path);
  }
  async getConfig(key: string): Promise<unknown> {
    const rows = await this.get<any>('platform_config', `key=eq.${key}&limit=1`);
    return rows[0] || null;
  }
  async updateConfig(key: string, value: string): Promise<void> {
    await this.proxy<void>('PATCH', `/platform_config?key=eq.${key}`, { value, updated_at: new Date().toISOString() });
  }
  async insertConfig(data: { key: string; value: string }): Promise<{ key: string; value: string }[]> {
    return this.insertRow('platform_config', data);
  }

  // ── POPUP BANNERS ──
  getPopupBanners(limit = 50) {
    return this.get<any>(`popup_banners?order=created_at.desc&limit=${limit}`);
  }
  deletePopupBannerRow(id: string) {
    return this.deleteRow('popup_banners', id);
  }
  updatePopupBannerRow(id: string, data: Record<string, unknown>) {
    return this.updateRow('popup_banners', id, data);
  }
  async uploadPopupImage(dataUrl: string, title: string, linkUrl = '', bannerId?: string): Promise<unknown> {
    const user = this.auth.getCurrentUser();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: environment.supabaseKey,
      Authorization: `Bearer ${environment.supabaseKey}`,
    };
    if (user?.token) headers['x-session-token'] = user.token;
    const res = await fetch(`${environment.supabaseUrl}/functions/v1/admin-popup-image`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ dataUrl, title, linkUrl, bannerId }),
    });
    const data = await res.json();
    if (!res.ok) throw AdminRpcError.fromMessage(data.error || 'Upload failed');
    return data;
  }

  // ── DASHBOARD STATS ──
  async getDashboardStats() {
    const [users, totalTx, pendingBets, pendingKyc] = await Promise.all([
      this.count('users'),
      this.count('transactions'),
      this.count('bets', 'status=eq.PENDING'),
      this.rpc('count_kyc_by_status', { p_status: 'PENDING' }),
    ]);
    return { totalUsers: users, totalTransactions: totalTx, pendingBets, pendingKyc: Number(pendingKyc) || 0 };
  }

  // ── SMART DASHBOARD STATS ──
  async getTodayRegistrations(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.count('users', `created_at=gte.${today.toISOString()}`);
  }

  async getYesterdayRegistrations(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return this.count('users', `created_at=gte.${yesterday.toISOString()}&created_at=lt.${today.toISOString()}`);
  }

  async getTodayTransactionVolume(type: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows = await this.get<any>(
      'transactions',
      `type=eq.${type}&created_at=gte.${today.toISOString()}&status=eq.APPROVED&select=amount`,
    );
    return rows.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
  }

  async getTotalWalletBalance(): Promise<{ main: number; bonus: number }> {
    const rows = await this.get<any>('wallet', 'select=balance_main,balance_bonus');
    return {
      main: rows.reduce((s: number, r: any) => s + Number(r.balance_main || 0), 0),
      bonus: rows.reduce((s: number, r: any) => s + Number(r.balance_bonus || 0), 0),
    };
  }

  async getActiveUsers(): Promise<number> {
    return this.count('users', 'login_status=eq.ACTIVE');
  }

  async getOnlineSessions(): Promise<number> {
    const SESSION_MS = 300_000;
    const fiveMinAgo = new Date(Date.now() - SESSION_MS).toISOString();
    const rows = await this.get<any>('sessions', `logged_out_at=is.null&last_activity=gte.${fiveMinAgo}&select=id`);
    return rows.length;
  }

  async getWeeklyUserGrowth(): Promise<{ date: string; count: number }[]> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    sevenDaysAgo.setHours(0, 0, 0, 0);
    const rows = await this.get<any>('users', `created_at=gte.${sevenDaysAgo.toISOString()}&select=created_at`);
    const map = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      map.set(d.toISOString().slice(0, 10), 0);
    }
    for (const r of rows) {
      if (!r.created_at) continue;
      const day = r.created_at.slice(0, 10);
      if (map.has(day)) map.set(day, map.get(day)! + 1);
    }
    return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
  }

  async getTodayVolume(): Promise<{ deposits: number; withdrawals: number }> {
    const [depositVol, withdrawalVol] = await Promise.all([
      this.getTodayTransactionVolume('DEPOSIT'),
      this.getTodayTransactionVolume('WITHDRAWAL'),
    ]);
    return { deposits: depositVol, withdrawals: withdrawalVol };
  }

  async getPlatformHealth(): Promise<{
    activeUsers: number;
    onlineNow: number;
    totalBalance: { main: number; bonus: number };
    pendingCount: number;
  }> {
    const [activeUsers, onlineNow, totalBalance, pendingKyc] = await Promise.all([
      this.getActiveUsers(),
      this.getOnlineSessions(),
      this.getTotalWalletBalance(),
      this.rpc('count_kyc_by_status', { p_status: 'PENDING' }),
    ]);
    return { activeUsers, onlineNow, totalBalance, pendingCount: Number(pendingKyc) || 0 };
  }

  async probeConnection(): Promise<{ latencyMs: number; checkedAt: string }> {
    const startedAt = performance.now();
    const response = await fetch(`${environment.supabaseUrl}/auth/v1/health?ts=${Date.now()}`, {
      method: 'GET',
      headers: { apikey: environment.supabaseKey },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Health endpoint returned HTTP ${response.status}`);
    }

    return {
      latencyMs: Math.max(1, Math.round(performance.now() - startedAt)),
      checkedAt: new Date().toISOString(),
    };
  }
}
