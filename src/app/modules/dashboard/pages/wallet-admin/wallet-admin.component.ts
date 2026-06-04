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

type TabId = 'deposits' | 'withdrawals' | 'turnover';

@Component({
  selector: 'app-wallet-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, WibDatePipe, ConfirmDialogComponent, PaginationComponent],
  template: `
    <div class="space-y-6">
      <!-- HEADER -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="max-sm:text-lg sm:text-2xl font-extrabold text-foreground">Wallet Management</h1>
          <p class="text-muted-foreground mt-1 text-sm">Kelola deposit, penarikan, dan turnover pengguna</p>
        </div>
      </div>

      <!-- TABS -->
      <div class="flex gap-1 rounded-xl border border-border bg-card p-1">
        @for (tb of tabs; track tb.id) {
          <button (click)="tab = tb.id"
            class="flex-1 rounded-lg px-3 py-2 text-xs font-bold transition text-center"
            [class.bg-primary]="tab === tb.id"
            [class.text-primary-foreground]="tab === tb.id"
            [class.text-muted-foreground]="tab !== tb.id"
            [class.hover:text-foreground]="tab !== tb.id">
            {{ tb.label }}
          </button>
        }
      </div>

      <!-- TAB: DEPOSITS -->
      @if (tab === 'deposits') {
        <ng-container *ngTemplateOutlet="depositTab" />
      }
      <!-- TAB: WITHDRAWALS -->
      @if (tab === 'withdrawals') {
        <ng-container *ngTemplateOutlet="withdrawTab" />
      }
      <!-- TAB: TURNOVER -->
      @if (tab === 'turnover') {
        <ng-container *ngTemplateOutlet="turnoverTab" />
      }
    </div>

    <!-- ═══════════ DEPOSIT TAB ═══════════ -->
    <ng-template #depositTab>
      <div class="flex flex-wrap gap-2">
        <button (click)="loadDeposits()" class="bg-card border-border text-muted-foreground hover:text-foreground rounded-lg border px-3 py-2 text-xs font-semibold transition-colors">↻ Refresh</button>
        <input [(ngModel)]="depSearch" (ngModelChange)="applyDepFilter()" placeholder="Cari username, nominal…"
          class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs outline-none w-48" />
        <select [(ngModel)]="depStatusFilter" (ngModelChange)="applyDepFilter()" class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs font-semibold outline-none">
          <option value="">Semua Status</option>
          <option value="PENDING">Pending</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      @if (depError) {
        <div class="bg-red-400/10 border border-red-400/30 rounded-xl p-4 text-sm text-red-400">
          <p class="font-bold">Gagal memuat deposit</p>
          <p class="text-xs mt-1">{{ depError }}</p>
          <button (click)="loadDeposits()" class="mt-2 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-semibold">Coba Lagi</button>
        </div>
      }

      @if (depLoading) {
        <div class="text-muted-foreground py-12 text-center">Memuat deposit...</div>
      }

      <div class="bg-card border-border rounded-xl border shadow-sm" [class.hidden]="depLoading">
        <div class="overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                <th class="px-3 py-3">Ref#</th>
                <th class="px-3 py-3">User</th>
                <th class="px-3 py-3">Nominal</th>
                <th class="px-3 py-3">Metode</th>
                <th class="px-3 py-3">Status</th>
                <th class="px-3 py-3">Tanggal</th>
                <th class="px-3 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              @for (tx of depDisplay; track tx.id) {
                <tr class="border-border hover:bg-muted/30 border-b text-xs transition-colors cursor-pointer" (click)="depDetail = tx">
                  <td class="px-3 py-3 font-mono text-[10px] text-muted-foreground">{{ tx.id.slice(0,8).toUpperCase() }}</td>
                  <td class="px-3 py-3">
                    <p class="font-semibold text-foreground">{{ tx.user?.display_name || tx.user?.username || '—' }}</p>
                    <p class="text-muted-foreground text-[10px]">&#64;{{ tx.user?.username }}</p>
                  </td>
                  <td class="px-3 py-3 font-bold text-emerald-400">+{{ tx.amount | number:'1.0-0' }} P</td>
                  <td class="px-3 py-3 text-[10px] text-muted-foreground">{{ tx.method || '-' }}</td>
                  <td class="px-3 py-3"><span [class]="'rounded px-2 py-0.5 text-[10px] font-bold ' + statusClass(tx.status)">{{ tx.status }}</span></td>
                  <td class="text-muted-foreground px-3 py-3 whitespace-nowrap text-[10px]">{{ tx.created_at | wibDate:'short' }}</td>
                  <td class="px-3 py-3">
                    @if (tx.status === 'PENDING') {
                      <div class="flex gap-1" (click)="$event.stopPropagation()">
                        <button (click)="approveDep(tx)" [disabled]="depProcessing"
                          class="rounded bg-emerald-400/10 text-emerald-400 border border-emerald-400/30 px-2 py-1 text-[10px] font-bold hover:bg-emerald-400/20 disabled:opacity-50">Setuju</button>
                        <button (click)="rejectDep(tx)" [disabled]="depProcessing"
                          class="rounded bg-red-400/10 text-red-400 border border-red-400/30 px-2 py-1 text-[10px] font-bold hover:bg-red-400/20 disabled:opacity-50">Tolak</button>
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <app-pagination [currentPage]="depPage" [totalItems]="depFiltered.length" (pageChange)="depPage = $event; applyDepFilter()" />
      </div>

      <!-- Deposit Detail Modal -->
      @if (depDetail) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" (click)="depDetail = null">
          <div class="bg-card border-border rounded-xl border p-6 w-full max-w-md space-y-4" (click)="$event.stopPropagation()">
            <div class="flex items-center justify-between">
              <p class="text-sm font-bold text-foreground">Detail Deposit</p>
              <button (click)="depDetail = null" class="text-muted-foreground hover:text-foreground">&times;</button>
            </div>
            <div class="space-y-2 text-xs">
              <div class="flex justify-between"><span class="text-muted-foreground">ID</span><span class="font-mono text-foreground">{{ depDetail.id }}</span></div>
              <div class="flex justify-between"><span class="text-muted-foreground">User</span><span class="text-foreground">{{ depDetail.user?.display_name || depDetail.user?.username }}</span></div>
              <div class="flex justify-between"><span class="text-muted-foreground">Nominal</span><span class="font-bold text-emerald-400">+{{ depDetail.amount | number }} P</span></div>
              <div class="flex justify-between"><span class="text-muted-foreground">Metode</span><span class="text-foreground">{{ depDetail.method || '-' }}</span></div>
              <div class="flex justify-between"><span class="text-muted-foreground">Status</span><span [class]="'font-bold ' + (depDetail.status === 'COMPLETED' ? 'text-emerald-400' : depDetail.status === 'FAILED' ? 'text-red-400' : 'text-yellow-400')">{{ depDetail.status }}</span></div>
              <div class="flex justify-between"><span class="text-muted-foreground">Tanggal</span><span class="text-foreground">{{ depDetail.created_at | wibDate:'short' }}</span></div>
              @if (depDetail.proof_image_url) {
                <div>
                  <p class="text-muted-foreground mb-1">Bukti Transfer</p>
                  <img [src]="depDetail.proof_image_url" class="w-full rounded-lg border border-border max-h-60 object-contain" />
                </div>
              }
            </div>
          </div>
        </div>
      }
    </ng-template>

    <!-- ═══════════ WITHDRAW TAB ═══════════ -->
    <ng-template #withdrawTab>
      <div class="flex flex-wrap gap-2">
        <button (click)="loadWithdrawals()" class="bg-card border-border text-muted-foreground hover:text-foreground rounded-lg border px-3 py-2 text-xs font-semibold transition-colors">↻ Refresh</button>
        <input [(ngModel)]="wdSearch" (ngModelChange)="applyWdFilter()" placeholder="Cari username, nominal…"
          class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs outline-none w-48" />
        <select [(ngModel)]="wdStatusFilter" (ngModelChange)="applyWdFilter()" class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs font-semibold outline-none">
          <option value="">Semua Status</option>
          <option value="PENDING">Pending</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      @if (wdError) {
        <div class="bg-red-400/10 border border-red-400/30 rounded-xl p-4 text-sm text-red-400">
          <p class="font-bold">Gagal memuat penarikan</p>
          <p class="text-xs mt-1">{{ wdError }}</p>
          <button (click)="loadWithdrawals()" class="mt-2 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-semibold">Coba Lagi</button>
        </div>
      }

      @if (wdLoading) {
        <div class="text-muted-foreground py-12 text-center">Memuat penarikan...</div>
      }

      <div class="bg-card border-border rounded-xl border shadow-sm" [class.hidden]="wdLoading">
        <div class="overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                <th class="px-3 py-3">Ref#</th>
                <th class="px-3 py-3">User</th>
                <th class="px-3 py-3">Nominal</th>
                <th class="px-3 py-3">Rekening</th>
                <th class="px-3 py-3">Status</th>
                <th class="px-3 py-3">Tanggal</th>
                <th class="px-3 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              @for (tx of wdDisplay; track tx.id) {
                <tr class="border-border hover:bg-muted/30 border-b text-xs transition-colors cursor-pointer" (click)="wdDetail = tx">
                  <td class="px-3 py-3 font-mono text-[10px] text-muted-foreground">{{ tx.id.slice(0,8).toUpperCase() }}</td>
                  <td class="px-3 py-3">
                    <p class="font-semibold text-foreground">{{ tx.user?.display_name || tx.user?.username || '—' }}</p>
                    <p class="text-muted-foreground text-[10px]">&#64;{{ tx.user?.username }}</p>
                  </td>
                  <td class="px-3 py-3 font-bold text-red-400">-{{ tx.amount | number:'1.0-0' }} P</td>
                  <td class="px-3 py-3 text-[10px] text-muted-foreground">{{ tx.bank_name || '-' }} {{ tx.bank_account_number ? '· ' + tx.bank_account_number.slice(-4) : '' }}</td>
                  <td class="px-3 py-3"><span [class]="'rounded px-2 py-0.5 text-[10px] font-bold ' + statusClass(tx.status)">{{ tx.status }}</span></td>
                  <td class="text-muted-foreground px-3 py-3 whitespace-nowrap text-[10px]">{{ tx.created_at | wibDate:'short' }}</td>
                  <td class="px-3 py-3">
                    @if (tx.status === 'PENDING') {
                      <div class="flex gap-1" (click)="$event.stopPropagation()">
                        <button (click)="approveWd(tx)" [disabled]="wdProcessing"
                          class="rounded bg-emerald-400/10 text-emerald-400 border border-emerald-400/30 px-2 py-1 text-[10px] font-bold hover:bg-emerald-400/20 disabled:opacity-50">Setuju</button>
                        <button (click)="rejectWd(tx)" [disabled]="wdProcessing"
                          class="rounded bg-red-400/10 text-red-400 border border-red-400/30 px-2 py-1 text-[10px] font-bold hover:bg-red-400/20 disabled:opacity-50">Tolak</button>
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <app-pagination [currentPage]="wdPage" [totalItems]="wdFiltered.length" (pageChange)="wdPage = $event; applyWdFilter()" />
      </div>

      <!-- Withdraw Detail Modal -->
      @if (wdDetail) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" (click)="wdDetail = null">
          <div class="bg-card border-border rounded-xl border p-6 w-full max-w-md space-y-4" (click)="$event.stopPropagation()">
            <div class="flex items-center justify-between">
              <p class="text-sm font-bold text-foreground">Detail Penarikan</p>
              <button (click)="wdDetail = null" class="text-muted-foreground hover:text-foreground">&times;</button>
            </div>
            <div class="space-y-2 text-xs">
              <div class="flex justify-between"><span class="text-muted-foreground">ID</span><span class="font-mono text-foreground">{{ wdDetail.id }}</span></div>
              <div class="flex justify-between"><span class="text-muted-foreground">User</span><span class="text-foreground">{{ wdDetail.user?.display_name || wdDetail.user?.username }}</span></div>
              <div class="flex justify-between"><span class="text-muted-foreground">Nominal</span><span class="font-bold text-red-400">-{{ wdDetail.amount | number }} P</span></div>
              @if (wdDetail.withdrawal_fee) {
                <div class="flex justify-between"><span class="text-muted-foreground">Fee</span><span class="text-red-400">-{{ wdDetail.withdrawal_fee | number }} P</span></div>
              }
              <div class="flex justify-between"><span class="text-muted-foreground">Bank</span><span class="text-foreground">{{ wdDetail.bank_name || '-' }}</span></div>
              <div class="flex justify-between"><span class="text-muted-foreground">No. Rekening</span><span class="font-mono text-foreground">{{ wdDetail.bank_account_number || '-' }}</span></div>
              <div class="flex justify-between"><span class="text-muted-foreground">A/n</span><span class="text-foreground">{{ wdDetail.bank_account_name || '-' }}</span></div>
              <div class="flex justify-between"><span class="text-muted-foreground">Status</span><span [class]="'font-bold ' + (wdDetail.status === 'COMPLETED' ? 'text-emerald-400' : wdDetail.status === 'FAILED' ? 'text-red-400' : 'text-yellow-400')">{{ wdDetail.status }}</span></div>
              <div class="flex justify-between"><span class="text-muted-foreground">Tanggal</span><span class="text-foreground">{{ wdDetail.created_at | wibDate:'short' }}</span></div>
              @if (wdDetail.notes) {
                <div><p class="text-muted-foreground mb-1">Catatan</p><p class="text-foreground">{{ wdDetail.notes }}</p></div>
              }
            </div>
          </div>
        </div>
      }
    </ng-template>

    <!-- ═══════════ TURNOVER TAB ═══════════ -->
    <ng-template #turnoverTab>
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div class="bg-card border-border rounded-xl border p-4">
          <p class="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">Total Turnover</p>
          <p class="text-foreground text-2xl font-black mt-1">{{ toTotal | number:'1.0-0' }}</p>
        </div>
        <div class="bg-card border-border rounded-xl border p-4">
          <p class="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">Net Deposit</p>
          <p class="text-emerald-400 text-2xl font-black mt-1">{{ toNetDeposit | number:'1.0-0' }}</p>
        </div>
        <div class="bg-card border-border rounded-xl border p-4">
          <p class="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">Platform PnL</p>
          <p [class]="'text-2xl font-black mt-1 ' + (toPlatformPnl >= 0 ? 'text-emerald-400' : 'text-red-400')">{{ toPlatformPnl | number:'1.0-0' }}</p>
        </div>
        <div class="bg-card border-border rounded-xl border p-4">
          <p class="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">Avg Win Rate</p>
          <p class="text-yellow-400 text-2xl font-black mt-1">{{ toWinRate }}%</p>
        </div>
      </div>

      <button (click)="loadTurnover()" class="bg-card border-border text-muted-foreground hover:text-foreground rounded-lg border px-3 py-2 text-xs font-semibold transition-colors mb-4">↻ Refresh</button>

      <div class="bg-card border-border rounded-xl border shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                <th class="px-3 py-3">User</th>
                <th class="px-3 py-3">Main</th>
                <th class="px-3 py-3">Bonus</th>
                <th class="px-3 py-3">Deposit</th>
                <th class="px-3 py-3">WD</th>
                <th class="px-3 py-3">Turnover</th>
                <th class="px-3 py-3">Locked</th>
                <th class="px-3 py-3">Net</th>
                <th class="px-3 py-3">PnL</th>
              </tr>
            </thead>
            <tbody>
              @for (w of toDisplay; track w.userId) {
                <tr class="border-border border-b text-xs">
                  <td class="px-3 py-3">
                    <p class="font-semibold text-foreground">{{ w.displayName }}</p>
                    <p class="text-muted-foreground text-[10px]">&#64;{{ w.username }}</p>
                  </td>
                  <td class="px-3 py-3 font-bold text-foreground">{{ w.main | number:'1.0-0' }}</td>
                  <td class="px-3 py-3 text-foreground">{{ w.bonus | number:'1.0-0' }}</td>
                  <td class="px-3 py-3 text-emerald-400 font-semibold">{{ w.deposited | number:'1.0-0' }}</td>
                  <td class="px-3 py-3 text-red-400 font-semibold">{{ w.withdrawn | number:'1.0-0' }}</td>
                  <td class="px-3 py-3 font-bold text-foreground">{{ w.turnover | number:'1.0-0' }}</td>
                  <td class="px-3 py-3">
                    @if (w.locked > 0) {
                      <span class="text-yellow-400 font-semibold">{{ w.locked | number:'1.0-0' }}</span>
                    } @else {
                      <span class="text-emerald-400 text-[10px]">✓ Lunas</span>
                    }
                  </td>
                  <td class="px-3 py-3 font-semibold" [class.text-emerald-400]="w.net >= 0" [class.text-red-400]="w.net < 0">{{ w.net | number:'1.0-0' }}</td>
                  <td class="px-3 py-3 font-bold" [class.text-emerald-400]="w.pnl >= 0" [class.text-red-400]="w.pnl < 0">{{ w.pnl | number:'1.0-0' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <app-pagination [currentPage]="toPage" [totalItems]="toFiltered.length" (pageChange)="toPage = $event; applyToFilter()" />
      </div>
    </ng-template>

    <!-- CONFIRM DIALOG -->
    <app-confirm-dialog [open]="!!confirmAction" [title]="confirmTitle" [message]="confirmMessage"
      (onConfirm)="onConfirm()" (onCancel)="confirmAction = null" />
  `,
})
export class WalletAdminComponent implements OnInit {
  tab: TabId = 'deposits';
  tabs = [
    { id: 'deposits' as TabId, label: 'Deposit' },
    { id: 'withdrawals' as TabId, label: 'Withdraw' },
    { id: 'turnover' as TabId, label: 'Turnover' },
  ];

