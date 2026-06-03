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

@Component({
  selector: 'app-deposits',
  standalone: true,
  imports: [CommonModule, FormsModule, WibDatePipe, ConfirmDialogComponent],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="max-sm:text-lg sm:text-2xl font-extrabold text-foreground">Deposits</h1>
          <p class="text-muted-foreground mt-1 text-sm">Verifikasi bukti transfer dan setujui deposit pengguna</p>
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
          <p class="font-bold">Gagal memuat deposit</p>
          <p class="text-xs mt-1">{{ error }}</p>
          <button (click)="load()" class="mt-2 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-semibold">Coba Lagi</button>
        </div>
      }

      @if (loading) {
        <div class="text-muted-foreground py-12 text-center">Memuat deposit...</div>
      }

      <div class="bg-card border-border rounded-xl border shadow-sm" [class.hidden]="loading">
        <div class="overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Ref#</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">User</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Nominal</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Metode</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Status</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Tanggal</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 w-48">Aksi</th>
              </tr>
            </thead>
            <tbody>
              @for (tx of filtered; track tx.id) {
                <tr class="border-border hover:bg-muted/30 border-b text-xs transition-colors cursor-pointer"
                    (click)="toggleDetail(tx)">
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono text-[10px] text-muted-foreground">{{ tx.id.slice(0,8).toUpperCase() }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p class="font-semibold text-foreground">{{ tx.user?.display_name || tx.user?.username || '—' }}</p>
                    <p class="text-muted-foreground text-[10px]">&#64;{{ tx.user?.username }}</p>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-bold text-emerald-400">+{{ tx.amount | number:'1.0-0' }} P</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-[10px] text-muted-foreground">{{ tx.method || '-' }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <span [class]="'rounded px-2 py-0.5 text-[10px] font-bold ' + statusClass(tx.status)">{{ tx.status }}</span>
                  </td>
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 whitespace-nowrap text-[10px]">{{ tx.created_at | wibDate:'short' }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" (click)="$event.stopPropagation()">
                    <div class="flex flex-wrap gap-1">
                      @if (tx.status === 'PENDING') {
                        <button (click)="confirmAction('approve', tx)" [disabled]="processing.has(tx.id)"
                          class="bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 disabled:opacity-50 rounded px-2 py-1 text-[10px] font-bold">
                          {{ processing.has(tx.id) ? '...' : '✓ Setujui' }}
                        </button>
                        <button (click)="confirmAction('reject', tx)" [disabled]="processing.has(tx.id)"
                          class="bg-red-400/10 text-red-400 hover:bg-red-400/20 disabled:opacity-50 rounded px-2 py-1 text-[10px] font-bold">✕ Tolak</button>
                      }
                      @if (tx.proof_image_url) {
                        <a [href]="tx.proof_image_url" target="_blank"
                          class="bg-sky-400/10 text-sky-400 hover:bg-sky-400/20 rounded px-2 py-1 text-[10px] font-bold">Bukti</a>
                      }
                    </div>
                  </td>
                </tr>

                @if (selectedId === tx.id) {
                  <tr class="bg-muted/5 border-border border-b">
                    <td colspan="7" class="px-4 pb-4 pt-2">
                      <div class="grid gap-4 sm:grid-cols-2 pt-2">
                        <div class="space-y-1.5">
                          <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Detail</p>
                          <p class="text-xs"><span class="text-muted-foreground">ID: </span><span class="font-mono text-[10px] text-foreground">{{ tx.id }}</span></p>
                          <p class="text-xs"><span class="text-muted-foreground">Nominal: </span><span class="font-bold text-emerald-400">{{ tx.amount | number:'1.2-2' }} P</span></p>
                          <p class="text-xs"><span class="text-muted-foreground">Metode: </span><span class="text-foreground font-semibold">{{ tx.method || '-' }}</span></p>
                          <p class="text-xs"><span class="text-muted-foreground">Diminta: </span><span class="text-foreground">{{ tx.requested_at | wibDate:'medium' }}</span></p>
                          @if (tx.processed_at) {
                            <p class="text-xs"><span class="text-muted-foreground">Diproses: </span><span class="text-foreground">{{ tx.processed_at | wibDate:'medium' }}</span></p>
                          }
                          @if (tx.notes) {
                            <p class="text-xs mt-1"><span class="text-muted-foreground">Catatan: </span><span class="text-red-400">{{ tx.notes }}</span></p>
                          }
                        </div>
                        @if (tx.proof_image_url) {
                          <div>
                            <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Bukti Transfer</p>
                            <a [href]="tx.proof_image_url" target="_blank">
                              <img [src]="tx.proof_image_url" alt="Bukti" class="rounded-lg max-h-48 object-contain border border-border" />
                            </a>
                          </div>
                        }
                      </div>
                    </td>
                  </tr>
                }
              } @empty {
                <tr><td colspan="7" class="text-muted-foreground px-4 py-12 text-center">Tidak ada deposit ditemukan.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>

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
export class DepositsComponent implements OnInit, OnDestroy {
  all: any[] = [];
  filtered: any[] = [];
  search = '';
  statusFilter = '';
  selectedId: string | null = null;
  loading = false;
  error: string | null = null;
  processing = new Set<string>();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
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
      this.all = await this.admin.getDeposits();
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
      this.all = await this.admin.getDeposits();
      this.applyFilter();
      this.cdr.markForCheck();
    } catch (e: any) {
      console.warn('[deposits] silent refresh failed', e?.message || e);
    }
  }

  applyFilter() {
    let r = this.all;
    if (this.search) {
      const q = this.search.toLowerCase();
      r = r.filter(tx => tx.user?.username?.toLowerCase().includes(q) || String(tx.amount).includes(q));
    }
    if (this.statusFilter) r = r.filter(tx => tx.status === this.statusFilter);
    this.filtered = r;
  }

  toggleDetail(tx: any) { this.selectedId = this.selectedId === tx.id ? null : tx.id; }

  confirmAction(action: string, tx: any) {
    this.confirm.loading = false;
    this.confirm.tx = tx;
    this.confirm.action = action;
    this.confirm.rejectReason = '';
    if (action === 'approve') {
      this.confirm.title = 'Setujui Deposit';
      this.confirm.message = `Setujui deposit +${tx.amount.toLocaleString()} P dari ${tx.user?.username || tx.user?.display_name || tx.id.slice(0,8)}? Dana akan dikreditkan ke wallet.`;
      this.confirm.icon = '✓';
      this.confirm.iconBg = 'bg-emerald-400/10';
      this.confirm.confirmText = 'Setujui';
      this.confirm.confirmVariant = 'success';
    } else {
      this.confirm.title = 'Tolak Deposit';
      this.confirm.message = `Tolak deposit +${tx.amount.toLocaleString()} P dari ${tx.user?.username || tx.user?.display_name || tx.id.slice(0,8)}? Dana TIDAK akan dikreditkan.`;
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
      await this.admin.approveDeposit(tx.id, admin.username);
      tx.status = 'COMPLETED';
      tx.processed_at = new Date().toISOString();
      this.applyFilter();
      this.notification.success('Deposit disetujui', `+${tx.amount.toLocaleString()} P dikreditkan ke wallet.`);
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
      await this.admin.rejectDeposit(tx.id, admin.username, this.confirm.rejectReason || undefined);
      tx.status = 'FAILED';
      tx.notes = this.confirm.rejectReason || 'Rejected by admin';
      this.applyFilter();
      this.notification.success('Deposit ditolak', tx.user?.username || tx.id);
    } catch (e: any) {
      this.notification.error('Gagal', e.message);
    } finally {
      this.processing.delete(tx.id);
      this.cdr.markForCheck();
    }
  }

  cancelDialog() {
    this.confirm.open = false;
    this.confirm.rejectReason = '';
    this.cdr.markForCheck();
  }

  statusClass(s: string) {
    const m: Record<string, string> = { COMPLETED: 'bg-emerald-400/10 text-emerald-400', PENDING: 'bg-amber-400/10 text-amber-400', FAILED: 'bg-red-400/10 text-red-400' };
    return m[s] || 'bg-zinc-400/10 text-zinc-400';
  }
}
