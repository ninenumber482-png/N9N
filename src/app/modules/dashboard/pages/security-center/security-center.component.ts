import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
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
import { DialogModule } from 'primeng/dialog';
import { ConfirmationService } from 'primeng/api';

interface SecurityItem {
  id?: string;
  created_at?: string;
  alert_type?: string;
  severity?: string;
  user_id?: string | null;
  description?: string;
  details?: unknown;
  resolved_at?: string | null;
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
    DialogModule,
  ],
  providers: [ConfirmationService],
  template: `
    <p-confirmdialog key="reset2fa" appendTo="body" />
    <p-confirmdialog key="secact" appendTo="body" />
    <div data-page="security-center" class="space-y-6">
      <app-page-header
        icon="shield-exclamation"
        title="Security Center"
        subtitle="Security alerts, failed logins, and audit events">
        <div class="flex items-center gap-2">
          <button
            type="button"
            (click)="exportCsv()"
            [disabled]="loading || tab === '2fa'"
            class="n9-btn n9-btn-ghost text-xs px-3 py-1.5">
            Export CSV
          </button>
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

      @if (tab !== '2fa') {
        <div class="grid grid-cols-3 gap-3">
          <div class="bg-card border-border rounded-lg border p-4">
            <div class="text-muted-foreground text-xs uppercase tracking-wider">Open Alerts</div>
            <div class="mt-1 flex items-baseline gap-2">
              <span class="text-foreground text-2xl font-semibold">{{ openAlertCount }}</span>
              @if (criticalOpenCount > 0) {
                <span class="text-xs font-medium text-red-400">{{ criticalOpenCount }} critical</span>
              }
            </div>
          </div>
          <div class="bg-card border-border rounded-lg border p-4">
            <div class="text-muted-foreground text-xs uppercase tracking-wider">Failed Logins (15m)</div>
            <div class="text-foreground mt-1 text-2xl font-semibold">{{ failed15Count }}</div>
          </div>
          <div class="bg-card border-border rounded-lg border p-4">
            <div class="text-muted-foreground text-xs uppercase tracking-wider">Audit Events</div>
            <div class="text-foreground mt-1 text-2xl font-semibold">{{ auditLogs.length }}</div>
          </div>
        </div>
      }

      <app-loading-error [loading]="loading" [error]="error" (retry)="load()" />

      @if (!loading && !error) {
        @if (tab === 'alerts') {
          <div class="flex flex-wrap items-center gap-2">
            <p-select
              [(ngModel)]="severityFilter"
              (ngModelChange)="onFilterChange()"
              [options]="severityOptions"
              optionLabel="label"
              optionValue="value"
              styleClass="!text-sm" />
            <button
              type="button"
              (click)="toggleOpenOnly()"
              class="n9-btn text-xs px-3 py-1.5"
              [ngClass]="openOnly ? 'n9-btn-primary' : 'n9-btn-ghost'">
              {{ openOnly ? 'Open only ✓' : 'Show all' }}
            </button>
            <div class="flex-1"></div>
            @if (openAlertCount > 0) {
              <button
                type="button"
                (click)="confirmResolveAll()"
                [disabled]="bulkActing"
                class="n9-btn n9-btn-ghost text-xs px-3 py-1.5">
                {{ bulkActing ? 'Working…' : 'Resolve all open' }}
              </button>
            }
          </div>
          <div class="bg-card border-border rounded-lg border overflow-x-auto">
            <table class="saas-table w-full text-left max-sm:text-xs sm:text-sm">
              <thead>
                <tr class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Time</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Type</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Severity</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Status</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">User</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">Description</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">IP</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                @for (l of displayItems; track l.id) {
                  <tr class="border-border hover:bg-accent/30 cursor-pointer border-b" (click)="openDetail(l)">
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 whitespace-nowrap">
                      {{ l.created_at | wibDate: 'short' }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                      <app-status-badge [value]="l.alert_type" severity="warn" />
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                      <app-status-badge [value]="l.severity" [severity]="l.severity | severityMap" />
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                      @if (l.resolved_at) {
                        <app-status-badge value="RESOLVED" severity="secondary" />
                      } @else {
                        <app-status-badge value="OPEN" severity="warn" />
                      }
                    </td>
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">
                      {{ userName(l.user_id) }}
                    </td>
                    <td
                      class="text-muted-foreground max-w-[200px] truncate max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">
                      {{ l.description }}
                    </td>
                    <td
                      class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 font-mono max-sm:hidden">
                      {{ l.ip_address || '-' }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-right">
                      @if (!l.resolved_at) {
                        <button
                          type="button"
                          (click)="$event.stopPropagation(); confirmResolve(l)"
                          [disabled]="actingId === l.id"
                          class="n9-btn n9-btn-ghost text-xs px-2.5 py-1">
                          {{ actingId === l.id ? '…' : 'Resolve' }}
                        </button>
                      } @else {
                        <span class="text-muted-foreground text-xs">—</span>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="8" class="text-muted-foreground py-12 text-center">No security alerts</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        @if (tab === 'failed') {
          <div class="flex items-center gap-2">
            <div class="flex-1"></div>
            @if (failedLogins.length > 0) {
              <button
                type="button"
                (click)="confirmClearOld()"
                [disabled]="bulkActing"
                class="n9-btn n9-btn-ghost text-xs px-3 py-1.5">
                {{ bulkActing ? 'Working…' : 'Clear old (>15m)' }}
              </button>
            }
          </div>
          <div class="bg-card border-border rounded-lg border overflow-x-auto">
            <table class="saas-table w-full text-left max-sm:text-xs sm:text-sm">
              <thead>
                <tr class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Time</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Username</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Reason</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">IP</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">User Agent</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                @for (l of displayItems; track l.id) {
                  <tr class="border-border hover:bg-accent/30 border-b">
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 whitespace-nowrap">
                      {{ l.attempted_at | wibDate: 'short' }}
                    </td>
                    <td class="text-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 font-semibold">
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
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-right">
                      <button
                        type="button"
                        (click)="confirmClearUser(l.username)"
                        [disabled]="actingId === l.username"
                        class="n9-btn n9-btn-ghost text-xs px-2.5 py-1 whitespace-nowrap">
                        {{ actingId === l.username ? '…' : 'Clear / Unlock' }}
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="text-muted-foreground py-12 text-center">No failed logins</td>
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
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">
                      {{ userName(l.admin_id) }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                      <span
                        class="bg-card border-border text-foreground rounded border px-2 py-0.5 text-[11px] font-medium"
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
                    <td colspan="5" class="text-muted-foreground py-12 text-center">No audit logs</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        @if (tab === '2fa') {
          <div class="bg-card border-border rounded-lg border overflow-x-auto">
            <div class="border-border border-b px-5 py-3.5">
              <h3 class="text-foreground text-sm font-medium">Admin 2FA (Google Authenticator)</h3>
              <p class="text-muted-foreground mt-0.5 text-[11px]">
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
                    <td class="text-foreground px-5 py-3.5 font-semibold">{{ a.username }}</td>
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
                    <td colspan="4" class="text-muted-foreground py-12 text-center">No admin accounts</td>
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

      <p-dialog
        [(visible)]="showDetail"
        [modal]="true"
        [dismissableMask]="true"
        [style]="{ width: '32rem' }"
        header="Alert detail"
        appendTo="body"
        styleClass="dashboard-dialog">
        @if (detailAlert) {
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-muted-foreground">Time</span
              ><span>{{ detailAlert.created_at | wibDate: 'short' }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Type</span
              ><app-status-badge [value]="detailAlert.alert_type" severity="warn" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Severity</span
              ><app-status-badge [value]="detailAlert.severity" [severity]="detailAlert.severity | severityMap" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Status</span>
              @if (detailAlert.resolved_at) {
                <app-status-badge value="RESOLVED" severity="secondary" />
              } @else {
                <app-status-badge value="OPEN" severity="warn" />
              }
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">User</span><span>{{ userName(detailAlert.user_id) }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-muted-foreground">IP</span
              ><span class="font-mono">{{ detailAlert.ip_address || '-' }}</span>
            </div>
            <div>
              <span class="text-muted-foreground">Description</span>
              <p class="mt-1">{{ detailAlert.description || '-' }}</p>
            </div>
            @if (detailAlert.details) {
              <div>
                <span class="text-muted-foreground">Details</span>
                <pre class="bg-background border-border mt-1 overflow-x-auto rounded border p-2 text-xs">{{
                  detailAlert.details | json
                }}</pre>
              </div>
            }
            @if (!detailAlert.resolved_at) {
              <div class="pt-2 text-right">
                <button
                  type="button"
                  (click)="confirmResolve(detailAlert)"
                  [disabled]="actingId === detailAlert.id"
                  class="n9-btn n9-btn-primary text-xs px-3 py-1.5">
                  Resolve
                </button>
              </div>
            }
          </div>
        }
      </p-dialog>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecurityCenterComponent implements OnInit, OnDestroy {
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
  userMap: Record<string, string> = {};
  admin2fa: Array<{
    id: string;
    username: string;
    display_name: string;
    role: string;
    totp_enabled: boolean;
    totp_skipped_at: string | null;
  }> = [];
  resettingId: string | null = null;
  actingId: string | null = null;
  bulkActing = false;
  loading = true;
  error: string | null = null;

  severityFilter = 'all';
  openOnly = true;

  showDetail = false;
  detailAlert: SecurityItem | null = null;

  private pollId?: ReturnType<typeof setInterval>;

  tabOptions = [
    { label: 'Security Alerts', value: 'alerts' },
    { label: 'Failed Logins', value: 'failed' },
    { label: 'Recent Audit', value: 'audit' },
    { label: 'Admin 2FA', value: '2fa' },
  ];

  severityOptions = [
    { label: 'All severity', value: 'all' },
    { label: 'Critical', value: 'critical' },
    { label: 'High', value: 'high' },
    { label: 'Medium', value: 'medium' },
    { label: 'Low', value: 'low' },
  ];

  userName(id?: string | null): string {
    if (!id) return '-';
    return this.userMap[id] || id.slice(0, 10);
  }

  get filteredAlerts(): SecurityItem[] {
    return this.alerts.filter(
      (a) =>
        (!this.openOnly || !a.resolved_at) &&
        (this.severityFilter === 'all' || (a.severity || '').toLowerCase() === this.severityFilter),
    );
  }

  get openAlertCount(): number {
    return this.alerts.filter((a) => !a.resolved_at).length;
  }
  get criticalOpenCount(): number {
    return this.alerts.filter((a) => !a.resolved_at && (a.severity || '').toLowerCase() === 'critical').length;
  }
  get failed15Count(): number {
    const cutoff = Date.now() - 900_000;
    return this.failedLogins.filter((f) => f.attempted_at && new Date(f.attempted_at).getTime() >= cutoff).length;
  }

  get currentTabData(): SecurityItem[] {
    switch (this.tab) {
      case 'alerts':
        return this.filteredAlerts;
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

  onFilterChange() {
    this.currentPage = 1;
    this.cdr.markForCheck();
  }

  toggleOpenOnly() {
    this.openOnly = !this.openOnly;
    this.currentPage = 1;
    this.cdr.markForCheck();
  }

  openDetail(alert: SecurityItem) {
    this.detailAlert = alert;
    this.showDetail = true;
    this.cdr.markForCheck();
  }

  confirmResolve(alert: SecurityItem) {
    if (!alert.id) return;
    const id = alert.id;
    this.confirm.confirm({
      key: 'secact',
      header: 'Resolve alert',
      message: `Tandai alert "${alert.alert_type || 'ini'}" sebagai resolved?`,
      acceptLabel: 'Resolve',
      rejectLabel: 'Cancel',
      accept: () => void this.doResolve(id),
    });
  }

  async doResolve(id: string) {
    this.actingId = id;
    this.cdr.markForCheck();
    try {
      await this.admin.resolveAlert(id);
      this.notify.success('Alert resolved', 'Ditandai sebagai resolved.');
      this.showDetail = false;
      await this.load();
    } catch (e) {
      this.notify.error('Resolve gagal', e instanceof Error ? e.message : 'Tidak bisa resolve alert');
    } finally {
      this.actingId = null;
      this.cdr.markForCheck();
    }
  }

  confirmResolveAll() {
    this.confirm.confirm({
      key: 'secact',
      header: 'Resolve all open',
      message: `Tandai ${this.openAlertCount} alert terbuka sebagai resolved?`,
      acceptLabel: 'Resolve all',
      rejectLabel: 'Cancel',
      accept: () => void this.doResolveAll(),
    });
  }

  async doResolveAll() {
    this.bulkActing = true;
    this.cdr.markForCheck();
    try {
      await this.admin.resolveAllOpenAlerts();
      this.notify.success('Alerts resolved', 'Semua alert terbuka ditandai resolved.');
      await this.load();
    } catch (e) {
      this.notify.error('Resolve gagal', e instanceof Error ? e.message : 'Tidak bisa resolve');
    } finally {
      this.bulkActing = false;
      this.cdr.markForCheck();
    }
  }

  confirmClearUser(username?: string) {
    if (!username) return;
    this.confirm.confirm({
      key: 'secact',
      header: 'Clear / Unlock',
      message: `Hapus catatan gagal-login & lepas kunci rate-limit untuk "${username}"?`,
      acceptLabel: 'Clear',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => void this.doClearUser(username),
    });
  }

  async doClearUser(username: string) {
    this.actingId = username;
    this.cdr.markForCheck();
    try {
      await this.admin.clearFailedLogins(username);
      this.notify.success('Lockout dilepas', `${username} bisa login lagi.`);
      await this.load();
    } catch (e) {
      this.notify.error('Gagal', e instanceof Error ? e.message : 'Tidak bisa clear');
    } finally {
      this.actingId = null;
      this.cdr.markForCheck();
    }
  }

  confirmClearOld() {
    this.confirm.confirm({
      key: 'secact',
      header: 'Clear old failed logins',
      message:
        'Hapus catatan gagal-login yang lebih tua dari 15 menit (housekeeping)? Lockout yang sedang aktif tidak terpengaruh.',
      acceptLabel: 'Clear old',
      rejectLabel: 'Cancel',
      accept: () => void this.doClearOld(),
    });
  }

  async doClearOld() {
    this.bulkActing = true;
    this.cdr.markForCheck();
    try {
      const cutoff = new Date(Date.now() - 900_000).toISOString();
      await this.admin.clearOldFailedLogins(cutoff);
      this.notify.success('Dibersihkan', 'Catatan lama dihapus.');
      await this.load();
    } catch (e) {
      this.notify.error('Gagal', e instanceof Error ? e.message : 'Tidak bisa clear');
    } finally {
      this.bulkActing = false;
      this.cdr.markForCheck();
    }
  }

  exportCsv() {
    const date = new Date().toISOString().slice(0, 10);
    let header: string[];
    let rows: string[][];
    if (this.tab === 'alerts') {
      header = ['Time', 'Type', 'Severity', 'Status', 'User', 'Description', 'IP'];
      rows = this.filteredAlerts.map((a) => [
        a.created_at || '',
        a.alert_type || '',
        a.severity || '',
        a.resolved_at ? 'RESOLVED' : 'OPEN',
        this.userName(a.user_id),
        a.description || '',
        a.ip_address || '',
      ]);
    } else if (this.tab === 'failed') {
      header = ['Time', 'Username', 'Reason', 'IP', 'User Agent'];
      rows = this.failedLogins.map((f) => [
        f.attempted_at || '',
        f.username || '',
        f.reason || '',
        f.ip_address || '',
        f.user_agent || '',
      ]);
    } else {
      header = ['Time', 'Admin', 'Action', 'Resource', 'IP'];
      rows = this.auditLogs.map((l) => [
        l.created_at || '',
        this.userName(l.admin_id),
        l.action || '',
        `${l.resource_type || ''} ${l.resource_id || ''}`.trim(),
        l.ip_address || '',
      ]);
    }
    this.downloadCsv(`security-${this.tab}-${date}.csv`, [header, ...rows]);
  }

  private downloadCsv(filename: string, rows: string[][]) {
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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
    this.pollId = setInterval(() => void this.poll(), 25_000);
  }

  ngOnDestroy() {
    if (this.pollId) clearInterval(this.pollId);
  }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      const [a, f, au, map] = await Promise.all([
        this.admin.getSecurityAlerts(),
        this.admin.getFailedLogins(),
        this.admin.getRecentAudit(100),
        this.admin.getUserNameMap(),
      ]);
      this.alerts = a as SecurityItem[];
      this.failedLogins = f as SecurityItem[];
      this.auditLogs = au as SecurityItem[];
      this.userMap = map;
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Could not load security data';
    }
    this.loading = false;
    this.cdr.markForCheck();
  }

  private async poll() {
    if (this.loading || this.tab === '2fa' || (typeof document !== 'undefined' && document.hidden)) return;
    try {
      // Refetch only the active tab — each proxied GET inserts an audit_log row, so polling all
      // three tabs would flood audit_log (and the Audit tab) with the page's own reads.
      if (this.tab === 'alerts') {
        this.alerts = (await this.admin.getSecurityAlerts()) as SecurityItem[];
      } else if (this.tab === 'failed') {
        this.failedLogins = (await this.admin.getFailedLogins()) as SecurityItem[];
      } else if (this.tab === 'audit') {
        this.auditLogs = (await this.admin.getRecentAudit(100)) as SecurityItem[];
      }
      this.cdr.markForCheck();
    } catch {
      /* transient polling failure — keep last good data */
    }
  }
}