  /* ── DEPOSITS ── */
  depAll: any[] = [];
  depFiltered: any[] = [];
  depDisplay: any[] = [];
  depSearch = '';
  depStatusFilter = '';
  depPage = 1;
  depPageSize = 20;
  depLoading = false;
  depError = '';
  depProcessing = false;
  depDetail: any = null;

  /* ── WITHDRAWALS ── */
  wdAll: any[] = [];
  wdFiltered: any[] = [];
  wdDisplay: any[] = [];
  wdSearch = '';
  wdStatusFilter = '';
  wdPage = 1;
  wdPageSize = 20;
  wdLoading = false;
  wdError = '';
  wdProcessing = false;
  wdDetail: any = null;

  /* ── TURNOVER ── */
  toAll: any[] = [];
  toFiltered: any[] = [];
  toDisplay: any[] = [];
  toPage = 1;
  toPageSize = 20;
  toTotal = 0;
  toNetDeposit = 0;
  toPlatformPnl = 0;
  toWinRate = 0;

  /* ── CONFIRM DIALOG ── */
  confirmAction: 'approveDep' | 'rejectDep' | 'approveWd' | 'rejectWd' | null = null;
  confirmTarget: any = null;
  get confirmTitle() { return this.confirmAction?.includes('approve') ? 'Konfirmasi' : 'Tolak Transaksi'; }
  get confirmMessage() {
    const t = this.confirmTarget;
    const label = this.confirmAction?.includes('Dep') ? 'deposit' : 'penarikan';
    return this.confirmAction?.startsWith('approve')
      ? `Setujui ${label} ${t?.amount?.toLocaleString()} P dari ${t?.user?.username || 'pengguna'}?`
      : `Tolak ${label} ${t?.amount?.toLocaleString()} P dari ${t?.user?.username || 'pengguna'}?`;
  }

