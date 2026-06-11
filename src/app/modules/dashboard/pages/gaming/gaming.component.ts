import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { RouterLink } from '@angular/router';
import { AdminService } from 'src/app/core/services/admin.service';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { TagModule } from 'primeng/tag';
import { PaginatorModule } from 'primeng/paginator';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { LoadingErrorComponent } from 'src/app/shared/components/loading-error/loading-error.component';
import { RefreshButtonComponent } from 'src/app/shared/components/refresh-button/refresh-button.component';
import { SeverityMapPipe } from 'src/app/shared/pipes/severity-map.pipe';
import { PaginationHelper } from 'src/app/shared/utils/pagination.helper';

interface GameSession {
  session_code: string;
  status: string;
  bet_count: number;
  total_stake: number;
  total_payout: number;
  created_at: string;
}

interface BetData {
  created_at?: string;
  stake?: number;
  actual_payout?: number;
  session_code?: string;
  status?: string;
}

@Component({
  selector: 'app-gaming',
  standalone: true,
  imports: [PageHeaderComponent, LoadingErrorComponent, RefreshButtonComponent, SeverityMapPipe, CommonModule, AngularSvgIconModule, RouterLink, WibDatePipe, TagModule, PaginatorModule],
  template: `
    <div data-page="gaming" class="space-y-6">
      <app-page-header icon="view-grid" title="Gaming Overview" subtitle="Platform gaming activity overview">
        <app-refresh-button [loading]="loading" (clicked)="load()" />
      </app-page-header>

      <app-loading-error [loading]="loading" [error]="error" (retry)="load()" />

      @if (!loading && !error) {
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <a
            routerLink="/3dking"
            class="bg-card border-border hover:border-foreground/20 rounded-lg border p-4 transition-all hover:shadow-sm group">
            <div class="flex items-center justify-between">
              <p class="text-muted-foreground text-xs font-bold uppercase tracking-widest">Active Sessions</p>
              <div class="rounded-lg bg-accent/20 p-2 group-hover:bg-accent/30 transition-colors">
                <svg-icon
                  src="assets/icons/heroicons/outline/trending-up.svg"
                  svgClass="h-4 w-4 text-foreground"></svg-icon>
              </div>
            </div>
            <p class="mt-2 text-2xl font-black text-foreground">{{ activeSessions }}</p>
            <p class="mt-1 text-[11px] font-semibold text-muted-foreground">Open for betting</p>
          </a>
          <a
            routerLink="/bets"
            class="bg-card border-border hover:border-foreground/20 rounded-lg border p-4 transition-all hover:shadow-sm group">
            <div class="flex items-center justify-between">
              <p class="text-muted-foreground text-xs font-bold uppercase tracking-widest">Total Bets Today</p>
              <div class="rounded-lg bg-accent/20 p-2 group-hover:bg-accent/30 transition-colors">
                <svg-icon
                  src="assets/icons/heroicons/outline/chart-pie.svg"
                  svgClass="h-4 w-4 text-foreground"></svg-icon>
              </div>
            </div>
            <p class="mt-2 text-2xl font-black text-foreground">{{ totalBetsToday }}</p>
            <p class="mt-1 text-[11px] font-semibold text-muted-foreground">All timezones</p>
          </a>
          <div class="bg-card border-border rounded-lg border p-4">
            <div class="flex items-center justify-between">
              <p class="text-muted-foreground text-xs font-bold uppercase tracking-widest">Total Stakes</p>
              <div class="rounded-lg bg-accent/20 p-2">
                <svg-icon
                  src="assets/icons/heroicons/outline/currency-dollar.svg"
                  svgClass="h-4 w-4 text-foreground"></svg-icon>
              </div>
            </div>
            <p class="mt-2 text-2xl font-black text-foreground">{{ totalStakes | number }}</p>
            <p class="mt-1 text-[11px] font-semibold text-muted-foreground">Aggregated</p>
          </div>
          <div class="bg-card border-border rounded-lg border p-4">
            <div class="flex items-center justify-between">
              <p class="text-muted-foreground text-xs font-bold uppercase tracking-widest">Payout Ratio</p>
              <div class="rounded-lg bg-accent/20 p-2">
                <svg-icon src="assets/icons/heroicons/outline/scale.svg" svgClass="h-4 w-4 text-foreground"></svg-icon>
              </div>
            </div>
            <p class="mt-2 text-2xl font-black text-foreground">{{ payoutRatio }}%</p>
            <p class="mt-1 text-[11px] font-semibold text-muted-foreground">Payout / Stake</p>
          </div>
        </div>

        <div class="bg-card border-border rounded-lg border overflow-x-auto">
          <div class="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 class="text-sm font-bold text-foreground">Recent Game Sessions</h3>
            <a routerLink="/3dking" class="text-xs font-medium text-muted-foreground hover:text-foreground transition"
              >Open 3D King →</a
            >
          </div>
          <table class="saas-table w-full text-left max-sm:text-xs sm:text-sm">
            <thead>
              <tr
                class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Session</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Status</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Bets</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Total Stake</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Payout</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Created</th>
              </tr>
            </thead>
            <tbody>
              @for (s of displaySessions; track s.session_code) {
                <tr class="border-border hover:bg-accent/30 border-b">
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 font-mono font-semibold text-foreground">
                    {{ s.session_code }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                    <p-tag [value]="s.status" [severity]="s.status | severityMap" />
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-muted-foreground">{{ s.bet_count }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-muted-foreground">
                    {{ s.total_stake | number }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-muted-foreground">
                    {{ s.total_payout | number }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-muted-foreground whitespace-nowrap">
                    {{ s.created_at | wibDate: 'short' }}
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="text-center py-12 text-muted-foreground">No sessions</td>
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
export class GamingComponent implements OnInit {
  private admin = inject(AdminService);
  private cdr = inject(ChangeDetectorRef);

  sessions: GameSession[] = [];
  activeSessions = 0;
  totalBetsToday = 0;
  totalStakes = 0;
  payoutRatio = 0;
  loading = true;
  error: string | null = null;
  currentPage = 1;
  pageSize = 20;

  get displaySessions() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.sessions.slice(start, start + this.pageSize);
  }

  ngOnInit() {
    this.load();
  }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      const sessions = await this.admin.getGameSessions() as GameSession[];
      this.sessions = sessions;
      this.activeSessions = sessions.filter((s: GameSession) => s.status === 'OPEN').length;

      const bets = await this.admin.getBets(500) as BetData[];
      const today = new Date().toISOString().slice(0, 10);
      const todayBets = bets.filter((b: BetData) => b.created_at?.startsWith(today));
      this.totalBetsToday = todayBets.length;
      this.totalStakes = bets.reduce((s: number, b: BetData) => s + Number(b.stake || 0), 0);
      const totalPayout = bets.reduce((s: number, b: BetData) => s + Number(b.actual_payout || 0), 0);
      this.payoutRatio = this.totalStakes > 0 ? Math.round((totalPayout / this.totalStakes) * 100) : 0;
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Could not load gaming data';
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
