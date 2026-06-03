import { Injectable, OnDestroy } from '@angular/core';
import { createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class RealtimeService implements OnDestroy {
  private supabase = createClient(
    environment.supabaseUrl,
    environment.supabaseKey
  );

  private readonly MAX_ARRAY_SIZE = 200;
  private transactionsSubject = new BehaviorSubject<any[]>([]);
  private walletsSubject = new BehaviorSubject<any[]>([]);
  private betsSubject = new BehaviorSubject<any[]>([]);
  private kycSubject = new BehaviorSubject<any[]>([]);
  private referralsSubject = new BehaviorSubject<any[]>([]);
  private usersSubject = new Subject<void>();
  private depositQueueSubject = new Subject<any>();
  private withdrawalQueueSubject = new Subject<any>();
  private engineStatusSubject = new Subject<any>();

  transactions$ = this.transactionsSubject.asObservable();
  wallets$ = this.walletsSubject.asObservable();
  bets$ = this.betsSubject.asObservable();
  kyc$ = this.kycSubject.asObservable();
  referrals$ = this.referralsSubject.asObservable();
  users$ = this.usersSubject.asObservable();
  depositQueue$ = this.depositQueueSubject.asObservable();
  withdrawalQueue$ = this.withdrawalQueueSubject.asObservable();
  engineStatus$ = this.engineStatusSubject.asObservable();

  private channels: Map<string, any> = new Map();
  private channelRefs: Map<string, number> = new Map();

  /** Subscribe dengan reference counting — aman dipanggil dari multiple components */
  subscribeTransactions() {
    this._addRef('transactions', () => {
      const channel = this.supabase
        .channel('transactions-all')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'transactions',
        }, (payload: any) => {
          this.handleTransactionChange(payload);
        })
        .subscribe();
      this.channels.set('transactions', channel);
    });
  }

  unsubscribeTransactions() {
    this._removeRef('transactions');
  }

  subscribeWallets() {
    this._addRef('wallets', () => {
      const channel = this.supabase
        .channel('wallets-all')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'wallet',
        }, (payload: any) => {
          this.handleWalletChange(payload);
        })
        .subscribe();
      this.channels.set('wallets', channel);
    });
  }

  unsubscribeWallets() {
    this._removeRef('wallets');
  }

  subscribeBets() {
    this._addRef('bets', () => {
      const channel = this.supabase
        .channel('bets-all')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'bets',
        }, (payload: any) => {
          this.handleBetChange(payload);
        })
        .subscribe();
      this.channels.set('bets', channel);
    });
  }

  unsubscribeBets() {
    this._removeRef('bets');
  }

  subscribeKyc() {
    this._addRef('kyc', () => {
      const channel = this.supabase
        .channel('kyc-all')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'kyc_documents',
        }, (payload: any) => {
          this.handleKycChange(payload);
        })
        .subscribe();
      this.channels.set('kyc', channel);
    });
  }

  unsubscribeKyc() {
    this._removeRef('kyc');
  }

  subscribeReferrals() {
    this._addRef('referrals', () => {
      const channel = this.supabase
        .channel('referrals-all')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'referrals',
        }, (payload: any) => {
          this.handleReferralChange(payload);
        })
        .subscribe();
      this.channels.set('referrals', channel);
    });
  }

  unsubscribeReferrals() {
    this._removeRef('referrals');
  }

  private _addRef(key: string, factory: () => void) {
    const refs = (this.channelRefs.get(key) || 0) + 1;
    this.channelRefs.set(key, refs);
    if (refs === 1 && !this.channels.has(key)) {
      factory();
    }
  }

  private _removeRef(key: string) {
    const refs = (this.channelRefs.get(key) || 1) - 1;
    if (refs <= 0) {
      const ch = this.channels.get(key);
      if (ch) {
        this.supabase.removeChannel(ch);
        this.channels.delete(key);
      }
      this.channelRefs.delete(key);
    } else {
      this.channelRefs.set(key, refs);
    }
  }

  private capArray(arr: any[], maxSize = this.MAX_ARRAY_SIZE): any[] {
    return arr.length > maxSize ? arr.slice(0, maxSize) : arr;
  }

  private async handleTransactionChange(payload: any) {
    const current = this.transactionsSubject.value;
    if (payload.eventType === 'DELETE') {
      this.transactionsSubject.next(
        this.capArray(current.filter(tx => tx.id !== payload.old.id))
      );
    } else if (payload.eventType === 'INSERT') {
      this.transactionsSubject.next(this.capArray([payload.new, ...current]));
      // Push to deposit/withdrawal queue subjects
      if (payload.new?.type === 'DEPOSIT') {
        this.depositQueueSubject.next(payload.new);
      } else if (payload.new?.type === 'WITHDRAWAL') {
        this.withdrawalQueueSubject.next(payload.new);
      }
    } else if (payload.eventType === 'UPDATE') {
      const idx = current.findIndex(tx => tx.id === payload.new.id);
      if (idx >= 0) {
        const updated = [...current];
        updated[idx] = payload.new;
        this.transactionsSubject.next(updated);
      }
      // Also emit to queue subjects on status changes
      if (payload.new?.type === 'DEPOSIT') this.depositQueueSubject.next(payload.new);
      if (payload.new?.type === 'WITHDRAWAL') this.withdrawalQueueSubject.next(payload.new);
    }
    console.log('[Realtime] Transaction updated:', payload.eventType, payload.new?.id?.slice(0, 8));
  }

  private async handleWalletChange(payload: any) {
    const current = this.walletsSubject.value;
    if (payload.eventType === 'DELETE') {
      this.walletsSubject.next(
        this.capArray(current.filter(w => w.id !== payload.old.id))
      );
    } else if (payload.eventType === 'INSERT') {
      this.walletsSubject.next(this.capArray([payload.new, ...current]));
    } else if (payload.eventType === 'UPDATE') {
      const idx = current.findIndex(w => w.id === payload.new.id);
      if (idx >= 0) {
        const updated = [...current];
        updated[idx] = payload.new;
        this.walletsSubject.next(updated);
      }
    }
    console.log('[Realtime] Wallet updated:', payload.eventType, payload.new?.user_id?.slice(0, 8));
  }

  private async handleBetChange(payload: any) {
    const current = this.betsSubject.value;
    if (payload.eventType === 'DELETE') {
      this.betsSubject.next(
        this.capArray(current.filter(b => b.id !== payload.old.id))
      );
    } else if (payload.eventType === 'INSERT') {
      this.betsSubject.next(this.capArray([payload.new, ...current]));
    } else if (payload.eventType === 'UPDATE') {
      const idx = current.findIndex(b => b.id === payload.new.id);
      if (idx >= 0) {
        const updated = [...current];
        updated[idx] = payload.new;
        this.betsSubject.next(updated);
      }
    }
    console.log('[Realtime] Bet updated:', payload.eventType, payload.new?.id?.slice(0, 8));
  }

  private async handleKycChange(payload: any) {
    const current = this.kycSubject.value;
    if (payload.eventType === 'DELETE') {
      this.kycSubject.next(
        this.capArray(current.filter(k => k.id !== payload.old.id))
      );
    } else if (payload.eventType === 'INSERT') {
      this.kycSubject.next(this.capArray([payload.new, ...current]));
    } else if (payload.eventType === 'UPDATE') {
      const idx = current.findIndex(k => k.id === payload.new.id);
      if (idx >= 0) {
        const updated = [...current];
        updated[idx] = payload.new;
        this.kycSubject.next(updated);
      }
    }
    console.log('[Realtime] KYC updated:', payload.eventType, payload.new?.id?.slice(0, 8));
  }

  private async handleReferralChange(payload: any) {
    const current = this.referralsSubject.value;
    if (payload.eventType === 'DELETE') {
      this.referralsSubject.next(
        this.capArray(current.filter(r => r.id !== payload.old.id))
      );
    } else if (payload.eventType === 'INSERT') {
      this.referralsSubject.next(this.capArray([payload.new, ...current]));
    } else if (payload.eventType === 'UPDATE') {
      const idx = current.findIndex(r => r.id === payload.new.id);
      if (idx >= 0) {
        const updated = [...current];
        updated[idx] = payload.new;
        this.referralsSubject.next(updated);
      }
    }
    console.log('[Realtime] Referral updated:', payload.eventType, payload.new?.id?.slice(0, 8));
  }

  subscribeUsers() {
    this._addRef('users', () => {
      const channel = this.supabase
        .channel('users-all')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'users',
        }, () => {
          this.usersSubject.next();
        })
        .subscribe();
      this.channels.set('users', channel);
    });
  }

  unsubscribeUsers() {
    this._removeRef('users');
  }

  subscribeEngineStatus() {
    this._addRef('engine_status', () => {
      const channel = this.supabase
        .channel('engine-results')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'king_results',
        }, (payload: any) => {
          this.engineStatusSubject.next(payload.new);
        })
        .subscribe();
      this.channels.set('engine_status', channel);
    });
  }

  unsubscribeEngineStatus() {
    this._removeRef('engine_status');
  }

  unsubscribeAll() {
    this.channels.forEach(channel => {
      this.supabase.removeChannel(channel);
    });
    this.channels.clear();
    this.channelRefs.clear();
  }

  ngOnDestroy() {
    this.unsubscribeAll();
  }
}
