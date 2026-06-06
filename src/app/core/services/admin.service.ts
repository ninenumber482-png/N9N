import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { AuthService } from 'src/app/core/services/auth.service';

export class AdminRpcError extends Error {
  constructor(
    message: string,
    public readonly code: 'FORBIDDEN' | 'TX_NOT_FOUND' | 'TX_NOT_PENDING' | 'UNKNOWN',
    public readonly detail?: string,
  ) { super(message); this.name = 'AdminRpcError'; }

  static fromMessage(msg: string): AdminRpcError {
    if (msg.startsWith('FORBIDDEN:')) return new AdminRpcError('Akses ditolak. Hanya admin yang dapat melakukan tindakan ini.', 'FORBIDDEN', msg.slice(10).trim());
    if (msg === 'TX_NOT_FOUND') return new AdminRpcError('Transaksi tidak ditemukan atau sudah diproses.', 'TX_NOT_FOUND');
    if (msg === 'TX_NOT_PENDING') return new AdminRpcError('Transaksi sudah diproses sebelumnya.', 'TX_NOT_PENDING');
    if (msg === 'CANNOT_SELF_APPROVE') return new AdminRpcError('Tidak dapat menyetujui akun sendiri.', 'FORBIDDEN');
    if (msg === 'CANNOT_SELF_REJECT') return new AdminRpcError('Tidak dapat menolak akun sendiri.', 'FORBIDDEN');
    if (msg === 'USER_NOT_FOUND_OR_NOT_PENDING') return new AdminRpcError('User tidak ditemukan atau sudah diproses.', 'TX_NOT_FOUND');
    return new AdminRpcError(msg, 'UNKNOWN');
  }
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private proxyUrl = `${environment.supabaseUrl}/functions/v1/admin-proxy`;

  /** In-memory cache with TTL (5s) and user context to prevent data leakage */
  private cache = new Map<string, { data: any; ts: number }>();
  private readonly CACHE_TTL = 5000;

