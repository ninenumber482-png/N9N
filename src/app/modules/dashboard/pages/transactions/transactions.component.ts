import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AdminService } from 'src/app/core/services/admin.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { RealtimeService } from 'src/app/core/services/realtime.service';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { SeverityMapPipe } from 'src/app/shared/pipes/severity-map.pipe';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { LoadingErrorComponent } from 'src/app/shared/components/loading-error/loading-error.component';
import { RefreshButtonComponent } from 'src/app/shared/components/refresh-button/refresh-button.component';
import { FilterBarComponent } from 'src/app/shared/components/filter-bar/filter-bar.component';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';

interface TransactionItem {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  status: string;
  created_at: string;
  reference_code?: string;
  user?: { username: string; display_name: string };
  method?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  proof_image_url?: string;
  notes?: string;
  processed_at?: string;
  bet_code?: string;
  result?: string;
  payout?: number;
}

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PageHeaderComponent,
    LoadingErrorComponent,
    RefreshButtonComponent,
    FilterBarComponent,
    SeverityMapPipe,
    WibDatePipe,
    SelectModule,
    DatePickerModule,
    TagModule,
    DialogModule,
    ConfirmDialogModule,
  ],
  providers: [ConfirmationService],
  template: `
    <div data-page="transactions" class="space-y-6">
      <app-page-header icon="currency-dollar" title="Transactions" subtitle="Review and manage all platform transactions">
        <app-refresh-button [loading]="loading" (clicked)="load()" />
      </app-page-header>

      <app-filter-bar [search]="search" (searchChange)="search=$event; applyFilter()" placeholder="Cari ref, username…">
        <p-select
          [(ngModel)]="typeFilter"
          (ngModelChange)="applyFilter()"
          [options]="typeOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Semua Tipe"
          class="w-36"
          styleClass="!text-xs !py-1.5" />

        <p-select
          [(ngModel)]="statusFilter"
          (ngModelChange)="applyFilter()"
          [options]="statusOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Semua Status"
          class="w-40"
          styleClass="!text-xs !py-1.5" />

        <p-datepicker
          [(ngModel)]="dateFromObj"
          (ngModelChange)="onDateFromChange()"
          placeholder="Dari tgl"
          dateFormat="dd/mm/yy"
          class="w-36"
          styleClass="!text-xs !py-1.5" />

        <p-datepicker
          [(ngModel)]="dateToObj"
          (ngModelChange)="onDateToChange()"
          placeholder="Sampai tgl"
          dateFormat="dd/mm/yy"
          class="w-36"
          styleClass="!text-xs !py-1.5" />
      </app-filter-bar>

      <app-loading-error [loading]="loading" [error]="error" (retry)="load()" />

      <div class="bg-card border-border rounded-lg page-accent-card">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead>
              <tr
                class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
                <th class="px-3 py-2.5">Ref#</th>
                <th class="px-3 py-2.5">User</th>
                <th class="px-3 py-2.5">Tipe</th>
                <th class="px-3 py-2.5">Nominal</th>
                <th class="px-3 py-2.5">Metode</th>
                <th class="px-3 py-2.5">Status</th>
                <th class="px-3 py-2.5">Tanggal</th>
                <th class="px-3 py-2.5 w-36">Aksi</th>
              </tr>
            </thead>
            <tbody>
              @for (tx of displayItems; track tx.id) {
                <tr
                  class="border-border hover:bg-accent/30 border-b text-xs transition-colors cursor-pointer"
                  (click)="toggleDetail(tx)">
                  <td class="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                    {{ tx.reference_code || tx.id.slice(0, 8).toUpperCase() }}
                  </td>
                  <td class="px-3 py-2.5">
                    <p class="font-medium text-foreground">{{ tx.user?.display_name || tx.user?.username || '—' }}</p>
                    <p class="text-muted-foreground text-[11px]">
                      &#64;{{ tx.user?.username || tx.user_id.slice(0, 8) }}
                    </p>
                  </td>
                  <td class="px-3 py-2.5">
                    <p-tag [value]="tx.type" [severity]="typeSeverity(tx.type)" />
                  </td>
                  <td class="px-3 py-2.5 font-bold text-foreground whitespace-nowrap">
                    {{ tx.amount | number: '1.0-0' }}
                    @if (tx.type === 'BET') {
                      P
                    } @else {
                      P
                    }
                  </td>
                  <td class="px-3 py-2.5 text-[11px] text-muted-foreground">{{ tx.method || tx.bank_name || '-' }}</td>
                  <td class="px-3 py-2.5">
                    <p-tag [value]="tx.status" [severity]="tx.status | severityMap" />
                  </td>
                  <td class="text-muted-foreground px-3 py-2.5 whitespace-nowrap text-[11px]">
                    {{ tx.created_at | wibDate: 'short' }}
                  </td>
                  <td class="px-3 py-2.5" (click)="$event.stopPropagation()">
                    <div class="flex flex-wrap gap-1">
                      @if (tx.status === 'PENDING') {
                        <button
                          (click)="confirmAction('approve', tx)"
                          class="bg-card border-border hover:bg-accent rounded border px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors">
                          Approve
                        </button>
                        <button
                          (click)="confirmAction('reject', tx)"
                          class="bg-card border-border hover:bg-accent rounded border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors">
                          Reject
                        </button>
                      }
                      @if (tx.proof_image_url) {
                        <a
                          [href]="tx.proof_image_url"
                          target="_blank"
                          class="bg-card border-border hover:bg-accent rounded border px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors"
                          >Bukti</a
                        >
                      }
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="8" class="text-muted-foreground px-3 py-12 text-center text-xs">
                    Tidak ada transaksi ditemukan.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (filtered.length > pageSize) {
          <div class="border-border flex items-center justify-between border-t px-3 py-2">
            <span class="text-[11px] text-muted-foreground">{{ filtered.length }} items</span>
            <div class="flex gap-1">
              <button
                (click)="prevPage()"
                [disabled]="currentPage <= 1"
                class="bg-card border-border hover:bg-accent rounded border px-2 py-1 text-[11px] font-medium disabled:opacity-40 transition-colors">
                ‹
              </button>
              @for (p of pageRange(); track $index) {
                @if (p === '...') {
                  <span class="px-2 py-1 text-[11px] text-muted-foreground">…</span>
                } @else {
                  <button
                    (click)="goToPage($any(p))"
                    class="rounded px-2 py-1 text-[11px] font-medium transition-colors"
                    [class.bg-accent]="p === currentPage"
                    [class.text-foreground]="p === currentPage"
                    [class.text-muted-foreground]="p !== currentPage"
                    [class.hover:bg-accent/50]="p !== currentPage">
                    {{ p }}
                  </button>
                }
              }
              <button
                (click)="nextPage()"
                [disabled]="currentPage >= totalPages"
                class="bg-card border-border hover:bg-accent rounded border px-2 py-1 text-[11px] font-medium disabled:opacity-40 transition-colors">
                ›
              </button>
            </div>
          </div>
        }
      </div>

      <p-dialog
        [(visible)]="detailVisible"
        [modal]="true"
        [style]="{ width: '560px', maxWidth: '95vw' }"
        [draggable]="false"
        [resizable]="false"
        [closable]="true"
        (onHide)="closeDetail()">
        <ng-template pTemplate="header">
          <span class="text-sm font-bold text-foreground">Detail Transaksi</span>
        </ng-template>
        <ng-template pTemplate="content">
          @if (selectedTx) {
            <div class="space-y-4 text-xs">
              <!-- Info utama -->
              <div class="grid grid-cols-2 gap-x-6 gap-y-2">
                <p><span class="text-muted-foreground">Ref: </span><span class="font-mono text-[11px] text-foreground">{{ selectedTx.reference_code || selectedTx.id.slice(0, 8).toUpperCase() }}</span></p>
                <p><span class="text-muted-foreground">ID: </span><span class="font-mono text-[11px] text-foreground break-all">{{ selectedTx.id }}</span></p>
                <p><span class="text-muted-foreground">Tipe: </span><span class="text-foreground font-medium">{{ selectedTx.type }}</span></p>
                <p><span class="text-muted-foreground">Nominal: </span><span class="font-bold text-foreground">{{ selectedTx.amount | number: '1.0-0' }} P</span></p>
                <p><span class="text-muted-foreground">Status: </span><span class="text-foreground font-medium">{{ selectedTx.status }}</span></p>
                @if (selectedTx.method) {
                  <p><span class="text-muted-foreground">Metode: </span><span class="text-foreground font-medium">{{ selectedTx.method }}</span></p>
                }
                <p><span class="text-muted-foreground">Diminta: </span><span class="text-foreground">{{ selectedTx.created_at | wibDate: 'medium' }}</span></p>
                @if (selectedTx.processed_at) {
                  <p class="col-span-2"><span class="text-muted-foreground">Diproses: </span><span class="text-foreground">{{ selectedTx.processed_at | wibDate: 'medium' }}</span></p>
                }
              </div>

              <!-- Bank info jika ada -->
              @if (selectedTx.bank_name) {
                <div class="bg-accent/20 rounded-lg p-3 space-y-1.5">
                  <p class="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Info Rekening</p>
                  <div class="grid grid-cols-2 gap-x-4 gap-y-1">
                    <p><span class="text-muted-foreground">Bank: </span><span class="text-foreground font-medium">{{ selectedTx.bank_name }}</span></p>
                    <p><span class="text-muted-foreground">A/n: </span><span class="text-foreground font-medium">{{ selectedTx.bank_account_name || '-' }}</span></p>
                    <p class="col-span-2"><span class="text-muted-foreground">No. Rek: </span><span class="font-mono text-foreground">{{ selectedTx.bank_account_number || '-' }}</span></p>
                  </div>
                </div>
              }

              <!-- Bet info jika ada -->
              @if (selectedTx.bet_code) {
                <div class="bg-accent/20 rounded-lg p-3 space-y-1.5">
                  <p class="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Info Bet</p>
                  <p><span class="text-muted-foreground">Kode: </span><span class="font-mono text-foreground">{{ selectedTx.bet_code }}</span></p>
                  @if (selectedTx.result) {
                    <p><span class="text-muted-foreground">Hasil: </span><span class="font-medium text-foreground">{{ selectedTx.result }}</span></p>
                  }
                  @if (selectedTx.payout) {
                    <p><span class="text-muted-foreground">Payout: </span><span class="font-medium text-foreground">{{ selectedTx.payout | number: '1.0-0' }} P</span></p>
                  }
                </div>
              }

              <!-- Bukti pembayaran jika ada -->
              @if (selectedTx.proof_image_url) {
                <div>
                  <p class="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Bukti Pembayaran</p>
                  <a [href]="selectedTx.proof_image_url" target="_blank">
                    <img [src]="selectedTx.proof_image_url" alt="Bukti" class="rounded-lg border border-border max-h-48 object-contain w-full" />
                  </a>
                </div>
              }

              <!-- Catatan admin -->
              <div>
                <p class="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Catatan Admin</p>
                <textarea
                  [(ngModel)]="editNotes[selectedTx.id]"
                  placeholder="Tambah catatan…"
                  rows="3"
                  class="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-foreground/30 resize-none transition-colors"></textarea>
                <div class="flex items-center gap-2 mt-2">
                  <button
                    (click)="saveNotes(selectedTx)"
                    [disabled]="savingNotes[selectedTx.id]"
                    class="bg-foreground text-background rounded px-2.5 py-1 text-[11px] font-medium disabled:opacity-50 transition-opacity">
                    {{ savingNotes[selectedTx.id] ? 'Menyimpan…' : 'Simpan Catatan' }}
                  </button>
                  @if (savedNotes[selectedTx.id]) {
                    <span class="text-emerald-400 text-[11px]">✓ Tersimpan</span>
                  }
                </div>
              </div>
            </div>
          }
        </ng-template>
      </p-dialog>

      <p-confirmdialog />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionsComponent implements OnInit, OnDestroy {
  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private notification = inject(NotificationService);
  private realtime = inject(RealtimeService);
  private cdr = inject(ChangeDetectorRef);
  private confirmation = inject(ConfirmationService);

  all: TransactionItem[] = [];
  filtered: TransactionItem[] = [];
  currentPage = 1;
  pageSize = 20;
  search = '';
  typeFilter = '';
  statusFilter = '';
  dateFrom = '';
  dateTo = '';
  dateFromObj: Date | null = null;
  dateToObj: Date | null = null;
  selectedTx: TransactionItem | null = null;
  detailVisible = false;
  editNotes: Record<string, string> = {};
  savingNotes: Record<string, boolean> = {};
  savedNotes: Record<string, boolean> = {};
  loading = false;
  error: string | null = null;

  typeOptions = [
    { label: 'Semua Tipe', value: '' },
    { label: 'Deposit', value: 'DEPOSIT' },
    { label: 'Withdrawal', value: 'WITHDRAWAL' },
    { label: 'Bet', value: 'BET' },
  ];
  statusOptions = [
    { label: 'Semua Status', value: '' },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Failed', value: 'FAILED' },
  ];

  private destroy$ = new Subject<void>();

  get displayItems() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }

  get totalPages() {
    return Math.ceil(this.filtered.length / this.pageSize);
  }

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
    this.realtime.subscribeTransactions();
    this.realtime.transactions$.pipe(takeUntil(this.destroy$)).subscribe((transactions) => {
      if (transactions) {
        // Realtime data arrives without user join (anon key, RLS on users).
        // Preserve existing user data from admin-proxy load.
        const existing = new Map(this.all.map((t) => [t.id, t]));
        this.all = (transactions as TransactionItem[]).map((tx) => ({
          ...tx,
          user: tx.user ?? existing.get(tx.id)?.user ?? undefined,
        }));
        this.all.forEach((tx) => {
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
      this.all.forEach((tx) => {
        if (tx.notes && !this.editNotes[tx.id]) this.editNotes[tx.id] = tx.notes;
      });
      this.applyFilter();
    } catch (e: unknown) {
      this.error = (e instanceof Error ? e.message : '') || 'Unknown error';
      this.notification.error('Load failed', (e instanceof Error ? e.message : '') || 'Could not load transactions.');
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  applyFilter() {
    this.currentPage = 1;
    let result = this.all;
    if (this.search) {
      const q = this.search.toLowerCase();
      result = result.filter(
        (tx) =>
          tx.id.toLowerCase().includes(q) ||
          (tx.reference_code?.toLowerCase().includes(q) ?? false) ||
          tx.user?.username?.toLowerCase().includes(q) ||
          tx.user?.display_name?.toLowerCase().includes(q) ||
          String(tx.amount).includes(q),
      );
    }
    if (this.typeFilter) result = result.filter((tx) => tx.type === this.typeFilter);
    if (this.statusFilter) result = result.filter((tx) => tx.status === this.statusFilter);
    if (this.dateFrom) {
      const from = new Date(this.dateFrom + 'T00:00:00').getTime();
      result = result.filter((tx) => new Date(tx.created_at).getTime() >= from);
    }
    if (this.dateTo) {
      const to = new Date(this.dateTo + 'T23:59:59').getTime();
      result = result.filter((tx) => new Date(tx.created_at).getTime() <= to);
    }
    this.filtered = result;
  }

  onDateFromChange() {
    this.dateFrom = this.dateFromObj ? this.dateFromObj.toISOString().slice(0, 10) : '';
    this.applyFilter();
  }

  onDateToChange() {
    this.dateTo = this.dateToObj ? this.dateToObj.toISOString().slice(0, 10) : '';
    this.applyFilter();
  }

  goToPage(p: number) {
    this.currentPage = p;
    this.cdr.markForCheck();
  }
  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.cdr.markForCheck();
    }
  }
  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.cdr.markForCheck();
    }
  }

  pageRange(): (number | string)[] {
    const total = this.totalPages;
    const current = this.currentPage;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | string)[] = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < total - 1) pages.push('...');
    pages.push(total);
    return pages;
  }

  toggleDetail(tx: TransactionItem) {
    this.selectedTx = tx;
    this.detailVisible = true;
    if (this.editNotes[tx.id] === undefined) {
      this.editNotes[tx.id] = tx.notes ?? '';
    }
    this.cdr.markForCheck();
  }

  closeDetail() {
    this.detailVisible = false;
    this.selectedTx = null;
    this.cdr.markForCheck();
  }

  confirmAction(action: string, tx: TransactionItem) {
    this.confirmation.confirm({
      message: `${action === 'approve' ? 'Setujui' : 'Tolak'} ${tx.type} ${Number(tx.amount).toLocaleString()} P dari ${tx.user?.username || tx.user_id?.slice(0, 8)}?`,
      header: action === 'approve' ? 'Setujui Transaksi' : 'Tolak Transaksi',
      icon: 'none',
      rejectLabel: 'Batal',
      acceptLabel: action === 'approve' ? 'Setujui' : 'Tolak',
      accept: () => this.executeAction(action, tx),
      reject: () => {},
    });
  }

  async executeAction(action: string, tx: TransactionItem) {
    try {
      const admin = this.auth.getCurrentUser();
      if (!admin) return;
      if (action === 'approve') {
        if (tx.type === 'DEPOSIT') await this.admin.approveDeposit(tx.id, admin.username);
        else if (tx.type === 'WITHDRAWAL') await this.admin.approveWithdrawal(tx.id, admin.username);
        else throw new Error(`Unsupported transaction type: ${tx.type}`);
        await this.admin.logAction(
          admin.username,
          'APPROVE_TRANSACTION',
          'transactions',
          tx.id,
          tx.status,
          'COMPLETED',
        );
        tx.status = 'COMPLETED';
        this.notification.success('Transaksi disetujui', `${tx.type} ${tx.amount} P berhasil disetujui.`);
      } else {
        if (tx.type === 'DEPOSIT') await this.admin.rejectDeposit(tx.id, admin.username, 'Ditolak oleh admin');
        else if (tx.type === 'WITHDRAWAL')
          await this.admin.rejectWithdrawal(tx.id, admin.username, 'Ditolak oleh admin');
        else throw new Error(`Unsupported transaction type: ${tx.type}`);
        await this.admin.logAction(admin.username, 'REJECT_TRANSACTION', 'transactions', tx.id, tx.status, 'FAILED');
        tx.status = 'FAILED';
        this.notification.success('Transaksi ditolak', `${tx.type} ${tx.amount} P telah ditolak.`);
      }
      tx.processed_at = new Date().toISOString();
      this.applyFilter();
    } catch (e: unknown) {
      this.notification.error('Gagal', (e instanceof Error ? e.message : '') || `Could not ${action} transaction.`);
    }
    this.cdr.markForCheck();
  }

  async saveNotes(tx: TransactionItem) {
    const notes = this.editNotes[tx.id] ?? '';
    this.savingNotes[tx.id] = true;
    this.savedNotes[tx.id] = false;
    this.cdr.markForCheck();
    try {
      await this.admin.updateTransaction(tx.id, { notes });
      tx.notes = notes;
      this.savedNotes[tx.id] = true;
      this.cdr.markForCheck();
      setTimeout(() => {
        this.savedNotes[tx.id] = false;
        this.cdr.markForCheck();
      }, 3000);
    } catch (e: unknown) {
      this.notification.error('Gagal simpan', (e instanceof Error ? e.message : '') || 'Could not save notes.');
    } finally {
      this.savingNotes[tx.id] = false;
      this.cdr.markForCheck();
    }
  }

  typeSeverity(t: string): 'info' | 'warn' | 'contrast' | 'secondary' {
    const m: Record<string, 'info' | 'warn' | 'contrast' | 'secondary'> = { DEPOSIT: 'info', WITHDRAWAL: 'warn', BET: 'contrast' };
    return m[t] || 'secondary';
  }
}
