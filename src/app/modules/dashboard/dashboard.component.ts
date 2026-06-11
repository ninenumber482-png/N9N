import { ChangeDetectionStrategy, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RouterOutlet, RouterLink, Router } from '@angular/router';
import { RealtimeService } from 'src/app/core/services/realtime.service';

const PAGE_ORDER = [
  // Dashboard
  { route: '/overview', label: 'Overview' },
  { route: '/users', label: 'Members' },
  // Finance
  { route: '/wallet', label: 'Deposits & Withdrawals' },
  { route: '/transactions', label: 'Transactions' },
  { route: '/wallets', label: 'Wallets' },
  { route: '/member-balance', label: 'Balance Adjustment' },
  { route: '/turnover', label: 'Turnover' },
  // Marketplace
  { route: '/3dking', label: '3D King Engine' },
  { route: '/bets', label: 'Bet History' },
  { route: '/session-monitor', label: 'Session Monitor' },
  { route: '/gaming', label: 'Gaming Overview' },
  // Members
  { route: '/kyc', label: 'KYC Verification' },
  { route: '/referrals', label: 'Referrals' },
  { route: '/member-password', label: 'Password Reset' },
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
    <div class="min-h-screen bg-background">
      <router-outlet />
      <div class="px-4 sm:px-6 lg:px-8 pb-6">
        <div class="mx-auto max-w-7xl">
          <nav class="flex items-center justify-between pt-6 mt-6 border-t border-border">
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
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private realtime = inject(RealtimeService);

  pages = PAGE_ORDER;

  ngOnInit() {
    // Global realtime subscriptions for toast notifications
    // These run regardless of which page the admin is on
    this.realtime.subscribeTransactions();
    this.realtime.subscribeKyc();
    this.realtime.subscribeBets();
    this.realtime.subscribeEngineStatus();
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
