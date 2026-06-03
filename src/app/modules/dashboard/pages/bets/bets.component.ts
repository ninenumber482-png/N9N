import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AdminService } from '../../../../core/services/admin.service';
import { RealtimeService } from '../../../../core/services/realtime.service';
import { WibDatePipe } from '../../../../shared/pipes/wib-date.pipe';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';

@Component({
  selector: 'app-bets',
  standalone: true,
  imports: [CommonModule, FormsModule, WibDatePipe, PaginationComponent],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="max-sm:text-lg sm:text-2xl font-extrabold text-foreground">Bets</h1>
          <p class="text-muted-foreground mt-1 text-sm">View all bets across sessions</p>
        </div>
        <select [(ngModel)]="statusFilter" (ngModelChange)="applyFilter()" class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs font-semibold outline-none">
          <option value="">All</option>
          <option value="PENDING">Pending</option>
          <option value="WON">Won</option>
          <option value="LOST">Lost</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <div class="bg-card border-border rounded-xl border shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Bet Code</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">User</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Session</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Selection</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Stake</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Potential Payout</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Actual Payout</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Status</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Result</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              @for (b of displayBets; track b.id) {
                <tr class="border-border hover:bg-muted/30 border-b text-xs transition-colors">
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono">{{ b.bet_code?.slice(0,12) }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p class="font-semibold text-foreground">{{ b.user?.username || b.user_id?.slice(0,10) }}</p>
                    <p class="text-muted-foreground text-[10px]">{{ b.user?.display_name }}</p>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground whitespace-nowrap">{{ sessionDisplay(b.session_code) }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-lg font-black text-foreground">{{ b.selection }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-bold text-foreground">{{ b.stake | number }} P</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">{{ b.potential_payout ? (b.potential_payout | number) + ' P' : '-' }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" [class.text-emerald-400]="b.actual_payout" [class.text-muted-foreground]="!b.actual_payout">
                    {{ b.actual_payout ? (b.actual_payout | number) + ' P' : '-' }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <span [class]="'rounded px-2 py-0.5 text-[10px] font-bold ' + statusClass(b.status)">{{ b.status }}</span>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    @if (b.result) {
                      <span [class]="'rounded px-2 py-0.5 text-[10px] font-bold ' + (b.result === 'WINNER' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400')">{{ b.result }}</span>
                    } @else { <span class="text-muted-foreground">-</span> }
                  </td>
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 whitespace-nowrap">{{ b.created_at | wibDate:'short' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="10" class="text-muted-foreground px-4 py-12 text-center">{{ emptyMessage }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      <app-pagination [currentPage]="currentPage" [totalItems]="filtered.length" (pageChange)="onPageChange($event)"></app-pagination>
      </div>
    </div>
  `,
})
export class BetsComponent implements OnInit, OnDestroy {
  bets: any[] = [];
  filtered: any[] = [];
  statusFilter = '';
  loading = true;
  error: string | null = null;
  currentPage = 1;
  pageSize = 20;
  private destroy$ = new Subject<void>();

  constructor(private admin: AdminService, private cdr: ChangeDetectorRef, private realtime: RealtimeService) {}

  ngOnInit() {
    this.load();
    // Hapus polling timer — realtime subscription sudah cukup
    this.realtime.subscribeBets();
    this.realtime.bets$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.silentRefresh();
      });
  }

  ngOnDestroy() {
    this.realtime.unsubscribeBets();
    this.destroy$.next();
    this.destroy$.complete();
  }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      this.bets = await this.admin.getBets();
      this.applyFilter();
    } catch (e: any) {
      this.error = e?.message || 'Failed to load bets';
      this.bets = [];
      this.applyFilter();
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private async silentRefresh() {
    try {
      this.bets = await this.admin.getBets();
      this.applyFilter();
      this.cdr.markForCheck();
    } catch (e: any) {
      console.warn('Bets silentRefresh failed', e);
    }
  }

  get displayBets() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }

  get emptyMessage(): string {
    if (this.loading) return 'Loading bets...';
    if (this.error) return this.error;
    return 'No bets found';
  }

  applyFilter() { this.currentPage = 1; this.filtered = this.statusFilter ? this.bets.filter(b => b.status === this.statusFilter) : this.bets; }

  onPageChange(p: number) { this.currentPage = p; }

  statusClass(s: string) {
    const m: Record<string, string> = { PENDING: 'bg-amber-400/10 text-amber-400', WON: 'bg-emerald-400/10 text-emerald-400', LOST: 'bg-red-400/10 text-red-400', CANCELLED: 'bg-zinc-400/10 text-zinc-400' };
    return m[s] || 'bg-zinc-400/10 text-zinc-400';
  }

  sessionDisplay(code: string): string {
    if (!code || code.length < 12) return code || '-';
    const dt = new Date(Date.UTC(+code.slice(0,4), +code.slice(4,6)-1, +code.slice(6,8), +code.slice(8,10), +code.slice(10,12)));
    const p = dt.toLocaleString('en-CA', { timeZone: 'Asia/Jakarta', hour12: false }).split(/[-, :]+/);
    return `N9K-${p[0]}${p[1]}${p[2]}${p[3]}${p[4]}`;
  }
}
