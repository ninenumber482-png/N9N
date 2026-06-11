import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from 'src/app/core/services/admin.service';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { PaginatorModule } from 'primeng/paginator';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { LoadingErrorComponent } from 'src/app/shared/components/loading-error/loading-error.component';
import { RefreshButtonComponent } from 'src/app/shared/components/refresh-button/refresh-button.component';
import { StatCardComponent } from 'src/app/shared/components/stat-card/stat-card.component';
import { PaginationHelper } from 'src/app/shared/utils/pagination.helper';

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
    SelectModule, TagModule, PaginatorModule,
    PageHeaderComponent, LoadingErrorComponent, RefreshButtonComponent, StatCardComponent],
  template: `
    <div data-page="risk-management" class="space-y-6">
      <app-page-header icon="exclamation-triangle" title="Risk Management" subtitle="User risk scoring and anomaly detection">
        <div class="flex gap-2">
          <p-select
            [(ngModel)]="filter"
            [options]="filterOptions"
            optionLabel="label"
            optionValue="value"
            class="w-36"
            styleClass="!text-xs !w-full" />
          <app-refresh-button [loading]="loading" (clicked)="load()" />
        </div>
      </app-page-header>

      <app-loading-error [loading]="loading" [error]="error" (retry)="load()" />

      @if (!loading && !error) {
        <div class="grid gap-4 sm:grid-cols-3">
          <app-stat-card label="High Risk Users" [value]="highRiskCount" />
          <app-stat-card label="Medium Risk Users" [value]="mediumRiskCount" />
          <app-stat-card label="Total Monitored" [value]="riskProfiles.length" />
        </div>

        <div class="bg-card border-border rounded-lg border overflow-x-auto">
          <table class="w-full text-left max-sm:text-xs sm:text-sm">
            <thead>
              <tr
                class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">User</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Risk Score</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Level</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">Turnover</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">Net</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">Flags</th>
              </tr>
            </thead>
            <tbody>
              @for (r of displayProfiles; track r.user_id) {
                <tr class="border-border hover:bg-accent/30 border-b">
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                    <p class="font-semibold text-foreground text-xs">{{ r.username }}</p>
                    <p class="text-[11px] text-muted-foreground">{{ r.display_name }}</p>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                    <div class="flex items-center gap-2">
                      <div class="h-2 w-16 rounded-full bg-accent/40 overflow-hidden">
                        <div class="h-full rounded-full bg-foreground" [style.width.%]="r.score"></div>
                      </div>
                      <span class="font-bold text-foreground">{{ r.score }}</span>
                    </div>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                    <p-tag
                      [value]="r.level"
                      [severity]="r.level === 'HIGH' ? 'danger' : r.level === 'MEDIUM' ? 'warn' : 'success'" />
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-muted-foreground max-sm:hidden">
                    {{ r.turnover | number }}
                  </td>
                  <td
                    class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden"
                    [class.text-foreground]="r.net >= 0"
                    [class.text-muted-foreground]="r.net < 0">
                    {{ r.net | number }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 max-sm:hidden">
                    <div class="flex flex-wrap gap-1">
                      @for (f of r.flags; track f) {
                        <span
                          class="rounded bg-card border-border text-foreground border px-1.5 py-0.5 text-xs font-medium"
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
    const { page, pageSize } = PaginationHelper.onPageChange(event, this.pageSize);
    this.currentPage = page;
    this.pageSize = pageSize;
    this.cdr.markForCheck();
  }
}
