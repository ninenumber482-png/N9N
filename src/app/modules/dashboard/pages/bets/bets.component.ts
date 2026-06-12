import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AdminService } from 'src/app/core/services/admin.service';
import { RealtimeService } from 'src/app/core/services/realtime.service';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { PaginatorModule } from 'primeng/paginator';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { LoadingErrorComponent } from 'src/app/shared/components/loading-error/loading-error.component';
import { FilterBarComponent } from 'src/app/shared/components/filter-bar/filter-bar.component';
import { PaginationHelper } from 'src/app/shared/utils/pagination.helper';

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
  imports: [
    CommonModule,
    FormsModule,
    WibDatePipe,
    SelectModule,
    DatePickerModule,
    PaginatorModule,
    PageHeaderComponent,
    LoadingErrorComponent,
    FilterBarComponent,
  ],
  template: `
    <div data-page="bets" class="space-y-6">
      <app-page-header icon="cursor-click" title="Bets" subtitle="All bets across marketplace sessions" />

      <div
        class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
        <span class="font-semibold uppercase tracking-wider text-foreground/80">Legenda</span>
        <span class="inline-flex items-center gap-1.5">
          <span class="bet-badge bet-badge-pending">Pending</span>
          stake terpotong, menunggu draw
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="bet-badge bet-badge-settled">Settled</span>
          hasil sudah diproses
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="bet-badge bet-badge-win">Win</span>
          <span class="text-emerald-500/90">nama hijau</span>
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="bet-badge bet-badge-lose">Lose</span>
          <span class="text-red-400/90">nama merah</span>
        </span>
      </div>

      <app-filter-bar
        [search]="search"
        (searchChange)="search = $event; applyFilter()"
        placeholder="Cari user, session, selection…">
        <p-select
          [(ngModel)]="statusFilter"
          (ngModelChange)="applyFilter()"
          [options]="statusOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="All"
          class="w-32"
          styleClass="!text-sm !w-44" />
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
      </app-filter-bar>

      <app-loading-error [loading]="loading" [error]="error" (retry)="load()" />

      @if (!loading && !error) {
        <div class="bg-card border-border rounded-lg page-accent-card">
          <div class="overflow-x-auto">
            <table class="saas-table w-full text-left max-sm:text-xs sm:text-sm">
              <thead>
                <tr class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Bet Code</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">User</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Session</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Selection</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Stake</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Potential Payout</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Actual Payout</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Status</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Result</th>
                  <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">Date</th>
                </tr>
              </thead>
              <tbody>
                @for (b of displayBets; track b.id) {
                  <tr class="border-border hover:bg-accent/30 border-b text-xs transition-colors">
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 font-mono">
                      {{ b.bet_code.slice(0, 12) }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                      <p
                        class="font-semibold"
                        [class.text-emerald-400]="b.result === 'WIN'"
                        [class.text-red-400]="b.result === 'LOSE'"
                        [class.text-foreground]="b.result !== 'WIN' && b.result !== 'LOSE'">
                        {{ b.user?.username || b.user_id?.slice(0, 10) }}
                      </p>
                      @if (b.user?.display_name) {
                        <p
                          class="text-[11px]"
                          [class.text-emerald-400/70]="b.result === 'WIN'"
                          [class.text-red-400/70]="b.result === 'LOSE'"
                          [class.text-muted-foreground]="b.result !== 'WIN' && b.result !== 'LOSE'">
                          {{ b.user!.display_name }}
                        </p>
                      }
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-muted-foreground whitespace-nowrap">
                      {{ sessionDisplay(b.session_code) }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-lg font-black text-foreground">
                      {{ b.selection }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 font-bold text-foreground">
                      {{ b.stake | number }} P
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-muted-foreground">
                      {{ b.potential_payout ? (b.potential_payout | number) + ' P' : '-' }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 text-foreground font-semibold">
                      {{ b.actual_payout ? (b.actual_payout | number) + ' P' : '-' }}
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                      <span class="bet-badge" [ngClass]="statusBadgeClass(b.status)" [title]="statusHint(b.status)">
                        {{ statusLabel(b.status) }}
                      </span>
                    </td>
                    <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5">
                      @if (b.result) {
                        <span class="bet-badge" [ngClass]="resultBadgeClass(b.result)" [title]="resultHint(b.result)">
                          {{ resultLabel(b.result) }}
                        </span>
                      } @else {
                        <span class="text-muted-foreground text-[11px]">— belum ada</span>
                      }
                    </td>
                    <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-5 sm:py-3.5 whitespace-nowrap">
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
            currentPageReportTemplate="Menampilkan {first}–{last} dari {totalRecords}" />
        </div>
      }
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
    const { page, pageSize } = PaginationHelper.onPageChange(event, this.pageSize);
    this.currentPage = page;
    this.pageSize = pageSize;
    this.cdr.markForCheck();
  }

  sessionDisplay(code: string): string {
    if (!code || code.length < 12) return code || '-';
    const dt = new Date(
      Date.UTC(+code.slice(0, 4), +code.slice(4, 6) - 1, +code.slice(6, 8), +code.slice(8, 10), +code.slice(10, 12)),
    );
    const p = dt.toLocaleString('en-CA', { timeZone: 'Asia/Jakarta', hour12: false }).split(/[-, :]+/);
    return `N9K-${p[0]}${p[1]}${p[2]}${p[3]}${p[4]}`;
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      PENDING: 'Pending',
      SETTLED: 'Settled',
      CANCELLED: 'Cancelled',
    };
    return map[status?.toUpperCase()] ?? status ?? '—';
  }

  statusHint(status: string): string {
    const map: Record<string, string> = {
      PENDING: 'Stake sudah dipotong, menunggu hasil session draw',
      SETTLED: 'Bet sudah diselesaikan — lihat kolom Result (Win/Lose)',
      CANCELLED: 'Bet dibatalkan, stake dikembalikan',
    };
    return map[status?.toUpperCase()] ?? status;
  }

  statusBadgeClass(status: string): string {
    const map: Record<string, string> = {
      PENDING: 'bet-badge-pending',
      SETTLED: 'bet-badge-settled',
      CANCELLED: 'bet-badge-cancelled',
    };
    return map[status?.toUpperCase()] ?? 'bet-badge-neutral';
  }

  resultLabel(result: string): string {
    return result?.toUpperCase() === 'WIN' ? 'Win' : result?.toUpperCase() === 'LOSE' ? 'Lose' : result;
  }

  resultHint(result: string): string {
    return result?.toUpperCase() === 'WIN'
      ? 'Pemain menang — payout dikreditkan'
      : result?.toUpperCase() === 'LOSE'
        ? 'Pemain kalah — stake hangus'
        : result;
  }

  resultBadgeClass(result: string): string {
    return result?.toUpperCase() === 'WIN'
      ? 'bet-badge-win'
      : result?.toUpperCase() === 'LOSE'
        ? 'bet-badge-lose'
        : 'bet-badge-neutral';
  }
}
