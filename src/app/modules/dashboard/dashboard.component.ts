import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, RouterLink, Router } from '@angular/router';
import { RealtimeService } from '../../core/services/realtime.service';

const PAGE_ORDER = [
  { route: '/overview', label: 'Overview' },
  { route: '/gaming', label: 'Gaming' },
  { route: '/users', label: 'Users' },
  { route: '/transactions', label: 'Transactions' },
  { route: '/wallet', label: 'Wallet' },
  { route: '/wallets', label: 'Wallets' },
  { route: '/bets', label: 'Bets' },
  { route: '/kyc', label: 'KYC' },
  { route: '/audit', label: 'Audit' },
  { route: '/referrals', label: 'Referrals' },
  { route: '/3dking', label: '3D King' },
  { route: '/cs-contact', label: 'CS Contact' },
  { route: '/session-monitor', label: 'Session Monitor' },
  { route: '/security-center', label: 'Security Center' },
  { route: '/risk-management', label: 'Risk Management' },
  { route: '/system', label: 'System' },
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
                <a [routerLink]="prev.route" class="group flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground hover:border-primary/30 hover:text-primary transition-colors">
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                  </svg>
                  <div class="text-left">
                    <p class="text-[10px] text-muted-foreground group-hover:text-primary/70">Previous</p>
                    <p class="text-xs font-bold">{{ prev.label }}</p>
                  </div>
                </a>
              }
            </div>
            <div class="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider text-center px-2">
              {{ current.label }}
            </div>
            <div>
              @if (next) {
                <a [routerLink]="next.route" class="group flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground hover:border-primary/30 hover:text-primary transition-colors">
                  <div class="text-right">
                    <p class="text-[10px] text-muted-foreground group-hover:text-primary/70">Next</p>
                    <p class="text-xs font-bold">{{ next.label }}</p>
                  </div>
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                  </svg>
                </a>
              }
            </div>
          </nav>
        </div>
      </div>
    </div>
  `,
})
export class DashboardComponent implements OnInit, OnDestroy {
  pages = PAGE_ORDER;

  constructor(private router: Router, private realtime: RealtimeService) {}

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
    const idx = this.pages.findIndex(p => path.endsWith(p.route));
    return idx >= 0 ? this.pages[idx] : this.pages[0];
  }

  get prev() {
    const path = this.router.url.split('?')[0];
    const idx = this.pages.findIndex(p => path.endsWith(p.route));
    return idx > 0 ? this.pages[idx - 1] : null;
  }

  get next() {
    const path = this.router.url.split('?')[0];
    const idx = this.pages.findIndex(p => path.endsWith(p.route));
    return idx >= 0 && idx < this.pages.length - 1 ? this.pages[idx + 1] : null;
  }
}
