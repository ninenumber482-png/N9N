import { AngularSvgIconModule } from 'angular-svg-icon';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AdminService } from 'src/app/core/services/admin.service';
import { RealtimeService } from 'src/app/core/services/realtime.service';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TagModule } from 'primeng/tag';
import { PaginatorModule } from 'primeng/paginator';

interface BetData {
  id: string;
  bet_code: string;
  user?: { username?: string; display_name?: string };
  user_id?: string;
  session_code: string;
  selection: string;
  stake: number;
  potential_payout: number | null;
  actual_payout: number | null;
  status: string;
  result: string | null;
  created_at: string;
}

@Component({
  selector: 'app-bets',
  standalone: true,
  imports: [CommonModule, FormsModule,
    AngularSvgIconModule, WibDatePipe, SelectModule, DatePickerModule, TagModule, PaginatorModule],
  template: `
    <div data-page="bets" class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <div class="flex items-center gap-3">
          <div class="page-header-icon"><svg-icon src="assets/icons/heroicons/outline/cursor-click.svg" svgClass="h-4 w-4"></svg-icon></div>
          <div>
            <h1 class="max-sm:text-lg sm:text-xl font-bold text-foreground tracking-tight">Bets</h1>
          <p class="text-muted-foreground mt-0.5 text-xs">View all bets across sessions</p>
        </div>
          </div>
        </div><div class="flex flex-wrap gap-2 items-center">
          <input
            [(ngModel)]="search"
            (ngModelChange)="applyFilter()"
            placeholder="Cari user, session, selection…"
            class="bg-card border-border text-foreground rounded-lg border px-2.5 py-1.5 text-xs outline-none w-44" />
          <p-select
            [(ngModel)]="statusFilter"
            (ngModelChange)="applyFilter()"
            [options]="statusOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="All"
            class="w-32"
            styleClass="!text-xs !w-full" />
          <p-datepicker
            [(ngModel)]="dateFrom"
            (ngModelChange)="applyFilter()"
            dateFormat="yy-mm-dd"
            placeholder="Dari"
            class="w-32"
            inputStyleClass="!text-xs !py-1.5 !px-2.5" />
          <p-datepicker
            [(ngModel)]="dateTo"
            (ngModelChange)="applyFilter()"
            dateFormat="yy-mm-dd"
            placeholder="Sampai"
            class="w-32"
            inputStyleClass="!text-xs !py-1.5 !px-2.5" />
        </div>
      </div>

      <div class="bg-card border-border rounded-lg page-accent-card">
        <div class="overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr
                class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
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
                <tr class="border-border hover:bg-accent/30 border-b text-xs transition-colors">
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono">
                    {{ b.bet_code.slice(0, 12) }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p class="font-semibold text-foreground">{{ b.user?.username || b.user_id?.slice(0, 10) }}</p>
                    <p class="text-muted-foreground text-[10px]">{{ b.user?.display_name }}</p>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground whitespace-nowrap">
                    {{ sessionDisplay(b.session_code) }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-lg font-black text-foreground">
                    {{ b.selection }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-bold text-foreground">
                    {{ b.stake | number }} P
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground">
                    {{ b.potential_payout ? (b.potential_payout | number) + ' P' : '-' }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-foreground font-semibold">
                    {{ b.actual_payout ? (b.actual_payout | number) + ' P' : '-' }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p-tag [value]="b.status" [severity]="betStatusSeverity(b.status)" />
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    @if (b.result) {
                      <p-tag [value]="b.result" [severity]="b.result === 'WIN' ? 'success' : 'danger'" />
                    } @else {
                      <span class="text-muted-foreground">-</span>
                    }
                  </td>
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 whitespace-nowrap">
                    {{ b.created_at | wibDate: 'short' }}
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="10" class="text-muted-foreground px-4 py-12 text-center">{{ emptyMessage }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p-paginator
          (onPageChange)="onPageChange($event)"
          [first]="(currentPage - 1) * pageSize"
          [rows]="pageSize"
          [totalRecords]="filtered.length"
          [showCurrentPageReport]="true"
          currentPageReportTemplate="" />
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BetsComponent implements OnInit, OnDestroy {
  private admin = inject(AdminService);
  private cdr = inject(ChangeDetectorRef);
  private realtime = inject(RealtimeService);

  bets: BetData[] = [];
  filtered: BetData[] = [];
  search = '';
  statusFilter = '';
  dateFrom: Date | null = null;
  dateTo: Date | null = null;
  loading = true;
  error: string | null = null;
  currentPage = 1;
  pageSize = 20;

  statusOptions = [
    { label: 'All', value: '' },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Won', value: 'WIN' },
    { label: 'Lost', value: 'LOSE' },
    { label: 'Settled', value: 'SETTLED' },
    { label: 'Cancelled', value: 'CANCELLED' },
  ];

  private destroy$ = new Subject<void>();

  ngOnInit() {
    this.load();
    this.realtime.subscribeBets();
    this.realtime.bets$.pipe(takeUntil(this.destroy$)).subscribe(() => {
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
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Failed to load bets';
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
    } catch {
      /* silent */
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

  applyFilter() {
    this.currentPage = 1;
    let result = this.bets;
    if (this.search) {
      const q = this.search.toLowerCase();
      result = result.filter(
        (b) =>
          b.user?.username?.toLowerCase().includes(q) ||
          b.bet_code?.toLowerCase().includes(q) ||
          b.session_code?.toLowerCase().includes(q) ||
          String(b.selection).toLowerCase().includes(q),
      );
    }
    if (this.statusFilter) {
      if (this.statusFilter === 'WIN' || this.statusFilter === 'LOSE') {
        result = result.filter((b) => b.result === this.statusFilter);
      } else {
        result = result.filter((b) => b.status === this.statusFilter);
      }
    }
    if (this.dateFrom) {
      const from = new Date(this.dateFrom).setHours(0, 0, 0, 0);
      result = result.filter((b) => new Date(b.created_at).getTime() >= from);
    }
    if (this.dateTo) {
      const to = new Date(this.dateTo).setHours(23, 59, 59, 999);
      result = result.filter((b) => new Date(b.created_at).getTime() <= to);
    }
    this.filtered = result;
  }

  onPageChange(event: { first?: number; rows?: number }) {
    this.currentPage = Math.floor((event.first ?? 0) / (event.rows ?? this.pageSize)) + 1;
    this.pageSize = event.rows ?? this.pageSize;
  }

  betStatusSeverity(s: string) {
    const m: Record<string, string> = { PENDING: 'warn', SETTLED: 'success', CANCELLED: 'secondary' };
    return (m[s] || 'secondary') as any;
  }

  sessionDisplay(code: string): string {
    if (!code || code.length < 12) return code || '-';
    const dt = new Date(
      Date.UTC(+code.slice(0, 4), +code.slice(4, 6) - 1, +code.slice(6, 8), +code.slice(8, 10), +code.slice(10, 12)),
    );
    const p = dt.toLocaleString('en-CA', { timeZone: 'Asia/Jakarta', hour12: false }).split(/[-, :]+/);
    return `N9K-${p[0]}${p[1]}${p[2]}${p[3]}${p[4]}`;
  }
}
