import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { AdminService, AdminRpcError } from 'src/app/core/services/admin.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';

@Component({
  selector: 'app-member-password',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent],
  template: `
    <div data-page="member-password" class="space-y-6">
      <app-page-header icon="lock-closed" title="Reset Password Member" subtitle="Cari user dan reset password" />
      <div class="bg-card border-border page-accent-card rounded-lg p-5" style="border-top: 3px solid #EC4899;">
        <div class="flex flex-wrap gap-2 mb-4">
          <input
            [(ngModel)]="searchUsername"
            placeholder="Cari username member..."
            class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs outline-none w-56" />
          <button
            (click)="searchUser()"
            [disabled]="!searchUsername.trim() || loading"
            class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-xs font-bold transition-colors disabled:opacity-50">
            {{ loading ? 'Mencari...' : 'Cari' }}
          </button>
        </div>

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
            <p class="text-[10px] text-muted-foreground font-mono select-all">{{ foundUser.id }}</p>
            <p class="text-xs text-muted-foreground">
              Balance: <span class="text-foreground font-mono font-semibold">{{ foundBalance | number: '1.0-0' }}</span>
            </p>
          </div>

          <div class="space-y-3 max-w-md">
            <div>
              <label class="text-xs font-semibold text-muted-foreground block mb-1">Password Baru <span class="text-destructive">*</span></label>
              <input
                [(ngModel)]="newPassword"
                type="password"
                placeholder="Min 6 karakter"
                class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs outline-none w-full" />
            </div>
            <div>
              <label class="text-xs font-semibold text-muted-foreground block mb-1">Konfirmasi Password <span class="text-destructive">*</span></label>
              <input
                [(ngModel)]="confirmPassword"
                type="password"
                placeholder="Ulangi password baru"
                class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs outline-none w-full" />
            </div>

            @if (passwordError) {
              <p class="text-xs text-red-400">{{ passwordError }}</p>
            }

            <button
              (click)="resetPassword()"
              [disabled]="submitting || !isFormValid()"
              class="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-xs font-bold transition-colors disabled:opacity-50">
              {{ submitting ? 'Menyimpan...' : 'Reset Password' }}
            </button>

            @if (success) {
              <div class="bg-emerald-400/10 border border-emerald-400/30 rounded-xl p-4 text-sm text-emerald-400">
                Password berhasil direset untuk <strong>{{ foundUser.username }}</strong>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemberPasswordComponent implements OnDestroy {
  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private notification = inject(NotificationService);

  private destroy$ = new Subject<void>();

  searchUsername = '';
  newPassword = '';
  confirmPassword = '';
  foundUser: { id: string; username?: string; display_name?: string; email?: string } | null = null;
  foundBalance = 0;
  searchError = '';
  passwordError = '';
  loading = false;
  submitting = false;
  success = false;

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  isFormValid(): boolean {
    return this.newPassword.length >= 6 && this.newPassword === this.confirmPassword;
  }

  async searchUser() {
    const username = this.searchUsername.trim().toLowerCase();
    if (!username) return;

    this.loading = true;
    this.searchError = '';
    this.foundUser = null;
    this.foundBalance = 0;
    this.success = false;
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
      this.foundBalance = wallets?.[0]?.balance_main ?? 0;
    } catch (e) {
      this.searchError = e instanceof AdminRpcError ? e.message : 'Gagal mencari user.';
    }

    this.loading = false;
    this.cdr.markForCheck();
  }

  async resetPassword() {
    if (!this.isFormValid()) {
      this.passwordError = 'Password minimal 6 karakter dan harus sama.';
      this.cdr.markForCheck();
      return;
    }

    const admin = this.auth.getCurrentUser();
    if (!admin?.username) {
      this.notification.error('Session expired', 'Silakan login ulang.');
      return;
    }

    this.submitting = true;
    this.passwordError = '';
    this.success = false;
    this.cdr.markForCheck();

    try {
      await this.admin.resetPassword(this.foundUser!.id, admin.username, this.newPassword);
      this.success = true;
      this.newPassword = '';
      this.confirmPassword = '';
      this.notification.success('Password direset', `Password ${this.foundUser!.username} berhasil direset.`);
    } catch (e) {
      this.passwordError = e instanceof AdminRpcError ? e.message : 'Gagal mereset password.';
    }

    this.submitting = false;
    this.cdr.markForCheck();
  }
}
