import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { RouterLink } from '@angular/router';
import { AdminService } from 'src/app/core/services/admin.service';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { TagModule } from 'primeng/tag';
import { PaginatorModule } from 'primeng/paginator';

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
  imports: [CommonModule, AngularSvgIconModule, RouterLink, WibDatePipe, TagModule, PaginatorModule],
  template: `
    <div data-page="gaming" class="space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="page-header-icon"><svg-icon src="assets/icons/heroicons/outline/view-grid.svg" svgClass="h-4 w-4"></svg-icon></div>
          <div>
            <h1 class="max-sm:text-lg sm:text-xl font-bold text-foreground tracking-tight">Gaming Operations</h1>
            <p class="text-muted-foreground mt-0.5 text-xs">Platform gaming activity overview</p>
          </div>
        </div>
        <button
          (click)="load()"
          [disabled]="loading"
          class="bg-card border-border text-muted-foreground hover:text-foreground rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50">
          <svg class="h-3.5 w-3.5" [class.animate-spin]="loading" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      @if (loading) {
        <div class="bg-card border-border animate-pulse rounded-lg border p-5">
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            @for (_ of [1, 2, 3, 4]; track _) {
              <div class="h-24 rounded-lg bg-accent/30"></div>
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
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <a
            routerLink="/3dking"
            class="bg-card border-border hover:border-foreground/20 rounded-lg border p-4 transition-all hover:shadow-sm group">
            <div class="flex items-center justify-between">
              <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Active Sessions</p>
              <div class="rounded-lg bg-accent/20 p-2 group-hover:bg-accent/30 transition-colors">
                <svg-icon
                  src="assets/icons/heroicons/outline/trending-up.svg"
                  svgClass="h-4 w-4 text-foreground"></svg-icon>
              </div>
            </div>
            <p class="mt-2 text-2xl font-black text-foreground">{{ activeSessions }}</p>
            <p class="mt-1 text-[10px] font-semibold text-muted-foreground">Open for betting</p>
          </a>
          <a
            routerLink="/bets"
            class="bg-card border-border hover:border-foreground/20 rounded-lg border p-4 transition-all hover:shadow-sm group">
            <div class="flex items-center justify-between">
              <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Total Bets Today</p>
              <div class="rounded-lg bg-accent/20 p-2 group-hover:bg-accent/30 transition-colors">
                <svg-icon
                  src="assets/icons/heroicons/outline/chart-pie.svg"
                  svgClass="h-4 w-4 text-foreground"></svg-icon>
              </div>
            </div>
            <p class="mt-2 text-2xl font-black text-foreground">{{ totalBetsToday }}</p>
            <p class="mt-1 text-[10px] font-semibold text-muted-foreground">All timezones</p>
          </a>
          <div class="bg-card border-border rounded-lg border p-4">
            <div class="flex items-center justify-between">
              <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Total Stakes</p>
              <div class="rounded-lg bg-accent/20 p-2">
                <svg-icon
                  src="assets/icons/heroicons/outline/currency-dollar.svg"
                  svgClass="h-4 w-4 text-foreground"></svg-icon>
              </div>
            </div>
            <p class="mt-2 text-2xl font-black text-foreground">{{ totalStakes | number }}</p>
            <p class="mt-1 text-[10px] font-semibold text-muted-foreground">Aggregated</p>
          </div>
          <div class="bg-card border-border rounded-lg border p-4">
            <div class="flex items-center justify-between">
              <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Payout Ratio</p>
              <div class="rounded-lg bg-accent/20 p-2">
                <svg-icon src="assets/icons/heroicons/outline/scale.svg" svgClass="h-4 w-4 text-foreground"></svg-icon>
              </div>
            </div>
            <p class="mt-2 text-2xl font-black text-foreground">{{ payoutRatio }}%</p>
            <p class="mt-1 text-[10px] font-semibold text-muted-foreground">Payout / Stake</p>
          </div>
        </div>

        <div class="bg-card border-border rounded-lg border overflow-x-auto">
          <div class="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 class="text-sm font-bold text-foreground">Recent Game Sessions</h3>
            <a routerLink="/3dking" class="text-xs font-medium text-muted-foreground hover:text-foreground transition"
              >Open 3D King →</a
            >
          </div>
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr
                class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Session</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Status</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Bets</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Total Stake</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Payout</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              @for (s of displaySessions; track s.session_code) {
                <tr class="border-border hover:bg-accent/30 border-b">
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono font-semibold text-foreground">
                    {{ s.session_code }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p-tag [value]="s.status" [severity]="sessionTagSeverity(s.status)" />
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground">{{ s.bet_count }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground">
                    {{ s.total_stake | number }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground">
                    {{ s.total_payout | number }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground whitespace-nowrap">
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
    this.currentPage = Math.floor((event.first ?? 0) / (event.rows ?? this.pageSize)) + 1;
    this.pageSize = event.rows ?? this.pageSize;
    this.cdr.markForCheck();
  }

  sessionTagSeverity(s: string) {
    const m: Record<string, string> = { OPEN: 'success', LOCKED: 'warn', SETTLED: 'secondary' };
    return (m[s] || 'secondary') as any;
  }
}
