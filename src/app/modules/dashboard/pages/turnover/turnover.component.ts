import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from 'src/app/core/services/admin.service';
import { PaginationComponent } from 'src/app/shared/components/pagination/pagination.component';

@Component({
  selector: 'app-turnover',
  standalone: true,
  imports: [CommonModule, FormsModule, PaginationComponent],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="max-sm:text-lg sm:text-2xl font-extrabold text-foreground">Turnover Analytics</h1>
          <p class="text-muted-foreground mt-1 max-sm:text-[10px] sm:text-sm">User transaction volume and financial performance</p>
        </div>
        <div class="flex gap-2">
          <input [(ngModel)]="search" placeholder="Search user..." class="bg-card border-border text-foreground rounded-lg border max-sm:px-2 max-sm:py-1.5 sm:px-3 sm:py-2 max-sm:text-[9px] sm:text-xs outline-none" />
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
      <!-- Summary Cards -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="bg-card border-border rounded-xl border p-4 shadow-sm">
          <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Total Turnover</p>
          <p class="mt-2 text-2xl font-black text-foreground">{{ totalTurnover | number }}</p>
        </div>
        <div class="bg-card border-border rounded-xl border p-4 shadow-sm">
          <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Net Deposit</p>
          <p class="mt-2 text-2xl font-black text-foreground">{{ netDeposit | number }}</p>
        </div>
        <div class="bg-card border-border rounded-xl border p-4 shadow-sm">
          <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Platform PnL</p>
          <p class="mt-2 text-2xl font-black text-foreground" [class.text-emerald-400]="platformPnL >= 0" [class.text-rose-400]="platformPnL < 0">{{ platformPnL | number }}</p>
        </div>
        <div class="bg-card border-border rounded-xl border p-4 shadow-sm">
          <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Avg Win Rate</p>
          <p class="mt-2 text-2xl font-black text-foreground">{{ avgWinRate }}%</p>
        </div>
      </div>

      <div class="bg-card border-border rounded-xl border shadow-sm overflow-x-auto">
        <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
          <thead><tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">User</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Main</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Bonus</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Deposited</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Withdrawn</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Turnover</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Locked</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Net</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">PnL</th>
          </tr></thead>
          <tbody>
            @for (w of displayWallets; track w.user_id) {
              <tr class="border-border hover:bg-muted/30 border-b">
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                  <p class="font-semibold text-foreground text-xs">{{ w.user?.username || w.user_id?.slice(0,8) }}</p>
                  <p class="text-[10px] text-muted-foreground">{{ w.user?.display_name }}</p>
                </td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground">{{ w.balance_main | number }}</td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground">{{ w.balance_bonus | number }}</td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-emerald-400">{{ w.total_deposited | number }}</td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-rose-400">{{ w.total_withdrawn | number }}</td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-semibold text-foreground">{{ w.total_turnover | number }}</td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" [class.text-yellow-400]="w.locked_remaining > 0" [class.text-muted-foreground]="!w.locked_remaining">
                  {{ w.locked_remaining ? (w.locked_remaining | number) : '—' }}
                </td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground">{{ (w.total_deposited - w.total_withdrawn) | number }}</td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" [class.text-emerald-400]="(w.total_deposited - w.total_withdrawn) >= 0" [class.text-rose-400]="(w.total_deposited - w.total_withdrawn) < 0">
                  {{ (w.total_deposited - w.total_withdrawn) >= 0 ? '+' : '' }}{{ (w.total_deposited - w.total_withdrawn) | number }}
                </td>
              </tr>
            } @empty { <tr><td colspan="8" class="text-center py-12 text-muted-foreground">No data</td></tr> }
          </tbody>
        </table>
      </div>
      <app-pagination [currentPage]="currentPage" [totalItems]="filteredWallets.length" (pageChange)="onPageChange($event)"></app-pagination>
      }
    </div>,
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TurnoverComponent implements OnInit {
  wallets: any[] = [];
  search = '';
  currentPage = 1;
  pageSize = 20;
  loading = true;
  error: string | null = null;
  totalTurnover = 0;
  netDeposit = 0;
  platformPnL = 0;
  avgWinRate = 0;

  constructor(private admin: AdminService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.load(); }

  get displayWallets() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredWallets.slice(start, start + this.pageSize);
  }

  onPageChange(p: number) { this.currentPage = p; window.scrollTo({ top: 0, behavior: 'smooth' }); }

  get filteredWallets() {
    if (!this.search.trim()) return this.wallets;
    const q = this.search.toLowerCase();
    return this.wallets.filter((w: any) =>
      (w.user?.username || '').toLowerCase().includes(q) ||
      (w.user?.display_name || '').toLowerCase().includes(q)
    );
  }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      this.wallets = await this.admin.getWallets();
      // Per-deposit turnover (1x each, no accumulation across deposits): locked
      // remaining = sum of outstanding turnover over incomplete deposit locks.
      // A completed deposit resets out and no longer counts.
      const locks = await this.admin.getDepositLocks();
      const lockMap = new Map<string, number>();
      for (const l of locks) {
        const rem = Number(l.turnover_required) - Number(l.turnover_applied);
        if (rem > 0) lockMap.set(l.user_id, (lockMap.get(l.user_id) || 0) + rem);
      }
      for (const w of this.wallets) {
        (w as any).locked_remaining = lockMap.get(w.user_id) || 0;
      }
      this.totalTurnover = this.wallets.reduce((s, w) => s + Number(w.total_turnover || 0), 0);
      const totalDeposited = this.wallets.reduce((s, w) => s + Number(w.total_deposited || 0), 0);
      const totalWithdrawn = this.wallets.reduce((s, w) => s + Number(w.total_withdrawn || 0), 0);
      this.netDeposit = totalDeposited - totalWithdrawn;
      this.platformPnL = totalWithdrawn - totalDeposited;
      this.avgWinRate = this.wallets.length > 0 ? Math.round((this.wallets.filter((w: any) => (w.total_deposited - w.total_withdrawn) > 0).length / this.wallets.length) * 100) : 0;
    } catch (e: any) {
      this.error = e?.message || 'Could not load turnover data';
    }
    this.loading = false;
    this.cdr.markForCheck();
  }
}
