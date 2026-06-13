import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from 'src/app/core/services/admin.service';
import { PaginatorModule } from 'primeng/paginator';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { LoadingErrorComponent } from 'src/app/shared/components/loading-error/loading-error.component';
import { RefreshButtonComponent } from 'src/app/shared/components/refresh-button/refresh-button.component';
import { StatCardComponent } from 'src/app/shared/components/stat-card/stat-card.component';
import { PaginationHelper } from 'src/app/shared/utils/pagination.helper';
import { FilterBarComponent } from 'src/app/shared/components/filter-bar/filter-bar.component';

interface WalletData {
  user_id: string;
  balance_main: number;
  balance_bonus: number;
  total_deposited: number;
  total_withdrawn: number;
  total_turnover: number;
  locked_remaining: number;
  user?: { username?: string; display_name?: string };
}

@Component({
  selector: 'app-turnover',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    PaginatorModule,
    PageHeaderComponent,
    LoadingErrorComponent,
    RefreshButtonComponent,
    StatCardComponent,
    FilterBarComponent,
  ],
  template: `
    <div data-page="turnover" class="space-y-6">
      <app-page-header
        icon="trending-up"
        title="Turnover Analytics"
        subtitle="User transaction volume and financial performance">
        <app-refresh-button [loading]="loading" (clicked)="load()" />
      </app-page-header>

      <app-filter-bar [search]="search" (searchChange)="onSearchChange($event)" placeholder="Search user..." />

      <app-loading-error [loading]="loading" [error]="error" (retry)="load()" />

      @if (!loading && !error) {
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <app-stat-card label="Total Turnover" [value]="totalTurnover | number" />
          <app-stat-card label="Net Deposit" [value]="netDeposit | number" />
          <app-stat-card label="Platform PnL" [value]="platformPnL | number" />
          <app-stat-card label="Avg Win Rate" [value]="avgWinRate + '%'" />
        </div>

        <div class="bg-card border-border rounded-lg border overflow-x-auto">
          <table class="saas-table w-full text-left max-sm:text-xs sm:text-sm">
            <thead>
              <tr class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">User</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Main</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Bonus</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Deposited</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Withdrawn</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Turnover</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Locked</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Net</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">PnL</th>
              </tr>
            </thead>
            <tbody>
              @for (w of displayWallets; track w.user_id) {
                <tr class="border-border hover:bg-accent/30 border-b">
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                    <p class="font-semibold text-foreground text-xs">
                      {{ w.user?.username || w.user_id.slice(0, 8) }}
                    </p>
                    <p class="text-[11px] text-muted-foreground">{{ w.user?.display_name }}</p>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-muted-foreground">
                    {{ w.balance_main | number }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-muted-foreground">
                    {{ w.balance_bonus | number }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-foreground">
                    {{ w.total_deposited | number }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-muted-foreground">
                    {{ w.total_withdrawn | number }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 font-semibold text-foreground">
                    {{ w.total_turnover | number }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-foreground">
                    {{ w.locked_remaining ? (w.locked_remaining | number) : '—' }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-muted-foreground">
                    {{ w.total_deposited - w.total_withdrawn | number }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-foreground">
                    {{ w.total_deposited - w.total_withdrawn >= 0 ? '+' : ''
                    }}{{ w.total_deposited - w.total_withdrawn | number }}
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="9" class="text-center py-12 text-muted-foreground">No data</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p-paginator
          (onPageChange)="onPageChange($event)"
          [first]="(currentPage - 1) * pageSize"
          [rows]="pageSize"
          [totalRecords]="filteredWallets.length" />
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TurnoverComponent implements OnInit {
  private admin = inject(AdminService);
  private cdr = inject(ChangeDetectorRef);

  wallets: WalletData[] = [];
  search = '';
  currentPage = 1;
  pageSize = 20;
  loading = true;
  error: string | null = null;
  totalTurnover = 0;
  netDeposit = 0;
  platformPnL = 0;
  avgWinRate = 0;

  ngOnInit() {
    this.load();
  }

  get displayWallets() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredWallets.slice(start, start + this.pageSize);
  }

  onPageChange(event: { first?: number; rows?: number }) {
    const { page, pageSize } = PaginationHelper.onPageChange(event, this.pageSize);
    this.currentPage = page;
    this.pageSize = pageSize;
    this.cdr.markForCheck();
  }

  onSearchChange(value: string) {
    this.search = value;
    this.currentPage = 1;
    this.cdr.markForCheck();
  }

  get filteredWallets() {
    if (!this.search.trim()) return this.wallets;
    const q = this.search.toLowerCase();
    return this.wallets.filter(
      (w) =>
        (w.user?.username || '').toLowerCase().includes(q) || (w.user?.display_name || '').toLowerCase().includes(q),
    );
  }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      this.wallets = await this.admin.getWallets();
      const locks = await this.admin.getDepositLocks();
      const lockMap = new Map<string, number>();
      for (const l of locks) {
        const rem = Number(l.turnover_required) - Number(l.turnover_applied);
        if (rem > 0) lockMap.set(l.user_id, (lockMap.get(l.user_id) || 0) + rem);
      }
      for (const w of this.wallets) {
        w.locked_remaining = lockMap.get(w.user_id) || 0;
      }
      this.totalTurnover = this.wallets.reduce((s, w) => s + Number(w.total_turnover || 0), 0);
      const totalDeposited = this.wallets.reduce((s, w) => s + Number(w.total_deposited || 0), 0);
      const totalWithdrawn = this.wallets.reduce((s, w) => s + Number(w.total_withdrawn || 0), 0);
      this.netDeposit = totalDeposited - totalWithdrawn;
      this.platformPnL = totalWithdrawn - totalDeposited;
      this.avgWinRate =
        this.wallets.length > 0
          ? Math.round(
              (this.wallets.filter((w) => w.total_deposited - w.total_withdrawn > 0).length / this.wallets.length) *
                100,
            )
          : 0;
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Could not load turnover data';
    }
    this.loading = false;
    this.cdr.markForCheck();
  }
}