  private destroy$ = new Subject<void>();

  constructor(
    private admin: AdminService,
    private auth: AuthService,
    private notification: NotificationService,
    private realtime: RealtimeService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit() {
    this.loadDeposits();
    this.loadWithdrawals();
    this.loadTurnover();
    this.realtime.transactions$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.loadDeposits();
      this.loadWithdrawals();
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /* ── DEPOSITS ── */
  loadDeposits() {
    this.depLoading = true; this.depError = '';
    this.admin.getDeposits().then(r => { this.depAll = r || []; this.applyDepFilter(); })
      .catch(e => this.depError = e.message)
      .finally(() => { this.depLoading = false; this.cdr.markForCheck(); });
  }
  applyDepFilter() {
    let f = this.depAll;
    if (this.depSearch) { const q = this.depSearch.toLowerCase(); f = f.filter((t: any) => t.user?.username?.toLowerCase().includes(q) || String(t.amount).includes(q)); }
    if (this.depStatusFilter) f = f.filter((t: any) => t.status === this.depStatusFilter);
    this.depFiltered = f;
    this.depPage = 1;
    this.depDisplay = f.slice(0, this.depPageSize);
  }
  approveDep(tx: any) { this.confirmAction = 'approveDep'; this.confirmTarget = tx; }
  rejectDep(tx: any) { this.confirmAction = 'rejectDep'; this.confirmTarget = tx; }

  /* ── WITHDRAWALS ── */
  loadWithdrawals() {
    this.wdLoading = true; this.wdError = '';
    this.admin.getWithdrawals().then(r => { this.wdAll = r || []; this.applyWdFilter(); })
      .catch(e => this.wdError = e.message)
      .finally(() => { this.wdLoading = false; this.cdr.markForCheck(); });
  }
  applyWdFilter() {
    let f = this.wdAll;
    if (this.wdSearch) { const q = this.wdSearch.toLowerCase(); f = f.filter((t: any) => t.user?.username?.toLowerCase().includes(q) || String(t.amount).includes(q)); }
    if (this.wdStatusFilter) f = f.filter((t: any) => t.status === this.wdStatusFilter);
    this.wdFiltered = f;
    this.wdPage = 1;
    this.wdDisplay = f.slice(0, this.wdPageSize);
  }
  approveWd(tx: any) { this.confirmAction = 'approveWd'; this.confirmTarget = tx; }
  rejectWd(tx: any) { this.confirmAction = 'rejectWd'; this.confirmTarget = tx; }

  /* ── TURNOVER ── */
  loadTurnover() {
    Promise.all([
      this.admin.getWallets(),
      this.admin.getDepositLocks(),
    ]).then(([wallets, locks]) => {
      const lockMap = new Map<string, number>();
      (locks || []).forEach((l: any) => {
        const rem = Number(l.turnover_required) - Number(l.turnover_applied);
        if (rem > 0) lockMap.set(l.user_id, (lockMap.get(l.user_id) || 0) + rem);
      });
      this.toAll = (wallets || [])
        .filter((w: any) => w.user?.role !== 'admin' && w.user?.role !== 'superadmin')
        .map((w: any) => ({
          userId: w.user_id, username: w.user?.username, displayName: w.user?.display_name,
          main: Number(w.balance_main), bonus: Number(w.balance_bonus),
          deposited: Number(w.total_deposited), withdrawn: Number(w.total_withdrawn),
          turnover: Number(w.total_turnover), locked: lockMap.get(w.user_id) || 0,
        }));
      this.applyToFilter();
    }).catch(() => {});
  }
  applyToFilter() {
    const all = this.toAll;
    this.toTotal = all.reduce((s: number, w: any) => s + w.turnover, 0);
    this.toNetDeposit = all.reduce((s: number, w: any) => s + w.deposited - w.withdrawn, 0);
    this.toPlatformPnl = all.reduce((s: number, w: any) => s + w.withdrawn - w.deposited, 0);
    const pos = all.filter((w: any) => w.net >= 0).length;
    this.toWinRate = all.length > 0 ? Math.round((pos / all.length) * 100) : 0;
    this.toFiltered = all.map((w: any) => ({ ...w, net: w.deposited - w.withdrawn, pnl: (w.deposited - w.withdrawn) - w.main - w.bonus }));
    this.toPage = 1;
    this.toDisplay = this.toFiltered.slice(0, this.toPageSize);
  }

  /* ── ACTIONS ── */
  onConfirm() {
    const admin = this.auth.getCurrentUser();
    if (!admin?.username) return;
    const t = this.confirmTarget;
    if (this.confirmAction === 'approveDep') {
      this.depProcessing = true;
      this.admin.approveDeposit(t.id, admin.username).then(() => {
        this.notification.success('Deposit disetujui');
        this.loadDeposits(); this.loadTurnover();
      }).catch(e => this.notification.error(e.message)).finally(() => { this.depProcessing = false; this.cdr.markForCheck(); });
    } else if (this.confirmAction === 'rejectDep') {
      this.depProcessing = true;
      this.admin.rejectDeposit(t.id, admin.username).then(() => {
        this.notification.success('Deposit ditolak');
        this.loadDeposits();
      }).catch(e => this.notification.error(e.message)).finally(() => { this.depProcessing = false; this.cdr.markForCheck(); });
    } else if (this.confirmAction === 'approveWd') {
      this.wdProcessing = true;
      this.admin.approveWithdrawal(t.id, admin.username).then(() => {
        this.notification.success('Penarikan disetujui');
        this.loadWithdrawals(); this.loadTurnover();
      }).catch(e => this.notification.error(e.message)).finally(() => { this.wdProcessing = false; this.cdr.markForCheck(); });
    } else if (this.confirmAction === 'rejectWd') {
      this.wdProcessing = true;
      this.admin.rejectWithdrawal(t.id, admin.username).then(() => {
        this.notification.success('Penarikan ditolak');
        this.loadWithdrawals(); this.loadTurnover();
      }).catch(e => this.notification.error(e.message)).finally(() => { this.wdProcessing = false; this.cdr.markForCheck(); });
    }
    this.confirmAction = null;
    this.confirmTarget = null;
  }

  statusClass(s: string) {
    if (s === 'COMPLETED') return 'bg-emerald-400/10 text-emerald-400';
    if (s === 'FAILED') return 'bg-red-400/10 text-red-400';
    return 'bg-yellow-400/10 text-yellow-400';
  }
}
