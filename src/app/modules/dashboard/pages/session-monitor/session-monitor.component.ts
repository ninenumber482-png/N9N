import { AngularSvgIconModule } from 'angular-svg-icon';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from 'src/app/core/services/admin.service';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { TagModule } from 'primeng/tag';
import { PaginatorModule } from 'primeng/paginator';

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

@Component({
  selector: 'app-session-monitor',
  standalone: true,
  imports: [CommonModule, FormsModule,
    AngularSvgIconModule, WibDatePipe, TagModule, PaginatorModule],
  template: `
    <div data-page="session-monitor" class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-3">
          <div class="page-header-icon"><svg-icon src="assets/icons/heroicons/outline/eye.svg" svgClass="h-4 w-4"></svg-icon></div>
          <div>
            <h1 class="max-sm:text-lg sm:text-xl font-bold text-foreground tracking-tight">Session Monitor</h1>
          <p class="text-muted-foreground mt-0.5 text-xs">Active user sessions and login activity</p>
        </div>
          </div>
        </div><div class="flex gap-2">
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
        <div class="bg-card border-border rounded-lg border overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr
                class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">User</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">IP Address</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">Browser</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">Device</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Last Activity</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Expires</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Status</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3"></th>
              </tr>
            </thead>
            <tbody>
              @for (s of displaySessions; track s.id) {
                <tr class="border-border hover:bg-accent/30 border-b">
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-semibold text-foreground">
                    {{ s.user_id?.slice(0, 8) }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono text-muted-foreground max-sm:hidden">
                    {{ s.ip_address || '-' }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground max-sm:hidden">
                    {{ s.browser_info || '-' }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground max-sm:hidden">
                    {{ s.device_info?.model || s.user_agent?.slice(0, 30) || '-' }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground whitespace-nowrap">
                    {{ s.last_activity | wibDate: 'short' }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground whitespace-nowrap">
                    {{ s.expires_at | wibDate: 'short' }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    @if (s.logged_out_at) {
                      <p-tag value="Ended" severity="secondary" />
                    } @else if (isExpired(s.expires_at)) {
                      <p-tag value="Expired" severity="warn" />
                    } @else {
                      <p-tag value="Active" severity="success" />
                    }
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    @if (!s.logged_out_at && !isExpired(s.expires_at)) {
                      <button
                        (click)="killSession(s.id)"
                        [disabled]="killing === s.id"
                        class="text-[10px] font-medium text-muted-foreground hover:text-foreground transition">
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

  sessions: SessionData[] = [];
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
      this.sessions = await this.admin.getUserSessions(100);
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
    this.currentPage = Math.floor((event.first ?? 0) / (event.rows ?? this.pageSize)) + 1;
    this.pageSize = event.rows ?? this.pageSize;
  }

  isExpired(expiresAt: string) {
    return new Date(expiresAt).getTime() < Date.now();
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
