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

const ADJUSTMENT_TYPES = [
  { value: 'BONUS',        label: 'Bonus' },
  { value: 'CORRECTION',   label: 'Koreksi Saldo' },
  { value: 'COMPENSATION', label: 'Kompensasi' },
  { value: 'DEDUCTION',    label: 'Pengurangan' },
  { value: 'MANUAL',       label: 'Manual Admin' },
];

@Component({
  selector: 'app-wallets',
  standalone: true,
  imports: [CommonModule, FormsModule, WibDatePipe, ConfirmDialogComponent, PaginationComponent],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="max-sm:text-lg sm:text-2xl font-extrabold text-foreground">Wallets</h1>
          <p class="text-muted-foreground mt-1 text-sm">Kelola saldo pengguna & rekening platform</p>
        </div>
        <button (click)="load()" class="bg-card border-border text-muted-foreground hover:text-foreground rounded-lg border px-3 py-2 text-xs font-semibold transition-colors">
          ↻ Refresh
        </button>
      </div>

      <!-- Tab switcher -->
      <div class="flex gap-1 border-b border-border">
        <button (click)="tab='wallets'"
          [class]="tab==='wallets' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'"
          class="px-4 pb-2 text-xs font-bold transition-colors">Saldo Pengguna</button>
        <button (click)="tab='accounts'"
          [class]="tab==='accounts' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'"
          class="px-4 pb-2 text-xs font-bold transition-colors">Rekening Platform</button>
      </div>

      <!-- ── Tab: User Wallets ───────────────────────────────────────────── -->
      @if (tab === 'wallets') {
        <div class="flex flex-wrap gap-2">
          <input [(ngModel)]="walletSearch" (ngModelChange)="filterWallets()" placeholder="Cari username…"
            class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs outline-none w-48" />
        </div>

        @if (error) {
          <div class="bg-red-400/10 border border-red-400/30 rounded-xl p-4 text-sm text-red-400">
            <p class="font-bold">Gagal memuat wallet</p>
            <p class="text-xs mt-1">{{ error }}</p>
            <button (click)="load()" class="mt-2 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-semibold">Coba Lagi</button>
          </div>
        }

        @if (loading) {
          <div class="text-muted-foreground py-12 text-center">Memuat wallet...</div>
        }

        <div class="bg-card border-border rounded-xl border shadow-sm" [class.hidden]="loading">
          <div class="overflow-x-auto">
            <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
              <thead>
                <tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">User</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Balance</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Bonus</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Deposit</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">WD</th>
                  <th class="max-sm:hidden sm:px-4 sm:py-3">Net</th>
                  <th class="max-sm:hidden sm:px-4 sm:py-3">Win/Loss</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">TO</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Updated</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 w-24">Aksi</th>
                </tr>
              </thead>
              <tbody>
                @for (w of paginatedWallets; track w.id) {
                  <tr class="border-border hover:bg-muted/30 border-b text-xs transition-colors">
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                      <p class="font-semibold text-foreground">{{ w.user?.display_name || w.user?.username || '—' }}</p>
                      <p class="text-muted-foreground text-[10px]">&#64;{{ w.user?.username || w.user_id.slice(0,8) }}</p>
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-bold text-foreground">{{ w.balance_main | number:'1.2-2' }} P</td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-semibold text-amber-400">{{ w.balance_bonus | number:'1.2-2' }} P</td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-emerald-400 font-semibold">{{ w.total_deposited | number:'1.2-2' }} P</td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-red-400 font-semibold">{{ w.total_withdrawn | number:'1.2-2' }} P</td>
                    <td class="max-sm:hidden sm:px-4 sm:py-3 font-semibold" [class.text-emerald-400]="net(w) >= 0" [class.text-red-400]="net(w) < 0">
                      {{ net(w) | number:'1.2-2' }} P
                    </td>
                    <td class="max-sm:hidden sm:px-4 sm:py-3 font-semibold" [class.text-emerald-400]="pnl(w) >= 0" [class.text-red-400]="pnl(w) < 0">
                      {{ pnl(w) | number:'1.2-2' }} P
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-blue-400 font-semibold">
                      {{ w.total_turnover | number:'1.2-2' }} P
                      @if (w.total_deposited > 0) {
                        <span class="text-muted-foreground text-[9px] ml-1">({{ (w.total_turnover / w.total_deposited) | number:'1.1-1' }}x)</span>
                      }
                    </td>
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-[10px]">{{ w.updated_at | wibDate:'short' }}</td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                      @if (isSuperadmin) {
                        <button (click)="openAdjust(w)"
                          class="bg-primary/10 text-primary hover:bg-primary/20 rounded px-2 py-1 text-[10px] font-bold transition-colors">
                          Sesuaikan
                        </button>
                      }
                    </td>
                  </tr>

                } @empty {
                  <tr><td colspan="10" class="text-muted-foreground px-4 py-12 text-center">Tidak ada wallet ditemukan.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
        <app-pagination [currentPage]="currentPage" [totalItems]="filteredWallets.length" (pageChange)="onPageChange($event)"></app-pagination>
      }

      <!-- ── Tab: Platform Accounts ─────────────────────────────────────── -->
      @if (tab === 'accounts') {
        <div class="flex items-center justify-between">
          <p class="text-muted-foreground text-xs">Rekening bank & metode pembayaran platform</p>
          <button (click)="openNewAccount()"
            class="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-xs font-bold">
            + Tambah Rekening
          </button>
        </div>

        @if (accountsError) {
          <div class="bg-amber-400/10 border border-amber-400/30 rounded-xl p-4 text-sm text-amber-400">
            Tabel <code class="font-mono">platform_accounts</code> belum ada.
            Jalankan migration <strong>20260602010000_platform_accounts.sql</strong> di Supabase SQL Editor terlebih dahulu.
          </div>
        }

        @if (editingAccount !== null) {
          <div class="bg-card border-border rounded-xl border p-5 shadow-sm space-y-4">
            <h3 class="text-sm font-bold text-foreground">{{ editingAccount.id ? 'Edit Rekening' : 'Tambah Rekening Baru' }}</h3>
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="space-y-1">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Nama Bank / Provider</label>
                <input [(ngModel)]="editingAccount.provider_name" placeholder="Bank Central Asia"
                  class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs w-full outline-none" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Nama Pemilik</label>
                <input [(ngModel)]="editingAccount.account_holder" placeholder="PT NUMBER NINE"
                  class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs w-full outline-none" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Nomor Rekening / Akun</label>
                <input [(ngModel)]="editingAccount.account_number" placeholder="1234567890"
                  class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs w-full outline-none" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Kode Pembayaran (opsional)</label>
                <input [(ngModel)]="editingAccount.payment_code" placeholder="Virtual account / kode QR"
                  class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs w-full outline-none" />
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tipe</label>
                <select [(ngModel)]="editingAccount.type" class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs w-full outline-none">
                  <option value="BANK">Bank Transfer</option>
                  <option value="EWALLET">E-Wallet</option>
                  <option value="QRIS">QRIS</option>
                </select>
              </div>
              <div class="space-y-1">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
                <select [(ngModel)]="editingAccount.status" class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs w-full outline-none">
                  <option value="ACTIVE">Aktif</option>
                  <option value="INACTIVE">Nonaktif</option>
                </select>
              </div>
              <div class="sm:col-span-2 space-y-1">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Instruksi Pembayaran</label>
                <textarea [(ngModel)]="editingAccount.instructions" rows="2" placeholder="Instruksi yang ditampilkan ke pengguna saat deposit…"
                  class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs w-full outline-none resize-none"></textarea>
              </div>
            </div>
            <div class="flex gap-2">
              <button (click)="saveAccount()" class="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-xs font-bold">Simpan</button>
              <button (click)="editingAccount = null" class="text-muted-foreground rounded-lg px-3 py-2 text-xs font-bold">Batal</button>
            </div>
          </div>
        }

        <div class="bg-card border-border rounded-xl border shadow-sm">
          <div class="overflow-x-auto">
            <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
              <thead>
                <tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Provider</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Pemilik</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">No. Rekening</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Tipe</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Status</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 w-28">Aksi</th>
                </tr>
              </thead>
              <tbody>
                @for (a of paginatedAccounts; track a.id) {
                  <tr class="border-border hover:bg-muted/30 border-b text-xs transition-colors">
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-semibold text-foreground">{{ a.provider_name }}</td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground">{{ a.account_holder }}</td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono text-foreground">{{ a.account_number }}</td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                      <span [class]="'rounded px-2 py-0.5 text-[10px] font-bold ' + typeClass(a.type)">{{ a.type }}</span>
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                      <span [class]="a.status === 'ACTIVE' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-zinc-400/10 text-zinc-400'"
                        class="rounded px-2 py-0.5 text-[10px] font-bold">{{ a.status }}</span>
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                      <div class="flex gap-1">
                        <button (click)="startEditAccount(a)"
                          class="bg-muted/30 text-muted-foreground hover:text-foreground rounded px-2 py-1 text-[10px] font-bold">Edit</button>
                        <button (click)="confirmAction(a)"
                          [class]="a.status === 'ACTIVE' ? 'bg-red-400/10 text-red-400 hover:bg-red-400/20' : 'bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20'"
                          class="rounded px-2 py-1 text-[10px] font-bold">
                          {{ a.status === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan' }}
                        </button>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  @if (!accountsError) {
                    <tr><td colspan="6" class="text-muted-foreground px-4 py-12 text-center">Belum ada rekening platform.</td></tr>
                  }
                }
              </tbody>
            </table>
          </div>
        </div>
        <app-pagination [currentPage]="currentPage" [totalItems]="accounts.length" (pageChange)="onPageChange($event)"></app-pagination>
      }

    <!-- Balance Adjustment Modal -->
    @if (adjusting) {
      <div class="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/60" (click)="adjusting = null">
        <div class="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 class="text-sm font-extrabold text-foreground">Sesuaikan Saldo</h3>
            <button (click)="adjusting = null" class="text-muted-foreground hover:text-foreground text-lg leading-none">&times;</button>
          </div>
          <div class="px-5 py-4 max-h-[65vh] overflow-y-auto">
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="space-y-2">
                <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Jenis Penyesuaian</p>
                <select [(ngModel)]="adjType" class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs font-semibold outline-none w-full">
                  @for (t of adjTypes; track t.value) {
                    <option [value]="t.value">{{ t.label }}</option>
                  }
                </select>
                <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-2">Field</p>
                <select [(ngModel)]="adjField" class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs font-semibold outline-none w-full">
                  <option value="balance_main">Main Balance</option>
                  <option value="balance_bonus">Bonus Balance</option>
                </select>
              </div>
              <div class="space-y-2">
                <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Jumlah (+ tambah / - kurang)</p>
                <input type="number" [(ngModel)]="adjAmount" placeholder="cth: 50000 atau -10000"
                  class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs outline-none w-full" />
                <p class="text-xs text-muted-foreground mt-1">
                  Saldo baru:
                  <span [class]="previewBalance(adjusting) >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'">
                    {{ previewBalance(adjusting) | number:'1.2-2' }} P
                  </span>
                </p>
                <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-2">Catatan</p>
                <input [(ngModel)]="adjNotes" placeholder="Alasan penyesuaian…"
                  class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs outline-none w-full" />
              </div>
            </div>
            <div class="flex items-center gap-2 mt-4 pt-3 border-t border-border">
              <button (click)="saveAdjust(adjusting)" [disabled]="!adjAmount"
                class="bg-primary text-primary-foreground disabled:opacity-50 rounded-lg px-4 py-2 text-xs font-bold">
                Simpan
              </button>
              <button (click)="adjusting = null"
                class="text-muted-foreground rounded-lg px-3 py-2 text-xs font-bold">
                Batal
              </button>
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
export class WalletsComponent implements OnInit, OnDestroy {
  tab: 'wallets' | 'accounts' = 'wallets';

  wallets: any[] = [];
  filteredWallets: any[] = [];
  walletSearch = '';
  currentPage = 1;
  pageSize = 20;

  adjusting: any = null;
  adjType = 'MANUAL';
  adjField: 'balance_main' | 'balance_bonus' = 'balance_main';
  adjAmount: number | null = null;
  adjNotes = '';
  adjTypes = ADJUSTMENT_TYPES;

  confirm = {
    open: false, title: '', message: '', icon: '', iconBg: 'bg-primary/10',
    confirmText: 'Confirm', cancelText: 'Cancel', loading: false,
    loadingText: 'Processing…', confirmVariant: 'primary' as 'primary' | 'danger' | 'success' | 'warning',
    action: '', account: null as any,
  };

  accounts: any[] = [];
  accountsError = false;
  editingAccount: any = null;

  loading = false;
  error: string | null = null;
  isSuperadmin = false;

  private destroy$ = new Subject<void>();

  constructor(
    private admin: AdminService,
    private auth: AuthService,
    private notification: NotificationService,
    private cdr: ChangeDetectorRef,
    private realtime: RealtimeService,
  ) {}

  ngOnInit() {
    this.isSuperadmin = this.auth.getCurrentUser()?.role === 'superadmin';
    this.load();
    // Hapus polling timer — realtime subscription sudah cukup
    this.realtime.subscribeWallets();
    this.realtime.wallets$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
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
      this.wallets = await this.admin.getWallets();
      this.filterWallets();
    } catch (e: any) {
      this.error = e?.message || 'Unknown error';
      this.notification.error('Load gagal', e.message || 'Tidak bisa memuat wallet.');
    }
    try {
      this.accounts = await this.admin.getPlatformAccounts();
      this.accountsError = false;
      this.cdr.markForCheck();
    } catch {
      this.accountsError = true;
      this.cdr.markForCheck();
    }
    this.loading = false;
    this.cdr.markForCheck();
  }

  private async silentRefresh() {
    try {
      const [w, a] = await Promise.all([
        this.admin.getWallets(),
        this.admin.getPlatformAccounts().catch(() => null),
      ]);
      this.wallets = w;
      this.filterWallets();
      if (a) { this.accounts = a; this.accountsError = false; }
      this.cdr.markForCheck();
    } catch (e: any) {
      console.warn('[wallets] silent refresh failed', e?.message || e);
    }
  }

  get paginatedWallets() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredWallets.slice(start, start + this.pageSize);
  }

  get paginatedAccounts() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.accounts.slice(start, start + this.pageSize);
  }

  filterWallets() {
    this.currentPage = 1;
    let list = this.wallets.filter(w => w.user?.role !== 'admin' && w.user?.role !== 'superadmin');
    const q = this.walletSearch.toLowerCase();
    this.filteredWallets = q
      ? list.filter(w => w.user?.username?.toLowerCase().includes(q) || w.user?.display_name?.toLowerCase().includes(q))
      : list;
  }

  openAdjust(w: any) {
    this.adjusting = w;
    this.adjType = 'MANUAL';
    this.adjField = 'balance_main';
    this.adjAmount = null;
    this.adjNotes = '';
  }

  previewBalance(w: any): number {
    const current = Number(w[this.adjField] ?? 0);
    return current + (this.adjAmount ?? 0);
  }

  async saveAdjust(w: any) {
    if (!this.adjAmount) return;
    const admin = this.auth.getCurrentUser();
    const oldVal = Number(w[this.adjField] ?? 0);
    const newVal = oldVal + this.adjAmount;
    if (newVal < 0) {
      this.notification.error('Saldo tidak valid', 'Saldo tidak boleh kurang dari 0.');
      return;
    }
    const data: any = { [this.adjField]: newVal };
    try {
      await this.admin.updateWalletRow(w.user_id, data);
      if (admin) {
        await this.admin.logAction(
          admin.username,
          `WALLET_${this.adjType}`,
          'wallet',
          w.user_id,
          `${this.adjField}:${oldVal}`,
          `${this.adjField}:${newVal} notes:${this.adjNotes || '-'}`,
        );
      }
      w[this.adjField] = newVal;
      this.adjusting = null;
      this.cdr.markForCheck();
      this.notification.success('Saldo diperbarui', `${this.adjField} → ${newVal.toLocaleString()} P`);
    } catch (e: any) {
      this.notification.error('Gagal', e.message || 'Tidak bisa memperbarui wallet.');
    }
  }

  openNewAccount() {
    this.editingAccount = { provider_name: '', account_holder: '', account_number: '', payment_code: '', type: 'BANK', status: 'ACTIVE', instructions: '' };
  }

  startEditAccount(a: any) {
    this.editingAccount = Object.assign({}, a);
  }

  async saveAccount() {
    const admin = this.auth.getCurrentUser();
    const a = this.editingAccount;
    if (!a.provider_name || !a.account_holder || !a.account_number) {
      this.notification.error('Data tidak lengkap', 'Provider, pemilik, dan nomor wajib diisi.');
      return;
    }
    try {
      if (a.id) {
        await this.admin.updatePlatformAccount(a.id, a);
        const idx = this.accounts.findIndex(x => x.id === a.id);
        if (idx >= 0) this.accounts[idx] = { ...this.accounts[idx], ...a };
        if (admin) await this.admin.logAction(admin.username, 'UPDATE_PLATFORM_ACCOUNT', 'platform_accounts', a.id, undefined, a.provider_name);
        this.notification.success('Rekening diperbarui', a.provider_name);
      } else {
        const created = await this.admin.createPlatformAccount(a);
        this.accounts.push(created[0] ?? a);
        if (admin) await this.admin.logAction(admin.username, 'CREATE_PLATFORM_ACCOUNT', 'platform_accounts', created[0]?.id, undefined, a.provider_name);
        this.notification.success('Rekening ditambahkan', a.provider_name);
      }
      this.editingAccount = null;
      this.cdr.markForCheck();
    } catch (e: any) {
      this.notification.error('Gagal simpan', e.message || 'Could not save account.');
    }
  }

  confirmAction(a: any) {
    this.confirm.loading = false;
    this.confirm.account = a;
    this.confirm.action = 'toggleStatus';
    const next = a.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.confirm.title = next === 'INACTIVE' ? 'Nonaktifkan Rekening' : 'Aktifkan Rekening';
    this.confirm.message = `${next === 'INACTIVE' ? 'Nonaktifkan' : 'Aktifkan'} rekening ${a.provider_name} (${a.account_number})?`;
    this.confirm.icon = next === 'INACTIVE' ? '◌' : '✓';
    this.confirm.iconBg = next === 'INACTIVE' ? 'bg-red-400/10' : 'bg-emerald-400/10';
    this.confirm.confirmText = next === 'INACTIVE' ? 'Nonaktifkan' : 'Aktifkan';
    this.confirm.confirmVariant = next === 'INACTIVE' ? 'danger' : 'success';
    this.confirm.open = true;
    this.cdr.markForCheck();
  }

  async executeConfirm() {
    const a = this.confirm.account;
    if (!a) return;
    this.confirm.loading = true;
    this.cdr.markForCheck();
    try {
      const admin = this.auth.getCurrentUser();
      const next = a.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await this.admin.updatePlatformAccount(a.id, { status: next });
      if (admin) await this.admin.logAction(admin.username, next === 'ACTIVE' ? 'ACTIVATE_PLATFORM_ACCOUNT' : 'DEACTIVATE_PLATFORM_ACCOUNT', 'platform_accounts', a.id, a.status, next);
      a.status = next;
      this.notification.success('Status diperbarui', `${a.provider_name} → ${next}`);
    } catch (e: any) {
      this.notification.error('Gagal', e.message || 'Could not update status.');
    } finally {
      this.confirm.open = false;
      this.confirm.loading = false;
      this.confirm.account = null;
      this.cdr.markForCheck();
    }
  }

  cancelDialog() {
    this.confirm.open = false;
    this.cdr.markForCheck();
  }

  typeClass(t: string) {
    const m: Record<string, string> = { BANK: 'bg-sky-400/10 text-sky-400', EWALLET: 'bg-violet-400/10 text-violet-400', QRIS: 'bg-amber-400/10 text-amber-400' };
    return m[t] || 'bg-zinc-400/10 text-zinc-400';
  }

  onPageChange(p: number) {
    this.currentPage = p;
  }

  net(w: any): number {
    return (w.total_deposited || 0) - (w.total_withdrawn || 0);
  }

  pnl(w: any): number {
    return this.net(w) - (w.balance_main || 0) - (w.balance_bonus || 0);
  }
}
