import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../../core/services/admin.service';

@Component({
  selector: 'app-risk-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="max-sm:text-lg sm:text-2xl font-extrabold text-foreground">Risk Management</h1>
          <p class="text-muted-foreground mt-1 max-sm:text-[10px] sm:text-sm">User risk scoring and anomaly detection</p>
        </div>
        <div class="flex gap-2">
          <select [(ngModel)]="filter" class="bg-card border-border text-foreground rounded-lg border max-sm:px-2 max-sm:py-1.5 sm:px-3 sm:py-2 max-sm:text-[9px] sm:text-xs font-semibold outline-none">
            <option value="all">All Users</option>
            <option value="high">High Risk Only</option>
            <option value="medium">Medium Risk Only</option>
          </select>
          <button (click)="load()" class="bg-primary/10 text-primary rounded-lg max-sm:px-2 max-sm:py-1.5 sm:px-3 sm:py-2 max-sm:text-[9px] sm:text-xs font-bold" [disabled]="loading">Refresh</button>
        </div>
      </div>

      @if (loading) {
        <div class="bg-card border-border animate-pulse rounded-xl border p-5 shadow-sm">
          <div class="space-y-3">@for (_ of [1,2,3,4,5]; track _) { <div class="h-10 rounded-lg bg-zinc-700/20"></div> }</div>
        </div>
      } @else if (error) {
        <div class="bg-card border-border rounded-xl border p-5 shadow-sm">
          <div class="flex flex-col items-center gap-3 py-6">
            <p class="text-red-400 text-sm font-semibold">{{ error }}</p>
            <button (click)="load()" class="bg-primary/10 text-primary rounded-lg px-4 py-2 text-xs font-bold">Retry</button>
          </div>
        </div>
      } @else {
      <!-- Risk Summary Cards -->
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="bg-card border-border rounded-xl border p-4 shadow-sm">
          <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">High Risk Users</p>
          <p class="mt-2 text-2xl font-black text-red-400">{{ highRiskCount }}</p>
        </div>
        <div class="bg-card border-border rounded-xl border p-4 shadow-sm">
          <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Medium Risk Users</p>
          <p class="mt-2 text-2xl font-black text-amber-400">{{ mediumRiskCount }}</p>
        </div>
        <div class="bg-card border-border rounded-xl border p-4 shadow-sm">
          <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Total Monitored</p>
          <p class="mt-2 text-2xl font-black text-foreground">{{ riskProfiles.length }}</p>
        </div>
      </div>

      <div class="bg-card border-border rounded-xl border shadow-sm overflow-x-auto">
        <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
          <thead><tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">User</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Risk Score</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Level</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">Turnover</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">Net</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">Flags</th>
          </tr></thead>
          <tbody>
            @for (r of filteredProfiles; track r.user_id) {
              <tr class="border-border hover:bg-muted/30 border-b">
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                  <p class="font-semibold text-foreground text-xs">{{ r.username }}</p>
                  <p class="text-[10px] text-muted-foreground">{{ r.display_name }}</p>
                </td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                  <div class="flex items-center gap-2">
                    <div class="h-2 w-16 rounded-full bg-zinc-700/30 overflow-hidden">
                      <div class="h-full rounded-full" [class.bg-red-400]="r.score >= 70" [class.bg-amber-400]="r.score >= 40 && r.score < 70" [class.bg-emerald-400]="r.score < 40" [style.width.%]="r.score"></div>
                    </div>
                    <span class="font-bold text-foreground">{{ r.score }}</span>
                  </div>
                </td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                  <span [class]="'rounded px-2 py-0.5 text-[10px] font-bold ' + levelClass(r.level)">{{ r.level }}</span>
                </td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground max-sm:hidden">{{ r.turnover | number }}</td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground max-sm:hidden" [class.text-emerald-400]="r.net >= 0" [class.text-rose-400]="r.net < 0">{{ r.net | number }}</td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">
                  <div class="flex flex-wrap gap-1">
                    @for (f of r.flags; track f) {
                      <span class="rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[9px] font-bold">{{ f }}</span>
                    }
                  </div>
                </td>
              </tr>
            } @empty { <tr><td colspan="6" class="text-center py-12 text-muted-foreground">No risk profiles</td></tr> }
          </tbody>
        </table>
      </div>
      }
    </div>
  `,
})
export class RiskManagementComponent implements OnInit {
  riskProfiles: any[] = [];
  filter = 'all';
  loading = true;
  error: string | null = null;
  highRiskCount = 0;
  mediumRiskCount = 0;

  constructor(private admin: AdminService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.load(); }

  get filteredProfiles() {
    if (this.filter === 'high') return this.riskProfiles.filter((r: any) => r.level === 'HIGH');
    if (this.filter === 'medium') return this.riskProfiles.filter((r: any) => r.level === 'MEDIUM');
    return this.riskProfiles;
  }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      const wallets = await this.admin.getWallets();
      const bets = await this.admin.getBets(1000);

      this.riskProfiles = wallets.map((w: any) => {
        const userBets = bets.filter((b: any) => b.user_id === w.user_id);
        const winCount = userBets.filter((b: any) => b.result === 'WIN').length;
        const totalBets = userBets.length;
        const winRate = totalBets > 0 ? winCount / totalBets : 0;
        const turnover = Number(w.total_turnover || 0);
        const net = Number(w.total_deposited || 0) - Number(w.total_withdrawn || 0);

        let score = 0;
        const flags: string[] = [];
        if (winRate > 0.85) { score += 30; flags.push('High WR'); }
        if (net < -5000000) { score += 25; flags.push('Big Winner'); }
        if (turnover > 100000000) { score += 20; flags.push('High Vol'); }
        if (winRate < 0.15 && totalBets > 20) { score += 15; flags.push('Low WR'); }
        if (Math.abs(net) > 50000000) { score += 10; flags.push('High Net'); }

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
      }).sort((a: any, b: any) => b.score - a.score);

      this.highRiskCount = this.riskProfiles.filter((r: any) => r.level === 'HIGH').length;
      this.mediumRiskCount = this.riskProfiles.filter((r: any) => r.level === 'MEDIUM').length;
    } catch (e: any) {
      this.error = e?.message || 'Could not load risk data';
    }
    this.loading = false;
    this.cdr.markForCheck();
  }

  levelClass(l: string) {
    const m: Record<string, string> = { HIGH: 'bg-red-400/10 text-red-400', MEDIUM: 'bg-amber-400/10 text-amber-400', LOW: 'bg-emerald-400/10 text-emerald-400' };
    return m[l] || 'bg-zinc-400/10 text-zinc-400';
  }
}
