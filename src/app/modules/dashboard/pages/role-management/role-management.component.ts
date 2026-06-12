import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from 'src/app/core/services/admin.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { StatusBadgeComponent } from 'src/app/shared/components/status-badge/status-badge.component';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { LoadingErrorComponent } from 'src/app/shared/components/loading-error/loading-error.component';
import { RefreshButtonComponent } from 'src/app/shared/components/refresh-button/refresh-button.component';

interface AdminUser {
  id: string;
  username: string;
  email?: string;
  role: string;
  login_status: string;
}

@Component({
  selector: 'app-role-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    StatusBadgeComponent,
    ConfirmDialogModule,
    PageHeaderComponent,
    LoadingErrorComponent,
    RefreshButtonComponent,
  ],
  providers: [ConfirmationService],
  template: `
    <div data-page="role-management" class="space-y-6">
      <app-page-header icon="users" title="Role Management" subtitle="Manage admin and superadmin roles">
        <app-refresh-button [loading]="loading" (clicked)="load()" />
      </app-page-header>

      @if (isSuperadmin) {
        <div class="bg-card border-border flex flex-wrap items-end gap-3 rounded-lg border p-4">
          <div class="flex flex-col gap-1">
            <label for="grant-username" class="text-muted-foreground text-xs">Beri akses admin (username)</label>
            <input
              id="grant-username"
              [(ngModel)]="grantUsername"
              (keyup.enter)="grantAdmin()"
              placeholder="username member"
              class="bg-background border-border text-foreground rounded border px-3 py-1.5 text-sm" />
          </div>
          <button
            (click)="grantAdmin()"
            [disabled]="granting || !grantUsername.trim()"
            class="rounded bg-yellow-400 px-3 py-1.5 text-sm font-bold text-black disabled:opacity-50">
            {{ granting ? '...' : 'Grant Admin' }}
          </button>
        </div>
      }

      <app-loading-error [loading]="loading" [error]="error" (retry)="load()" />

      @if (!loading) {
        <div class="bg-card border-border page-accent-card rounded-lg p-5" style="border-top: 3px solid #60A5FA;">
          <div class="overflow-x-auto">
            <table class="saas-table w-full text-left max-sm:text-xs sm:text-sm">
              <thead>
                <tr class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Username</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Email</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Current Role</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Change Role</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Status</th>
                </tr>
              </thead>
              <tbody>
                @for (u of users; track u.id) {
                  <tr class="border-border hover:bg-muted/30 border-b text-xs transition-colors">
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 font-semibold text-foreground">
                      {{ u.username }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-muted-foreground">
                      {{ u.email || '-' }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                      <app-status-badge [value]="u.role" [severity]="u.role === 'superadmin' ? 'warn' : 'info'" />
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                      @if (isSuperadmin && u.username !== currentUsername) {
                        <div class="flex flex-wrap gap-1">
                          @if (u.role !== 'admin') {
                            <button
                              (click)="confirmRoleChange(u, 'admin')"
                              class="bg-card border-border hover:bg-accent rounded border px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors">
                              → Admin
                            </button>
                          }
                          @if (u.role !== 'superadmin') {
                            <button
                              (click)="confirmRoleChange(u, 'superadmin')"
                              class="bg-card border-border hover:bg-accent rounded border px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors">
                              → Superadmin
                            </button>
                          }
                          <button
                            (click)="confirmToggleLogin(u)"
                            class="bg-card border-border hover:bg-accent rounded border px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors">
                            {{ u.login_status === 'ACTIVE' ? 'Disable' : 'Enable' }}
                          </button>
                          @if (u.role === 'admin') {
                            <button
                              (click)="confirmRevoke(u)"
                              class="border-rose-500/40 text-rose-400 hover:bg-rose-500/10 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors">
                              Revoke
                            </button>
                          }
                        </div>
                      } @else {
                        <span class="text-muted-foreground text-[11px]">—</span>
                      }
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                      <app-status-badge
                        [value]="u.login_status"
                        [severity]="u.login_status === 'ACTIVE' ? 'success' : 'secondary'" />
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5" class="text-muted-foreground px-4 py-12 text-center">Tidak ada admin ditemukan.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
      <p-confirmdialog />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleManagementComponent implements OnInit {
  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private notification = inject(NotificationService);
  private confirmation = inject(ConfirmationService);

  users: AdminUser[] = [];
  loading = false;
  error: string | null = null;
  isSuperadmin = false;
  currentUsername = '';

  ngOnInit() {
    const user = this.auth.getCurrentUser();
    this.isSuperadmin = user?.role === 'superadmin';
    this.currentUsername = user?.username || '';
    this.load();
  }

  async load() {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();
    try {
      this.users = await this.admin.getAdminUsers();
    } catch {
      this.error = 'Tidak bisa memuat data admin.';
      this.notification.error('Gagal', 'Tidak bisa memuat data admin.');
    }
    this.loading = false;
    this.cdr.markForCheck();
  }

  confirmRoleChange(u: AdminUser, newRole: string) {
    const oldRole = u.role;
    if (oldRole === newRole) return;
    this.confirmation.confirm({
      message: `Ubah role <strong>${u.username}</strong> dari <strong>${oldRole}</strong> menjadi <strong>${newRole}</strong>?`,
      header: 'Ubah Role',
      rejectLabel: 'Batal',
      acceptLabel: 'Ubah',
      accept: () => this.changeRole(u, newRole),
    });
  }

  async changeRole(u: AdminUser, newRole: string) {
    const oldRole = u.role;
    try {
      await this.admin.updateUser(u.id, { role: newRole });
      u.role = newRole;
      this.notification.success('Role diubah', `${u.username}: ${oldRole} → ${newRole}`);
    } catch (e: unknown) {
      this.notification.error('Gagal', e instanceof Error ? e.message : 'Tidak bisa mengubah role.');
    }
    this.cdr.markForCheck();
  }

  // ── Enable/disable Angular login (auth-login blocks login_status='SUSPENDED') ──
  confirmToggleLogin(u: AdminUser) {
    if (u.username === this.currentUsername) return; // never lock yourself out
    const disable = u.login_status === 'ACTIVE';
    this.confirmation.confirm({
      message: disable
        ? `Nonaktifkan login Angular untuk <strong>${u.username}</strong>?`
        : `Aktifkan kembali login Angular untuk <strong>${u.username}</strong>?`,
      header: disable ? 'Nonaktifkan Login' : 'Aktifkan Login',
      rejectLabel: 'Batal',
      acceptLabel: disable ? 'Nonaktifkan' : 'Aktifkan',
      accept: () => this.setLogin(u, disable ? 'SUSPENDED' : 'ACTIVE'),
    });
  }

  async setLogin(u: AdminUser, status: 'ACTIVE' | 'SUSPENDED') {
    try {
      await this.admin.updateUser(u.id, { login_status: status });
      u.login_status = status;
      this.notification.success('Status login diubah', `${u.username}: ${status}`);
    } catch (e: unknown) {
      this.notification.error('Gagal', e instanceof Error ? e.message : 'Tidak bisa mengubah status login.');
    }
    this.cdr.markForCheck();
  }

  // ── Revoke admin access (demote to regular 'user' role) ──
  confirmRevoke(u: AdminUser) {
    if (u.username === this.currentUsername) return;
    this.confirmation.confirm({
      message: `Cabut akses admin <strong>${u.username}</strong> (turunkan ke 'user')? Akun ini tidak akan bisa login Angular lagi.`,
      header: 'Cabut Akses Admin',
      rejectLabel: 'Batal',
      acceptLabel: 'Cabut',
      accept: () => this.changeRole(u, 'user'),
    });
  }

  // ── Grant admin to an existing member account (by username) ──
  grantUsername = '';
  granting = false;

  async grantAdmin() {
    const name = this.grantUsername.trim();
    if (!name) return;
    this.granting = true;
    this.cdr.markForCheck();
    try {
      const rows = await this.admin.getUserByUsername(name);
      const target = rows?.[0];
      if (!target) {
        this.notification.error('Tidak ditemukan', `Akun '${name}' tidak ada.`);
      } else if (target.role === 'admin' || target.role === 'superadmin') {
        this.notification.error('Sudah admin', `'${name}' sudah punya akses admin.`);
      } else {
        await this.admin.updateUser(target.id, { role: 'admin', login_status: 'ACTIVE' });
        this.notification.success('Admin ditambahkan', `${name} sekarang bisa login Angular.`);
        this.grantUsername = '';
        await this.load();
      }
    } catch (e: unknown) {
      this.notification.error('Gagal', e instanceof Error ? e.message : 'Tidak bisa memberi akses admin.');
    }
    this.granting = false;
    this.cdr.markForCheck();
  }
}
