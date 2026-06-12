import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { AdminService, AdminRpcError } from 'src/app/core/services/admin.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { FilterBarComponent } from 'src/app/shared/components/filter-bar/filter-bar.component';

@Component({
  selector: 'app-member-balance',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, FilterBarComponent],
  template: `
    <div data-page="member-balance" class="space-y-6">
      <app-page-header icon="currency-dollar" title="Tambah / Kurangi Saldo" subtitle="Adjust saldo member" />
      <div class="bg-card border-border page-accent-card rounded-lg p-5" style="border-top: 3px solid #84CC16;">
        <app-filter-bar
          [search]="searchUsername"
          (searchChange)="searchUsername = $event"
          (searchSubmit)="searchUser()"
          placeholder="Cari username member...">
          <button
            (click)="searchUser()"
            [disabled]="!searchUsername.trim() || loading"
            class="bg-primary text-primary-foreground hover:bg-primary/90 h-10 rounded-md px-4 text-xs font-bold transition-colors disabled:opacity-50">
            {{ loading ? 'Mencari...' : 'Cari' }}
          </button>
        </app-filter-bar>

        @if (searchError) {
          <div class="bg-red-400/10 border border-red-400/30 rounded-xl p-4 text-sm text-red-400 mb-4">
            <p class="font-bold">Error</p>
            <p class="text-xs mt-1">{{ searchError }}</p>
          </div>
        }

        @if (foundUser) {
          <div class="bg-muted/20 rounded-lg p-4 mb-4 space-y-1">
            <p class="text-sm text-foreground font-semibold">{{ foundUser.display_name || foundUser.username }}</p>
            <p class="text-xs text-muted-foreground">
              &#64;{{ foundUser.username }} &middot; {{ foundUser.email || '-' }}
            </p>
            <p class="text-[11px] text-muted-foreground font-mono select-all">{{ foundUser.id }}</p>
            <div class="flex gap-4 pt-1">
              <p class="text-xs text-muted-foreground">
                Main Balance:
                <span class="text-foreground font-mono font-bold">{{ walletBalance | number: '1.0-0' }}</span>
              </p>
              <p class="text-xs text-muted-foreground">
                Bonus: <span class="text-foreground font-mono font-bold">{{ walletBonus | number: '1.0-0' }}</span>
              </p>
            </div>
          </div>

          <div class="space-y-3 max-w-md">
            <div>
              <label class="text-xs font-semibold text-muted-foreground block mb-1"
                >Tipe <span class="text-destructive">*</span></label
              >
              <div class="flex gap-2">
                <button
                  (click)="adjustType = 'add'"
                  class="px-4 py-2 text-xs font-bold rounded-lg border transition-colors"
                  [class.bg-emerald-500/20]="adjustType === 'add'"
                  [class.text-emerald-400]="adjustType === 'add'"
                  [class.border-emerald-500/50]="adjustType === 'add'"
                  [class.bg-card]="adjustType !== 'add'"
                  [class.border-border]="adjustType !== 'add'"
                  [class.text-muted-foreground]="adjustType !== 'add'">
                  + Tambah
                </button>
                <button
                  (click)="adjustType = 'deduct'"
                  class="px-4 py-2 text-xs font-bold rounded-lg border transition-colors"
                  [class.bg-red-500/20]="adjustType === 'deduct'"
                  [class.text-red-400]="adjustType === 'deduct'"
                  [class.border-red-500/50]="adjustType === 'deduct'"
                  [class.bg-card]="adjustType !== 'deduct'"
                  [class.border-border]="adjustType !== 'deduct'"
                  [class.text-muted-foreground]="adjustType !== 'deduct'">
                  - Kurangi
                </button>
              </div>
            </div>
            <div>
              <label class="text-xs font-semibold text-muted-foreground block mb-1"
                >Jumlah <span class="text-destructive">*</span></label
              >
              <input
                [(ngModel)]="amount"
                type="number"
                placeholder="0"
                min="0"
                step="1000"
                class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs outline-none w-full" />
            </div>
            <div>
              <label class="text-xs font-semibold text-muted-foreground block mb-1">Alasan</label>
              <input
                [(ngModel)]="reason"
                placeholder="Alasan adjustment (opsional)"
                class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs outline-none w-full" />
            </div>

            @if (adjustError) {
              <p class="text-xs text-red-400">{{ adjustError }}</p>
            }

            <button
              (click)="submitAdjustment()"
              [disabled]="submitting || !amount || Number(amount) <= 0"
              class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-xs font-bold transition-colors disabled:opacity-50">
              {{ submitting ? 'Memproses...' : adjustType === 'add' ? 'Tambah Saldo' : 'Kurangi Saldo' }}
            </button>

            @if (success) {
              <div class="bg-emerald-400/10 border border-emerald-400/30 rounded-xl p-4 text-sm text-emerald-400">
                Saldo <strong>{{ foundUser.username }}</strong> berhasil diubah.
                @if (adjustResult) {
                  <br /><span class="text-xs"
                    >{{ adjustResult.old_balance | number: '1.0-0' }} →
                    {{ adjustResult.new_balance | number: '1.0-0' }}</span
                  >
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemberBalanceComponent implements OnDestroy {
  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private notification = inject(NotificationService);

  private destroy$ = new Subject<void>();

  Number = Number;

  searchUsername = '';
  amount = 0;
  reason = '';
  adjustType: 'add' | 'deduct' = 'add';
  foundUser: { id: string; username?: string; display_name?: string; email?: string } | null = null;
  walletBalance = 0;
  walletBonus = 0;
  searchError = '';
  adjustError = '';
  loading = false;
  submitting = false;
  success = false;
  adjustResult: { old_balance?: number; new_balance?: number } | null = null;

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async searchUser() {
    const username = this.searchUsername.trim().toLowerCase();
    if (!username) return;

    this.loading = true;
    this.searchError = '';
    this.foundUser = null;
    this.walletBalance = 0;
    this.walletBonus = 0;
    this.success = false;
    this.adjustResult = null;
    this.cdr.markForCheck();

    try {
      const users = await this.admin.getUserByUsername(username);
      if (!users || users.length === 0) {
        this.searchError = 'User tidak ditemukan.';
        this.loading = false;
        this.cdr.markForCheck();
        return;
      }
      this.foundUser = users[0];

      const wallets = await this.admin.getWallet(this.foundUser!.id);
      this.walletBalance = wallets?.[0]?.balance_main ?? 0;
      this.walletBonus = wallets?.[0]?.balance_bonus ?? 0;
    } catch (e) {
      this.searchError = e instanceof AdminRpcError ? e.message : 'Gagal mencari user.';
    }

    this.loading = false;
    this.cdr.markForCheck();
  }

  async submitAdjustment() {
    const amt = Number(this.amount);
    if (!amt || amt <= 0) {
      this.adjustError = 'Jumlah harus lebih dari 0.';
      this.cdr.markForCheck();
      return;
    }

    const admin = this.auth.getCurrentUser();
    if (!admin?.username) {
      this.notification.error('Session expired', 'Silakan login ulang.');
      return;
    }

    const signedAmount = this.adjustType === 'deduct' ? -amt : amt;

    this.submitting = true;
    this.adjustError = '';
    this.success = false;
    this.adjustResult = null;
    this.cdr.markForCheck();

    try {
      const result = await this.admin.adjustBalance(
        admin.username,
        this.foundUser!.id,
        signedAmount,
        this.reason.trim() || undefined,
      );
      this.adjustResult = result;
      this.success = true;
      this.walletBalance = result.new_balance;
      this.amount = 0;
      this.reason = '';
      this.notification.success(
        'Saldo diubah',
        `${this.foundUser!.username}: ${signedAmount > 0 ? '+' : ''}${signedAmount}`,
      );
    } catch (e) {
      this.adjustError = e instanceof AdminRpcError ? e.message : 'Gagal mengubah saldo.';
    }

    this.submitting = false;
    this.cdr.markForCheck();
  }
}
