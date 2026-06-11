import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { AdminService } from 'src/app/core/services/admin.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { RealtimeService } from 'src/app/core/services/realtime.service';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { PaginatorModule } from 'primeng/paginator';
import { InputTextModule } from 'primeng/inputtext';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { RefreshButtonComponent } from 'src/app/shared/components/refresh-button/refresh-button.component';
import { FilterBarComponent } from 'src/app/shared/components/filter-bar/filter-bar.component';
import { StatCardComponent } from 'src/app/shared/components/stat-card/stat-card.component';
import { SeverityMapPipe } from 'src/app/shared/pipes/severity-map.pipe';
import { PaginationHelper } from 'src/app/shared/utils/pagination.helper';

type TabId = 'deposits' | 'withdrawals' | 'turnover' | 'manual';

interface DepositTx {
  id: string;
  reference_code?: string;
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
  reference_code?: string;
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
    PageHeaderComponent,
    RefreshButtonComponent,
    FilterBarComponent,
    StatCardComponent,
    SeverityMapPipe,
    CommonModule,
    FormsModule,
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
      <app-page-header icon="arrow-sm-down" title="Deposits &amp; Withdrawals" subtitle="Approve and manage member transactions" />

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
      <app-filter-bar [search]="depSearch" (searchChange)="depSearch=$event; applyDepFilter()" placeholder="Cari username, nominal…">
        <app-refresh-button [loading]="depLoading" (clicked)="loadDeposits()" />
        <p-select
          [(ngModel)]="depStatusFilter"
          (ngModelChange)="applyDepFilter()"
          [options]="statusOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Semua Status"
          class="w-36"
          styleClass="!text-xs !w-full" />
      </app-filter-bar>

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
          <table class="w-full text-left max-sm:text-xs sm:text-sm">
            <thead>
              <tr
                class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
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
                  <td class="px-3 py-3 font-mono text-[11px] text-muted-foreground">
                    {{ tx.reference_code || tx.id.slice(0, 8).toUpperCase() }}
                  </td>
                  <td class="px-3 py-3">
                    <p class="font-semibold text-foreground">{{ tx.user?.display_name || tx.user?.username || '—' }}</p>
                    <p class="text-muted-foreground text-[11px]">&#64;{{ tx.user?.username }}</p>
                  </td>
                  <td class="px-3 py-3 font-bold text-foreground">+{{ tx.amount | number: '1.0-0' }} P</td>
                  <td class="px-3 py-3 text-[11px] text-muted-foreground">{{ tx.method || '-' }}</td>
                  <td class="px-3 py-3"><p-tag [value]="tx.status" [severity]="tx.status | severityMap" /></td>
                  <td class="text-muted-foreground px-3 py-3 whitespace-nowrap text-[11px]">
                    {{ tx.created_at | wibDate: 'short' }}
                  </td>
                  <td class="px-3 py-3">
                    @if (tx.status === 'PENDING') {
                      <div class="flex gap-1" (click)="$event.stopPropagation()">
                        <button
                          (click)="confirmApproveDep(tx)"
                          [disabled]="depProcessing"
                          class="bg-foreground text-background disabled:opacity-50 rounded px-2 py-1 text-[11px] font-medium">
                          Setuju
                        </button>
                        <button
                          (click)="confirmRejectDep(tx)"
                          [disabled]="depProcessing"
                          class="bg-card border-border text-muted-foreground hover:text-foreground disabled:opacity-50 rounded border px-2 py-1 text-[11px] font-medium">
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
                <span class="text-muted-foreground">Ref</span
                ><span class="font-mono text-foreground">{{ depDetail.reference_code || depDetail.id.slice(0, 8).toUpperCase() }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">ID</span
                ><span class="font-mono text-[11px] text-muted-foreground break-all">{{ depDetail.id }}</span>
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
                ><p-tag [value]="depDetail.status" [severity]="depDetail.status | severityMap" />
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
      <app-filter-bar [search]="wdSearch" (searchChange)="wdSearch=$event; applyWdFilter()" placeholder="Cari username, nominal…">
        <app-refresh-button [loading]="wdLoading" (clicked)="loadWithdrawals()" />
        <p-select
          [(ngModel)]="wdStatusFilter"
          (ngModelChange)="applyWdFilter()"
          [options]="statusOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Semua Status"
          class="w-36"
          styleClass="!text-xs !w-full" />
      </app-filter-bar>

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
          <table class="w-full text-left max-sm:text-xs sm:text-sm">
            <thead>
              <tr
                class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
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
                  <td class="px-3 py-3 font-mono text-[11px] text-muted-foreground">
                    {{ tx.reference_code || tx.id.slice(0, 8).toUpperCase() }}
                  </td>
                  <td class="px-3 py-3">
                    <p class="font-semibold text-foreground">{{ tx.user?.display_name || tx.user?.username || '—' }}</p>
                    <p class="text-muted-foreground text-[11px]">&#64;{{ tx.user?.username }}</p>
                  </td>
                  <td class="px-3 py-3 font-bold text-muted-foreground">-{{ tx.amount | number: '1.0-0' }} P</td>
                  <td class="px-3 py-3 text-[11px] text-muted-foreground">
                    {{ tx.bank_name || '-' }}
                    {{ tx.bank_account_number ? '· ' + tx.bank_account_number.slice(-4) : '' }}
                  </td>
                  <td class="px-3 py-3"><p-tag [value]="tx.status" [severity]="tx.status | severityMap" /></td>
                  <td class="text-muted-foreground px-3 py-3 whitespace-nowrap text-[11px]">
                    {{ tx.created_at | wibDate: 'short' }}
                  </td>
                  <td class="px-3 py-3">
                    @if (tx.status === 'PENDING') {
                      <div class="flex gap-1" (click)="$event.stopPropagation()">
                        <button
                          (click)="confirmApproveWd(tx)"
                          [disabled]="wdProcessing"
                          class="bg-foreground text-background disabled:opacity-50 rounded px-2 py-1 text-[11px] font-medium">
                          Setuju
                        </button>
                        <button
                          (click)="confirmRejectWd(tx)"
                          [disabled]="wdProcessing"
                          class="bg-card border-border text-muted-foreground hover:text-foreground disabled:opacity-50 rounded border px-2 py-1 text-[11px] font-medium">
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
                <span class="text-muted-foreground">Ref</span
                ><span class="font-mono text-foreground">{{ wdDetail.reference_code || wdDetail.id.slice(0, 8).toUpperCase() }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">ID</span
                ><span class="font-mono text-[11px] text-muted-foreground break-all">{{ wdDetail.id }}</span>
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
                ><p-tag [value]="wdDetail.status" [severity]="wdDetail.status | severityMap" />
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
        <app-stat-card label="Total Turnover" [value]="toTotal | number: '1.0-0'" />
        <app-stat-card label="Net Deposit" [value]="toNetDeposit | number: '1.0-0'" />
        <app-stat-card label="Platform PnL" [value]="toPlatformPnl | number: '1.0-0'" />
        <app-stat-card label="Avg Win Rate" [value]="toWinRate + '%'" />
      </div>

      <app-refresh-button [loading]="toLoading" (clicked)="loadTurnover()" />

      <div class="bg-card border-border rounded-lg border overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left max-sm:text-xs sm:text-sm">
            <thead>
              <tr
                class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
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
                    <p class="text-muted-foreground text-[11px]">&#64;{{ w.username }}</p>
                  </td>
                  <td class="px-3 py-3 font-bold text-foreground">{{ w.main | number: '1.0-0' }}</td>
                  <td class="px-3 py-3 text-foreground">{{ w.bonus | number: '1.0-0' }}</td>
                  <td class="px-3 py-3 text-foreground font-semibold">{{ w.deposited | number: '1.0-0' }}</td>
                  <td class="px-3 py-3 text-muted-foreground font-semibold">{{ w.withdrawn | number: '1.0-0' }}</td>
                  <td class="px-3 py-3 font-bold text-foreground">{{ w.turnover | number: '1.0-0' }}</td>
                  <td class="px-3 py-3">
                    @if (w.locked > 0) {
                      <span class="text-foreground font-semibold">{{ w.locked | number: '1.0-0' }}</span>
                      <button (click)="confirmResetTurnover(w)" class="ml-1 px-1.5 py-0.5 text-[11px] font-bold rounded bg-amber-400/20 text-amber-400 hover:bg-amber-400/30 transition">Reset</button>
                      <button (click)="openAdjustTurnover(w)" class="ml-1 px-1.5 py-0.5 text-[11px] font-bold rounded bg-sky-400/20 text-sky-400 hover:bg-sky-400/30 transition">Adjust</button>
                    } @else {
                      <span class="text-foreground text-[11px]">Lunas</span>
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

    <ng-template #manualTab>
      <app-filter-bar [search]="manSearch" (searchChange)="manSearch=$event; applyManFilter()" placeholder="Cari username, display name…">
        <app-refresh-button [loading]="manLoading" (clicked)="loadManual()" />
      </app-filter-bar>
      <div class="bg-card border-border rounded-lg border overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left max-sm:text-xs sm:text-sm">
            <thead>
              <tr class="border-border text-muted-foreground border-b text-xs font-semibold uppercase tracking-wider">
                <th class="px-3 py-3">User</th>
                <th class="px-3 py-3">Main (P)</th>
                <th class="px-3 py-3">Bonus (P)</th>
                <th class="px-3 py-3">Total Deposited</th>
                <th class="px-3 py-3">Total Withdrawn</th>
                <th class="px-3 py-3">Turnover</th>
                <th class="px-3 py-3">Locked TO</th>
                <th class="px-3 py-3 w-24">Aksi</th>
              </tr>
            </thead>
            <tbody>
              @for (w of manDisplay; track w.userId) {
                <tr class="border-border border-b text-xs">
                  <td class="px-3 py-3">
                    <p class="font-semibold text-foreground">{{ w.displayName }}</p>
                    <p class="text-muted-foreground text-[11px]">&#64;{{ w.username }}</p>
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
                      <span class="text-foreground text-[11px]">Lunas</span>
                    }
                  </td>
                  <td class="px-3 py-3">
                    <button
                      (click)="openEditWallet(w)"
                      class="bg-card border-border hover:bg-accent rounded border px-2 py-1 text-[11px] font-medium text-foreground transition-colors"
                    >
                      Edit Saldo
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <p-paginator
          (onPageChange)="manPageChange($event)"
          [first]="(manPage - 1) * manPageSize"
          [rows]="manPageSize"
          [totalRecords]="manFiltered.length" />
      </div>
    </ng-template>

    <p-dialog
      [(visible)]="editWalletVisible"
      [modal]="true"
      [style]="{ width: '420px' }"
      [draggable]="false"
      [resizable]="false"
      [closable]="true"
      (onHide)="editWalletVisible = false; editWallet = null;">
      <ng-template pTemplate="header">
        <span class="text-sm font-bold text-foreground">Edit Saldo</span>
      </ng-template>
      <ng-template pTemplate="content">
        @if (editWallet) {
          <div class="space-y-4 text-xs">
            <div>
              <p class="text-muted-foreground mb-1">User</p>
              <p class="font-semibold text-foreground">{{ editWallet.displayName }} (&#64;{{ editWallet.username }})</p>
            </div>
            <div>
              <label class="block text-muted-foreground mb-1">Balance Main (P)</label>
              <input
                type="number"
                [(ngModel)]="editMain"
                class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/30"
                step="1"
                min="0"
              />
            </div>
            <div>
              <label class="block text-muted-foreground mb-1">Balance Bonus (P)</label>
              <input
                type="number"
                [(ngModel)]="editBonus"
                class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/30"
                step="1"
                min="0"
              />
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button
                type="button"
                (click)="editWalletVisible = false; editWallet = null;"
                class="bg-card border-border hover:bg-accent rounded border px-3 py-1.5 text-sm font-medium text-foreground transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                (click)="saveEditWallet()"
                [disabled]="editWalletSaving"
                class="bg-foreground text-background rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 transition-opacity"
              >
                {{ editWalletSaving ? 'Menyimpan…' : 'Simpan' }}
              </button>
            </div>
          </div>
        }
      </ng-template>
    </p-dialog>

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
    { id: 'manual' as TabId, label: 'Saldo Manual' },
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

  editWallet: TurnoverItem | null = null;
  editWalletVisible = false;
  editWalletSaving = false;
  editMain = 0;
  editBonus = 0;

  manAll: TurnoverItem[] = [];
  manFiltered: TurnoverItem[] = [];
  manDisplay: TurnoverItem[] = [];
  manPage = 1;
  manPageSize = 20;
  manLoading = false;
  manSearch = '';

  private destroy$ = new Subject<void>();

  ngOnInit() {
    const path = this.route.snapshot.url[0]?.path;
    if (path === 'withdrawals') this.tab = 'withdrawals';
    else if (path === 'turnover') this.tab = 'turnover';
    else if (path === 'manual') this.tab = 'manual';
    this.loadDeposits();
    this.loadWithdrawals();
    this.loadTurnover();
    this.loadManual();
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

  openEditWallet(w: TurnoverItem) {
    this.editWallet = w;
    this.editMain = w.main;
    this.editBonus = w.bonus;
    this.editWalletVisible = true;
    this.cdr.markForCheck();
  }

  async saveEditWallet() {
    if (!this.editWallet) return;
    this.editWalletSaving = true;
    this.cdr.markForCheck();
    try {
      const admin = this.auth.getCurrentUser();
      if (!admin?.username) return;
      await this.admin.updateWalletRow(this.editWallet.userId, {
        balance_main: this.editMain,
        balance_bonus: this.editBonus,
      });
      await this.admin.logAction(
        admin.username,
        'EDIT_WALLET',
        'wallet',
        this.editWallet.userId,
        `main:${this.editWallet.main},bonus:${this.editWallet.bonus}`,
        `main:${this.editMain},bonus:${this.editBonus}`,
      );
      this.notification.success('Saldo diperbarui', `Saldo ${this.editWallet.displayName} berhasil diubah.`);
      this.editWalletVisible = false;
      this.editWallet = null;
      this.loadTurnover();
    } catch (e: unknown) {
      this.notification.error('Gagal', (e instanceof Error ? e.message : '') || 'Gagal memperbarui saldo.');
    } finally {
      this.editWalletSaving = false;
      this.cdr.markForCheck();
    }
  }

  confirmResetTurnover(w: TurnoverItem) {
    this.confirmation.confirm({
      message: `Reset turnover untuk <strong>${w.displayName}</strong>? Semua deposit lock akan dihapus.`,
      header: 'Reset Turnover',
      rejectLabel: 'Batal',
      acceptLabel: 'Reset',
      accept: () => this.resetTurnover(w),
    });
  }

  openAdjustTurnover(w: TurnoverItem) {
    const input = prompt(`Adjust turnover untuk ${w.displayName}\n\nPositif = tambah TO (bantu user)\nNegatif = kurangi TO (hukuman)\n\nContoh: 100000 atau -50000`, '0');
    if (input === null) return;
    const amount = Number(input.replace(/[^0-9\-]/g, ''));
    if (!amount || amount === 0) {
      this.notification.error('Invalid', 'Masukkan jumlah valid (contoh: 100000 atau -50000)');
      return;
    }
    this.adjustTurnoverSubmit(w, amount);
  }

  async adjustTurnoverSubmit(w: TurnoverItem, amount: number) {
    const admin = this.auth.getCurrentUser();
    if (!admin?.username) return;
    try {
      await this.admin.adjustTurnover(w.userId, admin.username, amount);
      const label = amount > 0 ? `+${amount}` : `${amount}`;
      this.notification.success('Turnover disesuaikan', `${w.displayName}: ${label} P`);
      this.loadTurnover();
    } catch (e: unknown) {
      this.notification.error('Gagal', (e instanceof Error ? e.message : '') || 'Gagal adjust turnover.');
    }
  }

  async resetTurnover(w: TurnoverItem) {
    const admin = this.auth.getCurrentUser();
    if (!admin?.username) return;
    try {
      await this.admin.resetTurnover(w.userId, admin.username);
      this.notification.success('Turnover direset', `Turnover ${w.displayName} berhasil direset.`);
      this.loadTurnover();
    } catch (e: unknown) {
      this.notification.error('Gagal', (e instanceof Error ? e.message : '') || 'Gagal mereset turnover.');
    }
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
    const { page, pageSize } = PaginationHelper.onPageChange(event, this.depPageSize);
    this.depPage = page;
    this.depPageSize = pageSize;
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
    const { page, pageSize } = PaginationHelper.onPageChange(event, this.wdPageSize);
    this.wdPage = page;
    this.wdPageSize = pageSize;
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
    this.toPlatformPnl = all.reduce((s: number, w: TurnoverItem) => s + w.pnl, 0);
    const pos = all.filter((w: TurnoverItem) => w.pnl >= 0).length;
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
    const { page, pageSize } = PaginationHelper.onPageChange(event, this.toPageSize);
    this.toPage = page;
    this.toPageSize = pageSize;
    this.toDisplay = this.toFiltered.slice((this.toPage - 1) * this.toPageSize, this.toPage * this.toPageSize);
    this.cdr.markForCheck();
  }

  loadManual() {
    this.manLoading = true;
    Promise.all([this.admin.getWallets(), this.admin.getDepositLocks()])
      .then(([wallets, locks]) => {
        const lockMap = new Map<string, number>();
        (locks || []).forEach((l: DepositLock) => {
          const rem = Number(l.turnover_required) - Number(l.turnover_applied);
          if (rem > 0) lockMap.set(l.user_id, (lockMap.get(l.user_id) || 0) + rem);
        });
        this.manAll = (wallets || [])
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
        this.applyManFilter();
      })
      .catch(() => {})
      .finally(() => {
        this.manLoading = false;
        this.cdr.markForCheck();
      });
  }
  applyManFilter() {
    let f = this.manAll;
    if (this.manSearch) {
      const q = this.manSearch.toLowerCase();
      f = f.filter((w) => w.username?.toLowerCase().includes(q) || w.displayName?.toLowerCase().includes(q));
    }
    this.manFiltered = f;
    this.manPage = 1;
    this.manDisplay = f.slice(0, this.manPageSize);
  }
  manPageChange(event: PageEvent) {
    const { page, pageSize } = PaginationHelper.onPageChange(event, this.manPageSize);
    this.manPage = page;
    this.manPageSize = pageSize;
    this.manDisplay = this.manFiltered.slice((this.manPage - 1) * this.manPageSize, this.manPage * this.manPageSize);
    this.cdr.markForCheck();
  }
}
