import { Injectable, OnDestroy, inject } from '@angular/core';
import { createClient, RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';
import { BehaviorSubject, Subject, interval, Subscription } from 'rxjs';
import { ToastService } from 'src/app/core/services/toast.service';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  user_id: string;
  status: string;
  _poll?: boolean;
  user?: { username: string; display_name: string };
}

interface Wallet {
  id: string;
  user_id: string;
  balance_main: number;
  balance_bonus: number;
  total_deposited: number;
  total_withdrawn: number;
  total_turnover: number;
  updated_at: string;
  user?: { username: string; display_name: string; role: string };
}

interface Bet {
  id: string;
  selection: string;
  stake: number;
  session_code: string;
  status: string;
  result: string;
  actual_payout: number;
  user?: { username: string; display_name: string };
}

interface KycDocument {
  id: string;
  document_type: string;
  user_id: string;
  status: string;
}

interface Referral {
  id: string;
}

interface KingResult {
  d1: string;
  d2: string;
  d3: string;
  total: string;
  big_small: string;
  odd_even: string;
  session_code: string;
}



@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
  private toastService = inject(ToastService);

  private supabase = createClient(environment.supabaseUrl, environment.supabaseKey);

  private readonly MAX_ARRAY_SIZE = 200;
  private readonly POLL_INTERVAL_MS = 5000; // 5 second polling fallback
  private readonly WS_RETRY_MS = 30000; // Retry WebSocket every 30s

  private transactionsSubject = new BehaviorSubject<Transaction[]>([]);
  private walletsSubject = new BehaviorSubject<Wallet[]>([]);
  private betsSubject = new BehaviorSubject<Bet[]>([]);
  private kycSubject = new BehaviorSubject<KycDocument[]>([]);
  private referralsSubject = new BehaviorSubject<Referral[]>([]);
  private usersSubject = new Subject<void>();
  private depositQueueSubject = new Subject<Transaction | { _poll: boolean }>();
  private withdrawalQueueSubject = new Subject<Transaction>();
  private engineStatusSubject = new Subject<KingResult>();

  transactions$ = this.transactionsSubject.asObservable();
  wallets$ = this.walletsSubject.asObservable();
  bets$ = this.betsSubject.asObservable();
  kyc$ = this.kycSubject.asObservable();
  referrals$ = this.referralsSubject.asObservable();
  users$ = this.usersSubject.asObservable();
  depositQueue$ = this.depositQueueSubject.asObservable();
  withdrawalQueue$ = this.withdrawalQueueSubject.asObservable();
  engineStatus$ = this.engineStatusSubject.asObservable();

  private channels: Map<string, RealtimeChannel> = new Map();
  private channelRefs: Map<string, number> = new Map();
  private pollSubs: Map<string, Subscription> = new Map();
  private wsEnabled = false;
  private wsRetryTimer: any;

  constructor() {
    this.tryEnableWebSocket();
    this.scheduleWSRetry();
  }

  /** Attempt WebSocket connection, fallback to polling if it fails */
  private tryEnableWebSocket() {
    try {
      const channel = this.supabase.channel('health-check', { config: { broadcast: { ack: false } } });
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.wsEnabled = true;
          this.supabase.removeChannel(channel);
          clearTimeout(this.wsRetryTimer);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.wsEnabled = false;
        }
      });
      setTimeout(() => {
        if (!this.wsEnabled) {
          this.supabase.removeChannel(channel);
        }
      }, 5000);
    } catch (e) {
      this.wsEnabled = false;
    }
  }

  /** Retry WebSocket connection every 30 seconds if disabled */
  private scheduleWSRetry() {
    this.wsRetryTimer = setInterval(() => {
      if (!this.wsEnabled) {
        this.tryEnableWebSocket();
      }
    }, this.WS_RETRY_MS);
  }

  /** Subscribe dengan reference counting — aman dipanggil dari multiple components */
  subscribeTransactions() {
    this._addRef('transactions', () => {
      if (this.wsEnabled) {
        const channel = this.supabase
          .channel('transactions-all')
          .on<Transaction>('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, (payload) => {
            this.handleTransactionChange(payload);
          })
          .subscribe();
        this.channels.set('transactions', channel);
      } else {
        // Polling fallback
        this.pollSubs.set(
          'transactions',
          interval(this.POLL_INTERVAL_MS).subscribe(() => {
            this._pollTransactions();
          }),
        );
      }
    });
  }

  unsubscribeTransactions() {
    this._removeRef('transactions');
  }

  subscribeWallets() {
    this._addRef('wallets', () => {
      if (this.wsEnabled) {
        const channel = this.supabase
          .channel('wallets-all')
          .on<Wallet>('postgres_changes', { event: '*', schema: 'public', table: 'wallet' }, (payload) => {
            this.handleWalletChange(payload);
          })
          .subscribe();
        this.channels.set('wallets', channel);
      } else {
        this.pollSubs.set(
          'wallets',
          interval(this.POLL_INTERVAL_MS).subscribe(() => {
            this._pollWallets();
          }),
        );
      }
    });
  }

  unsubscribeWallets() {
    this._removeRef('wallets');
  }

  subscribeBets() {
    this._addRef('bets', () => {
      if (this.wsEnabled) {
        const channel = this.supabase
          .channel('bets-all')
          .on<Bet>('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, (payload) => {
            this.handleBetChange(payload);
          })
          .subscribe();
        this.channels.set('bets', channel);
      } else {
        this.pollSubs.set(
          'bets',
          interval(this.POLL_INTERVAL_MS).subscribe(() => {
            this._pollBets();
          }),
        );
      }
    });
  }

  unsubscribeBets() {
    this._removeRef('bets');
  }

  subscribeKyc() {
    this._addRef('kyc', () => {
      if (this.wsEnabled) {
        const channel = this.supabase
          .channel('kyc-all')
          .on<KycDocument>('postgres_changes', { event: '*', schema: 'public', table: 'kyc_documents' }, (payload) => {
            this.handleKycChange(payload);
          })
          .subscribe();
        this.channels.set('kyc', channel);
      } else {
        this.pollSubs.set(
          'kyc',
          interval(this.POLL_INTERVAL_MS).subscribe(() => {
            this._pollKyc();
          }),
        );
      }
    });
  }

  unsubscribeKyc() {
    this._removeRef('kyc');
  }

  subscribeReferrals() {
    this._addRef('referrals', () => {
      if (this.wsEnabled) {
        const channel = this.supabase
          .channel('referrals-all')
          .on<Referral>('postgres_changes', { event: '*', schema: 'public', table: 'referrals' }, (payload) => {
            this.handleReferralChange(payload);
          })
          .subscribe();
        this.channels.set('referrals', channel);
      }
    });
  }

  unsubscribeReferrals() {
    this._removeRef('referrals');
  }

  subscribeUsers() {
    this._addRef('users', () => {
      if (this.wsEnabled) {
        const channel = this.supabase
          .channel('users-all')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
            this.usersSubject.next();
          })
          .subscribe();
        this.channels.set('users', channel);
      } else {
        this.pollSubs.set(
          'users',
          interval(this.POLL_INTERVAL_MS).subscribe(() => {
            this.usersSubject.next();
          }),
        );
      }
    });
  }

  unsubscribeUsers() {
    this._removeRef('users');
  }

  subscribeEngineStatus() {
    this._addRef('engine_status', () => {
      if (this.wsEnabled) {
        const channel = this.supabase
          .channel('engine-results')
          .on<KingResult>('postgres_changes', { event: 'INSERT', schema: 'public', table: 'king_results' }, (payload) => {
            const result = payload.new;
            this.engineStatusSubject.next(result);
            this.toastService.success(
              '3D King Result',
              `${result.d1}${result.d2}${result.d3} = ${result.total} (${result.big_small}/${result.odd_even})`,
            );
          })
          .subscribe();
        this.channels.set('engine_status', channel);
      } else {
        this.pollSubs.set(
          'engine_status',
          interval(this.POLL_INTERVAL_MS).subscribe(() => {
            this._pollEngineResults();
          }),
        );
      }
    });
  }

  unsubscribeEngineStatus() {
    this._removeRef('engine_status');
  }

  // ── Polling Fallback Methods ──

  private async _pollTransactions() {
    try {
      const res = await fetch(
        `${environment.supabaseUrl}/rest/v1/transactions?select=*,user:users!transactions_user_id_fkey(username,display_name)&order=created_at.desc&limit=50`,
        { headers: { apikey: environment.supabaseKey, Authorization: `Bearer ${environment.supabaseKey}` } },
      );
      if (res.ok) {
        const data = await res.json();
        this.transactionsSubject.next(data || []);
        if (data?.length) this.depositQueueSubject.next({ _poll: true });
      }
    } catch {
      /* polling fallback silent */
    }
  }

  private async _pollWallets() {
    try {
      const res = await fetch(
        `${environment.supabaseUrl}/rest/v1/wallet?select=user_id,balance_main,balance_bonus,total_deposited,total_withdrawn,total_turnover,updated_at,user:users!inner(username,display_name,role)&user.role=eq.user&order=updated_at.desc&limit=50`,
        { headers: { apikey: environment.supabaseKey, Authorization: `Bearer ${environment.supabaseKey}` } },
      );
      if (res.ok) {
        const data = await res.json();
        this.walletsSubject.next(data || []);
      }
    } catch {
      /* silent */
    }
  }

  private async _pollBets() {
    try {
      const res = await fetch(
        `${environment.supabaseUrl}/rest/v1/bets?select=*,user:users!bets_user_id_fkey(username,display_name)&order=created_at.desc&limit=50`,
        { headers: { apikey: environment.supabaseKey, Authorization: `Bearer ${environment.supabaseKey}` } },
      );
      if (res.ok) {
        const data = await res.json();
        this.betsSubject.next(data || []);
      }
    } catch {
      /* silent */
    }
  }

  private async _pollKyc() {
    try {
      const res = await fetch(`${environment.supabaseUrl}/rest/v1/rpc/get_kyc_documents_admin_list`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: environment.supabaseKey,
          Authorization: `Bearer ${environment.supabaseKey}`,
        },
        body: '{}',
      });
      if (res.ok) {
        const data = await res.json();
        this.kycSubject.next(Array.isArray(data) ? data : []);
      }
    } catch {
      /* silent */
    }
  }

  private async _pollEngineResults() {
    try {
      const res = await fetch(`${environment.supabaseUrl}/rest/v1/king_results?order=session_code.desc&limit=1`, {
        headers: { apikey: environment.supabaseKey, Authorization: `Bearer ${environment.supabaseKey}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.length) this.engineStatusSubject.next(data[0]);
      }
    } catch {
      /* silent */
    }
  }

  private _addRef(key: string, factory: () => void) {
    const refs = (this.channelRefs.get(key) || 0) + 1;
    this.channelRefs.set(key, refs);
    if (refs === 1 && !this.channels.has(key) && !this.pollSubs.has(key)) {
      factory();
    }
  }

  private _removeRef(key: string) {
    if (!this.channelRefs.has(key)) return;
    const refs = this.channelRefs.get(key)! - 1;
    if (refs <= 0) {
      const ch = this.channels.get(key);
      if (ch) {
        this.supabase.removeChannel(ch);
        this.channels.delete(key);
      }
      const poll = this.pollSubs.get(key);
      if (poll) {
        poll.unsubscribe();
        this.pollSubs.delete(key);
      }
      this.channelRefs.delete(key);
    } else {
      this.channelRefs.set(key, refs);
    }
  }

  private capArray<T>(arr: T[], maxSize = this.MAX_ARRAY_SIZE): T[] {
    return arr.length > maxSize ? arr.slice(0, maxSize) : arr;
  }

  // ── Handlers ──

  private async handleTransactionChange(payload: RealtimePostgresChangesPayload<Transaction>) {
    const current = this.transactionsSubject.value;
    if (payload.eventType === 'DELETE') {
      this.transactionsSubject.next(this.capArray(current.filter((t) => t.id !== payload.old.id)));
    } else if (payload.eventType === 'INSERT') {
      const tx = payload.new;
      this.transactionsSubject.next(this.capArray([tx, ...current]));
      if (tx.type === 'DEPOSIT') {
        this.depositQueueSubject.next(tx);
        this.toastService.info('Deposit Baru', `Deposit ${tx.amount}P dari user ${tx.user_id?.slice(0, 8)}`);
      } else if (tx.type === 'WITHDRAWAL') {
        this.withdrawalQueueSubject.next(tx);
        this.toastService.info('Withdrawal Baru', `Withdrawal ${tx.amount}P dari user ${tx.user_id?.slice(0, 8)}`);
      }
    } else if (payload.eventType === 'UPDATE') {
      const tx = payload.new;
      const idx = current.findIndex((t) => t.id === tx.id);
      if (idx >= 0) {
        const updated = [...current];
        updated[idx] = tx;
        this.transactionsSubject.next(updated);
      }
      if (tx.type === 'DEPOSIT') this.depositQueueSubject.next(tx);
      if (tx.type === 'WITHDRAWAL') this.withdrawalQueueSubject.next(tx);
      if (payload.old.status !== tx.status) {
        const userLabel = tx.user?.username || tx.user_id?.slice(0, 8) || 'User';
        if (tx.type === 'DEPOSIT') {
          if (tx.status === 'COMPLETED') this.toastService.success('Deposit Disetujui', `${userLabel}: ${tx.amount}P`);
          else if (tx.status === 'FAILED') this.toastService.error('Deposit Ditolak', `${userLabel}: ${tx.amount}P`);
        } else if (tx.type === 'WITHDRAWAL') {
          if (tx.status === 'COMPLETED')
            this.toastService.success('Withdrawal Disetujui', `${userLabel}: ${tx.amount}P`);
          else if (tx.status === 'FAILED')
            this.toastService.error('Withdrawal Ditolak', `${userLabel}: ${tx.amount}P`);
        }
      }
    }
  }

  private async handleWalletChange(payload: RealtimePostgresChangesPayload<Wallet>) {
    const current = this.walletsSubject.value;
    if (payload.eventType === 'DELETE') {
      this.walletsSubject.next(this.capArray(current.filter((w) => w.id !== payload.old.id)));
    } else if (payload.eventType === 'INSERT') {
      const w = payload.new;
      this.walletsSubject.next(this.capArray([w, ...current]));
    } else if (payload.eventType === 'UPDATE') {
      const w = payload.new;
      const idx = current.findIndex((x) => x.id === w.id);
      if (idx >= 0) {
        const updated = [...current];
        updated[idx] = w;
        this.walletsSubject.next(updated);
      }
    }
  }

  private async handleBetChange(payload: RealtimePostgresChangesPayload<Bet>) {
    const current = this.betsSubject.value;
    if (payload.eventType === 'DELETE') {
      this.betsSubject.next(this.capArray(current.filter((b) => b.id !== payload.old.id)));
    } else if (payload.eventType === 'INSERT') {
      const bet = payload.new;
      this.betsSubject.next(this.capArray([bet, ...current]));
      this.toastService.info('Bet Baru', `${bet.selection} ${bet.stake}P — Session ${bet.session_code}`);
    } else if (payload.eventType === 'UPDATE') {
      const bet = payload.new;
      const idx = current.findIndex((b) => b.id === bet.id);
      if (idx >= 0) {
        const updated = [...current];
        updated[idx] = bet;
        this.betsSubject.next(updated);
      }
      if (payload.old.status === 'PENDING' && bet.status === 'SETTLED') {
        const result = bet.result === 'WIN' ? 'Menang' : 'Kalah';
        const payout = bet.actual_payout || 0;
        if (bet.result === 'WIN') {
          this.toastService.success(`Bet ${result}!`, `${bet.selection} — Payout: ${payout}P`);
        } else {
          this.toastService.warning(`Bet ${result}`, `${bet.selection} — Session ${bet.session_code}`);
        }
      }
    }
  }

  private async handleKycChange(payload: RealtimePostgresChangesPayload<KycDocument>) {
    const current = this.kycSubject.value;
    if (payload.eventType === 'DELETE') {
      this.kycSubject.next(this.capArray(current.filter((k) => k.id !== payload.old.id)));
    } else if (payload.eventType === 'INSERT') {
      const kyc = payload.new;
      this.kycSubject.next(this.capArray([kyc, ...current]));
      this.toastService.info('KYC Baru', `Dokumen ${kyc.document_type} dari user ${kyc.user_id?.slice(0, 8)}`);
    } else if (payload.eventType === 'UPDATE') {
      const kyc = payload.new;
      const idx = current.findIndex((k) => k.id === kyc.id);
      if (idx >= 0) {
        const updated = [...current];
        updated[idx] = kyc;
        this.kycSubject.next(updated);
      }
      if (payload.old.status !== kyc.status) {
        if (kyc.status === 'PENDING') {
          this.toastService.info('KYC Diperbarui', `Dokumen menunggu review`);
        } else if (kyc.status === 'APPROVED') {
          this.toastService.success('KYC Disetujui', `Dokumen telah diverifikasi`);
        } else if (kyc.status === 'REJECTED') {
          this.toastService.error('KYC Ditolak', `Dokumen ditolak`);
        }
      }
    }
  }

  private async handleReferralChange(payload: RealtimePostgresChangesPayload<Referral>) {
    const current = this.referralsSubject.value;
    if (payload.eventType === 'DELETE') {
      this.referralsSubject.next(this.capArray(current.filter((r) => r.id !== payload.old.id)));
    } else if (payload.eventType === 'INSERT') {
      const r = payload.new;
      this.referralsSubject.next(this.capArray([r, ...current]));
    } else if (payload.eventType === 'UPDATE') {
      const r = payload.new;
      const idx = current.findIndex((x) => x.id === r.id);
      if (idx >= 0) {
        const updated = [...current];
        updated[idx] = r;
        this.referralsSubject.next(updated);
      }
    }
  }

  unsubscribeAll() {
    this.channels.forEach((channel) => {
      this.supabase.removeChannel(channel);
    });
    this.channels.clear();
    this.pollSubs.forEach((sub) => sub.unsubscribe());
    this.pollSubs.clear();
    this.channelRefs.clear();
  }

  ngOnDestroy() {
    clearInterval(this.wsRetryTimer);
    this.unsubscribeAll();
  }
}
