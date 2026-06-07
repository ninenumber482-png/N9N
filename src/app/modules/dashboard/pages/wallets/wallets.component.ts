import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AdminService, AdminRpcError } from 'src/app/core/services/admin.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { RealtimeService } from 'src/app/core/services/realtime.service';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { PaginatorModule } from 'primeng/paginator';

interface WalletRecord {
  user_id: string;
  balance_main: number;
  balance_bonus: number;
  total_deposited: number;
  total_withdrawn: number;
  total_turnover: number;
  updated_at: string;
  user?: { username?: string; display_name?: string; role?: string };
}

interface PlatformAccountRecord {
  id?: string;
  provider_name: string;
  account_holder: string;
  account_number: string;
  payment_code?: string;
  type: string;
  status: string;
  instructions?: string;
}

@Component({
  selector: 'app-wallets',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AngularSvgIconModule,
    WibDatePipe,
    SelectModule,
    TagModule,
    DialogModule,
    ConfirmDialogModule,
    InputNumberModule,
    InputTextModule,
    PaginatorModule,
  ],
  providers: [ConfirmationService],
  template: `
    <div data-page="wallets" class="space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="page-header-icon"><svg-icon src="assets/icons/heroicons/outline/folder.svg" svgClass="h-4 w-4"></svg-icon></div>
          <div>
            <h1 class="max-sm:text-lg sm:text-xl font-bold text-foreground tracking-tight">Wallets</h1>
            <p class="text-muted-foreground mt-0.5 text-xs">Kelola saldo pengguna & rekening platform</p>
          </div>
        </div>
        <button
          (click)="load()"
          [disabled]="loading"
          class="bg-card border-border text-muted-foreground hover:text-foreground rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50">
          <svg class="h-3.5 w-3.5" [class.animate-spin]="loading" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      <div class="flex gap-1 border-b border-border">
        <button
          (click)="tab = 'wallets'"
          [class]="
            tab === 'wallets'
              ? 'border-b-2 border-foreground text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          class="px-4 pb-2 text-xs font-semibold transition-colors">
          Saldo Pengguna
        </button>
        <button
          (click)="tab = 'accounts'"
          [class]="
            tab === 'accounts'
              ? 'border-b-2 border-foreground text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          class="px-4 pb-2 text-xs font-semibold transition-colors">
          Rekening Platform
        </button>
      </div>

      @if (tab === 'wallets') {
        <div class="flex flex-wrap gap-2">
          <input
            pInputText
            [(ngModel)]="walletSearch"
            (ngModelChange)="filterWallets()"
            placeholder="Cari username…"
            class="!w-48 !text-xs !py-1.5 !px-2.5" />
        </div>

        @if (error) {
          <div class="bg-card border-border rounded-lg border p-5 text-xs text-muted-foreground">
            <p class="font-medium text-foreground">Gagal memuat wallet</p>
            <p class="mt-0.5">{{ error }}</p>
            <button (click)="load()" class="mt-2 bg-card border-border rounded border px-2.5 py-1 text-xs font-medium">
              Coba Lagi
            </button>
          </div>
        }

        <div class="bg-card border-border rounded-lg page-accent-card">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr
                  class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                  <th class="px-3 py-2.5">User</th>
                  <th class="px-3 py-2.5">Balance</th>
                  <th class="px-3 py-2.5">Bonus</th>
                  <th class="px-3 py-2.5">Deposit</th>
                  <th class="px-3 py-2.5">WD</th>
                  <th class="max-sm:hidden px-3 py-2.5">Net</th>
                  <th class="max-sm:hidden px-3 py-2.5">Win/Loss</th>
                  <th class="px-3 py-2.5">TO</th>
                  <th class="px-3 py-2.5">Updated</th>
                  <th class="px-3 py-2.5 w-24">Aksi</th>
                </tr>
              </thead>
              <tbody>
                @for (w of paginatedWallets; track w.user_id) {
                  <tr class="border-border hover:bg-accent/30 border-b text-xs transition-colors">
                    <td class="px-3 py-2.5">
                      <p class="font-medium text-foreground">{{ w.user?.display_name || w.user?.username || '—' }}</p>
                      <p class="text-muted-foreground text-[10px]">
                        &#64;{{ w.user?.username || w.user_id.slice(0, 8) }}
                      </p>
                    </td>
                    <td class="px-3 py-2.5 font-bold text-foreground whitespace-nowrap">
                      {{ w.balance_main | number: '1.2-2' }} P
                    </td>
                    <td class="px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">
                      {{ w.balance_bonus | number: '1.2-2' }} P
                    </td>
                    <td class="px-3 py-2.5 text-foreground font-semibold whitespace-nowrap">
                      {{ w.total_deposited | number: '1.2-2' }} P
                    </td>
                    <td class="px-3 py-2.5 text-muted-foreground font-semibold whitespace-nowrap">
                      {{ w.total_withdrawn | number: '1.2-2' }} P
                    </td>
                    <td
                      class="max-sm:hidden px-3 py-2.5 font-semibold whitespace-nowrap"
                      [class.text-foreground]="net(w) >= 0"
                      [class.text-muted-foreground]="net(w) < 0">
                      {{ net(w) | number: '1.2-2' }} P
                    </td>
                    <td
                      class="max-sm:hidden px-3 py-2.5 font-semibold whitespace-nowrap"
                      [class.text-foreground]="pnl(w) >= 0"
                      [class.text-muted-foreground]="pnl(w) < 0">
                      {{ pnl(w) | number: '1.2-2' }} P
                    </td>
                    <td class="px-3 py-2.5 text-foreground font-semibold whitespace-nowrap">
                      {{ w.total_turnover | number: '1.2-2' }} P
                      @if (w.total_deposited > 0) {
                        <span class="text-muted-foreground text-[9px] ml-1"
                          >({{ w.total_turnover / w.total_deposited | number: '1.1-1' }}x)</span
                        >
                      }
                    </td>
                    <td class="text-muted-foreground px-3 py-2.5 text-[10px] whitespace-nowrap">
                      {{ w.updated_at | wibDate: 'short' }}
                    </td>
                    <td class="px-3 py-2.5">
                      @if (isSuperadmin) {
                        <button
                          (click)="openAdjust(w)"
                          class="bg-card border-border hover:bg-accent rounded border px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors">
                          Sesuaikan
                        </button>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="10" class="text-muted-foreground px-3 py-12 text-center text-xs">
                      Tidak ada wallet ditemukan.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
        <p-paginator
          (onPageChange)="onPageChange($event)"
          [first]="(currentPage - 1) * pageSize"
          [rows]="pageSize"
          [totalRecords]="filteredWallets.length"
          [showCurrentPageReport]="true"
          currentPageReportTemplate="" />
      }

      @if (tab === 'accounts') {
        <div class="flex items-center justify-between">
          <p class="text-muted-foreground text-xs">Rekening bank & metode pembayaran platform</p>
          <button
            (click)="openNewAccount()"
            class="bg-foreground text-background rounded-lg px-3 py-1.5 text-xs font-medium">
            + Tambah Rekening
          </button>
        </div>

        @if (accountsError) {
          <div class="bg-card border-border rounded-lg border p-5 text-xs text-muted-foreground">
            Tabel <code class="font-mono">platform_accounts</code> belum ada. Jalankan migration di Supabase SQL Editor.
          </div>
        }

        @if (editingAccount) {
          <div class="bg-card border-border rounded-lg border p-5 space-y-4">
            <h3 class="text-sm font-semibold text-foreground">
              {{ editingAccount.id ? 'Edit Rekening' : 'Tambah Rekening Baru' }}
            </h3>
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="space-y-1">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
                  >Nama Bank / Provider <span class="text-destructive">*</span></label
                >
                <input
                  pInputText
                  [(ngModel)]="editingAccount.provider_name"
                  placeholder="Bank Central Asia"
                  class="!w-full !text-xs" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
                  >Nama Pemilik <span class="text-destructive">*</span></label
                >
                <input
                  pInputText
                  [(ngModel)]="editingAccount.account_holder"
                  placeholder="PT NUMBER NINE"
                  class="!w-full !text-xs" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
                  >Nomor Rekening <span class="text-destructive">*</span></label
                >
                <input
                  pInputText
                  [(ngModel)]="editingAccount.account_number"
                  placeholder="1234567890"
                  class="!w-full !text-xs" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
                  >Kode Pembayaran (opsional)</label
                >
                <input
                  pInputText
                  [(ngModel)]="editingAccount.payment_code"
                  placeholder="Virtual account"
                  class="!w-full !text-xs" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tipe <span class="text-destructive">*</span></label>
                <p-select
                  [(ngModel)]="editingAccount.type"
                  [options]="accountTypeOptions"
                  optionLabel="label"
                  optionValue="value"
                  class="w-full"
                  styleClass="!text-xs !w-full" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status <span class="text-destructive">*</span></label>
                <p-select
                  [(ngModel)]="editingAccount.status"
                  [options]="accountStatusOptions"
                  optionLabel="label"
                  optionValue="value"
                  class="w-full"
                  styleClass="!text-xs !w-full" />
              </div>
              <div class="sm:col-span-2 space-y-1">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
                  >Instruksi Pembayaran</label
                >
                <textarea
                  [(ngModel)]="editingAccount.instructions"
                  rows="2"
                  placeholder="Instruksi yang ditampilkan ke pengguna saat deposit…"
                  class="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-foreground/30 resize-none transition-colors"></textarea>
              </div>
            </div>
            <div class="flex gap-2">
              <button
                (click)="saveAccount()"
                class="bg-foreground text-background rounded-lg px-3 py-1.5 text-xs font-medium">
                Simpan
              </button>
              <button
                (click)="editingAccount = null"
                class="text-muted-foreground rounded-lg px-2.5 py-1.5 text-xs font-medium">
                Batal
              </button>
            </div>
          </div>
        }

        <div class="bg-card border-border rounded-lg border overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr
                  class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                  <th class="px-3 py-2.5">Provider</th>
                  <th class="px-3 py-2.5">Pemilik</th>
                  <th class="px-3 py-2.5">No. Rekening</th>
                  <th class="px-3 py-2.5">Tipe</th>
                  <th class="px-3 py-2.5">Status</th>
                  <th class="px-3 py-2.5 w-28">Aksi</th>
                </tr>
              </thead>
              <tbody>
                @for (a of accounts; track a.id) {
                  <tr class="border-border hover:bg-accent/30 border-b text-xs transition-colors">
                    <td class="px-3 py-2.5 font-medium text-foreground">{{ a.provider_name }}</td>
                    <td class="px-3 py-2.5 text-muted-foreground">{{ a.account_holder }}</td>
                    <td class="px-3 py-2.5 font-mono text-foreground">{{ a.account_number }}</td>
                    <td class="px-3 py-2.5">
                      <p-tag [value]="a.type" [severity]="accountTypeSeverity(a.type)" />
                    </td>
                    <td class="px-3 py-2.5">
                      <p-tag [value]="a.status" [severity]="a.status === 'ACTIVE' ? 'success' : 'secondary'" />
                    </td>
                    <td class="px-3 py-2.5">
                      <div class="flex gap-1">
                        <button
                          (click)="startEditAccount(a)"
                          class="bg-card border-border hover:bg-accent rounded border px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors">
                          Edit
                        </button>
                        <button
                          (click)="confirmToggleAccount(a)"
                          class="bg-card border-border hover:bg-accent rounded border px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors">
                          {{ a.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan' }}
                        </button>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  @if (!accountsError) {
                    <tr>
                      <td colspan="6" class="text-muted-foreground px-3 py-12 text-center text-xs">
                        Belum ada rekening platform.
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      <p-dialog
        [(visible)]="adjustVisible"
        [modal]="true"
        [style]="{ width: '500px' }"
        [draggable]="false"
        [resizable]="false"
        [closable]="true">
        <ng-template pTemplate="header">
          <span class="text-sm font-bold text-foreground">Sesuaikan Saldo</span>
        </ng-template>
        <ng-template pTemplate="content">
          @if (adjusting) {
            <div class="space-y-4">
              <div class="bg-accent/20 rounded-lg p-3 space-y-1">
                <p class="text-sm text-foreground font-medium">
                  {{ adjusting.user?.display_name || adjusting.user?.username }}
                </p>
                <p class="text-xs text-muted-foreground">&#64;{{ adjusting.user?.username }}</p>
                <div class="flex gap-4 pt-1">
                  <p class="text-xs text-muted-foreground">
                    Main:
                    <span class="text-foreground font-mono font-bold">{{
                      adjusting.balance_main | number: '1.2-2'
                    }}</span>
                  </p>
                  <p class="text-xs text-muted-foreground">
                    Bonus:
                    <span class="text-foreground font-mono font-bold">{{
                      adjusting.balance_bonus | number: '1.2-2'
                    }}</span>
                  </p>
                </div>
              </div>
              <div>
                <label class="text-xs font-semibold text-muted-foreground block mb-1">Tipe <span class="text-destructive">*</span></label>
                <div class="flex gap-2">
                  <button
                    (click)="adjType = 'add'"
                    class="px-4 py-2 text-xs font-medium rounded-lg border transition-colors"
                    [class.bg-foreground]="adjType === 'add'"
                    [class.text-background]="adjType === 'add'"
                    [class.border-foreground]="adjType === 'add'"
                    [class.bg-card]="adjType !== 'add'"
                    [class.border-border]="adjType !== 'add'"
                    [class.text-muted-foreground]="adjType !== 'add'">
                    + Tambah
                  </button>
                  <button
                    (click)="adjType = 'deduct'"
                    class="px-4 py-2 text-xs font-medium rounded-lg border transition-colors"
                    [class.bg-foreground]="adjType === 'deduct'"
                    [class.text-background]="adjType === 'deduct'"
                    [class.border-foreground]="adjType === 'deduct'"
                    [class.bg-card]="adjType !== 'deduct'"
                    [class.border-border]="adjType !== 'deduct'"
                    [class.text-muted-foreground]="adjType !== 'deduct'">
                    - Kurangi
                  </button>
                </div>
              </div>
              <div>
                <label class="text-xs font-semibold text-muted-foreground block mb-1">Jumlah <span class="text-destructive">*</span></label>
                <p-inputNumber
                  [(ngModel)]="adjAmount"
                  [min]="0"
                  [max]="999999999"
                  mode="decimal"
                  [minFractionDigits]="0"
                  [maxFractionDigits]="2"
                  placeholder="0"
                  class="w-full"
                  inputStyleClass="!text-xs !w-full" />
              </div>
              <div>
                <label class="text-xs font-semibold text-muted-foreground block mb-1">Alasan</label>
                <input
                  pInputText
                  [(ngModel)]="adjNotes"
                  placeholder="Alasan adjustment (opsional)"
                  class="!w-full !text-xs" />
              </div>
              @if (adjError) {
                <p class="text-xs text-muted-foreground">{{ adjError }}</p>
              }
              @if (adjSuccess) {
                <div class="bg-card border-border rounded-lg border p-3 text-xs text-foreground">
                  Saldo berhasil diubah. {{ adjResult?.old_balance | number: '1.2-2' }} →
                  {{ adjResult?.new_balance | number: '1.2-2' }}
                </div>
              }
              <div class="flex gap-2 pt-2">
                <button
                  (click)="saveAdjust(adjusting)"
                  [disabled]="adjustSubmitting || !adjAmount || adjAmount <= 0"
                  class="bg-foreground text-background disabled:opacity-50 rounded-lg px-3 py-1.5 text-xs font-medium">
                  {{ adjustSubmitting ? 'Memproses...' : adjType === 'add' ? 'Tambah Saldo' : 'Kurangi Saldo' }}
                </button>
                <button
                  (click)="adjusting = null; adjustVisible = false"
                  class="text-muted-foreground rounded-lg px-2.5 py-1.5 text-xs font-medium">
                  Batal
                </button>
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
export class WalletsComponent implements OnInit, OnDestroy {
  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private notification = inject(NotificationService);
  private cdr = inject(ChangeDetectorRef);
  private realtime = inject(RealtimeService);
  private confirmation = inject(ConfirmationService);

  tab: 'wallets' | 'accounts' = 'wallets';

  wallets: WalletRecord[] = [];
  filteredWallets: WalletRecord[] = [];
  walletSearch = '';
  currentPage = 1;
  pageSize = 20;

  adjusting: WalletRecord | null = null;
  adjustVisible = false;
  adjType: 'add' | 'deduct' = 'add';
  adjAmount: number | null = null;
  adjNotes = '';
  adjError = '';
  adjSuccess = false;
  adjResult: { old_balance?: number; new_balance?: number } | null = null;
  adjustSubmitting = false;

  accounts: PlatformAccountRecord[] = [];
  accountsError = false;
  editingAccount: PlatformAccountRecord | null = null;

  loading = false;
  error: string | null = null;
  isSuperadmin = false;

  accountTypeOptions = [
    { label: 'Bank Transfer', value: 'BANK' },
    { label: 'E-Wallet', value: 'EWALLET' },
    { label: 'QRIS', value: 'QRIS' },
  ];
  accountStatusOptions = [
    { label: 'Aktif', value: 'ACTIVE' },
    { label: 'Nonaktif', value: 'INACTIVE' },
  ];

  private destroy$ = new Subject<void>();

  ngOnInit() {
    this.isSuperadmin = this.auth.getCurrentUser()?.role === 'superadmin';
    this.load();
    this.realtime.subscribeWallets();
    this.realtime.wallets$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.silentRefresh();
    });
  }

  ngOnDestroy() {
    this.realtime.unsubscribeWallets();
    this.destroy$.next();
    this.destroy$.complete();
  }

  async load() {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();
    try {
      this.wallets = (await this.admin.getWallets()) as WalletRecord[];
      this.filterWallets();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      this.error = msg;
      this.notification.error('Load gagal', msg);
    }
    try {
      this.accounts = (await this.admin.getPlatformAccounts()) as PlatformAccountRecord[];
      this.accountsError = false;
    } catch {
      this.accountsError = true;
    }
    this.loading = false;
    this.cdr.markForCheck();
  }

  private async silentRefresh() {
    try {
      const [w, a] = await Promise.all([this.admin.getWallets(), this.admin.getPlatformAccounts().catch(() => null)]);
      this.wallets = w as WalletRecord[];
      this.filterWallets();
      if (a) {
        this.accounts = a as PlatformAccountRecord[];
        this.accountsError = false;
      }
    } catch {
      /* silent */
    }
    this.cdr.markForCheck();
  }

  get paginatedWallets() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredWallets.slice(start, start + this.pageSize);
  }

  filterWallets() {
    this.currentPage = 1;
    const list = this.wallets.filter((w) => w.user?.role !== 'admin' && w.user?.role !== 'superadmin');
    const q = this.walletSearch.toLowerCase();
    this.filteredWallets = q
      ? list.filter(
          (w) => w.user?.username?.toLowerCase().includes(q) || w.user?.display_name?.toLowerCase().includes(q),
        )
      : list;
  }

  openAdjust(w: WalletRecord) {
    this.adjusting = w;
    this.adjustVisible = true;
    this.adjType = 'add';
    this.adjAmount = null;
    this.adjNotes = '';
    this.adjError = '';
    this.adjSuccess = false;
    this.adjResult = null;
  }

  async saveAdjust(w: WalletRecord) {
    const amt = Number(this.adjAmount);
    if (!amt || amt <= 0) {
      this.adjError = 'Jumlah harus lebih dari 0.';
      this.cdr.markForCheck();
      return;
    }
    const admin = this.auth.getCurrentUser();
    if (!admin?.username) {
      this.notification.error('Session expired', 'Silakan login ulang.');
      return;
    }
    const signedAmount = this.adjType === 'deduct' ? -amt : amt;
    this.adjustSubmitting = true;
    this.adjError = '';
    this.adjSuccess = false;
    this.cdr.markForCheck();
    try {
      const result = (await this.admin.adjustBalance(
        admin.username,
        w.user_id,
        signedAmount,
        this.adjNotes.trim() || undefined,
      )) as { new_balance?: number; old_balance?: number };
      this.adjResult = result;
      this.adjSuccess = true;
      if (result?.new_balance !== undefined) w.balance_main = result.new_balance;
      this.notification.success(
        'Saldo diubah',
        `${w.user?.username || w.user_id}: ${signedAmount > 0 ? '+' : ''}${signedAmount}`,
      );
    } catch (e: unknown) {
      this.adjError = e instanceof AdminRpcError ? e.message : 'Gagal mengubah saldo.';
    }
    this.adjustSubmitting = false;
    this.cdr.markForCheck();
  }

  openNewAccount() {
    this.editingAccount = {
      provider_name: '',
      account_holder: '',
      account_number: '',
      payment_code: '',
      type: 'BANK',
      status: 'ACTIVE',
      instructions: '',
    };
  }

  startEditAccount(a: PlatformAccountRecord) {
    this.editingAccount = Object.assign({}, a);
  }

  async saveAccount() {
    const admin = this.auth.getCurrentUser();
    const a = this.editingAccount!;
    if (!a.provider_name || !a.account_holder || !a.account_number) {
      this.notification.error('Data tidak lengkap', 'Provider, pemilik, dan nomor wajib diisi.');
      return;
    }
    try {
      if (a.id) {
        await this.admin.updatePlatformAccount(a.id, a as any);
        const idx = this.accounts.findIndex((x) => x.id === a.id);
        if (idx >= 0) this.accounts[idx] = { ...this.accounts[idx], ...a };
        if (admin)
          await this.admin.logAction(
            admin.username,
            'UPDATE_PLATFORM_ACCOUNT',
            'platform_accounts',
            a.id,
            undefined,
            a.provider_name,
          );
        this.notification.success('Rekening diperbarui', a.provider_name);
      } else {
        const created = await this.admin.createPlatformAccount(a as any);
        this.accounts.push(created[0] ?? a);
        if (admin)
          await this.admin.logAction(
            admin.username,
            'CREATE_PLATFORM_ACCOUNT',
            'platform_accounts',
            created[0]?.id,
            undefined,
            a.provider_name,
          );
        this.notification.success('Rekening ditambahkan', a.provider_name);
      }
      this.editingAccount = null;
    } catch (e: unknown) {
      this.notification.error('Gagal simpan', e instanceof Error ? e.message : 'Could not save account.');
    }
    this.cdr.markForCheck();
  }

  confirmToggleAccount(a: PlatformAccountRecord) {
    const next = a.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.confirmation.confirm({
      message: `${next === 'INACTIVE' ? 'Nonaktifkan' : 'Aktifkan'} rekening ${a.provider_name} (${a.account_number})?`,
      header: next === 'INACTIVE' ? 'Nonaktifkan Rekening' : 'Aktifkan Rekening',
      icon: 'none',
      rejectLabel: 'Batal',
      acceptLabel: next === 'INACTIVE' ? 'Nonaktifkan' : 'Aktifkan',
      accept: async () => {
        try {
          const admin = this.auth.getCurrentUser();
          if (!a.id) return;
          await this.admin.updatePlatformAccount(a.id, { status: next });
          if (admin)
            await this.admin.logAction(
              admin.username,
              next === 'ACTIVE' ? 'ACTIVATE_PLATFORM_ACCOUNT' : 'DEACTIVATE_PLATFORM_ACCOUNT',
              'platform_accounts',
              a.id,
              a.status,
              next,
            );
          a.status = next;
          this.notification.success('Status diperbarui', `${a.provider_name} → ${next}`);
        } catch (e: unknown) {
          this.notification.error('Gagal', e instanceof Error ? e.message : 'Could not update status.');
        }
        this.cdr.markForCheck();
      },
    });
  }

  accountTypeSeverity(t: string) {
    const m: Record<string, string> = { BANK: 'info', EWALLET: 'warn', QRIS: 'contrast' };
    return (m[t] || 'secondary') as any;
  }

  onPageChange(event: { first?: number; rows?: number }) {
    this.currentPage = Math.floor((event.first ?? 0) / (event.rows ?? this.pageSize)) + 1;
    this.pageSize = event.rows ?? this.pageSize;
    this.cdr.markForCheck();
  }

  net(w: WalletRecord): number {
    return (w.total_deposited || 0) - (w.total_withdrawn || 0);
  }

  pnl(w: WalletRecord): number {
    return this.net(w) - (w.balance_main || 0) - (w.balance_bonus || 0);
  }
}
