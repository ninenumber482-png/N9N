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

interface AuditItem {
  id: string;
  created_at?: string;
  admin_id?: string | null;
  action?: string;
  resource_type?: string;
  resource_id?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  ip_address?: string | null;
  user_id?: string | null;
  reason?: string | null;
  alert_type?: string;
  severity?: string;
  description?: string;
  attempted_at?: string;
  username?: string;
  user_agent?: string | null;
}

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [CommonModule, FormsModule,
    WibDatePipe, SelectModule, TagModule, PaginatorModule,
    PageHeaderComponent, LoadingErrorComponent, RefreshButtonComponent, SeverityMapPipe],
  template: `
    <div data-page="audit" class="space-y-6">
      <app-page-header icon="bookmark" title="Audit Logs" subtitle="Admin action audit trail + security events">
        <div class="flex gap-2">
          <p-select
            [(ngModel)]="tab"
            (ngModelChange)="onTabChange($event)"
            [options]="tabOptions"
            optionLabel="label"
            optionValue="value"
            class="w-40"
            styleClass="!text-xs !w-full" />
          <app-refresh-button [loading]="loading" (clicked)="load()" />
        </div>
      </app-page-header>

      <app-loading-error [loading]="loading" [error]="error" (retry)="load()" />

      @if (!loading && !error) {
        @if (tab === 'audit') {
          <div class="bg-card border-border rounded-lg border overflow-x-auto">
            <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
              <thead>
                <tr
                  class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Time</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">Admin</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Action</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Resource</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">Old Value</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">New Value</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">IP</th>
                </tr>
              </thead>
              <tbody>
                @for (l of displayItems; track l.id) {
                  <tr class="border-border hover:bg-accent/30 border-b">
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 whitespace-nowrap">
                      {{ l.created_at | wibDate: 'short' }}
                    </td>
                    <td
                      class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono max-sm:hidden">
                      {{ l.admin_id?.slice(0, 10) }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                      <span
                        class="bg-card border-border text-foreground rounded border px-2 py-0.5 font-medium text-[10px]"
                        >{{ l.action }}</span
                      >
                    </td>
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                      {{ l.resource_type }} {{ l.resource_id?.slice(0, 8) }}
                    </td>
                    <td
                      class="text-muted-foreground max-w-[120px] truncate max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">
                      {{ l.old_value || '-' }}
                    </td>
                    <td
                      class="text-muted-foreground max-w-[120px] truncate max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">
                      {{ l.new_value || '-' }}
                    </td>
                    <td
                      class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono max-sm:hidden">
                      {{ l.ip_address || '-' }}
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="7" class="text-center py-12 text-muted-foreground">No audit logs</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        @if (tab === 'user_audit') {
          <div class="bg-card border-border rounded-lg border overflow-x-auto">
            <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
              <thead>
                <tr
                  class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Time</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">User</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">Admin</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Action</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">Reason</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">IP</th>
                </tr>
              </thead>
              <tbody>
                @for (l of displayItems; track l.id) {
                  <tr class="border-border hover:bg-accent/30 border-b">
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 whitespace-nowrap">
                      {{ l.created_at | wibDate: 'short' }}
                    </td>
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono">
                      {{ l.user_id?.slice(0, 10) }}
                    </td>
                    <td
                      class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono max-sm:hidden">
                      {{ l.admin_id?.slice(0, 10) }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                      <span
                        class="bg-card border-border text-foreground rounded border px-2 py-0.5 font-medium text-[10px]"
                        >{{ l.action }}</span
                      >
                    </td>
                    <td
                      class="text-muted-foreground max-w-[200px] truncate max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">
                      {{ l.reason || '-' }}
                    </td>
                    <td
                      class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono max-sm:hidden">
                      {{ l.ip_address || '-' }}
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="text-center py-12 text-muted-foreground">No user audit logs</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        @if (tab === 'security') {
          <div class="bg-card border-border rounded-lg border overflow-x-auto">
            <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
              <thead>
                <tr
                  class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Time</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Type</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Severity</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">User</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">Description</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">IP</th>
                </tr>
              </thead>
              <tbody>
                @for (l of displayItems; track l.id) {
                  <tr class="border-border hover:bg-accent/30 border-b">
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 whitespace-nowrap">
                      {{ l.created_at | wibDate: 'short' }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                      <p-tag [value]="l.alert_type" severity="warn" />
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                      <p-tag [value]="l.severity" [severity]="l.severity | severityMap" />
                    </td>
                    <td
                      class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono max-sm:hidden">
                      {{ l.user_id?.slice(0, 10) || '-' }}
                    </td>
                    <td
                      class="text-muted-foreground max-w-[200px] truncate max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">
                      {{ l.description }}
                    </td>
                    <td
                      class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono max-sm:hidden">
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

        @if (tab === 'failed_logins') {
          <div class="bg-card border-border rounded-lg border overflow-x-auto">
            <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
              <thead>
                <tr
                  class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Time</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Username</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Reason</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">IP</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">User Agent</th>
                </tr>
              </thead>
              <tbody>
                @for (l of displayItems; track l.id) {
                  <tr class="border-border hover:bg-accent/30 border-b">
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 whitespace-nowrap">
                      {{ l.attempted_at | wibDate: 'short' }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-semibold text-foreground">
                      {{ l.username }}
                    </td>
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">{{ l.reason }}</td>
                    <td
                      class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono max-sm:hidden">
                      {{ l.ip_address }}
                    </td>
                    <td
                      class="text-muted-foreground max-w-[150px] truncate max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-[9px] max-sm:hidden">
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
export class AuditComponent implements OnInit {
  private admin = inject(AdminService);
  private cdr = inject(ChangeDetectorRef);

  tab = 'audit';
  currentPage = 1;
  pageSize = 20;
  auditLogs: AuditItem[] = [];
  userAudit: AuditItem[] = [];
  securityAlerts: AuditItem[] = [];
  failedLogins: AuditItem[] = [];
  loading = true;
  error: string | null = null;

  tabOptions = [
    { label: 'Admin Audit', value: 'audit' },
    { label: 'User Changes', value: 'user_audit' },
    { label: 'Security Alerts', value: 'security' },
    { label: 'Failed Logins', value: 'failed_logins' },
  ];

  get currentTabData(): AuditItem[] {
    switch (this.tab) {
      case 'audit':
        return this.auditLogs;
      case 'user_audit':
        return this.userAudit;
      case 'security':
        return this.securityAlerts;
      case 'failed_logins':
        return this.failedLogins;
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
      const [a, u, s, f] = await Promise.all([
        this.admin.getAuditLogs(),
        this.admin.getUserAudit(),
        this.admin.getSecurityAlerts(),
        this.admin.getFailedLogins(),
      ]);
      this.auditLogs = a as unknown as AuditItem[];
      this.userAudit = u as unknown as AuditItem[];
      this.securityAlerts = s as unknown as AuditItem[];
      this.failedLogins = f as unknown as AuditItem[];
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Could not load audit logs';
    }
    this.loading = false;
    this.cdr.markForCheck();
  }
}
