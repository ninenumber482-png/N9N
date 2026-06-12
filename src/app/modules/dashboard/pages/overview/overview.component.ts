import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminService } from 'src/app/core/services/admin.service';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { RefreshButtonComponent } from 'src/app/shared/components/refresh-button/refresh-button.component';

interface AuditLog {
  id: string;
  action: string;
  resource_type?: string;
  created_at: string;
  ip_address?: string;
}

interface ProbeLog {
  id: number;
  timestamp: string;
  status: 'ONLINE' | 'OFFLINE' | 'ERROR';
  latencyMs: number | null;
  bandwidthMbps: number | null;
  message: string;
}

interface NetworkInformationLike extends EventTarget {
  downlink?: number;
  effectiveType?: string;
  rtt?: number;
  saveData?: boolean;
}

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, PageHeaderComponent, RefreshButtonComponent],
  template: `
    <div data-page="overview" class="space-y-5">
      <app-page-header
        icon="chart-pie"
        title="System Console"
        [subtitle]="'Live network telemetry | ' + formatClock(currentTime)">
        <app-refresh-button [loading]="loading" (clicked)="load()" />
      </app-page-header>

      <section class="overflow-hidden rounded-lg border border-border bg-card">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div class="flex items-center gap-2.5">
            <span class="relative flex h-2.5 w-2.5">
              @if (networkStatus === 'ONLINE') {
                <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-40"></span>
              }
              <span
                class="relative inline-flex h-2.5 w-2.5 rounded-full"
                [class]="networkStatus === 'ONLINE' ? 'bg-emerald-500' : 'bg-rose-500'"></span>
            </span>
            <div>
              <p class="font-mono text-xs font-semibold text-foreground">N9 NETWORK MONITOR</p>
              <p class="font-mono text-[10px] text-muted-foreground">gateway.supabase.co / health probe</p>
            </div>
          </div>
          <div class="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
            <span>INTERVAL 10s</span>
            <span>SESSION {{ sessionUptime }}</span>
          </div>
        </div>

        <div class="grid grid-cols-2 divide-x divide-y divide-border lg:grid-cols-4 lg:divide-y-0">
          <div class="min-w-0 p-4">
            <p class="font-mono text-[10px] uppercase text-muted-foreground">Gateway</p>
            <div class="mt-2 flex items-end justify-between gap-2">
              <p
                class="font-mono text-xl font-bold"
                [class]="networkStatus === 'ONLINE' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'">
                {{ networkStatus }}
              </p>
              <span class="mb-0.5 font-mono text-[10px] text-muted-foreground">HTTP</span>
            </div>
          </div>

          <div class="min-w-0 p-4">
            <p class="font-mono text-[10px] uppercase text-muted-foreground">API Latency</p>
            <div class="mt-2 flex items-end justify-between gap-2">
              <p class="font-mono text-xl font-bold text-foreground">
                {{ latencyMs === null ? '--' : latencyMs }}<span class="ml-1 text-xs font-medium text-muted-foreground">ms</span>
              </p>
              <span class="mb-0.5 font-mono text-[10px]" [class]="qualityClass">{{ qualityLabel }}</span>
            </div>
          </div>

          <div class="min-w-0 p-4">
            <p class="font-mono text-[10px] uppercase text-muted-foreground">Downlink Estimate</p>
            <div class="mt-2 flex items-end justify-between gap-2">
              <p class="truncate font-mono text-xl font-bold text-foreground">
                {{ bandwidthMbps === null ? 'Unavailable' : bandwidthMbps }}
                @if (bandwidthMbps !== null) {
                  <span class="ml-1 text-xs font-medium text-muted-foreground">Mbps</span>
                }
              </p>
              <span class="mb-0.5 font-mono text-[10px] text-muted-foreground">BROWSER</span>
            </div>
          </div>

          <div class="min-w-0 p-4">
            <p class="font-mono text-[10px] uppercase text-muted-foreground">Connection</p>
            <div class="mt-2 flex items-end justify-between gap-2">
              <p class="font-mono text-xl font-bold uppercase text-foreground">{{ connectionType }}</p>
              <span class="mb-0.5 font-mono text-[10px] text-muted-foreground">
                {{ browserRtt === null ? 'RTT --' : 'RTT ' + browserRtt + 'ms' }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section class="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.45fr)]">
        <div class="overflow-hidden rounded-lg border border-border bg-[#080d16] text-slate-200 shadow-sm">
          <div class="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div class="flex items-center gap-2 font-mono text-xs font-semibold">
              <span class="h-2 w-2 rounded-full bg-emerald-400"></span>
              LIVE PROBE LOG
            </div>
            <span class="font-mono text-[10px] text-slate-500">{{ probeLogs.length }} records</span>
          </div>

          <div class="h-[420px] overflow-y-auto px-4 py-3 font-mono text-[11px] leading-6">
            @for (entry of probeLogs; track entry.id) {
              <div class="grid grid-cols-[70px_58px_minmax(0,1fr)] gap-3 border-b border-white/5 py-1 last:border-0">
                <span class="text-slate-600">{{ formatLogTime(entry.timestamp) }}</span>
                <span
                  [class]="entry.status === 'ONLINE' ? 'text-emerald-400' : entry.status === 'OFFLINE' ? 'text-rose-400' : 'text-amber-400'">
                  {{ entry.status }}
                </span>
                <span class="min-w-0 break-words text-slate-300">
                  {{ entry.message }}
                  @if (entry.latencyMs !== null) {
                    <span class="text-sky-400"> latency={{ entry.latencyMs }}ms</span>
                  }
                  @if (entry.bandwidthMbps !== null) {
                    <span class="text-violet-400"> downlink={{ entry.bandwidthMbps }}Mbps</span>
                  }
                </span>
              </div>
            } @empty {
              <div class="flex h-full items-center justify-center text-slate-600">Waiting for first network probe...</div>
            }
          </div>
        </div>

        <div class="overflow-hidden rounded-lg border border-border bg-card">
          <div class="border-b border-border px-4 py-3">
            <p class="font-mono text-xs font-semibold text-foreground">LATENCY HISTORY</p>
            <p class="mt-0.5 font-mono text-[10px] text-muted-foreground">Last {{ latencyHistory.length }} successful probes</p>
          </div>

          <div class="p-4">
            <div class="flex h-36 items-end gap-1 border-b border-border pb-2">
              @for (value of latencyChart; track $index) {
                <div
                  class="min-w-1 flex-1 transition-[height] duration-300"
                  [class]="value === null ? 'bg-transparent' : 'bg-primary/70'"
                  [style.height.%]="value === null ? 0 : latencyHeight(value)"
                  [title]="value === null ? '' : value + ' ms'"></div>
              }
            </div>

            <dl class="mt-4 space-y-3 font-mono text-[11px]">
              <div class="flex items-center justify-between">
                <dt class="text-muted-foreground">Minimum</dt>
                <dd class="font-semibold text-foreground">{{ minLatency }} ms</dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-muted-foreground">Average</dt>
                <dd class="font-semibold text-foreground">{{ averageLatency }} ms</dd>
              </div>
              <div class="flex items-center justify-between">
                <dt class="text-muted-foreground">Maximum</dt>
                <dd class="font-semibold text-foreground">{{ maxLatency }} ms</dd>
              </div>
              <div class="flex items-center justify-between border-t border-border pt-3">
                <dt class="text-muted-foreground">Data saver</dt>
                <dd class="font-semibold text-foreground">{{ saveData ? 'ENABLED' : 'OFF' }}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section class="overflow-hidden rounded-lg border border-border bg-card">
        <div class="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p class="font-mono text-xs font-semibold text-foreground">API ACCESS LOG</p>
            <p class="mt-0.5 font-mono text-[10px] text-muted-foreground">Latest admin gateway activity</p>
          </div>
          <span class="font-mono text-[10px] text-muted-foreground">
            {{ auditRangeStart }}-{{ auditRangeEnd }} of {{ auditTotal }} entries
          </span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full min-w-[720px] text-left font-mono text-[11px]">
            <thead class="bg-muted/50 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th class="px-4 py-2.5 font-medium">Time</th>
                <th class="px-4 py-2.5 font-medium">Method</th>
                <th class="px-4 py-2.5 font-medium">Request</th>
                <th class="px-4 py-2.5 font-medium">Resource</th>
                <th class="px-4 py-2.5 font-medium">Source IP</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border/60">
              @for (log of auditLogs; track log.id) {
                <tr class="hover:bg-muted/25">
                  <td class="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{{ formatLogTime(log.created_at) }}</td>
                  <td class="px-4 py-2.5">
                    <span [class]="methodClass(log.action)">{{ getMethod(log.action) }}</span>
                  </td>
                  <td class="max-w-[360px] truncate px-4 py-2.5 text-foreground" [title]="log.action">{{ log.action }}</td>
                  <td class="px-4 py-2.5 text-muted-foreground">{{ log.resource_type || 'system' }}</td>
                  <td class="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{{ firstIp(log.ip_address) }}</td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5" class="px-4 py-10 text-center text-muted-foreground">No audit activity available</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-between gap-3 border-t border-border px-4 py-3 font-mono text-[10px]">
          <span class="text-muted-foreground">PAGE {{ auditPage }} / {{ auditTotalPages }}</span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="border-border bg-card text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 inline-flex h-8 items-center gap-1.5 rounded border px-3 transition-colors"
              [disabled]="auditPage <= 1 || auditLoading"
              (click)="changeAuditPage(auditPage - 1)">
              <span aria-hidden="true">&larr;</span>
              Previous
            </button>
            <button
              type="button"
              class="border-border bg-card text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 inline-flex h-8 items-center gap-1.5 rounded border px-3 transition-colors"
              [disabled]="auditPage >= auditTotalPages || auditLoading"
              (click)="changeAuditPage(auditPage + 1)">
              Next
              <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewComponent implements OnInit, OnDestroy {
  private admin = inject(AdminService);
  private cdr = inject(ChangeDetectorRef);
  private readonly sessionStartedAt = Date.now();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private probeSequence = 0;

  loading = false;
  networkStatus: 'ONLINE' | 'OFFLINE' = navigator.onLine ? 'ONLINE' : 'OFFLINE';
  latencyMs: number | null = null;
  bandwidthMbps: number | null = null;
  browserRtt: number | null = null;
  connectionType = 'UNKNOWN';
  saveData = false;
  currentTime = new Date();
  sessionUptime = '00:00:00';
  latencyHistory: number[] = [];
  probeLogs: ProbeLog[] = [];
  auditLogs: AuditLog[] = [];
  auditPage = 1;
  auditTotal = 0;
  auditLoading = false;
  readonly auditPageSize = 10;

  private readonly handleOnline = () => {
    this.networkStatus = 'ONLINE';
    void this.load();
  };

  private readonly handleOffline = () => {
    this.networkStatus = 'OFFLINE';
    this.latencyMs = null;
    this.appendProbe('OFFLINE', null, 'Browser reported no internet connection');
    this.cdr.markForCheck();
  };

  private readonly handleConnectionChange = () => {
    this.readBrowserNetworkInfo();
    this.cdr.markForCheck();
  };

  ngOnInit() {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    this.getConnection()?.addEventListener('change', this.handleConnectionChange);
    this.readBrowserNetworkInfo();
    void this.load();

    this.refreshTimer = setInterval(() => void this.load(), 10_000);
    this.clockTimer = setInterval(() => {
      this.currentTime = new Date();
      this.sessionUptime = this.formatDuration(Date.now() - this.sessionStartedAt);
      this.cdr.markForCheck();
    }, 1_000);
  }

  ngOnDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.clockTimer) clearInterval(this.clockTimer);
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.getConnection()?.removeEventListener('change', this.handleConnectionChange);
  }

  async load() {
    if (this.loading) return;
    this.loading = true;
    this.readBrowserNetworkInfo();

    const auditPromise = this.fetchAuditPage(this.auditPage);

    try {
      if (!navigator.onLine) throw new Error('Browser is offline');
      const result = await this.admin.probeConnection();
      this.networkStatus = 'ONLINE';
      this.latencyMs = result.latencyMs;
      this.latencyHistory = [...this.latencyHistory, result.latencyMs].slice(-30);
      this.appendProbe('ONLINE', result.latencyMs, 'Health endpoint responded successfully', result.checkedAt);
    } catch (error) {
      this.networkStatus = 'OFFLINE';
      this.latencyMs = null;
      this.appendProbe('ERROR', null, error instanceof Error ? error.message : 'Network probe failed');
    }

    await auditPromise;
    this.loading = false;
    this.cdr.markForCheck();
  }

  get auditTotalPages(): number {
    return Math.max(1, Math.ceil(this.auditTotal / this.auditPageSize));
  }

  get auditRangeStart(): number {
    return this.auditTotal === 0 ? 0 : (this.auditPage - 1) * this.auditPageSize + 1;
  }

  get auditRangeEnd(): number {
    return this.auditTotal === 0 ? 0 : Math.min(this.auditPage * this.auditPageSize, this.auditTotal);
  }

  async changeAuditPage(page: number) {
    if (page < 1 || page > this.auditTotalPages || page === this.auditPage || this.auditLoading) return;
    await this.fetchAuditPage(page);
    this.cdr.markForCheck();
  }

  get qualityLabel(): string {
    if (this.latencyMs === null) return 'NO SIGNAL';
    if (this.latencyMs <= 80) return 'EXCELLENT';
    if (this.latencyMs <= 180) return 'STABLE';
    if (this.latencyMs <= 350) return 'SLOW';
    return 'CRITICAL';
  }

  get qualityClass(): string {
    if (this.latencyMs === null || this.latencyMs > 350) return 'text-rose-500';
    if (this.latencyMs > 180) return 'text-amber-500';
    return 'text-emerald-500';
  }

  get minLatency(): number | string {
    return this.latencyHistory.length ? Math.min(...this.latencyHistory) : '--';
  }

  get maxLatency(): number | string {
    return this.latencyHistory.length ? Math.max(...this.latencyHistory) : '--';
  }

  get averageLatency(): number | string {
    if (!this.latencyHistory.length) return '--';
    return Math.round(this.latencyHistory.reduce((sum, value) => sum + value, 0) / this.latencyHistory.length);
  }

  get latencyChart(): Array<number | null> {
    return [...Array<null>(30 - this.latencyHistory.length).fill(null), ...this.latencyHistory];
  }

  latencyHeight(value: number): number {
    const max = Math.max(...this.latencyHistory, 1);
    return Math.max(8, Math.round((value / max) * 100));
  }

  getMethod(action: string): string {
    return action.match(/^(GET|POST|PATCH|PUT|DELETE)/i)?.[1]?.toUpperCase() ?? 'EVENT';
  }

  methodClass(action: string): string {
    const method = this.getMethod(action);
    if (method === 'GET') return 'text-sky-600 dark:text-sky-400';
    if (method === 'POST') return 'text-emerald-600 dark:text-emerald-400';
    if (method === 'DELETE') return 'text-rose-600 dark:text-rose-400';
    if (method === 'PATCH' || method === 'PUT') return 'text-amber-600 dark:text-amber-400';
    return 'text-muted-foreground';
  }

  firstIp(value?: string): string {
    return value?.split(',')[0]?.trim() || '--';
  }

  formatClock(value: Date): string {
    return value.toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  formatLogTime(value: string): string {
    return new Date(value).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  private appendProbe(
    status: ProbeLog['status'],
    latencyMs: number | null,
    message: string,
    timestamp = new Date().toISOString(),
  ) {
    this.probeLogs = [
      {
        id: ++this.probeSequence,
        timestamp,
        status,
        latencyMs,
        bandwidthMbps: this.bandwidthMbps,
        message,
      },
      ...this.probeLogs,
    ].slice(0, 60);
  }

  private async fetchAuditPage(page: number) {
    if (this.auditLoading) return;
    this.auditLoading = true;
    try {
      const result = await this.admin.getPaginated<AuditLog>(
        'audit_log',
        'order=created_at.desc',
        page,
        this.auditPageSize,
      );
      this.auditLogs = result.data.slice(0, this.auditPageSize);
      this.auditTotal = result.total;
      this.auditPage = Math.min(page, Math.max(1, Math.ceil(result.total / this.auditPageSize)));
    } catch {
      // Keep the current page visible when the audit endpoint is temporarily unavailable.
    } finally {
      this.auditLoading = false;
    }
  }

  private readBrowserNetworkInfo() {
    const connection = this.getConnection();
    this.bandwidthMbps = typeof connection?.downlink === 'number' ? connection.downlink : null;
    this.browserRtt = typeof connection?.rtt === 'number' ? connection.rtt : null;
    this.connectionType = connection?.effectiveType?.toUpperCase() || (navigator.onLine ? 'ONLINE' : 'OFFLINE');
    this.saveData = Boolean(connection?.saveData);
  }

  private getConnection(): NetworkInformationLike | undefined {
    return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  }

  private formatDuration(durationMs: number): string {
    const totalSeconds = Math.floor(durationMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
  }
}
