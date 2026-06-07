import { AngularSvgIconModule } from 'angular-svg-icon';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AdminService, AdminRpcError } from 'src/app/core/services/admin.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { RealtimeService } from 'src/app/core/services/realtime.service';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { PaginatorModule } from 'primeng/paginator';
import { InputTextModule } from 'primeng/inputtext';

interface DepositTx {
  id: string;
  user?: { username: string; display_name?: string };
  amount: number;
  method?: string;
  status: string;
  created_at: string;
  processed_at?: string;
  proof_image_url?: string;
  notes?: string;
}

interface PageEvent {
  first: number;
  rows: number;
}

@Component({
  selector: 'app-deposits',
  standalone: true,
  imports: [CommonModule, FormsModule,
    AngularSvgIconModule, WibDatePipe, SelectModule, TagModule, DialogModule, ConfirmDialogModule, PaginatorModule, InputTextModule],
  providers: [ConfirmationService],
  template: `
    <div data-page="deposits" class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-3">
          <div class="page-header-icon"><svg-icon src="assets/icons/heroicons/outline/download.svg" svgClass="h-4 w-4"></svg-icon></div>
          <div>
            <h1 class="max-sm:text-lg sm:text-xl font-bold text-foreground tracking-tight">Deposits</h1>
          <p class="text-muted-foreground mt-0.5 text-xs">Verifikasi bukti transfer dan setujui deposit pengguna</p>
        </div>
          </div>
        </div><button (click)="load()" class="bg-card border-border text-muted-foreground hover:text-foreground rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors">
          <svg class="h-3.5 w-3.5 inline mr-1" [class.animate-spin]="loading" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          Refresh
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <input pInputText [(ngModel)]="search" (ngModelChange)="applyFilter()" placeholder="Cari username, nominal…"
          class="!w-48 !text-xs !py-1.5 !px-2.5" />
        <p-select [(ngModel)]="statusFilter" (ngModelChange)="applyFilter()" [options]="statusOptions" optionLabel="label" optionValue="value"
          placeholder="Semua Status" class="w-36" styleClass="!text-xs !w-full" />
      </div>

      @if (error) {
        <div class="bg-card border-border rounded-lg border p-5 text-xs text-muted-foreground">
          <p class="font-medium text-foreground">Gagal memuat deposit</p>
          <p class="mt-0.5">{{ error }}</p>
          <button (click)="load()" class="mt-2 bg-card border-border rounded border px-2.5 py-1 text-xs font-medium">Coba Lagi</button>
        </div>
      }

      @if (loading) {
        <div class="text-muted-foreground py-12 text-center text-xs">Memuat deposit...</div>
      }

      <div class="bg-card border-border rounded-lg page-accent-card" [class.hidden]="loading">
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
              @for (tx of displayItems; track tx.id) {
                <tr class="border-border hover:bg-accent/30 border-b text-xs transition-colors cursor-pointer"
                    (click)="toggleDetail(tx)">
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono text-[10px] text-muted-foreground">{{ tx.id.slice(0,8).toUpperCase() }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p class="font-semibold text-foreground">{{ tx.user?.display_name || tx.user?.username || '—' }}</p>
                    <p class="text-muted-foreground text-[10px]">&#64;{{ tx.user?.username }}</p>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-bold text-foreground">+{{ tx.amount | number:'1.0-0' }} P</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-[10px] text-muted-foreground">{{ tx.method || '-' }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p-tag [value]="tx.status" [severity]="txStatusSeverity(tx.status)" />
                  </td>
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 whitespace-nowrap text-[10px]">{{ tx.created_at | wibDate:'short' }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" (click)="$event.stopPropagation()">
                    <div class="flex flex-wrap gap-1">
                      @if (tx.status === 'PENDING') {
                        <button (click)="confirmApprove(tx)" [disabled]="processing.has(tx.id)"
                          class="bg-foreground text-background disabled:opacity-50 rounded px-2 py-1 text-[10px] font-medium">
                          {{ processing.has(tx.id) ? '...' : 'Setujui' }}
                        </button>
                        <button (click)="confirmReject(tx)" [disabled]="processing.has(tx.id)"
                          class="bg-card border-border text-muted-foreground hover:text-foreground disabled:opacity-50 rounded border px-2 py-1 text-[10px] font-medium">Tolak</button>
                      }
                      @if (tx.proof_image_url) {
                        <a [href]="tx.proof_image_url" target="_blank"
                          class="bg-card border-border text-muted-foreground hover:text-foreground rounded border px-2 py-1 text-[10px] font-medium">Bukti</a>
                      }
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="text-muted-foreground px-4 py-12 text-center text-xs">Tidak ada deposit ditemukan.</td></tr>
              }
            </tbody>
          </table>
        </div>
        <p-paginator (onPageChange)="onPageChange($event)" [first]="(currentPage - 1) * pageSize" [rows]="pageSize" [totalRecords]="filtered.length" [showCurrentPageReport]="true" currentPageReportTemplate="" />
      </div>

      <p-dialog [(visible)]="detailVisible" [modal]="true" [style]="{ width: '500px' }"
        [draggable]="false" [resizable]="false" [closable]="true" (onHide)="closeDetail()">
        <ng-template pTemplate="header">
          <span class="text-sm font-bold text-foreground">Detail Deposit</span>
        </ng-template>
        <ng-template pTemplate="content">
          @if (selectedTx) {
            <div class="space-y-3">
              <div class="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                <p class="text-xs"><span class="text-muted-foreground">ID: </span><span class="font-mono text-[10px] text-foreground">{{ selectedTx.id }}</span></p>
                <p class="text-xs"><span class="text-muted-foreground">Nominal: </span><span class="font-bold text-foreground">{{ selectedTx.amount | number:'1.2-2' }} P</span></p>
                <p class="text-xs"><span class="text-muted-foreground">Metode: </span><span class="text-foreground font-semibold">{{ selectedTx.method || '-' }}</span></p>
                <p class="text-xs"><span class="text-muted-foreground">Status: </span><p-tag [value]="selectedTx.status" [severity]="txStatusSeverity(selectedTx.status)" /></p>
                <p class="text-xs"><span class="text-muted-foreground">Diminta: </span><span class="text-foreground">{{ selectedTx.created_at | wibDate:'medium' }}</span></p>
                @if (selectedTx.processed_at) {
                  <p class="text-xs"><span class="text-muted-foreground">Diproses: </span><span class="text-foreground">{{ selectedTx.processed_at | wibDate:'medium' }}</span></p>
                }
              </div>
              @if (selectedTx.notes) {
                <p class="text-xs"><span class="text-muted-foreground">Catatan: </span><span class="text-muted-foreground">{{ selectedTx.notes }}</span></p>
              }
              @if (selectedTx.proof_image_url) {
                <div>
                  <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Bukti Transfer</p>
                  <a [href]="selectedTx.proof_image_url" target="_blank">
                    <img [src]="selectedTx.proof_image_url" alt="Bukti" class="rounded-lg max-h-48 object-contain border border-border" />
                  </a>
                </div>
              }
            </div>
          }
        </ng-template>
      </p-dialog>

      <p-confirmdialog />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DepositsComponent implements OnInit, OnDestroy {
  all: DepositTx[] = [];
  filtered: DepositTx[] = [];
  currentPage = 1;
  pageSize = 20;
  get displayItems() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }
  search = '';
  statusFilter = '';
  selectedTx: DepositTx | null = null;
  detailVisible = false;
  loading = false;
  error: string | null = null;
  processing = new Set<string>();
  private destroy$ = new Subject<void>();

  statusOptions = [
    { label: 'Semua Status', value: '' },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Failed', value: 'FAILED' },
  ];

  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private notification = inject(NotificationService);
  private cdr = inject(ChangeDetectorRef);
  private realtime = inject(RealtimeService);
  private confirmation = inject(ConfirmationService);

  ngOnInit() {
    this.load();
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
    } catch (e: unknown) {
      const message = (e instanceof Error ? e.message : String(e)) || 'Unknown error';
      this.error = message;
      this.notification.error('Load gagal', message);
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
    } catch { /* silent */ }
  }

  applyFilter() {
    this.currentPage = 1;
    let r = this.all;
    if (this.search) {
      const q = this.search.toLowerCase();
      r = r.filter(tx => tx.user?.username?.toLowerCase().includes(q) || String(tx.amount).includes(q));
    }
    if (this.statusFilter) r = r.filter(tx => tx.status === this.statusFilter);
    this.filtered = r;
  }

  toggleDetail(tx: DepositTx) {
    this.selectedTx = this.selectedTx?.id === tx.id ? null : tx;
    this.detailVisible = !!this.selectedTx;
  }

  closeDetail() { this.selectedTx = null; this.detailVisible = false; }

  confirmApprove(tx: DepositTx) {
    this.confirmation.confirm({
      message: `Setujui deposit +${tx.amount.toLocaleString()} P dari ${tx.user?.username || tx.user?.display_name || tx.id.slice(0,8)}? Dana akan dikreditkan ke wallet.`,
      header: 'Setujui Deposit',
      rejectLabel: 'Batal',
      acceptLabel: 'Setujui',
      accept: () => this.approve(tx),
    });
  }

  confirmReject(tx: DepositTx) {
    this.confirmation.confirm({
      message: `Tolak deposit +${tx.amount.toLocaleString()} P dari ${tx.user?.username || tx.user?.display_name || tx.id.slice(0,8)}? Dana TIDAK akan dikreditkan.`,
      header: 'Tolak Deposit',
      rejectLabel: 'Batal',
      acceptLabel: 'Tolak',
      accept: () => this.reject(tx),
    });
  }

  async approve(tx: DepositTx) {
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      const err = e instanceof AdminRpcError ? e : AdminRpcError.fromMessage(message);
      this.notification.error(err.code === 'FORBIDDEN' ? 'Akses Ditolak' : 'Gagal', err.message);
    } finally {
      this.processing.delete(tx.id);
      this.cdr.markForCheck();
    }
  }

  async reject(tx: DepositTx) {
    if (this.processing.has(tx.id)) return;
    this.processing.add(tx.id);
    this.cdr.markForCheck();
    const admin = this.auth.getCurrentUser();
    if (!admin) { this.processing.delete(tx.id); return; }
    try {
      await this.admin.rejectDeposit(tx.id, admin.username, 'Ditolak oleh admin');
      tx.status = 'FAILED';
      tx.notes = 'Ditolak oleh admin';
      this.applyFilter();
      this.notification.success('Deposit ditolak', tx.user?.username || tx.id);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      const err = e instanceof AdminRpcError ? e : AdminRpcError.fromMessage(message);
      this.notification.error(err.code === 'FORBIDDEN' ? 'Akses Ditolak' : 'Gagal', err.message);
    } finally {
      this.processing.delete(tx.id);
      this.cdr.markForCheck();
    }
  }

  onPageChange(event: PageEvent) { this.currentPage = Math.floor(event.first / event.rows) + 1; this.pageSize = event.rows; }

  txStatusSeverity(s: string) {
    const m: Record<string, string> = { COMPLETED: 'success', PENDING: 'warn', FAILED: 'danger' };
    return m[s] || 'secondary';
  }
}