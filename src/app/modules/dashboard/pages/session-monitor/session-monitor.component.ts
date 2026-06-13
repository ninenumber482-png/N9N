import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from 'src/app/core/services/admin.service';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { StatusBadgeComponent } from 'src/app/shared/components/status-badge/status-badge.component';
import { PaginatorModule } from 'primeng/paginator';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { LoadingErrorComponent } from 'src/app/shared/components/loading-error/loading-error.component';
import { RefreshButtonComponent } from 'src/app/shared/components/refresh-button/refresh-button.component';
import { PaginationHelper } from 'src/app/shared/utils/pagination.helper';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';

interface SessionData {
  id: string;
  user_id: string;
  ip_address?: string;
  browser_info?: string;
  device_info?: { model?: string };
  user_agent?: string;
  last_activity: string;
  expires_at: string;
  logged_out_at?: string | null;
}

interface OnlineUser {
  user_id: string;
  last_activity: string;
  ip_address: string;
  device_info?: { model?: string } | null;
}

@Component({
  selector: 'app-session-monitor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    WibDatePipe,
    StatusBadgeComponent,
    PaginatorModule,
    PageHeaderComponent,
    LoadingErrorComponent,
    RefreshButtonComponent,
    ConfirmDialogModule,
  ],
  providers: [ConfirmationService],
  template: `
    <p-confirmdialog />
    <div data-page="session-monitor" class="space-y-6">
      <app-page-header icon="eye" title="Session Monitor" subtitle="Active user sessions and login activity">
        <app-refresh-button [loading]="loading" (clicked)="load()" />
      </app-page-header>

      <app-loading-error [loading]="loading" [error]="error" (retry)="load()" />

      @if (!loading && !error) {
        <div class="bg-card border-border rounded-lg border p-4">
          <div class="flex items-center gap-2 mb-3">
            <span class="inline-block h-2 w-2 rounded-full bg-emerald-400"></span>
            <h3 class="text-sm font-semibold text-foreground">Online Now</h3>
            <span class="text-xs text-muted-foreground">({{ online.length }})</span>
          </div>
          @if (online.length) {
            <div class="flex flex-wrap gap-2">
              @for (o of online; track o.user_id) {
                <div class="bg-accent/30 border-border rounded-md border px-3 py-1.5 text-xs">
                  <span class="font-mono font-semibold text-foreground">{{ o.user_id.slice(0, 8) }}</span>
                  <span class="text-muted-foreground"> · {{ o.ip_address || '-' }}</span>
                  <span class="text-muted-foreground"> · {{ o.last_activity | wibDate: 'short' }}</span>
                </div>
              }
            </div>
          } @else {
            <p class="text-xs text-muted-foreground">No users online in the last 5 minutes.</p>
          }
        </div>
      }

      @if (!loading && !error) {
        <div class="bg-card border-border rounded-lg border overflow-x-auto">
          <table class="saas-table w-full text-left max-sm:text-xs sm:text-sm">
            <thead>
              <tr class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">User</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">IP Address</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">Browser</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">Device</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Last Activity</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Expires</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Status</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5"></th>
              </tr>
            </thead>
            <tbody>
              @for (s of displaySessions; track s.id) {
                <tr class="border-border hover:bg-accent/30 border-b">
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 font-semibold text-foreground">
                    {{ s.user_id.slice(0, 8) }}
                  </td>
                  <td
                    class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 font-mono text-muted-foreground max-sm:hidden">
                    {{ s.ip_address || '-' }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-muted-foreground max-sm:hidden">
                    {{ s.browser_info || '-' }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-muted-foreground max-sm:hidden">
                    {{ s.device_info?.model || s.user_agent?.slice(0, 30) || '-' }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-muted-foreground whitespace-nowrap">
                    {{ s.last_activity | wibDate: 'short' }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-muted-foreground whitespace-nowrap">
                    {{ s.expires_at | wibDate: 'short' }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                    @if (s.logged_out_at) {
                      <app-status-badge value="Ended" severity="secondary" />
                    } @else if (isExpired(s.expires_at)) {
                      <app-status-badge value="Expired" severity="warn" />
                    } @else {
                      <app-status-badge value="Active" severity="success" />
                    }
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                    @if (!s.logged_out_at && !isExpired(s.expires_at)) {
                      <button
                        (click)="confirmKill(s.id)"
                        [disabled]="killing === s.id"
                        class="text-[11px] font-medium text-rose-500 hover:text-rose-700 transition">
                        {{ killing === s.id ? '...' : 'Kill' }}
                      </button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="8" class="text-center py-12 text-muted-foreground">No sessions</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p-paginator
          (onPageChange)="onPageChange($event)"
          [first]="(currentPage - 1) * pageSize"
          [rows]="pageSize"
          [totalRecords]="sessions.length" />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionMonitorComponent implements OnInit, OnDestroy {
  private admin = inject(AdminService);
  private cdr = inject(ChangeDetectorRef);
  private confirmation = inject(ConfirmationService);

  sessions: SessionData[] = [];
  online: OnlineUser[] = [];
  currentPage = 1;
  pageSize = 20;
  loading = true;
  error: string | null = null;
  killing: string | null = null;
  private interval: ReturnType<typeof setInterval> | undefined;

  ngOnInit() {
    this.load();
    this.interval = setInterval(() => this.load(), 30000);
  }

  ngOnDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  async load() {
    if (!this.loading && this.sessions.length === 0) this.loading = true;
    this.error = null;
    try {
      const [sessions, online] = await Promise.all([
        this.admin.getUserSessions(100),
        this.admin.getOnlineUsers().catch(() => [] as OnlineUser[]),
      ]);
      this.sessions = sessions;
      this.online = online;
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Could not load sessions';
    }
    this.loading = false;
    this.cdr.markForCheck();
  }

  get displaySessions() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.sessions.slice(start, start + this.pageSize);
  }

  onPageChange(event: { first?: number; rows?: number }) {
    const { page, pageSize } = PaginationHelper.onPageChange(event, this.pageSize);
    this.currentPage = page;
    this.pageSize = pageSize;
    this.cdr.markForCheck();
  }

  isExpired(expiresAt: string) {
    return new Date(expiresAt).getTime() < Date.now();
  }

  confirmKill(id: string) {
    this.confirmation.confirm({
      message: 'Paksa logout sesi ini? User akan langsung keluar.',
      header: 'Kill Session',
      icon: 'none',
      rejectLabel: 'Batal',
      acceptLabel: 'Kill',
      accept: () => this.killSession(id),
      reject: () => {},
    });
  }

  async killSession(id: string) {
    this.killing = id;
    try {
      await this.admin.endUserSession(id);
      await this.load();
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Failed to end session';
    }
    this.killing = null;
    this.cdr.markForCheck();
  }
}
