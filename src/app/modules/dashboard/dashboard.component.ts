import { ChangeDetectionStrategy, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RouterOutlet, RouterLink, Router } from '@angular/router';
import { RealtimeService } from 'src/app/core/services/realtime.service';
import { HealthChimeService } from 'src/app/core/services/health-chime.service';

const PAGE_ORDER = [
  // Dashboard
  { route: '/overview', label: 'Overview' },
  { route: '/users', label: 'Management Member' },
  // Finance
  { route: '/deposits', label: 'Deposit' },
  { route: '/withdrawals', label: 'Withdraw' },
  { route: '/turnover', label: 'Turnover' },
  { route: '/manual', label: 'Saldo Manual' },
  { route: '/transactions', label: 'Transactions' },
  { route: '/wallets', label: 'Wallets' },
  // Marketplace
  { route: '/3dking', label: '3D King Engine' },
  { route: '/bets', label: 'Bet History' },
  { route: '/session-monitor', label: 'Session Monitor' },
  { route: '/gaming', label: 'Gaming Overview' },
  // Members
  { route: '/kyc', label: 'KYC Verification' },
  { route: '/referrals', label: 'Referrals' },
  // Compliance
  { route: '/audit', label: 'Audit Log' },
  { route: '/security-center', label: 'Security Center' },
  { route: '/risk-management', label: 'Risk Management' },
  { route: '/ip-whitelist', label: 'IP Whitelist' },
  // Settings
  { route: '/system', label: 'Configuration' },
  { route: '/role-management', label: 'Role Management' },
  { route: '/popup-banner', label: 'Popup Banners' },
  { route: '/cs-contact', label: 'CS Contact' },
];

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <div class="bg-background">
      <router-outlet />
      <div class="mx-auto max-w-7xl px-0 pb-2 pt-6">
        <nav class="border-border flex items-center justify-between border-t pt-6">
          <div>
            @if (prev) {
              <a
                [routerLink]="prev.route"
                class="group flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-xs font-semibold text-foreground hover:border-primary/30 hover:text-primary transition-colors">
                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
                <div class="text-left">
                  <p class="text-[11px] text-muted-foreground group-hover:text-primary/70">Previous</p>
                  <p class="text-xs font-bold">{{ prev.label }}</p>
                </div>
              </a>
            }
          </div>
          <div class="text-muted-foreground text-xs font-semibold uppercase tracking-wider text-center px-2">
            {{ current.label }}
          </div>
          <div>
            @if (next) {
              <a
                [routerLink]="next.route"
                class="group flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-xs font-semibold text-foreground hover:border-primary/30 hover:text-primary transition-colors">
                <div class="text-right">
                  <p class="text-[11px] text-muted-foreground group-hover:text-primary/70">Next</p>
                  <p class="text-xs font-bold">{{ next.label }}</p>
                </div>
                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </a>
            }
          </div>
        </nav>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private realtime = inject(RealtimeService);
  private healthChime = inject(HealthChimeService);

  pages = PAGE_ORDER;

  ngOnInit() {
    // Global realtime subscriptions for toast notifications
    // These run regardless of which page the admin is on
    this.realtime.subscribeTransactions();
    this.realtime.subscribeKyc();
    this.realtime.subscribeBets();
    this.realtime.subscribeEngineStatus();
    // Global health-heartbeat chime (boarding-call) — persists across navigation
    this.healthChime.start();
    // Welcome chime on entering the dashboard (after login)
    void this.healthChime.greet();
  }

  ngOnDestroy() {
    this.realtime.unsubscribeTransactions();
    this.realtime.unsubscribeKyc();
    this.realtime.unsubscribeBets();
    this.realtime.unsubscribeEngineStatus();
  }

  get current() {
    const path = this.router.url.split('?')[0];
    const normalizedPath = path.replace(/\/+$/, '') || '/';
    const idx = this.pages.findIndex((p) => {
      const normalizedRoute = p.route.replace(/\/+$/, '') || '/';
      return normalizedPath === normalizedRoute || normalizedPath.endsWith(normalizedRoute);
    });
    return idx >= 0 ? this.pages[idx] : this.pages[0];
  }

  get prev() {
    const path = this.router.url.split('?')[0];
    const normalizedPath = path.replace(/\/+$/, '') || '/';
    const idx = this.pages.findIndex((p) => {
      const normalizedRoute = p.route.replace(/\/+$/, '') || '/';
      return normalizedPath === normalizedRoute || normalizedPath.endsWith(normalizedRoute);
    });
    return idx > 0 ? this.pages[idx - 1] : null;
  }

  get next() {
    const path = this.router.url.split('?')[0];
    const normalizedPath = path.replace(/\/+$/, '') || '/';
    const idx = this.pages.findIndex((p) => {
      const normalizedRoute = p.route.replace(/\/+$/, '') || '/';
      return normalizedPath === normalizedRoute || normalizedPath.endsWith(normalizedRoute);
    });
    return idx >= 0 && idx < this.pages.length - 1 ? this.pages[idx + 1] : null;
  }
}
