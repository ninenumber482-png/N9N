import { AngularSvgIconModule } from 'angular-svg-icon';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminService } from 'src/app/core/services/admin.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { utcMs } from 'src/shared/utils/utc';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { StatusBadgeComponent } from 'src/app/shared/components/status-badge/status-badge.component';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';

const SESSION_MS = 300_000;
const LOCK_MS = 60_000; // betting + result-editing close 1 min before draw (kept in sync with king.js)
const RESULT_MS = 3_000;

const pad2 = (n: number) => String(n).padStart(2, '0');

function fmtCode(resultMs: number) {
  const d = new Date(resultMs);
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}${pad2(d.getUTCHours())}${pad2(Math.floor(d.getUTCMinutes() / 5) * 5)}`;
}

/* WIB (Asia/Jakarta) date-parts for a UTC session code — DISPLAY only. */
function wibParts(code: string): string[] | null {
  if (!code || code.length < 12) return null;
  const dt = new Date(
    Date.UTC(+code.slice(0, 4), +code.slice(4, 6) - 1, +code.slice(6, 8), +code.slice(8, 10), +code.slice(10, 12)),
  );
  return dt.toLocaleString('en-CA', { timeZone: 'Asia/Jakarta', hour12: false }).split(/[-, :]+/);
}

function toWIB(code: string): string {
  const p = wibParts(code);
  if (!p) return code;
  return `${p[0]}-${p[1]}-${p[2]} ${p[3]}:${p[4]}`;
}

/* The exact code users see in the React app: "N9K-" + WIB digits.
   The matching/settlement key stays the raw UTC `code`. Mirrors king.js. */
function displayCode(code: string): string {
  const p = wibParts(code);
  if (!p) return code;
  return `N9K-${p[0]}${p[1]}${p[2]}${p[3]}${p[4]}`;
}

const fmtTimer = (ms: number) => {
  if (ms < 0) ms = 0;
  const s = Math.ceil(ms / 1000);
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
};

interface DrawResult {
  d1: number;
  d2: number;
  d3: number;
  total: number;
  bs: string;
  oe: string;
}

const PAST_SLOTS = 6; // recently-settled rows shown above the current session
const TOTAL_ROWS = 20; // total rows rendered (past + current + upcoming)
const SWEEP_SLOTS = 12; // completed boundaries the engine catches up on (1 hour)

const randDigit = () => Math.floor(Math.random() * 10);

interface SessionRow {
  index: number;
  code: string;
  display: string;
  wib: string;
  status: string;
  countdown: number;
  d1: number;
  d2: number;
  d3: number;
  total: number;
  bs: string;
  oe: string;
  betCount: number;
  totalStake: number;
  settled: boolean; // result published in king_results (final, money settled)
  hasResult: boolean; // digits to show (either settled actual OR an admin-planned draw)
  editable: boolean; // admin may set/change the result (status NEXT or OPEN)
}

interface PlannedRow {
  session_code: string;
  d1: number;
  d2: number;
  d3: number;
}

interface KingResultRow {
  session_code: string;
  d1: number;
  d2: number;
  d3: number;
  total: number;
  big_small: string;
  odd_even: string;
}

interface BetRow {
  session_code: string;
  stake: number;
}

/* total / BIG-SMALL / ODD-EVEN derived from three digits. */
function deriveDraw(d1: number, d2: number, d3: number): DrawResult {
  const total = d1 + d2 + d3;
  return { d1, d2, d3, total, bs: total >= 14 ? 'BIG' : 'SMALL', oe: total % 2 === 1 ? 'ODD' : 'EVEN' };
}

/* Split a total (0..27) into three digits each 0..9 that sum to it.
   d1's lower bound (total-18) keeps the remainder coverable by two 0..9 digits. */
function splitTotal(total: number): [number, number, number] {
  const d1min = Math.max(0, total - 18);
  const d1max = Math.min(9, total);
  const d1 = d1min + Math.floor(Math.random() * (d1max - d1min + 1));
  const rem = total - d1;
  const d2min = Math.max(0, rem - 9);
  const d2max = Math.min(9, rem);
  const d2 = d2min + Math.floor(Math.random() * (d2max - d2min + 1));
  return [d1, d2, rem - d2];
}

/* Roll random digits whose total satisfies the given BIG/SMALL and/or ODD/EVEN
   constraint (undefined = unconstrained). This is the engine's own draw; the
   admin's only lever is nudging a category, which re-rolls within it. */
function rollDigits(bs?: string, oe?: string): { d1: number; d2: number; d3: number } {
  const lo = bs === 'BIG' ? 14 : 0;
  const hi = bs === 'SMALL' ? 13 : 27;
  const totals: number[] = [];
  for (let t = lo; t <= hi; t++) {
    if (oe === 'ODD' && t % 2 === 0) continue;
    if (oe === 'EVEN' && t % 2 === 1) continue;
    totals.push(t);
  }
  const total = totals[Math.floor(Math.random() * totals.length)];
  const [d1, d2, d3] = splitTotal(total);
  return { d1, d2, d3 };
}

@Component({
  selector: 'app-3dking',
  standalone: true,
  imports: [CommonModule, AngularSvgIconModule, PageHeaderComponent, StatusBadgeComponent, ConfirmDialogModule],
  providers: [ConfirmationService],
  template: `
    <div data-page="3dking" class="space-y-6">
      <app-page-header icon="cube" title="3D King Engine" subtitle="Draw engine and session control" />

      <div class="bg-card border border-border page-accent-card p-5" style="border-top: 3px solid #D946EF;">
        <div class="grid grid-cols-5 gap-4 text-[11px]">
          <div>
            <p class="text-muted-foreground uppercase tracking-wider mb-0.5">Session</p>
            <p class="font-mono text-foreground truncate">{{ currentDisplay || '-' }}</p>
          </div>
          <div>
            <p class="text-muted-foreground uppercase tracking-wider mb-0.5">Phase</p>
            <app-status-badge [value]="currentStatus || '-'" [severity]="phaseSeverity(currentStatus)" />
          </div>
          <div>
            <p class="text-muted-foreground uppercase tracking-wider mb-0.5">Countdown</p>
            <p class="font-mono text-foreground">{{ fmtTimer(currentCountdown) }}</p>
          </div>
          <div>
            <p class="text-muted-foreground uppercase tracking-wider mb-0.5">Last Result</p>
            <p
              class="inline-flex min-w-16 items-center rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 font-mono text-red-400 shadow-[0_0_18px_rgba(239,68,68,0.18)]"
              [class.animate-pulse]="lastResult !== null">
              {{ lastResult !== null ? lastResult : '-' }}
            </p>
          </div>
          <div>
            <p class="text-muted-foreground uppercase tracking-wider mb-0.5">Auto-Engine</p>
            <app-status-badge
              [value]="engineHealthy ? 'OK' : 'STALE'"
              [severity]="engineHealthy ? 'success' : 'warn'" />
          </div>
        </div>
      </div>

      <div class="bg-card border border-border rounded-lg overflow-hidden">
        <div class="overflow-x-auto">
          <table class="saas-table w-full text-left text-[11px]">
            <thead>
              <tr class="border-b border-border text-muted-foreground uppercase tracking-wider text-xs bg-muted/10">
                <th class="px-3 py-2.5 w-8">#</th>
                <th class="px-3 py-2.5">Code</th>
                <th class="px-3 py-2.5">WIB</th>
                <th class="px-3 py-2.5">Phase</th>
                <th class="px-3 py-2.5 text-right">Timer</th>
                <th class="px-1 py-2.5 text-center" colspan="3">Digits</th>
                <th class="px-3 py-2.5 text-right">N9</th>
                <th class="px-2 py-2.5 text-center">BS</th>
                <th class="px-2 py-2.5 text-center">OE</th>
                <th class="px-3 py-2.5 text-right">Bets</th>
                <th class="px-3 py-2.5 text-right">Stake</th>
              </tr>
            </thead>
            <tbody>
              @for (s of displaySessions; track s.code; let i = $index) {
                <tr
                  class="border-b border-border transition-colors text-muted-foreground"
                  [class.king-upcoming-row]="s.status === 'NEXT'"
                  [class.hover:bg-muted/5]="s.status !== 'NEXT' && s.index > 7"
                  [class.bg-red-500/10]="s.index <= 7 && s.status !== 'NEXT'"
                  [class.hover:bg-red-500/15]="s.index <= 7 && s.status !== 'NEXT'"
                  [class.opacity-40]="s.settled && s.index > 7">
                  <td
                    class="px-3 py-2 font-mono text-[11px]"
                    [class.border-l-2]="s.index <= 7 && s.status !== 'NEXT'"
                    [class.border-red-500]="s.index <= 7 && s.status !== 'NEXT'"
                    [class.text-red-400]="s.index <= 7 && s.status !== 'NEXT'"
                    [class.font-semibold]="s.index <= 7 || s.status === 'NEXT'"
                    [class.text-emerald-400]="s.status === 'NEXT'">
                    {{ s.index }}
                  </td>
                  <td
                    class="px-3 py-2 font-mono"
                    [class.text-red-300]="s.index <= 7 && s.status !== 'NEXT'"
                    [class.text-emerald-300]="s.status === 'NEXT'"
                    [class.text-foreground]="s.index > 7 && s.status !== 'NEXT'">
                    {{ s.display }}
                  </td>
                  <td
                    class="px-3 py-2 font-mono text-[11px]"
                    [class.text-red-400/80]="s.index <= 7 && s.status !== 'NEXT'"
                    [class.text-emerald-400/80]="s.status === 'NEXT'">
                    {{ s.wib }}
                  </td>
                  <td class="px-3 py-2">
                    <span
                      class="text-[11px]"
                      [class.text-emerald-400]="s.status === 'NEXT'"
                      [class.font-semibold]="s.status === 'NEXT'"
                      >{{
                        s.status === 'SETTLED'
                          ? 'Settled'
                          : s.status === 'RESULTING'
                            ? 'Resulting'
                            : s.status === 'LOCKED'
                              ? 'Locked'
                              : s.status === 'OPEN'
                                ? 'Open'
                                : 'Next'
                      }}</span
                    >
                  </td>
                  <td
                    class="px-3 py-2 text-right font-mono text-[11px]"
                    [class.text-emerald-400]="s.status === 'NEXT'"
                    [class.font-semibold]="s.status === 'NEXT'">
                    {{ fmtTimer(s.countdown) }}
                  </td>
                  <td
                    class="px-1 py-2 text-center font-mono"
                    [class.text-red-300]="s.index <= 7 && s.hasResult"
                    [class.text-foreground]="s.index > 7 || !s.hasResult">
                    {{ s.hasResult ? s.d1 : '—' }}
                  </td>
                  <td
                    class="px-1 py-2 text-center font-mono"
                    [class.text-red-300]="s.index <= 7 && s.hasResult"
                    [class.text-foreground]="s.index > 7 || !s.hasResult">
                    {{ s.hasResult ? s.d2 : '—' }}
                  </td>
                  <td
                    class="px-1 py-2 text-center font-mono"
                    [class.text-red-300]="s.index <= 7 && s.hasResult"
                    [class.text-foreground]="s.index > 7 || !s.hasResult">
                    {{ s.hasResult ? s.d3 : '—' }}
                  </td>
                  <td
                    class="px-3 py-2 text-right font-mono font-semibold"
                    [class.text-red-400]="s.index <= 7 && s.hasResult"
                    [class.text-foreground]="s.index > 7 || !s.hasResult">
                    {{ s.hasResult ? s.total : '—' }}
                  </td>
                  <td class="px-2 py-2 text-center">
                    @if (s.editable) {
                      <div class="inline-flex gap-1">
                        <button
                          type="button"
                          (click)="confirmOverride(s.code, 'bs', 'BIG')"
                          title="Force BIG"
                          class="px-1.5 py-0.5 rounded text-[11px] transition-colors"
                          [class.bg-muted]="s.bs !== 'BIG'"
                          [class.text-foreground]="s.bs !== 'BIG'"
                          [class.bg-amber-400]="s.bs === 'BIG'"
                          [class.text-background]="s.bs === 'BIG'"
                          [class.font-bold]="s.bs === 'BIG'">
                          B
                        </button>
                        <button
                          type="button"
                          (click)="confirmOverride(s.code, 'bs', 'SMALL')"
                          title="Force SMALL"
                          class="px-1.5 py-0.5 rounded text-[11px] transition-colors"
                          [class.bg-muted]="s.bs !== 'SMALL'"
                          [class.text-foreground]="s.bs !== 'SMALL'"
                          [class.bg-amber-400]="s.bs === 'SMALL'"
                          [class.text-background]="s.bs === 'SMALL'"
                          [class.font-bold]="s.bs === 'SMALL'">
                          S
                        </button>
                      </div>
                    } @else {
                      <span class="text-muted-foreground">{{ s.hasResult ? s.bs : '—' }}</span>
                    }
                  </td>
                  <td class="px-2 py-2 text-center">
                    @if (s.editable) {
                      <div class="inline-flex gap-1">
                        <button
                          type="button"
                          (click)="confirmOverride(s.code, 'oe', 'ODD')"
                          title="Force ODD"
                          class="px-1.5 py-0.5 rounded text-[11px] transition-colors"
                          [class.bg-muted]="s.oe !== 'ODD'"
                          [class.text-foreground]="s.oe !== 'ODD'"
                          [class.bg-amber-400]="s.oe === 'ODD'"
                          [class.text-background]="s.oe === 'ODD'"
                          [class.font-bold]="s.oe === 'ODD'">
                          O
                        </button>
                        <button
                          type="button"
                          (click)="confirmOverride(s.code, 'oe', 'EVEN')"
                          title="Force EVEN"
                          class="px-1.5 py-0.5 rounded text-[11px] transition-colors"
                          [class.bg-muted]="s.oe !== 'EVEN'"
                          [class.text-foreground]="s.oe !== 'EVEN'"
                          [class.bg-amber-400]="s.oe === 'EVEN'"
                          [class.text-background]="s.oe === 'EVEN'"
                          [class.font-bold]="s.oe === 'EVEN'">
                          E
                        </button>
                      </div>
                    } @else {
                      <span class="text-muted-foreground">{{ s.hasResult ? s.oe : '—' }}</span>
                    }
                  </td>
                  <td class="px-3 py-2 text-right text-foreground">{{ s.betCount || 0 }}</td>
                  <td class="px-3 py-2 text-right text-foreground">
                    {{ s.totalStake ? (s.totalStake | number) + 'P' : '—' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between px-3 py-2 border-t border-border text-[11px]">
          <span class="text-muted-foreground">{{ displaySessions.length }} of {{ sessions.length }} sessions</span>
          <div class="flex items-center gap-2">
            <button
              (click)="prevPage()"
              [class.opacity-30]="page === 0"
              class="px-2 py-1 rounded text-foreground hover:bg-muted/20 transition-colors disabled:opacity-30">
              ← Prev
            </button>
            <span class="text-muted-foreground">{{ page + 1 }} / {{ totalPages }}</span>
            <button
              (click)="nextPage()"
              [class.opacity-30]="(page + 1) * pageSize >= sessions.length"
              class="px-2 py-1 rounded text-foreground hover:bg-muted/20 transition-colors disabled:opacity-30">
              Next →
            </button>
          </div>
        </div>
      </div>

      <p-confirmdialog />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThreeDKingComponent implements OnInit, OnDestroy {
  private admin = inject(AdminService);
  private cdr = inject(ChangeDetectorRef);
  private notification = inject(NotificationService);
  private confirmation = inject(ConfirmationService);

  dispCode(code: string) {
    return displayCode(code);
  }

  phaseSeverity(phase: string): 'success' | 'warn' | 'info' | 'secondary' {
    switch (phase) {
      case 'OPEN':
        return 'success';
      case 'LOCKED':
        return 'warn';
      case 'RESULTING':
        return 'info';
      default:
        return 'secondary';
    }
  }

  confirmOverride(code: string, axis: 'bs' | 'oe', value: string) {
    this.confirmation.confirm({
      message: `Paksa <strong>${value}</strong> untuk sesi <strong>${this.dispCode(code)}</strong>? Ini meng-override hasil undian secara manual.`,
      header: 'Konfirmasi Override',
      rejectLabel: 'Batal',
      acceptLabel: `Paksa ${value}`,
      accept: () => this.overrideCategory(code, axis, value),
    });
  }

  // ── Auto-engine health (read-only): healthy if a result landed within ~1.3 sessions ──
  engineHealthy = true;
  lastSettleAt: string | null = null;
  private async loadEngineMeta() {
    try {
      const r = await this.admin.getLatestKingResult();
      const ts = r?.[0]?.created_at as string | undefined;
      this.lastSettleAt = ts ?? null;
      this.engineHealthy = !!ts && Date.now() - utcMs(ts) < 390_000;
    } catch {
      this.engineHealthy = false;
    }
    this.cdr.markForCheck();
  }

  sessions: SessionRow[] = [];
  lastResult: number | null = null;
  currentCode = '';
  currentDisplay = '';
  currentStatus = '';
  currentCountdown = 0;
  page = 0;
  pageSize = 20;

  private timerId: ReturnType<typeof setInterval> | undefined;
  private dataId: ReturnType<typeof setInterval> | undefined;
  /* Published draws keyed by session_code — the shared source of truth (Supabase). */
  private results = new Map<string, DrawResult>();

  get displaySessions() {
    const start = this.page * this.pageSize;
    return this.sessions.slice(start, start + this.pageSize);
  }
  get totalPages() {
    return Math.max(1, Math.ceil(this.sessions.length / this.pageSize));
  }
  nextPage() {
    if ((this.page + 1) * this.pageSize < this.sessions.length) this.page++;
  }
  prevPage() {
    if (this.page > 0) this.page--;
  }
  /* The engine's own draw per session (king_planned). settle_session treats this
     as the authoritative result; the admin only re-rolls its category. */
  private planned = new Map<string, { d1: number; d2: number; d3: number }>();
  /* Sessions whose default draw has been auto-generated, so we write each once. */
  private filling = new Set<string>();
  /* Auto-fill must wait for the first king_planned load — otherwise the t=100ms
     tick would overwrite an admin's saved category with random before we see it. */
  private planLoaded = false;
  private planLoadAttempts = 0;
  /* Settlement calls in flight, so the 100ms tick can't double-invoke a session. */
  private inflight = new Set<string>();
  /* Planned-draw writes in flight, so loadPlanned doesn't overwrite optimistic values. */
  private pendingPlanWrites = new Set<string>();
  /* Bet aggregates per session_code, refreshed alongside results. */
  private betAgg = new Map<string, { count: number; stake: number }>();
  private dbErrorShown = false;
  private fillPlanErrorNotified = new Set<string>();
  private overrideErrorNotified = new Set<string>();
  private betsErrorNotified = false;

  ngOnInit() {
    this.loadData();
    this.buildSessions();
    this.loadEngineMeta();
    // Fast clock: rebuild rows + advance the engine. markForCheck is required
    // because this is a zoneless app — a bare setInterval won't trigger CD, so
    // the table/countdowns would otherwise freeze after first paint.
    // OPTIMIZED: UI ticker 1 detik (cukup untuk countdown human-readable)
    // Business logic (buildSessions + runEngine) dijalankan terpisah
    this.timerId = setInterval(() => {
      this.updateCountdownsOnly();
      this.cdr.markForCheck();
    }, 1000);
    // Business logic: rebuild session rows + engine settle
    this.buildSessions();
    this.runEngine();
    // Slow poll: pull published results + bet aggregates dari Supabase
    // Dikurangi dari 3s ke 15s untuk mengurangi beban DB
    this.dataId = setInterval(() => this.loadData(), 15000);
  }

  ngOnDestroy() {
    if (this.timerId) clearInterval(this.timerId);
    if (this.dataId) clearInterval(this.dataId);
  }

  /** Update countdown display tanpa rebuild seluruh session rows */
  private updateCountdownsOnly() {
    const utc = this.nowUtc();
    let updated = false;
    for (const s of this.sessions) {
      const resultMs = this.parseCodeToMs(s.code);
      if (!resultMs) continue;
      const startMs = resultMs - SESSION_MS;
      const lockMs = resultMs - LOCK_MS;
      const sStart = resultMs + RESULT_MS;
      let newStatus = s.status;
      let newCd = s.countdown;
      if (utc < startMs) {
        newStatus = 'NEXT';
        newCd = startMs - utc;
      } else if (utc < lockMs) {
        newStatus = 'OPEN';
        newCd = lockMs - utc;
      } else if (utc < resultMs) {
        newStatus = 'LOCKED';
        newCd = resultMs - utc;
      } else if (utc < sStart) {
        newStatus = 'RESULTING';
        newCd = 0;
      } else {
        newStatus = 'SETTLED';
        newCd = 0;
      }
      if (newStatus !== s.status || newCd !== s.countdown) {
        s.status = newStatus;
        s.countdown = newCd;
        s.editable = newStatus === 'NEXT' || newStatus === 'OPEN';
        updated = true;
      }
    }
    // Update header countdown
    const active = this.sessions.find((s) => s.status === 'OPEN' || s.status === 'LOCKED');
    if (active) {
      this.currentCode = active.code;
      this.currentDisplay = displayCode(active.code);
      this.currentStatus = active.status;
      this.currentCountdown = active.countdown;
    }
    // Rebuild hanya jika ada perubahan status signifikan
    if (updated) {
      const nowBoundary = Math.floor(utc / SESSION_MS) * SESSION_MS;
      const lastBoundary = Math.floor((utc - 1000) / SESSION_MS) * SESSION_MS;
      if (nowBoundary !== lastBoundary) {
        this.buildSessions();
        this.runEngine();
      }
    }
  }

  private parseCodeToMs(code: string): number | null {
    if (!code || code.length !== 12) return null;
    try {
      return Date.UTC(
        +code.slice(0, 4),
        +code.slice(4, 6) - 1,
        +code.slice(6, 8),
        +code.slice(8, 10),
        +code.slice(10, 12),
      );
    } catch {
      return null;
    }
  }

  private nowUtc(): number {
    const d = new Date();
    return Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    );
  }

  buildSessions() {
    const utc = this.nowUtc();
    let r = Math.ceil(utc / SESSION_MS) * SESSION_MS; // next result boundary
    if (utc % SESSION_MS === 0) r += SESSION_MS;
    const firstResultMs = r - PAST_SLOTS * SESSION_MS;

    let curCode = '',
      curDisplay = '',
      curStatus = '',
      curCountdown = 0,
      curFound = false;
    const rows: SessionRow[] = [];
    for (let i = 0; i < TOTAL_ROWS; i++) {
      const resultMs = firstResultMs + i * SESSION_MS;
      const startMs = resultMs - SESSION_MS; // its betting window opens here
      const lockMs = resultMs - LOCK_MS;
      const sStart = resultMs + RESULT_MS;
      const code = fmtCode(resultMs);

      let status: string;
      if (utc < startMs)
        status = 'NEXT'; // scheduled — window not open yet
      else if (utc < lockMs)
        status = 'OPEN'; // betting + result-editing open
      else if (utc < resultMs)
        status = 'LOCKED'; // final minute — locked in
      else if (utc < sStart) status = 'RESULTING';
      else status = 'SETTLED';

      const editable = status === 'NEXT' || status === 'OPEN';
      // Settled actual takes priority; before that, show the admin's planned draw.
      const plan = this.planned.get(code);
      const res = this.results.get(code) ?? (plan ? deriveDraw(plan.d1, plan.d2, plan.d3) : undefined);
      const settled = this.results.has(code);
      const hasResult = !!res;
      const cd =
        status === 'OPEN' ? lockMs - utc : status === 'LOCKED' ? resultMs - utc : status === 'NEXT' ? startMs - utc : 0;
      const agg = this.betAgg.get(code);

      // The "current" session = first active (OPEN/LOCKED) row, i.e. the live one.
      if (!curFound && (status === 'OPEN' || status === 'LOCKED')) {
        curCode = code;
        curDisplay = displayCode(code);
        curStatus = status;
        curCountdown = cd;
        curFound = true;
      }

      rows.push({
        index: i + 1,
        code,
        display: displayCode(code),
        wib: toWIB(code),
        status,
        countdown: cd,
        d1: res?.d1 ?? 0,
        d2: res?.d2 ?? 0,
        d3: res?.d3 ?? 0,
        total: res?.total ?? 0,
        bs: res?.bs ?? '',
        oe: res?.oe ?? '',
        betCount: agg?.count ?? 0,
        totalStake: agg?.stake ?? 0,
        settled,
        hasResult,
        editable,
      });
    }
    this.sessions = rows;
    this.currentCode = curCode;
    this.currentDisplay = curDisplay;
    this.currentStatus = curStatus;
    this.currentCountdown = curCountdown;
  }

  /* (1) Give every upcoming session its own engine draw, then (2) settle every
     completed boundary that has no published result yet (catches up the last
     hour after a reopen). */
  private runEngine() {
    this.ensureUpcomingPlans();
    const utc = this.nowUtc();
    const lastBoundary = Math.floor(utc / SESSION_MS) * SESSION_MS;
    for (let k = 0; k < SWEEP_SLOTS; k++) {
      const resultMs = lastBoundary - k * SESSION_MS;
      if (utc < resultMs) continue; // result time not reached
      const code = fmtCode(resultMs);
      if (this.results.has(code) || this.inflight.has(code)) continue;
      this.settle(code);
    }
  }

  /* The engine "has its own result": auto-generate + persist a random draw for
     every editable (NEXT/OPEN) session that doesn't have one yet — written once. */
  private ensureUpcomingPlans() {
    if (!this.planLoaded) return; // never auto-fill before we've read existing plans
    for (const s of this.sessions) {
      if (!s.editable || this.planned.has(s.code) || this.filling.has(s.code)) continue;
      this.fillPlan(s.code, rollDigits());
    }
  }

  private fillPlan(code: string, d: { d1: number; d2: number; d3: number }) {
    this.filling.add(code);
    this.planned.set(code, d); // optimistic; loadPlanned merges DB over local
    this.pendingPlanWrites.add(code);
    this.admin
      .setPlanned(code, d.d1, d.d2, d.d3)
      .then(() => this.pendingPlanWrites.delete(code))
      .catch((err: unknown) => {
        this.pendingPlanWrites.delete(code);
        // fillPlan failed
        if (!this.fillPlanErrorNotified.has(code)) {
          this.fillPlanErrorNotified.add(code);
          this.notification.error(
            'Plan save failed',
            `Session ${code}: ${(err instanceof Error ? err.message : String(err)).slice(0, 60)}`,
          );
        }
      });
  }

  /* Admin's only lever: nudge a category. Re-rolls digits so the chosen axis
     becomes `value` while the other axis keeps its current value, then persists. */
  overrideCategory(code: string, axis: 'bs' | 'oe', value: string) {
    const cur = this.planned.get(code) ?? rollDigits();
    const d = deriveDraw(cur.d1, cur.d2, cur.d3);
    const bs = axis === 'bs' ? value : d.bs;
    const oe = axis === 'oe' ? value : d.oe;
    this.filling.add(code);
    const rolled = rollDigits(bs, oe);
    this.planned.set(code, rolled);
    // Zoneless: reflect the new category/digits in the table immediately —
    // otherwise the row (highlight + Digits column) won't change until the next
    // 5-min boundary, making the Force buttons look like they do nothing.
    this.buildSessions();
    this.cdr.markForCheck();
    this.pendingPlanWrites.add(code);
    this.admin
      .setPlanned(code, rolled.d1, rolled.d2, rolled.d3)
      .then(() => this.pendingPlanWrites.delete(code))
      .catch((err: unknown) => {
        this.pendingPlanWrites.delete(code);
        // overrideCategory failed
        if (!this.overrideErrorNotified.has(code)) {
          this.overrideErrorNotified.add(code);
          this.notification.error(
            'Override failed',
            `Session ${code}: ${(err instanceof Error ? err.message : String(err)).slice(0, 60)}`,
          );
        }
      });
  }

  private async loadData() {
    await Promise.all([this.loadResults(), this.loadBets(), this.loadPlanned()]);
    // Reflect freshly-loaded results/plans/bets into the visible session rows
    // immediately — otherwise the Digits column stays "—" until the next
    // 5-minute boundary rebuilds sessions.
    this.buildSessions();
    this.cdr.markForCheck();
  }

  private async loadPlanned() {
    try {
      const rows = (await this.admin.getPlanned()) as unknown as PlannedRow[];
      // Merge DB over local so optimistic writes that haven't landed yet survive.
      // BUT don't overwrite codes that have a write still in-flight.
      const map = new Map(this.planned);
      for (const r of rows) {
        if (this.pendingPlanWrites.has(r.session_code)) continue;
        map.set(r.session_code, { d1: r.d1, d2: r.d2, d3: r.d3 });
      }
      this.planned = map;
      this.planLoaded = true;
      this.planLoadAttempts = 0;
      this.dbErrorShown = false;
    } catch (err: unknown) {
      this.planLoadAttempts++;
      // ROOT-CAUSE FIX: never block the engine forever because of a DB error.
      // The engine must always generate local draws so the admin UI stays alive.
      this.planLoaded = true;
      const msg = err instanceof Error ? err.message : String(err);
      // loadPlanned failed
      // Show a toast once so the admin knows the DB is unreachable.
      if (!this.dbErrorShown && this.planLoadAttempts <= 3) {
        this.dbErrorShown = true;
        this.notification.error(
          '3D King engine degraded',
          `Could not load planned draws: ${msg.slice(0, 80)}. Local random draws are active.`,
        );
      }
    }
  }

  /* Settle a completed session via the atomic RPC. The DB is the authority: it
     uses the admin's king_planned draw if one exists, else these random digits.
     We still pass the local plan (when known) as a belt-and-suspenders fallback.
     The DB primary key makes this idempotent even if two clients race. */
  private settle(code: string) {
    this.inflight.add(code);
    const plan = this.planned.get(code);
    const d1 = plan?.d1 ?? randDigit();
    const d2 = plan?.d2 ?? randDigit();
    const d3 = plan?.d3 ?? randDigit();
    this.admin
      .settleSession(code, d1, d2, d3)
      .then(() => this.loadResults())
      .catch((err: unknown) => {
        // settle failed
        // Only notify once per batch of failures to avoid toast spam.
        if (!this.dbErrorShown) {
          this.dbErrorShown = true;
          this.notification.error(
            'Settlement failed',
            `Session ${code} could not be settled: ${(err instanceof Error ? err.message : String(err)).slice(0, 80)}`,
          );
        }
      })
      .finally(() => this.inflight.delete(code));
  }

  private async loadResults() {
    try {
      const rows = (await this.admin.getKingResults(200)) as unknown as KingResultRow[];
      const map = new Map<string, DrawResult>();
      for (const r of rows) {
        map.set(r.session_code, {
          d1: r.d1,
          d2: r.d2,
          d3: r.d3,
          total: r.total,
          bs: r.big_small,
          oe: r.odd_even,
        });
      }
      this.results = map;
      this.lastResult = rows.length ? Number(rows[0].total) : this.lastResult;
    } catch (err: unknown) {
      // loadResults failed
      if (!this.dbErrorShown) {
        this.dbErrorShown = true;
        this.notification.error(
          '3D King result sync failed',
          `Could not load settled results: ${(err instanceof Error ? err.message : String(err)).slice(0, 80)}`,
        );
      }
    }
  }

  private async loadBets() {
    try {
      const bets = (await this.admin.getBets(2000)) as unknown as BetRow[];
      const agg = new Map<string, { count: number; stake: number }>();
      for (const b of bets) {
        if (!b.session_code) continue;
        const a = agg.get(b.session_code) || { count: 0, stake: 0 };
        a.count += 1;
        a.stake += Number(b.stake) || 0;
        agg.set(b.session_code, a);
      }
      this.betAgg = agg;
      this.betsErrorNotified = false;
    } catch (err: unknown) {
      // loadBets failed
      if (!this.betsErrorNotified) {
        this.betsErrorNotified = true;
        this.notification.error(
          'Bet sync failed',
          `Could not load bet aggregates: ${(err instanceof Error ? err.message : String(err)).slice(0, 60)}`,
        );
      }
    }
  }

  fmtTimer = fmtTimer;
}
