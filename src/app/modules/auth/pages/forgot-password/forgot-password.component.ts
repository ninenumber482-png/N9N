import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminService } from 'src/app/core/services/admin.service';
import { AuthService } from 'src/app/core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-screen items-center justify-center bg-background px-4">
      <div class="w-full max-w-sm">
        <div class="mb-8">
          <h1 class="text-xl font-semibold text-foreground tracking-tight">Reset Password</h1>
          <p class="text-muted-foreground text-[13px] mt-1">Masukkan username untuk mereset password</p>
        </div>

        <div class="space-y-5">
          <div class="space-y-4">
            <div>
              <label class="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Username <span class="text-destructive">*</span></label>
              <input type="text" [(ngModel)]="username" placeholder="Enter username"
                class="w-full bg-card border border-border rounded-lg px-3 py-2.5 text-sm text-foreground outline-none focus:border-foreground/30 transition-colors" />
            </div>
          </div>

          @if (error) {
            <div class="bg-red-400/10 border border-red-400/30 rounded-lg p-3 text-xs text-red-400">{{ error }}</div>
          }
          @if (success) {
            <div class="bg-emerald-400/10 border border-emerald-400/30 rounded-lg p-3 text-xs text-emerald-400">
              Password berhasil direset. Silakan login dengan password baru dari admin.
            </div>
          }

          <button (click)="resetPassword()" [disabled]="loading || !username.trim()"
            class="w-full bg-foreground text-background rounded-lg px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2">
            @if (loading) {
              <span class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"></span>
            }
            {{ loading ? 'Resetting...' : 'Reset Password' }}
          </button>

          <p class="text-center text-xs text-muted-foreground">
            <a routerLink="/auth/sign-in" class="text-foreground hover:underline">Kembali ke Login</a>
          </p>
        </div>
      </div>
    </div>
  `,
})
export class ForgotPasswordComponent {
  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  username = '';
  loading = false;
  error = '';
  success = false;

  async resetPassword() {
    const u = this.username.trim().toLowerCase();
    if (!u || u.length < 3) {
      this.error = 'Username minimal 3 karakter.';
      this.cdr.markForCheck();
      return;
    }
    this.loading = true;
    this.error = '';
    this.success = false;
    this.cdr.markForCheck();
    try {
      const tempPassword = Math.random().toString(36).slice(-8);
      const currentUser = this.auth.getCurrentUser();
      await this.admin.resetPassword(u, currentUser?.id || '', tempPassword);
      this.success = true;
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Gagal mereset password. Hubungi admin.';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }
}
