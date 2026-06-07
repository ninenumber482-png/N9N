import { AngularSvgIconModule } from 'angular-svg-icon';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from 'src/app/core/services/admin.service';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { PaginatorModule } from 'primeng/paginator';

interface WalletData {
  user_id?: string;
  total_turnover?: number;
  total_deposited?: number;
  total_withdrawn?: number;
  user?: { username?: string; display_name?: string };
}

interface BetData {
  user_id?: string;
  result?: string;
  created_at?: string;
  stake?: number;
  actual_payout?: number;
  status?: string;
}

interface RiskProfile {
  user_id?: string;
  username?: string;
  display_name?: string;
  score: number;
  level: string;
  turnover: number;
  net: number;
  winRate: number;
  flags: string[];
}

@Component({
  selector: 'app-risk-management',
  standalone: true,
  imports: [CommonModule, FormsModule,
    AngularSvgIconModule, SelectModule, TagModule, PaginatorModule],
  template: `
    <div data-page="risk-management" class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-3">
          <div class="page-header-icon"><svg-icon src="assets/icons/heroicons/outline/exclamation-triangle.svg" svgClass="h-4 w-4"></svg-icon></div>
          <div>
            <h1 class="max-sm:text-lg sm:text-xl font-bold text-foreground tracking-tight">Risk Management</h1>
          <p class="text-muted-foreground mt-0.5 text-xs">User risk scoring and anomaly detection</p>
        </div>
          </div>
        </div><div class="flex gap-2">
          <p-select
            [(ngModel)]="filter"
            [options]="filterOptions"
            optionLabel="label"
            optionValue="value"
            class="w-36"
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
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="bg-card border-border rounded-lg border p-4">
            <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">High Risk Users</p>
            <p class="mt-2 text-2xl font-black text-foreground">{{ highRiskCount }}</p>
          </div>
          <div class="bg-card border-border rounded-lg border p-4">
            <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Medium Risk Users</p>
            <p class="mt-2 text-2xl font-black text-foreground">{{ mediumRiskCount }}</p>
          </div>
          <div class="bg-card border-border rounded-lg border p-4">
            <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Total Monitored</p>
            <p class="mt-2 text-2xl font-black text-foreground">{{ riskProfiles.length }}</p>
          </div>
        </div>

        <div class="bg-card border-border rounded-lg border overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr
                class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">User</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Risk Score</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Level</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">Turnover</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">Net</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">Flags</th>
              </tr>
            </thead>
            <tbody>
              @for (r of displayProfiles; track r.user_id) {
                <tr class="border-border hover:bg-accent/30 border-b">
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p class="font-semibold text-foreground text-xs">{{ r.username }}</p>
                    <p class="text-[10px] text-muted-foreground">{{ r.display_name }}</p>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <div class="flex items-center gap-2">
                      <div class="h-2 w-16 rounded-full bg-accent/40 overflow-hidden">
                        <div class="h-full rounded-full bg-foreground" [style.width.%]="r.score"></div>
                      </div>
                      <span class="font-bold text-foreground">{{ r.score }}</span>
                    </div>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p-tag
                      [value]="r.level"
                      [severity]="r.level === 'HIGH' ? 'danger' : r.level === 'MEDIUM' ? 'warn' : 'success'" />
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground max-sm:hidden">
                    {{ r.turnover | number }}
                  </td>
                  <td
                    class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden"
                    [class.text-foreground]="r.net >= 0"
                    [class.text-muted-foreground]="r.net < 0">
                    {{ r.net | number }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">
                    <div class="flex flex-wrap gap-1">
                      @for (f of r.flags; track f) {
                        <span
                          class="rounded bg-card border-border text-foreground border px-1.5 py-0.5 text-[9px] font-medium"
                          >{{ f }}</span
                        >
                      }
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="text-center py-12 text-muted-foreground">No risk profiles</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p-paginator
          (onPageChange)="onPageChange($event)"
          [first]="(currentPage - 1) * pageSize"
          [rows]="pageSize"
          [totalRecords]="filteredProfiles.length" />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RiskManagementComponent implements OnInit {
  private admin = inject(AdminService);
  private cdr = inject(ChangeDetectorRef);

  riskProfiles: RiskProfile[] = [];
  filter = 'all';
  loading = true;
  error: string | null = null;
  highRiskCount = 0;
  mediumRiskCount = 0;
  currentPage = 1;
  pageSize = 20;

  filterOptions = [
    { label: 'All Users', value: 'all' },
    { label: 'High Risk Only', value: 'high' },
    { label: 'Medium Risk Only', value: 'medium' },
  ];

  get displayProfiles() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredProfiles.slice(start, start + this.pageSize);
  }

  ngOnInit() {
    this.load();
  }

  get filteredProfiles() {
    if (this.filter === 'high') return this.riskProfiles.filter((r: RiskProfile) => r.level === 'HIGH');
    if (this.filter === 'medium') return this.riskProfiles.filter((r: RiskProfile) => r.level === 'MEDIUM');
    return this.riskProfiles;
  }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      const wallets = await this.admin.getWallets() as WalletData[];
      const bets = await this.admin.getBets(1000) as BetData[];

      this.riskProfiles = wallets
        .map((w: WalletData) => {
          const userBets = bets.filter((b: BetData) => b.user_id === w.user_id);
          const winCount = userBets.filter((b: BetData) => b.result === 'WIN').length;
          const totalBets = userBets.length;
          const winRate = totalBets > 0 ? winCount / totalBets : 0;
          const turnover = Number(w.total_turnover || 0);
          const net = Number(w.total_deposited || 0) - Number(w.total_withdrawn || 0);

          let score = 0;
          const flags: string[] = [];
          if (winRate > 0.85) {
            score += 30;
            flags.push('High WR');
          }
          if (net < -5000000) {
            score += 25;
            flags.push('Big Winner');
          }
          if (turnover > 100000000) {
            score += 20;
            flags.push('High Vol');
          }
          if (winRate < 0.15 && totalBets > 20) {
            score += 15;
            flags.push('Low WR');
          }
          if (Math.abs(net) > 50000000) {
            score += 10;
            flags.push('High Net');
          }

          const level = score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';
          return {
            user_id: w.user_id,
            username: w.user?.username || w.user_id?.slice(0, 8),
            display_name: w.user?.display_name,
            score,
            level,
            turnover,
            net,
            winRate,
            flags,
          };
        })
        .sort((a: RiskProfile, b: RiskProfile) => b.score - a.score);

      this.highRiskCount = this.riskProfiles.filter((r: RiskProfile) => r.level === 'HIGH').length;
      this.mediumRiskCount = this.riskProfiles.filter((r: RiskProfile) => r.level === 'MEDIUM').length;
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Could not load risk data';
    }
    this.loading = false;
    this.cdr.markForCheck();
  }

  onPageChange(event: { first?: number; rows?: number }) {
    this.currentPage = Math.floor((event.first ?? 0) / (event.rows ?? this.pageSize)) + 1;
    this.pageSize = event.rows ?? this.pageSize;
    this.cdr.markForCheck();
  }
}
