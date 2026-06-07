import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { AdminService } from 'src/app/core/services/admin.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { RealtimeService } from 'src/app/core/services/realtime.service';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { PaginatorModule } from 'primeng/paginator';
import { InputTextModule } from 'primeng/inputtext';

type TabId = 'deposits' | 'withdrawals' | 'turnover';

interface DepositTx {
  id: string;
  user?: { username: string; display_name?: string };
  amount: number;
  method?: string;
  status: string;
  created_at: string;
  proof_image_url?: string;
  type?: string;
}

interface WithdrawTx {
  id: string;
  user?: { username: string; display_name?: string };
  amount: number;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  status: string;
  created_at: string;
  withdrawal_fee?: number;
  notes?: string;
  type?: string;
}

interface TurnoverItem {
  userId: string;
  username: string;
  displayName: string;
  main: number;
  bonus: number;
  deposited: number;
  withdrawn: number;
  turnover: number;
  locked: number;
  net: number;
  pnl: number;
}

interface DepositLock {
  user_id: string;
  turnover_required: string | number;
  turnover_applied: string | number;
}

interface WalletRow {
  user_id: string;
  user?: { username: string; display_name: string; role: string };
  balance_main: string | number;
  balance_bonus: string | number;
  total_deposited: string | number;
  total_withdrawn: string | number;
  total_turnover: string | number;
}

interface PageEvent {
  first?: number;
  rows?: number;
}

