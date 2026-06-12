import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from 'src/app/core/services/admin.service';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { SelectModule } from 'primeng/select';
import { StatusBadgeComponent } from 'src/app/shared/components/status-badge/status-badge.component';
import { PaginatorModule } from 'primeng/paginator';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { LoadingErrorComponent } from 'src/app/shared/components/loading-error/loading-error.component';
import { RefreshButtonComponent } from 'src/app/shared/components/refresh-button/refresh-button.component';
import { SeverityMapPipe } from 'src/app/shared/pipes/severity-map.pipe';
import { PaginationHelper } from 'src/app/shared/utils/pagination.helper';
import { MfaService } from 'src/app/core/services/mfa.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';

interface SecurityItem {
  id?: string;
  created_at?: string;
  alert_type?: string;
  severity?: string;
  user_id?: string | null;
  description?: string;
  attempted_at?: string;
  username?: string;
  reason?: string;
  user_agent?: string | null;
  admin_id?: string | null;
  action?: string;
  resource_type?: string;
  resource_id?: string | null;
  ip_address?: string | null;
}

@Component({
  selector: 'app-security-center',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    WibDatePipe,
    SelectModule,
    StatusBadgeComponent,
    PaginatorModule,
    PageHeaderComponent,
    LoadingErrorComponent,
    RefreshButtonComponent,
    SeverityMapPipe,
    ConfirmDialogModule,
  ],
  providers: [ConfirmationService],
  template: `
    <p-confirmdialog key="reset2fa" appendTo="body" />
    <div data-page="security-center" class="space-y-6">
      <app-page-header
        icon="shield-exclamation"
        title="Security Center"
        subtitle="Security alerts, failed logins, and audit events">
        <div class="flex gap-2">
          <p-select
            [(ngModel)]="tab"
            (ngModelChange)="onTabChange($event)"
            [options]="tabOptions"
            optionLabel="label"
            optionValue="value"
            class="w-40"
            styleClass="!text-sm !w-44" />
          <app-refresh-button [loading]="loading" (clicked)="load()" />
        </div>
      </app-page-header>

      <app-loading-error [loading]="loading" [error]="error" (retry)="load()" />

      @if (!loading && !error) {
        @if (tab === 'alerts') {
          <div class="bg-card border-border rounded-lg border overflow-x-auto">
            <table class="saas-table w-full text-left max-sm:text-xs sm:text-sm">
              <thead>
                <tr class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Time</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Type</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Severity</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">User</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">Description</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">IP</th>
                </tr>
              </thead>
              <tbody>
                @for (l of displayItems; track l.id) {
                  <tr class="border-border hover:bg-accent/30 border-b">
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 whitespace-nowrap">
                      {{ l.created_at | wibDate: 'short' }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                      <app-status-badge [value]="l.alert_type" severity="warn" />
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                      <app-status-badge [value]="l.severity" [severity]="l.severity | severityMap" />
                    </td>
                    <td
                      class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 font-mono max-sm:hidden">
                      {{ l.user_id?.slice(0, 10) || '-' }}
                    </td>
                    <td
                      class="text-muted-foreground max-w-[200px] truncate max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">
                      {{ l.description }}
                    </td>
                    <td
                      class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 font-mono max-sm:hidden">
                      {{ l.ip_address || '-' }}
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="text-center py-12 text-muted-foreground">No security alerts</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        @if (tab === 'failed') {
          <div class="bg-card border-border rounded-lg border overflow-x-auto">
            <table class="saas-table w-full text-left max-sm:text-xs sm:text-sm">
              <thead>
                <tr class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Time</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Username</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Reason</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">IP</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">User Agent</th>
                </tr>
              </thead>
              <tbody>
                @for (l of displayItems; track l.id) {
                  <tr class="border-border hover:bg-accent/30 border-b">
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 whitespace-nowrap">
                      {{ l.attempted_at | wibDate: 'short' }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 font-semibold text-foreground">
                      {{ l.username }}
                    </td>
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">{{ l.reason }}</td>
                    <td
                      class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 font-mono max-sm:hidden">
                      {{ l.ip_address }}
                    </td>
                    <td
                      class="text-muted-foreground max-w-[150px] truncate max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-xs max-sm:hidden">
                      {{ l.user_agent || '-' }}
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5" class="text-center py-12 text-muted-foreground">No failed logins</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        @if (tab === 'audit') {
          <div class="bg-card border-border rounded-lg border overflow-x-auto">
            <table class="saas-table w-full text-left max-sm:text-xs sm:text-sm">
              <thead>
                <tr class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Time</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">Admin</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Action</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Resource</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">IP</th>
                </tr>
              </thead>
              <tbody>
                @for (l of displayItems; track l.id) {
                  <tr class="border-border hover:bg-accent/30 border-b">
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 whitespace-nowrap">
                      {{ l.created_at | wibDate: 'short' }}
                    </td>
                    <td
                      class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 font-mono max-sm:hidden">
                      {{ l.admin_id?.slice(0, 10) }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                      <span
                        class="bg-card border-border text-foreground rounded border px-2 py-0.5 font-medium text-[11px]"
                        >{{ l.action }}</span
                      >
                    </td>
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                      {{ l.resource_type }} {{ l.resource_id?.slice(0, 8) }}
                    </td>
                    <td
                      class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 font-mono max-sm:hidden">
                      {{ l.ip_address || '-' }}
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5" class="text-center py-12 text-muted-foreground">No audit logs</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        @if (tab === '2fa') {
          <div class="bg-card border-border rounded-lg border overflow-x-auto">
            <div class="border-b border-border px-5 py-3.5">
              <h3 class="text-sm font-medium text-foreground">Admin 2FA (Google Authenticator)</h3>
              <p class="text-[11px] text-muted-foreground mt-0.5">
                Hard reset clears TOTP secret, backup codes, and skip status. User must set up 2FA again on next login.
              </p>
            </div>
            <table class="saas-table w-full text-left text-sm">
              <thead>
                <tr class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
                  <th class="px-5 py-3.5">Username</th>
                  <th class="px-5 py-3.5">Role</th>
                  <th class="px-5 py-3.5">2FA Status</th>
                  <th class="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                @for (a of admin2fa; track a.id) {
                  <tr class="border-border hover:bg-accent/30 border-b">
                    <td class="px-5 py-3.5 font-semibold text-foreground">{{ a.username }}</td>
                    <td class="px-5 py-3.5">
                      <app-status-badge [value]="a.role" severity="info" />
                    </td>
                    <td class="px-5 py-3.5">
                      @if (a.totp_enabled) {
                        <app-status-badge value="ENABLED" severity="success" />
                      } @else if (a.totp_skipped_at) {
                        <app-status-badge value="SKIPPED" severity="warn" />
                      } @else {
                        <app-status-badge value="NOT SET" severity="secondary" />
                      }
                    </td>
                    <td class="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        (click)="confirmReset2fa(a)"
                        [disabled]="resettingId === a.id"
                        class="n9-btn n9-btn-danger text-xs px-3 py-1.5">
                        {{ resettingId === a.id ? 'Resetting...' : 'Hard Reset 2FA' }}
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="4" class="text-center py-12 text-muted-foreground">No admin accounts</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        @if (tab !== '2fa') {
          <p-paginator
            (onPageChange)="onPageChange($event)"
            [first]="(currentPage - 1) * pageSize"
            [rows]="pageSize"
            [totalRecords]="currentTabData.length" />
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecurityCenterComponent implements OnInit {
  private admin = inject(AdminService);
  private mfa = inject(MfaService);
  private notify = inject(NotificationService);
  private confirm = inject(ConfirmationService);
  private cdr = inject(ChangeDetectorRef);

  tab = 'alerts';
  currentPage = 1;
  pageSize = 20;
  alerts: SecurityItem[] = [];
  failedLogins: SecurityItem[] = [];
  auditLogs: SecurityItem[] = [];
  admin2fa: Array<{
    id: string;
    username: string;
    display_name: string;
    role: string;
    totp_enabled: boolean;
    totp_skipped_at: string | null;
  }> = [];
  resettingId: string | null = null;
  loading = true;
  error: string | null = null;

  tabOptions = [
    { label: 'Security Alerts', value: 'alerts' },
    { label: 'Failed Logins', value: 'failed' },
    { label: 'Recent Audit', value: 'audit' },
    { label: 'Admin 2FA', value: '2fa' },
  ];

  get currentTabData(): SecurityItem[] {
    switch (this.tab) {
      case 'alerts':
        return this.alerts;
      case 'failed':
        return this.failedLogins;
      case 'audit':
        return this.auditLogs;
      default:
        return [];
    }
  }

  get displayItems() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.currentTabData.slice(start, start + this.pageSize);
  }

  onPageChange(event: { first?: number; rows?: number }) {
    const { page, pageSize } = PaginationHelper.onPageChange(event, this.pageSize);
    this.currentPage = page;
    this.pageSize = pageSize;
    this.cdr.markForCheck();
  }

  onTabChange(t: string) {
    this.tab = t;
    this.currentPage = 1;
    if (t === '2fa') void this.load2faAdmins();
    this.cdr.markForCheck();
  }

  async load2faAdmins() {
    try {
      const res = await this.mfa.listAdmins();
      this.admin2fa = res.admins || [];
    } catch (e) {
      this.notify.error('2FA list failed', e instanceof Error ? e.message : 'Could not load admins');
    }
    this.cdr.markForCheck();
  }

  confirmReset2fa(admin: { id: string; username: string }) {
    this.confirm.confirm({
      key: 'reset2fa',
      header: 'Hard Reset 2FA',
      message: `Reset 2FA for "${admin.username}"? They must scan a new QR code on next login.`,
      acceptLabel: 'Hard Reset',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => void this.hardReset2fa(admin.id),
    });
  }

  async hardReset2fa(userId: string) {
    this.resettingId = userId;
    this.cdr.markForCheck();
    try {
      await this.mfa.reset(userId);
      this.notify.success('2FA reset', 'Admin must configure 2FA again on next login.');
      await this.load2faAdmins();
    } catch (e) {
      this.notify.error('Reset failed', e instanceof Error ? e.message : 'Could not reset 2FA');
    } finally {
      this.resettingId = null;
      this.cdr.markForCheck();
    }
  }

  ngOnInit() {
    this.load();
  }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      const [a, f, au] = await Promise.all([
        this.admin.getSecurityAlerts(),
        this.admin.getFailedLogins(),
        this.admin.getAuditLogs(30),
      ]);
      this.alerts = a as SecurityItem[];
      this.failedLogins = f as SecurityItem[];
      this.auditLogs = au as SecurityItem[];
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Could not load security data';
    }
    this.loading = false;
    this.cdr.markForCheck();
  }
}
