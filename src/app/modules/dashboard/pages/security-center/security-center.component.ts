import { AngularSvgIconModule } from 'angular-svg-icon';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from 'src/app/core/services/admin.service';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { PaginatorModule } from 'primeng/paginator';

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
    AngularSvgIconModule, WibDatePipe, SelectModule, TagModule, PaginatorModule],
  template: `
    <div data-page="security-center" class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-3">
          <div class="page-header-icon"><svg-icon src="assets/icons/heroicons/outline/shield-exclamation.svg" svgClass="h-4 w-4"></svg-icon></div>
          <div>
            <h1 class="max-sm:text-lg sm:text-xl font-bold text-foreground tracking-tight">Security Center</h1>
          <p class="text-muted-foreground mt-0.5 text-xs">
            Security alerts, failed logins, and audit events
          </p>
        </div>
          </div>
        </div><div class="flex gap-2">
          <p-select
            [(ngModel)]="tab"
            (ngModelChange)="onTabChange($event)"
            [options]="tabOptions"
            optionLabel="label"
            optionValue="value"
            class="w-40"
            styleClass="!text-xs !w-full" />
          <button
            (click)="load()"
            class="bg-card border-border text-muted-foreground hover:text-foreground rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors"
            [disabled]="loading">
            <svg
              class="h-3.5 w-3.5 inline mr-1"
              [class.animate-spin]="loading"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      @if (loading) {
        <div class="bg-card border-border animate-pulse rounded-lg border p-5">
          <div class="space-y-3">
            @for (_ of [1, 2, 3, 4, 5]; track _) {
              <div class="h-10 rounded-lg bg-accent/30"></div>
            }
          </div>
        </div>
      } @else if (error) {
        <div class="bg-card border-border rounded-lg border p-5">
          <div class="flex flex-col items-center gap-3 py-6">
            <p class="text-muted-foreground text-sm font-medium">{{ error }}</p>
            <button
              (click)="load()"
              class="bg-card border-border text-foreground rounded-lg border px-3 py-1.5 text-xs font-medium">
              Retry
            </button>
          </div>
        </div>
      } @else {
        @if (tab === 'alerts') {
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
                      <p-tag [value]="l.severity" [severity]="severityTagSeverity(l.severity ?? '')" />
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
        @if (tab === 'failed') {
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
                      class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono max-sm:hidden">
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
    this.currentPage = Math.floor((event.first ?? 0) / (event.rows ?? 20)) + 1;
    this.pageSize = event.rows ?? 20;
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

  severityTagSeverity(s: string) {
    const m: Record<string, "success" | "info" | "secondary" | "warn" | "danger" | "contrast" | null | undefined> = { CRITICAL: 'danger', HIGH: 'warn', MEDIUM: 'warn', LOW: 'secondary' };
    return (m[s] || 'secondary') as "success" | "info" | "secondary" | "warn" | "danger" | "contrast" | null | undefined;
  }
}
