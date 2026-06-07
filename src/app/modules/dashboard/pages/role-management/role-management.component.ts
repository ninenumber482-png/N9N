import { AngularSvgIconModule } from 'angular-svg-icon';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from 'src/app/core/services/admin.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { TagModule } from 'primeng/tag';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';

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
  imports: [CommonModule, FormsModule, AngularSvgIconModule, TagModule, ConfirmDialogModule],
  providers: [ConfirmationService],
  template: `
    <div data-page="role-management" class="space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="page-header-icon"><svg-icon src="assets/icons/heroicons/outline/users.svg" svgClass="h-4 w-4"></svg-icon></div>
          <div>
            <h1 class="max-sm:text-lg sm:text-xl font-bold tracking-tight text-foreground">Role Management</h1>
            <p class="text-muted-foreground mt-0.5 text-xs">Kelola role admin &amp; superadmin</p>
          </div>
        </div>
        <button
          (click)="load()"
          [disabled]="loading"
          class="bg-card border-border text-muted-foreground hover:text-foreground rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50">
          <svg class="h-3.5 w-3.5" [class.animate-spin]="loading" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      @if (loading) {
        <div class="bg-card border-border animate-pulse rounded-lg p-5">
          <div class="space-y-3">
            @for (_ of [1, 2, 3, 4]; track _) {
              <div class="h-10 rounded-lg bg-zinc-700/20"></div>
            }
          </div>
        </div>
      } @else {
        <div class="bg-card border-border page-accent-card rounded-lg p-5" style="border-top: 3px solid #60A5FA;">
          <div class="overflow-x-auto">
            <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
              <thead>
                <tr
                  class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Username</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Email</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Current Role</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Change Role</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                @for (u of users; track u.id) {
                  <tr class="border-border hover:bg-muted/30 border-b text-xs transition-colors">
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-semibold text-foreground">
                      {{ u.username }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground">
                      {{ u.email || '-' }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                      <p-tag [value]="u.role" [severity]="u.role === 'superadmin' ? 'warn' : 'info'" />
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                      @if (isSuperadmin && u.username !== currentUsername) {
                        <div class="flex gap-1">
                          @if (u.role !== 'admin') {
                            <button
                              (click)="confirmRoleChange(u, 'admin')"
                              class="bg-card border-border hover:bg-accent rounded border px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors">
                              → Admin
                            </button>
                          }
                          @if (u.role !== 'superadmin') {
                            <button
                              (click)="confirmRoleChange(u, 'superadmin')"
                              class="bg-card border-border hover:bg-accent rounded border px-2 py-0.5 text-[10px] font-medium text-foreground transition-colors">
                              → Superadmin
                            </button>
                          }
                        </div>
                      } @else {
                        <span class="text-muted-foreground text-[10px]">—</span>
                      }
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                      <p-tag [value]="u.login_status" [severity]="u.login_status === 'ACTIVE' ? 'success' : 'secondary'" />
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
    this.cdr.markForCheck();
    try {
      this.users = await this.admin.getAdminUsers();
    } catch {
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
}
