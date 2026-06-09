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
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { LoadingErrorComponent } from 'src/app/shared/components/loading-error/loading-error.component';
import { RefreshButtonComponent } from 'src/app/shared/components/refresh-button/refresh-button.component';
import { FilterBarComponent } from 'src/app/shared/components/filter-bar/filter-bar.component';
import { SeverityMapPipe } from 'src/app/shared/pipes/severity-map.pipe';
import { PaginationHelper } from 'src/app/shared/utils/pagination.helper';

interface WithdrawTx {
  id: string;
  user?: { username: string; display_name?: string };
  amount: number;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  withdrawal_fee?: number;
  status: string;
  created_at: string;
  processed_at?: string;
  notes?: string;
}

interface PageEvent {
  first: number;
  rows: number;
}

@Component({
  selector: 'app-withdrawals',
  standalone: true,
  imports: [CommonModule, FormsModule,
    WibDatePipe, SelectModule, TagModule, DialogModule, ConfirmDialogModule, PaginatorModule,
    PageHeaderComponent, LoadingErrorComponent, RefreshButtonComponent, FilterBarComponent, SeverityMapPipe],
  providers: [ConfirmationService],
  template: `
    <div data-page="withdrawals" class="space-y-6">
      <app-page-header icon="arrow-long-right" title="Withdrawals" subtitle="Proses permintaan penarikan dana pengguna">
        <app-refresh-button [loading]="loading" (clicked)="load()" />
      </app-page-header>

      <app-filter-bar [search]="search" (searchChange)="search=$event; applyFilter()" placeholder="Cari username, nominal…">
        <p-select [(ngModel)]="statusFilter" (ngModelChange)="applyFilter()" [options]="statusOptions" optionLabel="label" optionValue="value"
          placeholder="Semua Status" class="w-36" styleClass="!text-xs !w-full" />
      </app-filter-bar>

      <app-loading-error [loading]="loading" [error]="error" (retry)="load()" />

      <div class="bg-card border-border rounded-lg page-accent-card" [class.hidden]="loading">
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
                <tr class="border-border hover:bg-accent/30 border-b text-xs transition-colors cursor-pointer"
                    (click)="toggleDetail(tx)">
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono text-[10px] text-muted-foreground">{{ tx.id.slice(0,8).toUpperCase() }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p class="font-semibold text-foreground">{{ tx.user?.display_name || tx.user?.username || '—' }}</p>
                    <p class="text-muted-foreground text-[10px]">&#64;{{ tx.user?.username }}</p>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-bold text-muted-foreground">-{{ tx.amount | number:'1.0-0' }} P</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p class="text-foreground font-semibold text-[10px]">{{ tx.bank_name || '-' }}</p>
                    <p class="text-muted-foreground text-[9px]">{{ tx.bank_account_number }} · {{ tx.bank_account_name }}</p>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-[10px] text-muted-foreground">{{ tx.withdrawal_fee ? (tx.withdrawal_fee | number:'1.0-0') + ' P' : '-' }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p-tag [value]="tx.status" [severity]="tx.status | severityMap" />
                  </td>
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 whitespace-nowrap text-[10px]">{{ tx.created_at | wibDate:'short' }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" (click)="$event.stopPropagation()">
                    <div class="flex flex-wrap gap-1">
                      @if (tx.status === 'PENDING') {
                        <button (click)="confirmApprove(tx)" [disabled]="processing.has(tx.id)"
                          class="bg-foreground text-background disabled:opacity-50 rounded px-2 py-1 text-[10px] font-medium">
                          {{ processing.has(tx.id) ? '...' : 'Proses' }}
                        </button>
                        <button (click)="confirmReject(tx)" [disabled]="processing.has(tx.id)"
                          class="bg-card border-border text-muted-foreground hover:text-foreground disabled:opacity-50 rounded border px-2 py-1 text-[10px] font-medium">Tolak</button>
                      }
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="text-muted-foreground px-4 py-12 text-center text-xs">Tidak ada withdrawal ditemukan.</td></tr>
              }
            </tbody>
          </table>
        </div>
        <p-paginator (onPageChange)="onPageChange($event)" [first]="(currentPage - 1) * pageSize" [rows]="pageSize" [totalRecords]="filtered.length" [showCurrentPageReport]="true" currentPageReportTemplate="Menampilkan {first}–{last} dari {totalRecords}" />
      </div>

      <p-dialog [(visible)]="detailVisible" [modal]="true" [style]="{ width: '500px' }"
        [draggable]="false" [resizable]="false" [closable]="true" (onHide)="closeDetail()">
        <ng-template pTemplate="header">
          <span class="text-sm font-bold text-foreground">Detail Penarikan</span>
        </ng-template>
        <ng-template pTemplate="content">
          @if (selectedTx) {
            <div class="space-y-3">
              <div class="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                <p class="text-xs"><span class="text-muted-foreground">ID: </span><span class="font-mono text-[10px] text-foreground">{{ selectedTx.id }}</span></p>
                <p class="text-xs"><span class="text-muted-foreground">Nominal: </span><span class="font-bold text-muted-foreground">{{ selectedTx.amount | number:'1.0-0' }} P</span></p>
                <p class="text-xs"><span class="text-muted-foreground">Fee: </span><span class="text-muted-foreground">{{ selectedTx.withdrawal_fee | number:'1.0-0' }} P</span></p>
                <p class="text-xs"><span class="text-muted-foreground">Status: </span><p-tag [value]="selectedTx.status" [severity]="selectedTx.status | severityMap" /></p>
                <p class="text-xs"><span class="text-muted-foreground">Bank: </span><span class="font-semibold text-foreground">{{ selectedTx.bank_name }}</span></p>
                <p class="text-xs"><span class="text-muted-foreground">No. Rek: </span><span class="font-mono font-semibold text-foreground">{{ selectedTx.bank_account_number }}</span></p>
                <p class="text-xs"><span class="text-muted-foreground">Nama: </span><span class="font-semibold text-foreground">{{ selectedTx.bank_account_name }}</span></p>
                <p class="text-xs"><span class="text-muted-foreground">Diminta: </span><span class="text-foreground">{{ selectedTx.created_at | wibDate:'medium' }}</span></p>
                @if (selectedTx.processed_at) {
                  <p class="text-xs"><span class="text-muted-foreground">Diproses: </span><span class="text-foreground">{{ selectedTx.processed_at | wibDate:'medium' }}</span></p>
                }
              </div>
              @if (selectedTx.notes) {
                <p class="text-xs border-t border-border pt-2"><span class="text-muted-foreground">Catatan: </span><span class="text-muted-foreground">{{ selectedTx.notes }}</span></p>
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
export class WithdrawalsComponent implements OnInit, OnDestroy {
  all: WithdrawTx[] = [];
  filtered: WithdrawTx[] = [];
  currentPage = 1;
  pageSize = 20;
  get displayItems() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }
  search = '';
  statusFilter = '';
  selectedTx: WithdrawTx | null = null;
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
      this.all = await this.admin.getWithdrawals();
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
      this.all = await this.admin.getWithdrawals();
      this.applyFilter();
      this.cdr.markForCheck();
    } catch { /* silent */ }
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

  toggleDetail(tx: WithdrawTx) {
    this.selectedTx = this.selectedTx?.id === tx.id ? null : tx;
    this.detailVisible = !!this.selectedTx;
  }

  closeDetail() { this.selectedTx = null; this.detailVisible = false; }

  confirmApprove(tx: WithdrawTx) {
    this.confirmation.confirm({
      message: `Proses withdrawal -${tx.amount.toLocaleString()} P untuk ${tx.bank_account_name} (${tx.bank_name} ${tx.bank_account_number})? Dana akan dikirim ke rekening tujuan.`,
      header: 'Proses Withdrawal',
      rejectLabel: 'Batal',
      acceptLabel: 'Proses',
      accept: () => this.approve(tx),
    });
  }

  confirmReject(tx: WithdrawTx) {
    this.confirmation.confirm({
      message: `Tolak withdrawal -${tx.amount.toLocaleString()} P dari ${tx.user?.username || tx.id.slice(0,8)}? Dana akan dikembalikan ke wallet.`,
      header: 'Tolak Withdrawal',
      rejectLabel: 'Batal',
      acceptLabel: 'Tolak',
      accept: () => this.reject(tx),
    });
  }

  async approve(tx: WithdrawTx) {
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      const err = e instanceof AdminRpcError ? e : AdminRpcError.fromMessage(message);
      this.notification.error(err.code === 'FORBIDDEN' ? 'Akses Ditolak' : 'Gagal', err.message);
    } finally {
      this.processing.delete(tx.id);
      this.cdr.markForCheck();
    }
  }

  async reject(tx: WithdrawTx) {
    if (this.processing.has(tx.id)) return;
    this.processing.add(tx.id);
    this.cdr.markForCheck();
    const admin = this.auth.getCurrentUser();
    if (!admin) { this.processing.delete(tx.id); return; }
    try {
      await this.admin.rejectWithdrawal(tx.id, admin.username, 'Ditolak oleh admin');
      tx.status = 'FAILED';
      tx.notes = 'Ditolak oleh admin';
      this.applyFilter();
      this.notification.success('Withdrawal ditolak', tx.user?.username || tx.id);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      const err = e instanceof AdminRpcError ? e : AdminRpcError.fromMessage(message);
      this.notification.error(err.code === 'FORBIDDEN' ? 'Akses Ditolak' : 'Gagal', err.message);
    } finally {
      this.processing.delete(tx.id);
      this.cdr.markForCheck();
    }
  }

  onPageChange(event: PageEvent) {
    const { page, pageSize } = PaginationHelper.onPageChange(event, this.pageSize);
    this.currentPage = page;
    this.pageSize = pageSize;
    this.cdr.markForCheck();
  }
}