  constructor(private auth: AuthService) {}

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
    return fetcher().then(data => {
      this.cache.set(cacheKey, { data, ts: Date.now() });
      return data;
    });
  }

  private getToken(): string {
    const user = this.auth.getCurrentUser();
    if (!user?.token) {
      // Token missing - this should not happen in production
      throw new Error('User token not available. User may not be authenticated.');
    }
    return user.token;
  }

  private async proxy<T>(method: string, path: string, body?: any, prefer?: string): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: environment.supabaseKey,
      Authorization: `Bearer ${environment.supabaseKey}`,
      'x-session-token': this.getToken(),
    };
    if (prefer) headers['Prefer'] = prefer;

    const res = await fetch(this.proxyUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ method, path, body, prefer }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw AdminRpcError.fromMessage(text.length < 200 ? text : `${res.status}`);
    }
    const text = await res.text();
    if (!text) return undefined as any;
    try { return JSON.parse(text); } catch { return text as any; }
  }

  private async get<T>(table: string, query = ''): Promise<T[]> {
    const sep = table.includes('?') ? '&' : '?';
    const path = query ? `/${table}${sep}${query}` : `/${table}`;
    const cacheKey = `GET:${path}`;
    return this.cached(cacheKey, () => this.proxy<T[]>('GET', path));
  }

  async count(table: string, query = ''): Promise<number> {
    const path = `/${table}?${query}&select=count`;
    const cacheKey = `COUNT:${path}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL) {
      return Promise.resolve(cached.data as number);
    }
    const res = await fetch(this.proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: environment.supabaseKey,
        Authorization: `Bearer ${environment.supabaseKey}`,
        'x-session-token': this.getToken(),
      },
      body: JSON.stringify({ method: 'GET', path, prefer: 'count=exact' }),
    });
    if (!res.ok) return 0;
    const val = Number(res.headers.get('content-range')?.split('/')[1] || 0);
    this.cache.set(cacheKey, { data: val, ts: Date.now() });
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
    const id = rows[0]?.id;
    if (!id) throw new Error(`Admin not found: ${usernameOrId}`);
    this.adminIdCache[usernameOrId] = id;
    return id;
  }

  async rpc(name: string, params: Record<string, any> = {}): Promise<any> {
    const cacheKey = `RPC:${name}:${JSON.stringify(params)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL) {
      return Promise.resolve(cached.data);
    }
    const data = await this.proxy<any>('POST', `/rpc/${name}`, params);
    this.cache.set(cacheKey, { data, ts: Date.now() });
    return data;
  }

  // ── USERS ──
  // getUsers unused — getUsersWithWallets is used instead
  getUsersWithWallets(limit = 100) { return this.get<any>('users', `select=id,username,display_name,email,phone,country,role,registration_status,login_status,account_status,kyc_status,referral_code,bank_name,bank_account_number,bank_account_name,created_at,approved_at,wallet(balance_main,balance_bonus)&order=created_at.desc&limit=${limit}`); }
  // getUser unused — queries by UUID
  updateUser(id: string, data: any) { return this.updateRow('users', id, data); }
  // deleteUser unused — no delete UI
  countUsers() { return this.count('users'); }
  getUserSessionsForUser(userId: string, limit = 5) {
    return this.get<any>(`sessions?user_id=eq.${userId}&order=last_activity.desc&limit=${limit}`);
  }
  getActiveSessionsForUsers(userIds: string[]) {
    const filter = userIds.map(id => `user_id=eq.${id}`).join(',');
    return this.get<any>(`sessions?or=(${filter})&logged_out_at=is.null&order=last_activity.desc`);
  }
  getAuditLogsByResource(resourceId: string, limit = 10) {
    return this.get<any>(`audit_log?resource_id=eq.${resourceId}&order=created_at.desc&limit=${limit}`);
  }
  getKycDocsByUser(userId: string) {
    return this.rpc('get_kyc_documents_by_user', { p_user_id: userId });
  }

  // ── WALLET ──
  getWallets(limit = 100) { return this.get<any>('wallet', `select=user_id,balance_main,balance_bonus,total_deposited,total_withdrawn,total_turnover,updated_at,user:users!inner(username,display_name,role)&user.role=eq.user&order=updated_at.desc&limit=${limit}`); }
  getWallet(userId: string) { return this.get<any>(`wallet?user_id=eq.${userId}`, 'limit=1'); }
  updateWalletRow(userId: string, data: any) {
    return this.proxy<any>('PATCH', `/wallet?user_id=eq.${userId}`, data);
  }

  // ── PLATFORM ACCOUNTS ──
  getPlatformAccounts() { return this.get<any>('platform_accounts', 'order=created_at.asc'); }
  createPlatformAccount(data: any) { return this.insertRow<any>('platform_accounts', data); }
  updatePlatformAccount(id: string, data: any) {
    return this.updateRow('platform_accounts', id, { ...data, updated_at: new Date().toISOString() });
  }

  // ── TRANSACTIONS (used for deposits, withdrawals, all tx) ──
  getTransactions(type?: string, limit = 100) {
    const typeFilter = type ? `&type=eq.${type}` : '';
    return this.get<any>('transactions', `select=*,user:users!transactions_user_id_fkey(username,display_name)&order=created_at.desc&limit=${limit}${typeFilter}`);
  }
  getDeposits() { return this.getTransactions('DEPOSIT'); }
  getWithdrawals() { return this.getTransactions('WITHDRAWAL'); }
  updateTransaction(id: string, data: any) { return this.updateRow('transactions', id, data); }
  countTransactions() { return this.count('transactions'); }
  countPending(type: string) { return this.count('transactions', `type=eq.${type}&status=eq.PENDING`); }
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
  getBets(limit = 100) { return this.get<any>(`bets?select=*,user:users!bets_user_id_fkey(username,display_name)&order=created_at.desc&limit=${limit}`); }
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
    return this.proxy<any>('POST', '/king_planned?on_conflict=session_code', {
      session_code: code, d1, d2, d3, updated_at: new Date().toISOString(),
    }, 'resolution=merge-duplicates,return=representation');
  }
  getDepositLocks() {
    return this.get<any>('deposit_locks', 'select=user_id,turnover_required,turnover_applied');
  }
  getEngineStatus() {
    return this.proxy<any>('GET', '/engine_status?limit=1');
  }

  // ── KYC DOCUMENTS ──
  getKycDocuments() { return this.rpc('get_kyc_documents_admin_list'); }
  getKycDocumentUrl(id: string) { return this.rpc('get_kyc_document_url', { p_id: id }); }
  updateKycStatus(id: string, status: string, rejectionReason?: string) {
    return this.updateRow('kyc_documents', id, {
      status, rejection_reason: rejectionReason || null, reviewed_at: new Date().toISOString(),
    });
  }

  // ── REFERRALS ──
  getReferrals() { return this.get<any>('referrals', 'select=*,creator:users!referrals_created_by_fkey(username,display_name)&order=created_at.desc'); }
  // getReferralStats unused — data from referrals table directly
  async generateReferralCode(usernameOrId: string): Promise<string> {
    const adminId = await this.resolveAdminId(usernameOrId);
    const result = await this.rpc('generate_referral_code', { p_admin_id: adminId });
    if (Array.isArray(result) && result.length > 0) {
      return result[0]?.generate_referral_code || String(result[0]);
    }
    return String(result);
  }
  updateReferral(id: string, data: any) {
    return this.updateRow('referrals', id, { ...data, updated_at: new Date().toISOString() });
  }
  getUsersByReferral(referralId: string) {
    return this.get<any>(`users?referred_by=eq.${referralId}&order=created_at.desc`);
  }
  async updateReferralStatus(id: string, status: string) {
    return this.updateRow('referrals', id, { status, updated_at: new Date().toISOString() });
  }

  getUserByUsername(username: string) {
    return this.get<any>('users', `username=eq.${encodeURIComponent(username)}&select=id,username,display_name,email,role&limit=1`);
  }

  // ── MEMBER MANAGEMENT ──
  async resetPassword(userId: string, adminId: string, newPassword: string) {
    return this.rpc('admin_reset_password', { p_admin_id: adminId, p_user_id: userId, p_new_password: newPassword });
  }
  async adjustBalance(adminId: string, userId: string, amount: number, reason?: string) {
    return this.rpc('admin_adjust_balance', { p_admin_id: adminId, p_user_id: userId, p_amount: amount, p_reason: reason || null });
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
  getUserSessions(limit = 50) { return this.get<any>(`sessions?order=last_activity.desc&limit=${limit}`); }
  endUserSession(sessionId: string) {
    return this.updateRow('sessions', sessionId, { logged_out_at: new Date().toISOString(), logout_reason: 'Admin terminated' });
  }

  // ── AUDIT LOGS ──
  getAuditLogs(limit = 50) { return this.get<any>(`audit_log?order=created_at.desc&limit=${limit}`); }
  async logAction(usernameOrId: string, action: string, resourceType: string, resourceId?: string, oldValue?: string, newValue?: string) {
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
  getTransactionAudit(limit = 100) { return this.get<any>(`transaction_audit?order=created_at.desc&limit=${limit}`); }
  getUserAudit(limit = 50) { return this.get<any>(`user_audit?order=created_at.desc&limit=${limit}`); }
  getSecurityAlerts(limit = 50) { return this.get<any>(`security_alerts?order=created_at.desc&limit=${limit}`); }
  getFailedLogins(limit = 50) { return this.get<any>(`failed_logins?order=attempted_at.desc&limit=${limit}`); }
  // getTransactionAudit unused — audit_component uses getUserAudit instead
  // getMetrics unused

  // ── GAME SESSIONS (grouped from bets table by session_code) ──
  async getGameSessions(): Promise<any[]> {
    const bets = await this.getBets(1000);
    const grouped: Record<string, any[]> = {};
    bets.forEach((b: any) => {
      if (!b.session_code) return;
      if (!grouped[b.session_code]) grouped[b.session_code] = [];
      grouped[b.session_code].push(b);
    });
    return Object.entries(grouped).map(([code, sessionBets]: [string, any]) => {
      const totalStake = sessionBets.reduce((s: number, b: any) => s + Number(b.stake), 0);
      const totalPayout = sessionBets.reduce((s: number, b: any) => s + Number(b.actual_payout || 0), 0);
      const settled = sessionBets.every((b: any) => b.status === 'SETTLED');
      return {
        session_code: code,
        status: settled ? 'SETTLED' : 'OPEN',
        bet_count: sessionBets.length,
        total_stake: totalStake,
        total_payout: totalPayout,
        created_at: sessionBets[0]?.created_at,
      };
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // ── PLATFORM CONFIG (CS Contact, etc.) ──
  async getConfigs(query = '') {
    const path = query ? `/platform_config?${query}` : '/platform_config';
    return this.proxy<any[]>('GET', path);
  }
  async getConfig(key: string): Promise<any> {
    const rows = await this.get<any>('platform_config', `key=eq.${key}&limit=1`);
    return rows[0] || null;
  }
  async updateConfig(key: string, value: string): Promise<void> {
    await this.proxy<void>('PATCH', `/platform_config?key=eq.${key}`, { value, updated_at: new Date().toISOString() });
  }
  async insertConfig(data: { key: string; value: string }): Promise<any[]> {
    return this.insertRow('platform_config', data);
  }

  // ── POPUP BANNERS ──
  getPopupBanners(limit = 50) {
    return this.get<any>(`popup_banners?order=created_at.desc&limit=${limit}`);
  }
  deletePopupBannerRow(id: string) {
    return this.deleteRow('popup_banners', id);
  }
  updatePopupBannerRow(id: string, data: any) {
    return this.updateRow('popup_banners', id, data);
  }
  async uploadPopupImage(dataUrl: string, title: string, linkUrl = '', bannerId?: string): Promise<any> {
    const token = this.getToken();
    const res = await fetch(`${environment.supabaseUrl}/functions/v1/admin-popup-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: environment.supabaseKey,
        Authorization: `Bearer ${environment.supabaseKey}`,
        'x-session-token': token,
      },
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
}
