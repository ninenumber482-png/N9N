import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { RouterLink } from '@angular/router';
import { AdminService } from 'src/app/core/services/admin.service';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { LoadingErrorComponent } from 'src/app/shared/components/loading-error/loading-error.component';
import { RefreshButtonComponent } from 'src/app/shared/components/refresh-button/refresh-button.component';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, AngularSvgIconModule, RouterLink, WibDatePipe, PageHeaderComponent, LoadingErrorComponent, RefreshButtonComponent],
  template: `
    <div data-page="overview" class="space-y-6">
      <app-page-header icon="chart-pie" title="System Overview" [subtitle]="'Console · ' + (lastUpdated ? (lastUpdated | wibDate: 'short') : 'Loading...')">
        <app-refresh-button [loading]="loading" (clicked)="load()" />
      </app-page-header>

      <app-loading-error [loading]="loading && !stats.totalUsers" [error]="error" (retry)="load()" />

      @if (!loading || stats.totalUsers) {
        @if (!error) {
          <!-- ─── KEY METRICS BAR ─── -->
          <div class="bg-card border-border rounded-lg page-accent-card">
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              <a
                routerLink="/users"
                class="border-border group border-r border-b lg:border-b-0 p-3.5 hover:bg-accent/30 transition-colors">
                <p class="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">Registered Users</p>
                <p class="mt-1 text-lg font-bold text-foreground">{{ formatNum(stats.totalUsers) }}</p>
                <p class="text-[10px] text-muted-foreground/70 mt-0.5">
                  <span [class]="regGrowth >= 0 ? 'text-foreground' : 'text-muted-foreground'"
                    >{{ regGrowth >= 0 ? '+' : '' }}{{ formatNum(regGrowth) }}</span
                  >
                  today — {{ formatNum(todayRegs) }} new
                </p>
              </a>
              <a
                routerLink="/users"
                class="border-border group border-r border-b lg:border-b-0 p-3.5 hover:bg-accent/30 transition-colors">
                <p class="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">Active / Online</p>
                <p class="mt-1 text-lg font-bold text-foreground">{{ formatNum(health.activeUsers) }}</p>
                <p class="text-[10px] text-muted-foreground/70 mt-0.5">{{ health.onlineNow }} online now</p>
              </a>
              <a
                routerLink="/transactions"
                class="border-border group border-r border-b lg:border-b-0 p-3.5 hover:bg-accent/30 transition-colors">
                <p class="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">Today Volume</p>
                <p class="mt-1 text-lg font-bold text-foreground">
                  {{ formatMoney(volume.deposits + volume.withdrawals) }}
                </p>
                <p class="text-[10px] text-muted-foreground/70 mt-0.5">
                  Deposit {{ formatMoney(volume.deposits) }} · WD {{ formatMoney(volume.withdrawals) }}
                </p>
              </a>
              <a
                routerLink="/wallet"
                class="border-border group border-r border-b lg:border-b-0 sm:border-b-0 p-3.5 hover:bg-accent/30 transition-colors">
                <p class="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">Wallet Total</p>
                <p class="mt-1 text-lg font-bold text-foreground">
                  {{ formatMoney(health.totalBalance.main + health.totalBalance.bonus) }}
                </p>
                <p class="text-[10px] text-muted-foreground/70 mt-0.5">
                  Main {{ formatMoney(health.totalBalance.main) }} · Bonus {{ formatMoney(health.totalBalance.bonus) }}
                </p>
              </a>
              <a
                routerLink="/bets"
                class="border-border group border-r border-b sm:border-b-0 lg:border-b-0 p-3.5 hover:bg-accent/30 transition-colors">
                <p class="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">Pending Bets</p>
                <p class="mt-1 text-lg font-bold text-foreground">{{ formatNum(stats.pendingBets) }}</p>
                <p class="text-[10px] text-muted-foreground/70 mt-0.5">
                  {{ stats.pendingBets > 0 ? 'Needs settlement' : 'All settled' }}
                </p>
              </a>
              <a routerLink="/kyc" class="border-border group p-3.5 hover:bg-accent/30 transition-colors">
                <p class="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">Pending KYC</p>
                <p class="mt-1 text-lg font-bold text-foreground">{{ formatNum(health.pendingCount) }}</p>
                <p class="text-[10px] text-muted-foreground/70 mt-0.5">
                  {{ health.pendingCount > 0 ? 'Needs review' : 'All verified' }}
                </p>
              </a>
            </div>
          </div>

          <!-- ─── CONSOLE ROW ─── -->
          <div class="grid gap-5 lg:grid-cols-3">
            <!-- 7-Day Growth -->
            <div class="bg-card border-border rounded-lg border">
              <div class="border-border flex items-center justify-between border-b px-4 py-2.5">
                <h3 class="text-xs font-semibold text-foreground">User Growth (7d)</h3>
                <span class="text-[10px] text-muted-foreground">{{ formatNum(weekTotal) }} total</span>
              </div>
              <div class="p-4">
                @if (growthData.length === 7) {
                  <div class="flex items-end gap-1 h-20">
                    @for (d of growthData; track d.date) {
                      @let pct = maxGrowth > 0 ? d.count / maxGrowth : 0;
                      <div class="flex-1 flex flex-col items-center gap-1 justify-end h-full">
                        <div
                          class="w-full rounded-sm"
                          [class]="d.count > 0 ? 'bg-foreground/80' : 'bg-border'"
                          [style.height.%]="Math.max(pct * 100, d.count > 0 ? 30 : 4)"></div>
                        <span class="text-[8px] text-muted-foreground/50">{{ d.date.slice(5) }}</span>
                      </div>
                    }
                  </div>
                  <div class="text-[10px] text-muted-foreground/60 mt-3 text-center">
                    {{ Math.round(weekTotal / 7) }}/day avg
                  </div>
                }
              </div>
            </div>

            <!-- Volume Breakdown -->
            <div class="bg-card border-border rounded-lg border">
              <div class="border-border flex items-center justify-between border-b px-4 py-2.5">
                <h3 class="text-xs font-semibold text-foreground">Volume Today</h3>
                <span class="text-[10px] text-muted-foreground"
                  >{{ formatMoney(volume.deposits + volume.withdrawals) }} total</span
                >
              </div>
              <div class="p-4 space-y-3">
                <div>
                  <div class="flex justify-between text-xs mb-1">
                    <span class="text-muted-foreground">Deposits</span>
                    <span class="text-foreground font-medium">{{ formatMoney(volume.deposits) }}</span>
                  </div>
                  <div class="h-1.5 bg-border rounded-full overflow-hidden">
                    @let depPct = totalVol > 0 ? (volume.deposits / totalVol) * 100 : 0;
                    <div class="h-full bg-foreground/60 rounded-full" [style.width.%]="depPct"></div>
                  </div>
                </div>
                <div>
                  <div class="flex justify-between text-xs mb-1">
                    <span class="text-muted-foreground">Withdrawals</span>
                    <span class="text-foreground font-medium">{{ formatMoney(volume.withdrawals) }}</span>
                  </div>
                  <div class="h-1.5 bg-border rounded-full overflow-hidden">
                    @let wdPct = totalVol > 0 ? (volume.withdrawals / totalVol) * 100 : 0;
                    <div class="h-full bg-foreground/30 rounded-full" [style.width.%]="wdPct"></div>
                  </div>
                </div>
                <div class="border-border flex justify-between border-t pt-2.5 text-xs">
                  <span class="text-muted-foreground">Net Flow</span>
                  @let net = volume.deposits - volume.withdrawals;
                  <span class="font-medium" [class]="net >= 0 ? 'text-foreground' : 'text-muted-foreground'"
                    >{{ net >= 0 ? '+' : '' }}{{ formatMoney(net) }}</span
                  >
                </div>
              </div>
            </div>

            <!-- Pending Queue -->
            <div class="bg-card border-border rounded-lg border">
              <div class="border-border flex items-center justify-between border-b px-4 py-2.5">
                <h3 class="text-xs font-semibold text-foreground">Pending Queue</h3>
                <span class="text-[10px] text-muted-foreground"
                  >{{ pendingDeposits + pendingWithdrawals + health.pendingCount + stats.pendingBets }} items</span
                >
              </div>
              <div class="divide-border divide-y text-xs">
                <a
                  routerLink="/deposits"
                  class="flex items-center justify-between px-4 py-2.5 hover:bg-accent/30 transition-colors">
                  <span class="text-muted-foreground">Deposit Approvals</span>
                  <span class="text-foreground font-medium">{{ pendingDeposits }}</span>
                </a>
                <a
                  routerLink="/withdrawals"
                  class="flex items-center justify-between px-4 py-2.5 hover:bg-accent/30 transition-colors">
                  <span class="text-muted-foreground">Withdrawal Approvals</span>
                  <span class="text-foreground font-medium">{{ pendingWithdrawals }}</span>
                </a>
                <a
                  routerLink="/kyc"
                  class="flex items-center justify-between px-4 py-2.5 hover:bg-accent/30 transition-colors">
                  <span class="text-muted-foreground">KYC Reviews</span>
                  <span class="text-foreground font-medium">{{ health.pendingCount }}</span>
                </a>
                <a
                  routerLink="/bets"
                  class="flex items-center justify-between px-4 py-2.5 hover:bg-accent/30 transition-colors">
                  <span class="text-muted-foreground">Unsettled Bets</span>
                  <span class="text-foreground font-medium">{{ stats.pendingBets }}</span>
                </a>
              </div>
            </div>
          </div>

          <!-- ─── BOTTOM ROW ─── -->
          <div class="grid gap-5 lg:grid-cols-2">
            <!-- Recent Activity -->
            <div class="bg-card border-border rounded-lg border">
              <div class="border-border flex items-center justify-between border-b px-4 py-2.5">
                <h3 class="text-xs font-semibold text-foreground">Recent Activity</h3>
                <a routerLink="/audit" class="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  >View all →</a
                >
              </div>
              <div class="divide-border divide-y">
                @for (log of recentLogs; track log.id) {
                  <div class="flex items-start gap-2.5 px-4 py-2.5">
                    <div class="bg-accent/50 mt-0.5 rounded p-1">
                      <svg-icon
                        src="assets/icons/heroicons/outline/cursor-click.svg"
                        svgClass="h-2.5 w-2.5 text-muted-foreground"></svg-icon>
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-xs text-foreground">{{ log.action }}</p>
                      <div class="flex gap-2 text-[10px] text-muted-foreground/60 mt-0.5">
                        <span>{{ log.resource_type }}</span>
                        @if (log.resource_id) {
                          <span>· {{ log.resource_id.slice(0, 8) }}</span>
                        }
                        <span>· {{ log.created_at | wibDate: 'short' }}</span>
                      </div>
                    </div>
                  </div>
                } @empty {
                  <p class="text-muted-foreground text-xs text-center py-6">No recent activity</p>
                }
              </div>
            </div>

            <!-- Quick Actions -->
            <div class="bg-card border-border rounded-lg border">
              <div class="border-border flex items-center justify-between border-b px-4 py-2.5">
                <h3 class="text-xs font-semibold text-foreground">Quick Actions</h3>
              </div>
              <div class="grid grid-cols-4 gap-px bg-border">
                @for (action of quickActions; track action.label) {
                  <a
                    [routerLink]="action.route"
                    class="bg-card flex flex-col items-center gap-1.5 px-2 py-3.5 hover:bg-accent/30 transition-colors">
                    <svg-icon [src]="action.icon" svgClass="h-4 w-4 text-muted-foreground"></svg-icon>
                    <span class="text-[10px] text-muted-foreground font-medium">{{ action.label }}</span>
                  </a>
                }
              </div>
            </div>
          </div>
        }
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewComponent implements OnInit, OnDestroy {
  private admin = inject(AdminService);
  private cdr = inject(ChangeDetectorRef);

  Math = Math;
  stats = { totalUsers: 0, totalTransactions: 0, pendingBets: 0, pendingKyc: 0 };
  pendingDeposits = 0;
  pendingWithdrawals = 0;
  recentLogs: { id: string; action: string; admin_id?: string; resource_type?: string; resource_id?: string; created_at: string; ip_address?: string }[] = [];
  loading = true;
  error: string | null = null;
  lastUpdated: string | null = null;

  todayRegs = 0;
  yesterdayRegs = 0;
  regGrowth = 0;
  volume = { deposits: 0, withdrawals: 0 };
  health = { activeUsers: 0, onlineNow: 0, totalBalance: { main: 0, bonus: 0 }, pendingCount: 0 };
  growthData: { date: string; count: number }[] = [];
  weekTotal = 0;
  totalVol = 0;

  quickActions = [
    { label: 'Users', route: '/users', icon: 'assets/icons/heroicons/outline/users.svg' },
    { label: 'Deposits', route: '/deposits', icon: 'assets/icons/heroicons/outline/arrow-sm-down.svg' },
    { label: 'WD', route: '/withdrawals', icon: 'assets/icons/heroicons/outline/arrow-sm-up.svg' },
    { label: 'Bets', route: '/bets', icon: 'assets/icons/heroicons/outline/trending-up.svg' },
    { label: 'KYC', route: '/kyc', icon: 'assets/icons/heroicons/outline/identification.svg' },
    { label: '3D King', route: '/3dking', icon: 'assets/icons/heroicons/outline/view-grid.svg' },
    { label: 'CS', route: '/cs-contact', icon: 'assets/icons/heroicons/outline/phone.svg' },
    { label: 'Wallet', route: '/wallet', icon: 'assets/icons/heroicons/outline/currency-dollar.svg' },
  ];

  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    this.load();
    this.refreshTimer = setInterval(() => this.load(), 30_000);
  }
  ngOnDestroy() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  get maxGrowth() {
    return Math.max(...this.growthData.map((d) => d.count), 1);
  }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);
      const [s, l, pd, pw, tr, yr, v, h, g] = await Promise.all([
        safe(this.admin.getDashboardStats(), { totalUsers: 0, totalTransactions: 0, pendingBets: 0, pendingKyc: 0 }),
        safe(this.admin.getAuditLogs(5), []),
        safe(this.admin.countPending('DEPOSIT'), 0),
        safe(this.admin.countPending('WITHDRAWAL'), 0),
        safe(this.admin.getTodayRegistrations(), 0),
        safe(this.admin.getYesterdayRegistrations(), 0),
        safe(this.admin.getTodayVolume(), { deposits: 0, withdrawals: 0 }),
        safe(this.admin.getPlatformHealth(), { activeUsers: 0, onlineNow: 0, totalBalance: { main: 0, bonus: 0 }, pendingCount: 0 }),
        safe(this.admin.getWeeklyUserGrowth(), []),
      ]);
      this.stats = s;
      this.recentLogs = l;
      this.pendingDeposits = pd;
      this.pendingWithdrawals = pw;
      this.todayRegs = tr;
      this.yesterdayRegs = yr;
      this.regGrowth = tr - yr;
      this.volume = v;
      this.health = h;
      this.growthData = g;
      this.weekTotal = g.reduce((sum, d) => sum + d.count, 0);
      this.totalVol = v.deposits + v.withdrawals;
      this.lastUpdated = new Date().toISOString();
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Could not load overview';
    }
    this.loading = false;
    this.cdr.markForCheck();
  }

  formatNum(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toLocaleString('id-ID');
  }

  formatMoney(n: number): string {
    if (!n) return 'Rp 0';
    if (n >= 1_000_000) return 'Rp ' + (n / 1_000_000).toFixed(1) + 'jt';
    if (n >= 1_000) return 'Rp ' + (n / 1_000).toFixed(0) + 'rb';
    return 'Rp ' + n.toLocaleString('id-ID');
  }

  formatNumShort(n: number): string {
    if (!n) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  }
}
