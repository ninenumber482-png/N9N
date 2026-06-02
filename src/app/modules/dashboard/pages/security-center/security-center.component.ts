import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../../core/services/admin.service';
import { WibDatePipe } from '../../../../shared/pipes/wib-date.pipe';

@Component({
  selector: 'app-security-center',
  standalone: true,
  imports: [CommonModule, FormsModule, WibDatePipe],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="max-sm:text-lg sm:text-2xl font-extrabold text-foreground">Security Center</h1>
          <p class="text-muted-foreground mt-1 max-sm:text-[10px] sm:text-sm">Security alerts, failed logins, and audit events</p>
        </div>
        <div class="flex gap-2">
          <select [(ngModel)]="tab" class="bg-card border-border text-foreground rounded-lg border max-sm:px-2 max-sm:py-1.5 sm:px-3 sm:py-2 max-sm:text-[9px] sm:text-xs font-semibold outline-none">
            <option value="alerts">Security Alerts</option>
            <option value="failed">Failed Logins</option>
            <option value="audit">Recent Audit</option>
          </select>
          <button (click)="load()" class="bg-primary/10 text-primary rounded-lg max-sm:px-2 max-sm:py-1.5 sm:px-3 sm:py-2 max-sm:text-[9px] sm:text-xs font-bold" [disabled]="loading">Refresh</button>
        </div>
      </div>

      @if (loading) {
        <div class="bg-card border-border animate-pulse rounded-xl border p-5 shadow-sm">
          <div class="space-y-3">@for (_ of [1,2,3,4,5]; track _) { <div class="h-10 rounded-lg bg-zinc-700/20"></div> }</div>
        </div>
      } @else if (error) {
        <div class="bg-card border-border rounded-xl border p-5 shadow-sm">
          <div class="flex flex-col items-center gap-3 py-6">
            <p class="text-red-400 text-sm font-semibold">{{ error }}</p>
            <button (click)="load()" class="bg-primary/10 text-primary rounded-lg px-4 py-2 text-xs font-bold">Retry</button>
          </div>
        </div>
      } @else {
      @if (tab === 'alerts') {
        <div class="bg-card border-border rounded-xl border shadow-sm overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead><tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
              <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Time</th>
              <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Type</th>
              <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Severity</th>
              <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">User</th>
              <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">Description</th>
              <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">IP</th>
            </tr></thead>
            <tbody>
              @for (l of alerts; track l.id) {
                <tr class="border-border hover:bg-muted/30 border-b">
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 whitespace-nowrap">{{ l.created_at | wibDate:'short' }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3"><span class="rounded px-2 py-0.5 text-[10px] font-bold bg-amber-400/10 text-amber-400">{{ l.alert_type }}</span></td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3"><span [class]="'rounded px-2 py-0.5 text-[10px] font-bold ' + severityClass(l.severity)">{{ l.severity }}</span></td>
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono max-sm:hidden">{{ l.user_id?.slice(0,10) || '-' }}</td>
                  <td class="text-muted-foreground max-w-[200px] truncate max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">{{ l.description }}</td>
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono max-sm:hidden">{{ l.ip_address || '-' }}</td>
                </tr>
              } @empty { <tr><td colspan="6" class="text-center py-12 text-muted-foreground">No security alerts</td></tr> }
            </tbody>
          </table>
        </div>
      }
      @if (tab === 'failed') {
        <div class="bg-card border-border rounded-xl border shadow-sm overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead><tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
              <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Time</th>
              <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Username</th>
              <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Reason</th>
              <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">IP</th>
              <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">User Agent</th>
            </tr></thead>
            <tbody>
              @for (l of failedLogins; track l.id) {
                <tr class="border-border hover:bg-muted/30 border-b">
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 whitespace-nowrap">{{ l.attempted_at | wibDate:'short' }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-semibold text-foreground">{{ l.username }}</td>
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">{{ l.reason }}</td>
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono max-sm:hidden">{{ l.ip_address }}</td>
                  <td class="text-muted-foreground max-w-[150px] truncate max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-[9px] max-sm:hidden">{{ l.user_agent || '-' }}</td>
                </tr>
              } @empty { <tr><td colspan="5" class="text-center py-12 text-muted-foreground">No failed logins</td></tr> }
            </tbody>
          </table>
        </div>
      }
      @if (tab === 'audit') {
        <div class="bg-card border-border rounded-xl border shadow-sm overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead><tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
              <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Time</th>
              <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">Admin</th>
              <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Action</th>
              <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Resource</th>
              <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">IP</th>
            </tr></thead>
            <tbody>
              @for (l of auditLogs; track l.id) {
                <tr class="border-border hover:bg-muted/30 border-b">
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 whitespace-nowrap">{{ l.created_at | wibDate:'short' }}</td>
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono max-sm:hidden">{{ l.admin_id?.slice(0,10) }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3"><span class="bg-primary/10 text-primary rounded px-2 py-0.5 font-bold">{{ l.action }}</span></td>
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">{{ l.resource_type }} {{ l.resource_id?.slice(0,8) }}</td>
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono max-sm:hidden">{{ l.ip_address || '-' }}</td>
                </tr>
              } @empty { <tr><td colspan="5" class="text-center py-12 text-muted-foreground">No audit logs</td></tr> }
            </tbody>
          </table>
        </div>
      }
      }
    </div>
  `,
})
export class SecurityCenterComponent implements OnInit {
  tab = 'alerts';
  alerts: any[] = [];
  failedLogins: any[] = [];
  auditLogs: any[] = [];
  loading = true;
  error: string | null = null;

  constructor(private admin: AdminService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.load(); }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      const [a, f, au] = await Promise.all([
        this.admin.getSecurityAlerts(),
        this.admin.getFailedLogins(),
        this.admin.getAuditLogs(30),
      ]);
      this.alerts = a;
      this.failedLogins = f;
      this.auditLogs = au;
    } catch (e: any) {
      this.error = e?.message || 'Could not load security data';
    }
    this.loading = false;
    this.cdr.markForCheck();
  }

  severityClass(s: string) {
    const m: Record<string, string> = { CRITICAL: 'bg-red-400/10 text-red-400', HIGH: 'bg-orange-400/10 text-orange-400', MEDIUM: 'bg-amber-400/10 text-amber-400', LOW: 'bg-zinc-400/10 text-zinc-400' };
    return m[s] || 'bg-zinc-400/10 text-zinc-400';
  }
}
