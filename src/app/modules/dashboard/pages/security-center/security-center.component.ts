import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from 'src/app/core/services/admin.service';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { PaginatorModule } from 'primeng/paginator';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { LoadingErrorComponent } from 'src/app/shared/components/loading-error/loading-error.component';
import { RefreshButtonComponent } from 'src/app/shared/components/refresh-button/refresh-button.component';
import { SeverityMapPipe } from 'src/app/shared/pipes/severity-map.pipe';
import { PaginationHelper } from 'src/app/shared/utils/pagination.helper';

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
  imports: [CommonModule, FormsModule,
    WibDatePipe, SelectModule, TagModule, PaginatorModule,
    PageHeaderComponent, LoadingErrorComponent, RefreshButtonComponent, SeverityMapPipe],
  template: `
    <div data-page="security-center" class="space-y-6">
      <app-page-header icon="shield-exclamation" title="Security Center" subtitle="Security alerts, failed logins, and audit events">
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
            <table class="w-full text-left max-sm:text-xs sm:text-sm">
              <thead>
                <tr
                  class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
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
                      <p-tag [value]="l.alert_type" severity="warn" />
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                      <p-tag [value]="l.severity" [severity]="l.severity | severityMap" />
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
            <table class="w-full text-left max-sm:text-xs sm:text-sm">
              <thead>
                <tr
                  class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
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
            <table class="w-full text-left max-sm:text-xs sm:text-sm">
              <thead>
                <tr
                  class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
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
        <p-paginator
          (onPageChange)="onPageChange($event)"
          [first]="(currentPage - 1) * pageSize"
          [rows]="pageSize"
          [totalRecords]="currentTabData.length" />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecurityCenterComponent implements OnInit {
  private admin = inject(AdminService);
  private cdr = inject(ChangeDetectorRef);

  tab = 'alerts';
  currentPage = 1;
  pageSize = 20;
  alerts: SecurityItem[] = [];
  failedLogins: SecurityItem[] = [];
  auditLogs: SecurityItem[] = [];
  loading = true;
  error: string | null = null;

  tabOptions = [
    { label: 'Security Alerts', value: 'alerts' },
    { label: 'Failed Logins', value: 'failed' },
    { label: 'Recent Audit', value: 'audit' },
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
    this.cdr.markForCheck();
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
