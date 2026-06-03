import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AdminService } from '../../../../core/services/admin.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { RealtimeService } from '../../../../core/services/realtime.service';
import { WibDatePipe } from '../../../../shared/pipes/wib-date.pipe';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [CommonModule, FormsModule, WibDatePipe, ConfirmDialogComponent, PaginationComponent],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="max-sm:text-lg sm:text-2xl font-extrabold text-foreground">Transactions</h1>
          <p class="text-muted-foreground mt-1 text-sm">Verifikasi dan kelola seluruh transaksi platform</p>
        </div>
        <button (click)="load()" class="bg-card border-border text-muted-foreground hover:text-foreground rounded-lg border px-3 py-2 text-xs font-semibold transition-colors">
          ↻ Refresh
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <input [(ngModel)]="search" (ngModelChange)="applyFilter()" placeholder="Cari ref, username, nominal…"
          class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs outline-none w-56" />
        <select [(ngModel)]="typeFilter" (ngModelChange)="applyFilter()" class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs font-semibold outline-none">
          <option value="">Semua Tipe</option>
          <option value="DEPOSIT">Deposit</option>
          <option value="WITHDRAWAL">Withdrawal</option>
          <option value="BET">Bet</option>
        </select>
        <select [(ngModel)]="statusFilter" (ngModelChange)="applyFilter()" class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs font-semibold outline-none">
          <option value="">Semua Status</option>
          <option value="PENDING">Pending</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      @if (error) {
        <div class="bg-red-400/10 border border-red-400/30 rounded-xl p-4 text-sm text-red-400">
          <p class="font-bold">Gagal memuat transaksi</p>
          <p class="text-xs mt-1">{{ error }}</p>
          <button (click)="load()" class="mt-2 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-semibold">Coba Lagi</button>
        </div>
      }

      @if (loading) {
        <div class="text-muted-foreground py-12 text-center">Memuat transaksi...</div>
      }

      <div class="bg-card border-border rounded-xl border shadow-sm" [class.hidden]="loading">
        <div class="overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Ref#</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">User</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Tipe</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Nominal</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Metode</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Status</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Tanggal</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 w-40">Aksi</th>
              </tr>
            </thead>
            <tbody>
              @for (tx of displayItems; track tx.id) {
                <tr class="border-border hover:bg-muted/30 border-b text-xs transition-colors cursor-pointer"
                    (click)="toggleDetail(tx)">
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono text-[10px] text-muted-foreground">{{ tx.id.slice(0,8).toUpperCase() }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p class="font-semibold text-foreground">{{ tx.user?.display_name || tx.user?.username || '—' }}</p>
                    <p class="text-muted-foreground text-[10px]">&#64;{{ tx.user?.username || tx.user_id.slice(0,8) }}</p>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <span [class]="'rounded px-2 py-0.5 text-[10px] font-bold ' + typeClass(tx.type)">{{ tx.type }}</span>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-bold text-foreground">{{ tx.amount | number:'1.0-0' }} P</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-[10px] text-muted-foreground">{{ tx.method || tx.bank_name || '-' }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <span [class]="'rounded px-2 py-0.5 text-[10px] font-bold ' + statusClass(tx.status)">{{ tx.status }}</span>
                  </td>
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 whitespace-nowrap text-[10px]">{{ tx.created_at | wibDate:'short' }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" (click)="$event.stopPropagation()">
                    <div class="flex flex-wrap gap-1">
                      @if (tx.status === 'PENDING') {
                        <button (click)="confirmAction('approve', tx)" class="bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 rounded px-2 py-1 text-[10px] font-bold">Approve</button>
                        <button (click)="confirmAction('reject', tx)" class="bg-red-400/10 text-red-400 hover:bg-red-400/20 rounded px-2 py-1 text-[10px] font-bold">Reject</button>
                      }
                      @if (tx.proof_image_url) {
                        <a [href]="tx.proof_image_url" target="_blank"
                          class="bg-primary/10 text-primary hover:bg-primary/20 rounded px-2 py-1 text-[10px] font-bold">Bukti</a>
                      }
                    </div>
                  </td>
                </tr>

              } @empty {
                <tr><td colspan="8" class="text-muted-foreground px-4 py-12 text-center">Tidak ada transaksi ditemukan.</td></tr>
              }
            </tbody>
          </table>
        </div>
        <app-pagination [currentPage]="currentPage" [totalItems]="filtered.length" (pageChange)="onPageChange($event)"></app-pagination>
      </div>
    </div>

    <!-- Detail Modal -->
    @if (selectedTx) {
      <div class="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/60" (click)="closeDetail()">
        <div class="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 class="text-sm font-extrabold text-foreground">Detail Transaksi</h3>
            <button (click)="closeDetail()" class="text-muted-foreground hover:text-foreground text-lg leading-none">&times;</button>
          </div>
          <div class="px-5 py-4 max-h-[65vh] overflow-y-auto">
            <div class="grid gap-4 sm:grid-cols-3">
              <!-- Col 1: Details -->
              <div class="space-y-1.5">
                <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Info Transaksi</p>
                <p class="text-xs"><span class="text-muted-foreground">ID: </span><span class="font-mono font-semibold text-foreground text-[10px]">{{ selectedTx.id }}</span></p>
                <p class="text-xs"><span class="text-muted-foreground">Nominal: </span><span class="font-bold text-foreground">{{ selectedTx.amount | number:'1.2-2' }} P</span></p>
                @if (selectedTx.withdrawal_fee) {
                  <p class="text-xs"><span class="text-muted-foreground">Fee: </span><span class="text-red-400 font-semibold">{{ selectedTx.withdrawal_fee | number:'1.2-2' }} P</span></p>
                }
                @if (selectedTx.method) {
                  <p class="text-xs"><span class="text-muted-foreground">Metode: </span><span class="text-foreground font-semibold">{{ selectedTx.method }}</span></p>
                }
                @if (selectedTx.bank_name) {
                  <p class="text-xs"><span class="text-muted-foreground">Bank: </span><span class="text-foreground font-semibold">{{ selectedTx.bank_name }}</span></p>
                  <p class="text-xs"><span class="text-muted-foreground">No. Rek: </span><span class="text-foreground font-semibold">{{ selectedTx.bank_account_number }}</span></p>
                  <p class="text-xs"><span class="text-muted-foreground">Nama: </span><span class="text-foreground font-semibold">{{ selectedTx.bank_account_name }}</span></p>
                }
                <p class="text-xs"><span class="text-muted-foreground">Diminta: </span><span class="text-foreground font-semibold">{{ selectedTx.created_at | wibDate:'medium' }}</span></p>
                @if (selectedTx.processed_at) {
                  <p class="text-xs"><span class="text-muted-foreground">Diproses: </span><span class="text-foreground font-semibold">{{ selectedTx.processed_at | wibDate:'medium' }}</span></p>
                }
              </div>
              <!-- Col 2: Admin Notes -->
              <div class="space-y-1.5">
                <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Catatan Admin</p>
                <textarea [(ngModel)]="editNotes[selectedTx.id]" placeholder="Tambah catatan…" rows="4"
                  class="bg-card border-border text-foreground text-xs rounded-lg border px-3 py-2 outline-none w-full resize-none"></textarea>
                <div class="flex items-center gap-2 mt-1">
                  <button (click)="saveNotes(selectedTx)"
                    [disabled]="savingNotes[selectedTx.id]"
                    class="bg-primary text-primary-foreground disabled:opacity-60 rounded px-3 py-1 text-[10px] font-bold transition-opacity">
                    {{ savingNotes[selectedTx.id] ? 'Menyimpan…' : 'Simpan Catatan' }}
                  </button>
                  @if (savedNotes[selectedTx.id]) {
                    <span class="text-emerald-400 text-[10px] font-semibold">✓ Tersimpan</span>
                  }
                </div>
              </div>
              <!-- Col 3: Proof & Bet Info -->
              <div class="space-y-1.5">
                @if (selectedTx.proof_image_url) {
                  <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Bukti Pembayaran</p>
                  <a [href]="selectedTx.proof_image_url" target="_blank">
                    <img [src]="selectedTx.proof_image_url" alt="Bukti" class="rounded-lg max-h-40 object-cover border border-border" />
                  </a>
                }
                @if (selectedTx.bet_code) {
                  <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Info Bet</p>
                  <p class="text-xs"><span class="text-muted-foreground">Kode: </span><span class="font-mono font-semibold text-foreground">{{ selectedTx.bet_code }}</span></p>
                  @if (selectedTx.result) {
                    <p class="text-xs"><span class="text-muted-foreground">Hasil: </span><span class="font-semibold text-foreground">{{ selectedTx.result }}</span></p>
                  }
                  @if (selectedTx.payout) {
                    <p class="text-xs"><span class="text-muted-foreground">Payout: </span><span class="font-semibold text-emerald-400">{{ selectedTx.payout | number:'1.2-2' }} P</span></p>
                  }
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    }

    <app-confirm-dialog
      [open]="confirm.open"
      [title]="confirm.title"
      [message]="confirm.message"
      [icon]="confirm.icon"
      [iconBg]="confirm.iconBg"
      [confirmText]="confirm.confirmText"
      [cancelText]="confirm.cancelText"
      [loading]="confirm.loading"
      [loadingText]="confirm.loadingText"
      [confirmVariant]="confirm.confirmVariant"
      (onConfirm)="executeConfirm()"
      (onCancel)="cancelDialog()"
    />
  `,
})
export class TransactionsComponent implements OnInit, OnDestroy {
  all: any[] = [];
  filtered: any[] = [];
  currentPage = 1;
  pageSize = 20;
  search = '';
  typeFilter = '';
  statusFilter = '';
  selectedTx: any = null;
  editNotes: Record<string, string> = {};
  savingNotes: Record<string, boolean> = {};
  savedNotes: Record<string, boolean> = {};
  loading = false;

  confirm = {
    open: false, title: '', message: '', icon: '', iconBg: 'bg-primary/10',
    confirmText: 'Confirm', cancelText: 'Cancel', loading: false,
    loadingText: 'Processing…', confirmVariant: 'primary' as 'primary' | 'danger' | 'success' | 'warning',
    action: '', tx: null as any,
  };
  error: string | null = null;
  private destroy$ = new Subject<void>();

  get displayItems() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }

  constructor(
    private admin: AdminService,
    private auth: AuthService,
    private notification: NotificationService,
    private realtime: RealtimeService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.load();
    this.subscribeTransactions();
  }

  ngOnDestroy() {
    this.realtime.unsubscribeTransactions();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private subscribeTransactions() {
    // Subscribe to realtime transaction updates — hapus polling timer
    this.realtime.subscribeTransactions();
    this.realtime.transactions$
      .pipe(takeUntil(this.destroy$))
      .subscribe(transactions => {
        if (transactions) {
          this.all = transactions;
          this.all.forEach(tx => {
            if (tx.notes && !this.editNotes[tx.id]) {
              this.editNotes[tx.id] = tx.notes;
            }
          });
          this.applyFilter();
          this.cdr.markForCheck();
        }
      });
  }

  async load() {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();
    try {
      this.all = await this.admin.getTransactions();
      this.all.forEach(tx => { if (tx.notes && !this.editNotes[tx.id]) this.editNotes[tx.id] = tx.notes; });
      this.applyFilter();
    } catch (e: any) {
      this.error = e?.message || 'Unknown error';
      this.notification.error('Load failed', e.message || 'Could not load transactions.');
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private async silentRefresh() {
    try {
      const fresh = await this.admin.getTransactions();
      this.all = fresh;
      this.all.forEach(tx => { if (tx.notes && !this.editNotes[tx.id]) this.editNotes[tx.id] = tx.notes; });
      this.applyFilter();
      this.cdr.markForCheck();
    } catch (e: any) {
      console.warn('[transactions] silent refresh failed', e?.message || e);
    }
  }

  applyFilter() {
    this.currentPage = 1;
    let result = this.all;
    if (this.search) {
      const q = this.search.toLowerCase();
      result = result.filter(tx =>
        tx.id.toLowerCase().includes(q) ||
        tx.user?.username?.toLowerCase().includes(q) ||
        tx.user?.display_name?.toLowerCase().includes(q) ||
        String(tx.amount).includes(q)
      );
    }
    if (this.typeFilter) result = result.filter(tx => tx.type === this.typeFilter);
    if (this.statusFilter) result = result.filter(tx => tx.status === this.statusFilter);
    this.filtered = result;
  }

  onPageChange(p: number) { this.currentPage = p; }

  toggleDetail(tx: any) {
    if (this.selectedTx?.id === tx.id) { this.selectedTx = null; return; }
    this.selectedTx = tx;
    if (this.editNotes[tx.id] === undefined) {
      this.editNotes[tx.id] = tx.notes ?? '';
    }
  }

  closeDetail() { this.selectedTx = null; }

  confirmAction(action: string, tx: any) {
    this.confirm.loading = false;
    this.confirm.tx = tx;
    this.confirm.action = action;
    if (action === 'approve') {
      this.confirm.title = 'Setujui Transaksi';
      this.confirm.message = `Setujui ${tx.type} ${tx.amount.toLocaleString()} P dari ${tx.user?.username || tx.user_id?.slice(0,8)}?`;
      this.confirm.icon = '✓';
      this.confirm.iconBg = 'bg-emerald-400/10';
      this.confirm.confirmText = 'Setujui';
      this.confirm.confirmVariant = 'success';
    } else {
      this.confirm.title = 'Tolak Transaksi';
      this.confirm.message = `Tolak ${tx.type} ${tx.amount.toLocaleString()} P dari ${tx.user?.username || tx.user_id?.slice(0,8)}?`;
      this.confirm.icon = '✕';
      this.confirm.iconBg = 'bg-red-400/10';
      this.confirm.confirmText = 'Tolak';
      this.confirm.confirmVariant = 'danger';
    }
    this.confirm.open = true;
    this.cdr.markForCheck();
  }

  async executeConfirm() {
    const action = this.confirm.action;
    const tx = this.confirm.tx;
    if (!tx) return;
    this.confirm.loading = true;
    this.cdr.markForCheck();
    try {
      const admin = this.auth.getCurrentUser();
      if (!admin) return;
      if (action === 'approve') {
        if (tx.type === 'DEPOSIT') await this.admin.approveDeposit(tx.id, admin.username);
        else if (tx.type === 'WITHDRAWAL') await this.admin.approveWithdrawal(tx.id, admin.username);
        else throw new Error(`Unsupported transaction type: ${tx.type}`);
        await this.admin.logAction(admin.username, 'APPROVE_TRANSACTION', 'transactions', tx.id, tx.status, 'COMPLETED');
        tx.status = 'COMPLETED';
        this.notification.success('Transaksi disetujui', `${tx.type} ${tx.amount} P berhasil disetujui.`);
      } else {
        if (tx.type === 'DEPOSIT') await this.admin.rejectDeposit(tx.id, admin.username, 'Ditolak oleh admin');
        else if (tx.type === 'WITHDRAWAL') await this.admin.rejectWithdrawal(tx.id, admin.username, 'Ditolak oleh admin');
        else throw new Error(`Unsupported transaction type: ${tx.type}`);
        await this.admin.logAction(admin.username, 'REJECT_TRANSACTION', 'transactions', tx.id, tx.status, 'FAILED');
        tx.status = 'FAILED';
        this.notification.success('Transaksi ditolak', `${tx.type} ${tx.amount} P telah ditolak.`);
      }
      tx.processed_at = new Date().toISOString();
      this.applyFilter();
      this.cdr.markForCheck();
    } catch (e: any) {
      this.notification.error('Gagal', e.message || `Could not ${action} transaction.`);
    } finally {
      this.confirm.open = false;
      this.confirm.loading = false;
      this.confirm.tx = null;
      this.cdr.markForCheck();
    }
  }

  async saveNotes(tx: any) {
    const notes = this.editNotes[tx.id] ?? '';
    this.savingNotes[tx.id] = true;
    this.savedNotes[tx.id] = false;
    this.cdr.markForCheck();
    try {
      await this.admin.updateTransaction(tx.id, { notes });
      tx.notes = notes;
      this.savedNotes[tx.id] = true;
      this.cdr.markForCheck();
      setTimeout(() => { this.savedNotes[tx.id] = false; this.cdr.markForCheck(); }, 3000);
    } catch (e: any) {
      this.notification.error('Gagal simpan', e.message || 'Could not save notes.');
    } finally {
      this.savingNotes[tx.id] = false;
      this.cdr.markForCheck();
    }
  }

  cancelDialog() {
    this.confirm.open = false;
    this.cdr.markForCheck();
  }

  typeClass(t: string) {
    const m: Record<string, string> = {
      DEPOSIT: 'bg-emerald-400/10 text-emerald-400',
      WITHDRAWAL: 'bg-amber-400/10 text-amber-400',
      BET: 'bg-violet-400/10 text-violet-400',
    };
    return m[t] || 'bg-primary/10 text-primary';
  }

  statusClass(s: string) {
    const m: Record<string, string> = {
      COMPLETED: 'bg-emerald-400/10 text-emerald-400',
      PENDING: 'bg-amber-400/10 text-amber-400',
      FAILED: 'bg-red-400/10 text-red-400',
    };
    return m[s] || 'bg-zinc-400/10 text-zinc-400';
  }
}
