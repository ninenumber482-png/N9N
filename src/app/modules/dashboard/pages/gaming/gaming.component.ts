import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../../../core/services/admin.service';
import { WibDatePipe } from '../../../../shared/pipes/wib-date.pipe';

@Component({
  selector: 'app-gaming',
  standalone: true,
  imports: [CommonModule, AngularSvgIconModule, RouterLink, WibDatePipe],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="max-sm:text-lg sm:text-2xl font-extrabold text-foreground">Gaming Operations</h1>
        <p class="text-muted-foreground mt-1 text-sm">Platform gaming activity overview</p>
      </div>

      @if (loading) {
        <div class="bg-card border-border animate-pulse rounded-xl border p-5 shadow-sm">
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            @for (_ of [1,2,3,4]; track _) { <div class="h-24 rounded-lg bg-zinc-700/20"></div> }
          </div>
        </div>
      } @else if (error) {
        <div class="bg-card border-border rounded-xl border p-5 shadow-sm">
          <div class="flex flex-col items-center gap-3 py-6">
            <p class="text-red-400 text-sm font-semibold">{{ error }}</p>
            <button (click)="load()" class="bg-primary/10 text-primary rounded-lg px-4 py-2 text-xs font-bold">Retry</button>
          </div>
        </div>
      } @else {

      <!-- Stat Cards -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <a routerLink="/3dking" class="bg-card border-border hover:border-violet-500/30 rounded-xl border p-4 shadow-sm transition-all hover:shadow-md group">
          <div class="flex items-center justify-between">
            <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Active Sessions</p>
            <div class="rounded-lg bg-violet-400/10 p-2 group-hover:bg-violet-400/20 transition-colors">
              <svg-icon src="assets/icons/heroicons/outline/trending-up.svg" svgClass="h-4 w-4 text-violet-400"></svg-icon>
            </div>
          </div>
          <p class="mt-2 text-2xl font-black text-foreground">{{ activeSessions }}</p>
          <p class="mt-1 text-[10px] font-semibold text-violet-400">● Open for betting</p>
        </a>
        <a routerLink="/bets" class="bg-card border-border hover:border-sky-500/30 rounded-xl border p-4 shadow-sm transition-all hover:shadow-md group">
          <div class="flex items-center justify-between">
            <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Total Bets Today</p>
            <div class="rounded-lg bg-sky-400/10 p-2 group-hover:bg-sky-400/20 transition-colors">
              <svg-icon src="assets/icons/heroicons/outline/chart-pie.svg" svgClass="h-4 w-4 text-sky-400"></svg-icon>
            </div>
          </div>
          <p class="mt-2 text-2xl font-black text-foreground">{{ totalBetsToday }}</p>
          <p class="mt-1 text-[10px] font-semibold text-sky-400">● All timezones</p>
        </a>
        <div class="bg-card border-border rounded-xl border p-4 shadow-sm">
          <div class="flex items-center justify-between">
            <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Total Stakes</p>
            <div class="rounded-lg bg-emerald-400/10 p-2">
              <svg-icon src="assets/icons/heroicons/outline/currency-dollar.svg" svgClass="h-4 w-4 text-emerald-400"></svg-icon>
            </div>
          </div>
          <p class="mt-2 text-2xl font-black text-foreground">{{ totalStakes | number }}</p>
          <p class="mt-1 text-[10px] font-semibold text-emerald-400">● Aggregated</p>
        </div>
        <div class="bg-card border-border rounded-xl border p-4 shadow-sm">
          <div class="flex items-center justify-between">
            <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Payout Ratio</p>
            <div class="rounded-lg bg-amber-400/10 p-2">
              <svg-icon src="assets/icons/heroicons/outline/scale.svg" svgClass="h-4 w-4 text-amber-400"></svg-icon>
            </div>
          </div>
          <p class="mt-2 text-2xl font-black text-foreground">{{ payoutRatio }}%</p>
          <p class="mt-1 text-[10px] font-semibold text-amber-400">● Payout / Stake</p>
        </div>
      </div>

      <!-- Recent Sessions -->
      <div class="bg-card border-border rounded-xl border shadow-sm overflow-x-auto">
        <div class="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 class="text-sm font-bold text-foreground">Recent Game Sessions</h3>
          <a routerLink="/3dking" class="text-xs font-bold text-primary hover:text-primary/80 transition">Open 3D King →</a>
        </div>
        <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
          <thead><tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Session</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Status</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Bets</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Total Stake</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Payout</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Created</th>
          </tr></thead>
          <tbody>
            @for (s of sessions; track s.session_code) {
              <tr class="border-border hover:bg-muted/30 border-b">
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono font-semibold text-foreground">{{ s.session_code }}</td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3"><span [class]="'rounded px-2 py-0.5 text-[10px] font-bold ' + statusClass(s.status)">{{ s.status }}</span></td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground">{{ s.bet_count }}</td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground">{{ s.total_stake | number }}</td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground">{{ s.total_payout | number }}</td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground whitespace-nowrap">{{ s.created_at | wibDate:'short' }}</td>
              </tr>
            } @empty { <tr><td colspan="6" class="text-center py-12 text-muted-foreground">No sessions</td></tr> }
          </tbody>
        </table>
      </div>
      }
    </div>
  `,
})
export class GamingComponent implements OnInit {
  sessions: any[] = [];
  activeSessions = 0;
  totalBetsToday = 0;
  totalStakes = 0;
  payoutRatio = 0;
  loading = true;
  error: string | null = null;

  constructor(private admin: AdminService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.load(); }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      const sessions = await this.admin.getGameSessions();
      this.sessions = sessions.slice(0, 20);
      this.activeSessions = sessions.filter((s: any) => s.status === 'OPEN').length;

      const bets = await this.admin.getBets(500);
      const today = new Date().toISOString().slice(0, 10);
      const todayBets = bets.filter((b: any) => b.created_at?.startsWith(today));
      this.totalBetsToday = todayBets.length;
      this.totalStakes = bets.reduce((s: number, b: any) => s + Number(b.stake || 0), 0);
      const totalPayout = bets.reduce((s: number, b: any) => s + Number(b.actual_payout || 0), 0);
      this.payoutRatio = this.totalStakes > 0 ? Math.round((totalPayout / this.totalStakes) * 100) : 0;
    } catch (e: any) {
      this.error = e?.message || 'Could not load gaming data';
    }
    this.loading = false;
    this.cdr.markForCheck();
  }

  statusClass(s: string) {
    const m: Record<string, string> = { OPEN: 'bg-emerald-400/10 text-emerald-400', SETTLED: 'bg-zinc-400/10 text-zinc-400', LOCKED: 'bg-amber-400/10 text-amber-400' };
    return m[s] || 'bg-zinc-400/10 text-zinc-400';
  }
}