@Component({
  selector: 'app-wallet-admin',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AngularSvgIconModule,
    WibDatePipe,
    SelectModule,
    TagModule,
    DialogModule,
    ConfirmDialogModule,
    PaginatorModule,
    InputTextModule,
  ],
  providers: [ConfirmationService],
  template: `
    <div data-page="wallet-admin" class="space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="page-header-icon"><svg-icon src="assets/icons/heroicons/outline/cog.svg" svgClass="h-4 w-4"></svg-icon></div>
          <div>
            <h1 class="max-sm:text-lg sm:text-xl font-bold text-foreground tracking-tight">Wallet Management</h1>
            <p class="text-muted-foreground mt-0.5 text-xs">Kelola deposit, penarikan, dan turnover pengguna</p>
          </div>
        </div>
      </div>

      <div class="flex gap-1 rounded-lg border border-border bg-card p-1">
        @for (tb of tabs; track tb.id) {
          <button
            (click)="tab = tb.id"
            class="flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition text-center"
            [class.bg-foreground]="tab === tb.id"
            [class.text-background]="tab === tb.id"
            [class.text-muted-foreground]="tab !== tb.id"
            [class.hover:text-foreground]="tab !== tb.id">
            {{ tb.label }}
          </button>
        }
      </div>

      @if (tab === 'deposits') {
        <ng-container *ngTemplateOutlet="depositTab" />
      }
      @if (tab === 'withdrawals') {
        <ng-container *ngTemplateOutlet="withdrawTab" />
      }
      @if (tab === 'turnover') {
        <ng-container *ngTemplateOutlet="turnoverTab" />
      }
    </div>

    <ng-template #depositTab>
      <div class="flex flex-wrap gap-2">
        <button
          (click)="loadDeposits()"
          class="bg-card border-border text-muted-foreground hover:text-foreground rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors">
          <svg
            class="h-3.5 w-3.5 inline mr-1"
            [class.animate-spin]="depLoading"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
        <input
          pInputText
          [(ngModel)]="depSearch"
          (ngModelChange)="applyDepFilter()"
          placeholder="Cari username, nominal…"
          class="!w-48 !text-xs !py-1.5 !px-2.5" />
        <p-select
          [(ngModel)]="depStatusFilter"
          (ngModelChange)="applyDepFilter()"
          [options]="statusOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Semua Status"
          class="w-36"
          styleClass="!text-xs !w-full" />
      </div>

      @if (depError) {
        <div class="bg-card border-border rounded-lg border p-5 text-xs text-muted-foreground">
          <p class="font-medium text-foreground">Gagal memuat deposit</p>
          <p class="mt-0.5">{{ depError }}</p>
          <button
            (click)="loadDeposits()"
            class="mt-2 bg-card border-border rounded border px-2.5 py-1 text-xs font-medium">
            Coba Lagi
          </button>
        </div>
      }

      @if (depLoading) {
        <div class="text-muted-foreground py-12 text-center text-xs">Memuat deposit...</div>
      }

      <div class="bg-card border-border rounded-lg page-accent-card" [class.hidden]="depLoading">
        <div class="overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr
                class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                <th class="px-3 py-3">Ref#</th>
                <th class="px-3 py-3">User</th>
                <th class="px-3 py-3">Nominal</th>
                <th class="px-3 py-3">Metode</th>
                <th class="px-3 py-3">Status</th>
                <th class="px-3 py-3">Tanggal</th>
                <th class="px-3 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              @for (tx of depDisplay; track tx.id) {
                <tr
                  class="border-border hover:bg-accent/30 border-b text-xs transition-colors cursor-pointer"
                  (click)="openDepDetail(tx)">
                  <td class="px-3 py-3 font-mono text-[10px] text-muted-foreground">
                    {{ tx.id.slice(0, 8).toUpperCase() }}
                  </td>
                  <td class="px-3 py-3">
                    <p class="font-semibold text-foreground">{{ tx.user?.display_name || tx.user?.username || '—' }}</p>
                    <p class="text-muted-foreground text-[10px]">&#64;{{ tx.user?.username }}</p>
                  </td>
                  <td class="px-3 py-3 font-bold text-foreground">+{{ tx.amount | number: '1.0-0' }} P</td>
                  <td class="px-3 py-3 text-[10px] text-muted-foreground">{{ tx.method || '-' }}</td>
                  <td class="px-3 py-3"><p-tag [value]="tx.status" [severity]="txStatusSeverity(tx.status)" /></td>
                  <td class="text-muted-foreground px-3 py-3 whitespace-nowrap text-[10px]">
                    {{ tx.created_at | wibDate: 'short' }}
                  </td>
                  <td class="px-3 py-3">
                    @if (tx.status === 'PENDING') {
                      <div class="flex gap-1" (click)="$event.stopPropagation()">
                        <button
                          (click)="confirmApproveDep(tx)"
                          [disabled]="depProcessing"
                          class="bg-foreground text-background disabled:opacity-50 rounded px-2 py-1 text-[10px] font-medium">
                          Setuju
                        </button>
                        <button
                          (click)="confirmRejectDep(tx)"
                          [disabled]="depProcessing"
                          class="bg-card border-border text-muted-foreground hover:text-foreground disabled:opacity-50 rounded border px-2 py-1 text-[10px] font-medium">
                          Tolak
                        </button>
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p-paginator
          (onPageChange)="depPageChange($event)"
          [first]="(depPage - 1) * depPageSize"
          [rows]="depPageSize"
          [totalRecords]="depFiltered.length" />
      </div>

      <p-dialog
        [(visible)]="depDetailVisible"
        [modal]="true"
        [style]="{ width: '500px' }"
        [draggable]="false"
        [resizable]="false"
        [closable]="true"
        (onHide)="depDetail = null; depDetailVisible = false">
        <ng-template pTemplate="header">
          <span class="text-sm font-bold text-foreground">Detail Deposit</span>
        </ng-template>
        <ng-template pTemplate="content">
          @if (depDetail) {
            <div class="space-y-3 text-xs">
              <div class="flex justify-between">
                <span class="text-muted-foreground">ID</span
                ><span class="font-mono text-foreground">{{ depDetail.id }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">User</span
                ><span class="text-foreground">{{ depDetail.user?.display_name || depDetail.user?.username }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Nominal</span
                ><span class="font-bold text-foreground">+{{ depDetail.amount | number }} P</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Metode</span
                ><span class="text-foreground">{{ depDetail.method || '-' }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-muted-foreground">Status</span
                ><p-tag [value]="depDetail.status" [severity]="txStatusSeverity(depDetail.status)" />
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Tanggal</span
                ><span class="text-foreground">{{ depDetail.created_at | wibDate: 'short' }}</span>
              </div>
              @if (depDetail.proof_image_url) {
                <div>
                  <p class="text-muted-foreground mb-1">Bukti Transfer</p>
                  <img
                    [src]="depDetail.proof_image_url"
                    class="w-full rounded-lg border border-border max-h-60 object-contain" />
                </div>
              }
            </div>
          }
        </ng-template>
      </p-dialog>
    </ng-template>

    <ng-template #withdrawTab>
      <div class="flex flex-wrap gap-2">
        <button
          (click)="loadWithdrawals()"
          class="bg-card border-border text-muted-foreground hover:text-foreground rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors">
          <svg
            class="h-3.5 w-3.5 inline mr-1"
            [class.animate-spin]="wdLoading"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
        <input
          pInputText
          [(ngModel)]="wdSearch"
          (ngModelChange)="applyWdFilter()"
          placeholder="Cari username, nominal…"
          class="!w-48 !text-xs !py-1.5 !px-2.5" />
        <p-select
          [(ngModel)]="wdStatusFilter"
          (ngModelChange)="applyWdFilter()"
          [options]="statusOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Semua Status"
          class="w-36"
          styleClass="!text-xs !w-full" />
      </div>

      @if (wdError) {
        <div class="bg-card border-border rounded-lg border p-5 text-xs text-muted-foreground">
          <p class="font-medium text-foreground">Gagal memuat penarikan</p>
          <p class="mt-0.5">{{ wdError }}</p>
          <button
            (click)="loadWithdrawals()"
            class="mt-2 bg-card border-border rounded border px-2.5 py-1 text-xs font-medium">
            Coba Lagi
          </button>
        </div>
      }

      @if (wdLoading) {
        <div class="text-muted-foreground py-12 text-center text-xs">Memuat penarikan...</div>
      }

      <div class="bg-card border-border rounded-lg border overflow-hidden" [class.hidden]="wdLoading">
        <div class="overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr
                class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                <th class="px-3 py-3">Ref#</th>
                <th class="px-3 py-3">User</th>
                <th class="px-3 py-3">Nominal</th>
                <th class="px-3 py-3">Rekening</th>
                <th class="px-3 py-3">Status</th>
                <th class="px-3 py-3">Tanggal</th>
                <th class="px-3 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              @for (tx of wdDisplay; track tx.id) {
                <tr
                  class="border-border hover:bg-accent/30 border-b text-xs transition-colors cursor-pointer"
                  (click)="openWdDetail(tx)">
                  <td class="px-3 py-3 font-mono text-[10px] text-muted-foreground">
                    {{ tx.id.slice(0, 8).toUpperCase() }}
                  </td>
                  <td class="px-3 py-3">
                    <p class="font-semibold text-foreground">{{ tx.user?.display_name || tx.user?.username || '—' }}</p>
                    <p class="text-muted-foreground text-[10px]">&#64;{{ tx.user?.username }}</p>
                  </td>
                  <td class="px-3 py-3 font-bold text-muted-foreground">-{{ tx.amount | number: '1.0-0' }} P</td>
                  <td class="px-3 py-3 text-[10px] text-muted-foreground">
                    {{ tx.bank_name || '-' }}
                    {{ tx.bank_account_number ? '· ' + tx.bank_account_number.slice(-4) : '' }}
                  </td>
                  <td class="px-3 py-3"><p-tag [value]="tx.status" [severity]="txStatusSeverity(tx.status)" /></td>
                  <td class="text-muted-foreground px-3 py-3 whitespace-nowrap text-[10px]">
                    {{ tx.created_at | wibDate: 'short' }}
                  </td>
                  <td class="px-3 py-3">
                    @if (tx.status === 'PENDING') {
                      <div class="flex gap-1" (click)="$event.stopPropagation()">
                        <button
                          (click)="confirmApproveWd(tx)"
                          [disabled]="wdProcessing"
                          class="bg-foreground text-background disabled:opacity-50 rounded px-2 py-1 text-[10px] font-medium">
                          Setuju
                        </button>
                        <button
                          (click)="confirmRejectWd(tx)"
                          [disabled]="wdProcessing"
                          class="bg-card border-border text-muted-foreground hover:text-foreground disabled:opacity-50 rounded border px-2 py-1 text-[10px] font-medium">
                          Tolak
                        </button>
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p-paginator
          (onPageChange)="wdPageChange($event)"
          [first]="(wdPage - 1) * wdPageSize"
          [rows]="wdPageSize"
          [totalRecords]="wdFiltered.length" />
      </div>

      <p-dialog
        [(visible)]="wdDetailVisible"
        [modal]="true"
        [style]="{ width: '500px' }"
        [draggable]="false"
        [resizable]="false"
        [closable]="true"
        (onHide)="wdDetail = null; wdDetailVisible = false">
        <ng-template pTemplate="header">
          <span class="text-sm font-bold text-foreground">Detail Penarikan</span>
        </ng-template>
        <ng-template pTemplate="content">
          @if (wdDetail) {
            <div class="space-y-3 text-xs">
              <div class="flex justify-between">
                <span class="text-muted-foreground">ID</span
                ><span class="font-mono text-foreground">{{ wdDetail.id }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">User</span
                ><span class="text-foreground">{{ wdDetail.user?.display_name || wdDetail.user?.username }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Nominal</span
                ><span class="font-bold text-muted-foreground">-{{ wdDetail.amount | number }} P</span>
              </div>
              @if (wdDetail.withdrawal_fee) {
                <div class="flex justify-between">
                  <span class="text-muted-foreground">Fee</span
                  ><span class="text-muted-foreground">-{{ wdDetail.withdrawal_fee | number }} P</span>
                </div>
              }
              <div class="flex justify-between">
                <span class="text-muted-foreground">Bank</span
                ><span class="text-foreground">{{ wdDetail.bank_name || '-' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">No. Rekening</span
                ><span class="font-mono text-foreground">{{ wdDetail.bank_account_number || '-' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">A/n</span
                ><span class="text-foreground">{{ wdDetail.bank_account_name || '-' }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-muted-foreground">Status</span
                ><p-tag [value]="wdDetail.status" [severity]="txStatusSeverity(wdDetail.status)" />
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Tanggal</span
                ><span class="text-foreground">{{ wdDetail.created_at | wibDate: 'short' }}</span>
              </div>
              @if (wdDetail.notes) {
                <div>
                  <p class="text-muted-foreground mb-1">Catatan</p>
                  <p class="text-foreground">{{ wdDetail.notes }}</p>
                </div>
              }
            </div>
          }
        </ng-template>
      </p-dialog>
    </ng-template>

    <ng-template #turnoverTab>
      <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div class="bg-card border-border rounded-lg border p-4">
          <p class="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">Total Turnover</p>
          <p class="text-foreground text-2xl font-black mt-1">{{ toTotal | number: '1.0-0' }}</p>
        </div>
        <div class="bg-card border-border rounded-lg border p-4">
          <p class="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">Net Deposit</p>
          <p class="text-foreground text-2xl font-black mt-1">{{ toNetDeposit | number: '1.0-0' }}</p>
        </div>
        <div class="bg-card border-border rounded-lg border p-4">
          <p class="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">Platform PnL</p>
          <p [class]="'text-2xl font-black mt-1 ' + (toPlatformPnl >= 0 ? 'text-foreground' : 'text-muted-foreground')">
            {{ toPlatformPnl | number: '1.0-0' }}
          </p>
        </div>
        <div class="bg-card border-border rounded-lg border p-4">
          <p class="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">Avg Win Rate</p>
          <p class="text-foreground text-2xl font-black mt-1">{{ toWinRate }}%</p>
        </div>
      </div>

      <button
        (click)="loadTurnover()"
        class="bg-card border-border text-muted-foreground hover:text-foreground rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors">
        <svg class="h-3.5 w-3.5 inline mr-1" [class.animate-spin]="toLoading" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Refresh
      </button>

      <div class="bg-card border-border rounded-lg border overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr
                class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                <th class="px-3 py-3">User</th>
                <th class="px-3 py-3">Main</th>
                <th class="px-3 py-3">Bonus</th>
                <th class="px-3 py-3">Deposit</th>
                <th class="px-3 py-3">WD</th>
                <th class="px-3 py-3">Turnover</th>
                <th class="px-3 py-3">Locked</th>
                <th class="px-3 py-3">Net</th>
                <th class="px-3 py-3">PnL</th>
              </tr>
            </thead>
            <tbody>
              @for (w of toDisplay; track w.userId) {
                <tr class="border-border border-b text-xs">
                  <td class="px-3 py-3">
                    <p class="font-semibold text-foreground">{{ w.displayName }}</p>
                    <p class="text-muted-foreground text-[10px]">&#64;{{ w.username }}</p>
                  </td>
                  <td class="px-3 py-3 font-bold text-foreground">{{ w.main | number: '1.0-0' }}</td>
                  <td class="px-3 py-3 text-foreground">{{ w.bonus | number: '1.0-0' }}</td>
                  <td class="px-3 py-3 text-foreground font-semibold">{{ w.deposited | number: '1.0-0' }}</td>
                  <td class="px-3 py-3 text-muted-foreground font-semibold">{{ w.withdrawn | number: '1.0-0' }}</td>
                  <td class="px-3 py-3 font-bold text-foreground">{{ w.turnover | number: '1.0-0' }}</td>
                  <td class="px-3 py-3">
                    @if (w.locked > 0) {
                      <span class="text-foreground font-semibold">{{ w.locked | number: '1.0-0' }}</span>
                    } @else {
                      <span class="text-foreground text-[10px]">Lunas</span>
                    }
                  </td>
                  <td class="px-3 py-3 font-semibold text-foreground">{{ w.net | number: '1.0-0' }}</td>
                  <td class="px-3 py-3 font-bold text-foreground">{{ w.pnl | number: '1.0-0' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p-paginator
          (onPageChange)="toPageChange($event)"
          [first]="(toPage - 1) * toPageSize"
          [rows]="toPageSize"
          [totalRecords]="toFiltered.length" />
      </div>
    </ng-template>

    <p-confirmdialog />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletAdminComponent implements OnInit, OnDestroy {
  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private notification = inject(NotificationService);
  private realtime = inject(RealtimeService);
  private cdr = inject(ChangeDetectorRef);
  private confirmation = inject(ConfirmationService);
  private route = inject(ActivatedRoute);

  tab: TabId = 'deposits';
  tabs = [
    { id: 'deposits' as TabId, label: 'Deposit' },
    { id: 'withdrawals' as TabId, label: 'Withdraw' },
    { id: 'turnover' as TabId, label: 'Turnover' },
  ];

  statusOptions = [
    { label: 'Semua Status', value: '' },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Failed', value: 'FAILED' },
  ];

  depAll: DepositTx[] = [];
  depFiltered: DepositTx[] = [];
  depDisplay: DepositTx[] = [];
  depSearch = '';
  depStatusFilter = '';
  depPage = 1;
  depPageSize = 20;
  depLoading = false;
  depError = '';
  depProcessing = false;
  depDetail: DepositTx | null = null;
  depDetailVisible = false;

  wdAll: WithdrawTx[] = [];
  wdFiltered: WithdrawTx[] = [];
  wdDisplay: WithdrawTx[] = [];
  wdSearch = '';
  wdStatusFilter = '';
  wdPage = 1;
  wdPageSize = 20;
  wdLoading = false;
  wdError = '';
  wdProcessing = false;
  wdDetail: WithdrawTx | null = null;
  wdDetailVisible = false;

  toAll: TurnoverItem[] = [];
  toFiltered: TurnoverItem[] = [];
  toDisplay: TurnoverItem[] = [];
  toPage = 1;
  toPageSize = 20;
  toTotal = 0;
  toNetDeposit = 0;
  toPlatformPnl = 0;
  toWinRate = 0;
  toLoading = false;

  private destroy$ = new Subject<void>();

  ngOnInit() {
    const path = this.route.snapshot.url[0]?.path;
    if (path === 'withdrawals') this.tab = 'withdrawals';
    else if (path === 'turnover') this.tab = 'turnover';
    this.loadDeposits();
    this.loadWithdrawals();
    this.loadTurnover();
    this.realtime.transactions$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.loadDeposits();
      this.loadWithdrawals();
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  openDepDetail(tx: DepositTx) {
    this.depDetail = tx;
    this.depDetailVisible = true;
    this.cdr.markForCheck();
  }

  openWdDetail(tx: WithdrawTx) {
    this.wdDetail = tx;
    this.wdDetailVisible = true;
    this.cdr.markForCheck();
  }

  loadDeposits() {
    this.depLoading = true;
    this.depError = '';
    this.admin
      .getDeposits()
      .then((r) => {
        this.depAll = r || [];
        this.applyDepFilter();
      })
      .catch((e) => (this.depError = e.message))
      .finally(() => {
        this.depLoading = false;
        this.cdr.markForCheck();
      });
  }
  applyDepFilter() {
    let f = this.depAll;
    if (this.depSearch) {
      const q = this.depSearch.toLowerCase();
      f = f.filter((t) => t.user?.username?.toLowerCase().includes(q) || String(t.amount).includes(q));
    }
    if (this.depStatusFilter) f = f.filter((t) => t.status === this.depStatusFilter);
    this.depFiltered = f;
    this.depPage = 1;
    this.depDisplay = f.slice(0, this.depPageSize);
  }
  depPageChange(event: PageEvent) {
    this.depPage = Math.floor((event.first ?? 0) / (event.rows ?? this.depPageSize)) + 1;
    this.depPageSize = event.rows ?? this.depPageSize;
    this.depDisplay = this.depFiltered.slice((this.depPage - 1) * this.depPageSize, this.depPage * this.depPageSize);
    this.cdr.markForCheck();
  }

  confirmApproveDep(tx: DepositTx) {
    this.confirmation.confirm({
      message: `Setujui deposit +${tx.amount.toLocaleString()} P dari ${tx.user?.username || 'pengguna'}?`,
      header: 'Konfirmasi',
      rejectLabel: 'Batal',
      acceptLabel: 'Setujui',
      accept: () => this.executeDep('approve', tx),
    });
  }
  confirmRejectDep(tx: DepositTx) {
    this.confirmation.confirm({
      message: `Tolak deposit +${tx.amount.toLocaleString()} P dari ${tx.user?.username || 'pengguna'}?`,
      header: 'Tolak Transaksi',
      rejectLabel: 'Batal',
      acceptLabel: 'Tolak',
      accept: () => this.executeDep('reject', tx),
    });
  }
  private executeDep(action: 'approve' | 'reject', tx: DepositTx) {
    const admin = this.auth.getCurrentUser();
    if (!admin?.username) return;
    this.depProcessing = true;
    const p =
      action === 'approve'
        ? this.admin.approveDeposit(tx.id, admin.username)
        : this.admin.rejectDeposit(tx.id, admin.username);
    p.then(() => {
      this.notification.success(action === 'approve' ? 'Deposit disetujui' : 'Deposit ditolak');
      this.loadDeposits();
      this.loadTurnover();
    })
      .catch((e) => this.notification.error(e.message))
      .finally(() => {
        this.depProcessing = false;
        this.cdr.markForCheck();
      });
  }

  loadWithdrawals() {
    this.wdLoading = true;
    this.wdError = '';
    this.admin
      .getWithdrawals()
      .then((r) => {
        this.wdAll = r || [];
        this.applyWdFilter();
      })
      .catch((e) => (this.wdError = e.message))
      .finally(() => {
        this.wdLoading = false;
        this.cdr.markForCheck();
      });
  }
  applyWdFilter() {
    let f = this.wdAll;
    if (this.wdSearch) {
      const q = this.wdSearch.toLowerCase();
      f = f.filter((t) => t.user?.username?.toLowerCase().includes(q) || String(t.amount).includes(q));
    }
    if (this.wdStatusFilter) f = f.filter((t) => t.status === this.wdStatusFilter);
    this.wdFiltered = f;
    this.wdPage = 1;
    this.wdDisplay = f.slice(0, this.wdPageSize);
  }
  wdPageChange(event: PageEvent) {
    this.wdPage = Math.floor((event.first ?? 0) / (event.rows ?? this.wdPageSize)) + 1;
    this.wdPageSize = event.rows ?? this.wdPageSize;
    this.wdDisplay = this.wdFiltered.slice((this.wdPage - 1) * this.wdPageSize, this.wdPage * this.wdPageSize);
    this.cdr.markForCheck();
  }

  confirmApproveWd(tx: WithdrawTx) {
    this.confirmation.confirm({
      message: `Setujui penarikan -${tx.amount.toLocaleString()} P dari ${tx.user?.username || 'pengguna'}?`,
      header: 'Konfirmasi',
      rejectLabel: 'Batal',
      acceptLabel: 'Setujui',
      accept: () => this.executeWd('approve', tx),
    });
  }
  confirmRejectWd(tx: WithdrawTx) {
    this.confirmation.confirm({
      message: `Tolak penarikan -${tx.amount.toLocaleString()} P dari ${tx.user?.username || 'pengguna'}?`,
      header: 'Tolak Transaksi',
      rejectLabel: 'Batal',
      acceptLabel: 'Tolak',
      accept: () => this.executeWd('reject', tx),
    });
  }
  private executeWd(action: 'approve' | 'reject', tx: WithdrawTx) {
    const admin = this.auth.getCurrentUser();
    if (!admin?.username) return;
    this.wdProcessing = true;
    const p =
      action === 'approve'
        ? this.admin.approveWithdrawal(tx.id, admin.username)
        : this.admin.rejectWithdrawal(tx.id, admin.username);
    p.then(() => {
      this.notification.success(action === 'approve' ? 'Penarikan disetujui' : 'Penarikan ditolak');
      this.loadWithdrawals();
      this.loadTurnover();
    })
      .catch((e) => this.notification.error(e.message))
      .finally(() => {
        this.wdProcessing = false;
        this.cdr.markForCheck();
      });
  }

  loadTurnover() {
    this.toLoading = true;
    Promise.all([this.admin.getWallets(), this.admin.getDepositLocks()])
      .then(([wallets, locks]) => {
        const lockMap = new Map<string, number>();
        (locks || []).forEach((l: DepositLock) => {
          const rem = Number(l.turnover_required) - Number(l.turnover_applied);
          if (rem > 0) lockMap.set(l.user_id, (lockMap.get(l.user_id) || 0) + rem);
        });
        this.toAll = (wallets || [])
          .filter((w: WalletRow) => w.user?.role !== 'admin' && w.user?.role !== 'superadmin')
          .map((w: WalletRow) => ({
            userId: w.user_id,
            username: w.user?.username ?? '',
            displayName: w.user?.display_name ?? '',
            main: Number(w.balance_main),
            bonus: Number(w.balance_bonus),
            deposited: Number(w.total_deposited),
            withdrawn: Number(w.total_withdrawn),
            turnover: Number(w.total_turnover),
            locked: lockMap.get(w.user_id) || 0,
            net: Number(w.total_deposited) - Number(w.total_withdrawn),
            pnl: Number(w.total_deposited) - Number(w.total_withdrawn) - Number(w.balance_main) - Number(w.balance_bonus),
          }));
        this.applyToFilter();
      })
      .catch(() => {})
      .finally(() => {
        this.toLoading = false;
        this.cdr.markForCheck();
      });
  }
  applyToFilter() {
    const all = this.toAll;
    this.toTotal = all.reduce((s: number, w: TurnoverItem) => s + w.turnover, 0);
    this.toNetDeposit = all.reduce((s: number, w: TurnoverItem) => s + w.deposited - w.withdrawn, 0);
    this.toPlatformPnl = all.reduce((s: number, w: TurnoverItem) => s + w.withdrawn - w.deposited, 0);
    const pos = all.filter((w: TurnoverItem) => w.net >= 0).length;
    this.toWinRate = all.length > 0 ? Math.round((pos / all.length) * 100) : 0;
    this.toFiltered = all.map((w: TurnoverItem) => ({
      ...w,
      net: w.deposited - w.withdrawn,
      pnl: w.deposited - w.withdrawn - w.main - w.bonus,
    }));
    this.toPage = 1;
    this.toDisplay = this.toFiltered.slice(0, this.toPageSize);
  }
  toPageChange(event: PageEvent) {
    this.toPage = Math.floor((event.first ?? 0) / (event.rows ?? this.toPageSize)) + 1;
    this.toPageSize = event.rows ?? this.toPageSize;
    this.toDisplay = this.toFiltered.slice((this.toPage - 1) * this.toPageSize, this.toPage * this.toPageSize);
    this.cdr.markForCheck();
  }

  txStatusSeverity(s: string) {
    const m: Record<string, string> = { COMPLETED: 'success', PENDING: 'warn', FAILED: 'danger' };
    return (m[s] || 'secondary') as any;
  }
}
