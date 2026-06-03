import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AdminService } from '../../../../core/services/admin.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { RealtimeService } from '../../../../core/services/realtime.service';
import { WibDatePipe } from '../../../../shared/pipes/wib-date.pipe';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';

@Component({
  selector: 'app-withdrawals',
  standalone: true,
  imports: [CommonModule, FormsModule, WibDatePipe, ConfirmDialogComponent, PaginationComponent],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="max-sm:text-lg sm:text-2xl font-extrabold text-foreground">Withdrawals</h1>
          <p class="text-muted-foreground mt-1 text-sm">Proses permintaan penarikan dana pengguna</p>
        </div>
        <button (click)="load()" class="bg-card border-border text-muted-foreground hover:text-foreground rounded-lg border px-3 py-2 text-xs font-semibold transition-colors">
          ↻ Refresh
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <input [(ngModel)]="search" (ngModelChange)="applyFilter()" placeholder="Cari username, nominal…"
          class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs outline-none w-48" />
        <select [(ngModel)]="statusFilter" (ngModelChange)="applyFilter()" class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs font-semibold outline-none">
          <option value="">Semua Status</option>
          <option value="PENDING">Pending</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      @if (error) {
        <div class="bg-red-400/10 border border-red-400/30 rounded-xl p-4 text-sm text-red-400">
          <p class="font-bold">Gagal memuat withdrawal</p>
          <p class="text-xs mt-1">{{ error }}</p>
          <button (click)="load()" class="mt-2 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-semibold">Coba Lagi</button>
        </div>
      }

      @if (loading) {
        <div class="text-muted-foreground py-12 text-center">Memuat withdrawal...</div>
      }

      <div class="bg-card border-border rounded-xl border shadow-sm" [class.hidden]="loading">
        <div class="overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Ref#</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">User</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Nominal</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Rekening Tujuan</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Fee</th>
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
                    <p class="text-muted-foreground text-[10px]">&#64;{{ tx.user?.username }}</p>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-bold text-amber-400">-{{ tx.amount | number:'1.0-0' }} P</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p class="text-foreground font-semibold text-[10px]">{{ tx.bank_name || '-' }}</p>
                    <p class="text-muted-foreground text-[9px]">{{ tx.bank_account_number }} · {{ tx.bank_account_name }}</p>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-[10px] text-red-400">{{ tx.withdrawal_fee ? (tx.withdrawal_fee | number:'1.0-0') + ' P' : '-' }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <span [class]="'rounded px-2 py-0.5 text-[10px] font-bold ' + statusClass(tx.status)">{{ tx.status }}</span>
                  </td>
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 whitespace-nowrap text-[10px]">{{ tx.created_at | wibDate:'short' }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" (click)="$event.stopPropagation()">
                    <div class="flex flex-wrap gap-1">
                      @if (tx.status === 'PENDING') {
                        <button (click)="confirmAction('approve', tx)" [disabled]="processing.has(tx.id)"
                          class="bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 disabled:opacity-50 rounded px-2 py-1 text-[10px] font-bold">
                          {{ processing.has(tx.id) ? '...' : '✓ Proses' }}
                        </button>
                        <button (click)="confirmAction('reject', tx)" [disabled]="processing.has(tx.id)"
                          class="bg-red-400/10 text-red-400 hover:bg-red-400/20 disabled:opacity-50 rounded px-2 py-1 text-[10px] font-bold">✕ Tolak</button>
                      }
                    </div>
                  </td>
                </tr>

              } @empty {
                <tr><td colspan="8" class="text-muted-foreground px-4 py-12 text-center">Tidak ada withdrawal ditemukan.</td></tr>
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
        <div class="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 class="text-sm font-extrabold text-foreground">Detail Penarikan</h3>
            <button (click)="closeDetail()" class="text-muted-foreground hover:text-foreground text-lg leading-none">&times;</button>
          </div>
          <div class="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
            <div class="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <p class="text-xs"><span class="text-muted-foreground">ID: </span><span class="font-mono text-[10px]">{{ selectedTx.id }}</span></p>
              <p class="text-xs"><span class="text-muted-foreground">Nominal: </span><span class="font-bold text-amber-400">{{ selectedTx.amount | number:'1.2-2' }} P</span></p>
              <p class="text-xs"><span class="text-muted-foreground">Fee: </span><span class="text-red-400">{{ selectedTx.withdrawal_fee | number:'1.2-2' }} P</span></p>
              <p class="text-xs"><span class="text-muted-foreground">Status: </span><span [class]="'rounded px-2 py-0.5 text-[10px] font-bold ' + statusClass(selectedTx.status)">{{ selectedTx.status }}</span></p>
              <p class="text-xs"><span class="text-muted-foreground">Bank: </span><span class="font-semibold text-foreground">{{ selectedTx.bank_name }}</span></p>
              <p class="text-xs"><span class="text-muted-foreground">No. Rek: </span><span class="font-mono font-semibold text-foreground">{{ selectedTx.bank_account_number }}</span></p>
              <p class="text-xs"><span class="text-muted-foreground">Nama: </span><span class="font-semibold text-foreground">{{ selectedTx.bank_account_name }}</span></p>
              <p class="text-xs"><span class="text-muted-foreground">Diminta: </span><span>{{ selectedTx.created_at | wibDate:'medium' }}</span></p>
              @if (selectedTx.processed_at) {
                <p class="text-xs"><span class="text-muted-foreground">Diproses: </span><span>{{ selectedTx.processed_at | wibDate:'medium' }}</span></p>
              }
            </div>
            @if (selectedTx.notes) {
              <p class="text-xs border-t border-border pt-2"><span class="text-muted-foreground">Catatan: </span><span class="text-red-400">{{ selectedTx.notes }}</span></p>
            }
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
export class WithdrawalsComponent implements OnInit, OnDestroy {
  all: any[] = [];
  filtered: any[] = [];
  currentPage = 1;
  pageSize = 20;
  get displayItems() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }
  search = '';
  statusFilter = '';
  selectedTx: any = null;
  loading = false;
  error: string | null = null;
  processing = new Set<string>();
  private destroy$ = new Subject<void>();

  confirm = {
    open: false, title: '', message: '', icon: '', iconBg: 'bg-primary/10',
    confirmText: 'Confirm', cancelText: 'Cancel', loading: false,
    loadingText: 'Processing…', confirmVariant: 'primary' as 'primary' | 'danger' | 'success' | 'warning',
    action: '', tx: null as any, rejectReason: '',
  };

  constructor(
    private admin: AdminService,
    private auth: AuthService,
    private notification: NotificationService,
    private cdr: ChangeDetectorRef,
    private realtime: RealtimeService,
  ) {}

  ngOnInit() {
    this.load();
    // Hapus polling timer — realtime subscription sudah cukup
    this.realtime.subscribeTransactions();
    this.realtime.transactions$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.silentRefresh();
      });
  }

  ngOnDestroy() {
    this.realtime.unsubscribeTransactions();
    this.destroy$.next();
    this.destroy$.complete();
  }

  async load() {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();
    try {
      this.all = await this.admin.getWithdrawals();
      this.applyFilter();
    } catch (e: any) {
      this.error = e?.message || 'Unknown error';
      this.notification.error('Load gagal', e.message);
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private async silentRefresh() {
    try {
      this.all = await this.admin.getWithdrawals();
      this.applyFilter();
      this.cdr.markForCheck();
    } catch (e: any) {
      console.warn('[withdrawals] silent refresh failed', e?.message || e);
    }
  }

  applyFilter() {
    this.currentPage = 1;
    let r = this.all;
    if (this.search) {
      const q = this.search.toLowerCase();
      r = r.filter(tx => tx.user?.username?.toLowerCase().includes(q) || String(tx.amount).includes(q) || tx.bank_account_name?.toLowerCase().includes(q));
    }
    if (this.statusFilter) r = r.filter(tx => tx.status === this.statusFilter);
    this.filtered = r;
  }

  toggleDetail(tx: any) { this.selectedTx = this.selectedTx?.id === tx.id ? null : tx; }

  closeDetail() { this.selectedTx = null; }

  onPageChange(p: number) { this.currentPage = p; }

  cancelDialog() {
    this.confirm.open = false;
    this.confirm.rejectReason = '';
    this.cdr.markForCheck();
  }

  confirmAction(action: string, tx: any) {
    this.confirm.loading = false;
    this.confirm.tx = tx;
    this.confirm.action = action;
    this.confirm.rejectReason = '';
    if (action === 'approve') {
      this.confirm.title = 'Proses Withdrawal';
      this.confirm.message = `Proses withdrawal -${tx.amount.toLocaleString()} P untuk ${tx.bank_account_name} (${tx.bank_name} ${tx.bank_account_number})? Dana akan dikirim ke rekening tujuan.`;
      this.confirm.icon = '✓';
      this.confirm.iconBg = 'bg-emerald-400/10';
      this.confirm.confirmText = 'Proses';
      this.confirm.confirmVariant = 'success';
    } else {
      this.confirm.title = 'Tolak Withdrawal';
      this.confirm.message = `Tolak withdrawal -${tx.amount.toLocaleString()} P dari ${tx.user?.username || tx.id.slice(0,8)}? Dana akan dikembalikan ke wallet.`;
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
      if (action === 'approve') await this.approve(tx);
      else await this.confirmReject(tx);
    } finally {
      this.confirm.open = false;
      this.confirm.loading = false;
      this.confirm.tx = null;
      this.cdr.markForCheck();
    }
  }

  async approve(tx: any) {
    if (this.processing.has(tx.id)) return;
    this.processing.add(tx.id);
    this.cdr.markForCheck();
    const admin = this.auth.getCurrentUser();
    if (!admin) { this.processing.delete(tx.id); return; }
    try {
      await this.admin.approveWithdrawal(tx.id, admin.username);
      tx.status = 'COMPLETED';
      tx.processed_at = new Date().toISOString();
      this.applyFilter();
      this.notification.success('Withdrawal diproses', `${tx.amount.toLocaleString()} P → ${tx.bank_account_name}`);
    } catch (e: any) {
      this.notification.error('Gagal', e.message);
    } finally {
      this.processing.delete(tx.id);
      this.cdr.markForCheck();
    }
  }

  async confirmReject(tx: any) {
    if (this.processing.has(tx.id)) return;
    this.processing.add(tx.id);
    this.cdr.markForCheck();
    const admin = this.auth.getCurrentUser();
    if (!admin) { this.processing.delete(tx.id); return; }
    try {
      await this.admin.rejectWithdrawal(tx.id, admin.username, this.confirm.rejectReason || undefined);
      tx.status = 'FAILED';
      tx.notes = this.confirm.rejectReason || 'Rejected by admin';
      this.applyFilter();
      this.notification.success('Withdrawal ditolak', tx.user?.username || tx.id);
    } catch (e: any) {
      this.notification.error('Gagal', e.message);
    } finally {
      this.processing.delete(tx.id);
      this.cdr.markForCheck();
    }
  }

  statusClass(s: string) {
    const m: Record<string, string> = { COMPLETED: 'bg-emerald-400/10 text-emerald-400', PENDING: 'bg-amber-400/10 text-amber-400', FAILED: 'bg-red-400/10 text-red-400' };
    return m[s] || 'bg-zinc-400/10 text-zinc-400';
  }
}
