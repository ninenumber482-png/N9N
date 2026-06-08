import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AdminService, AdminRpcError } from 'src/app/core/services/admin.service';
import { environment } from 'src/environments/environment';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { RealtimeService } from 'src/app/core/services/realtime.service';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { PaginatorModule } from 'primeng/paginator';
import { InputTextModule } from 'primeng/inputtext';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { LoadingErrorComponent } from 'src/app/shared/components/loading-error/loading-error.component';
import { RefreshButtonComponent } from 'src/app/shared/components/refresh-button/refresh-button.component';
import { FilterBarComponent } from 'src/app/shared/components/filter-bar/filter-bar.component';
import { SeverityMapPipe } from 'src/app/shared/pipes/severity-map.pipe';
import { PaginationHelper } from 'src/app/shared/utils/pagination.helper';

interface WalletRow {
  balance_main: number;
  balance_bonus: number;
}

interface UserRow {
  id: string;
  username: string;
  display_name?: string;
  email: string;
  phone?: string;
  country?: string;
  role: string;
  registration_status: string;
  login_status: string;
  account_status: string;
  kyc_status: string;
  referral_code?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_name?: string;
  created_at: string;
  approved_at?: string;
  wallet?: WalletRow | WalletRow[];
  [other: string]: unknown;
}

interface SessionRow {
  id: string;
  user_id: string;
  ip_address?: string;
  browser_info?: string;
  device_info?: string;
  last_activity: string;
  logged_out_at?: string;
}

interface AuditLogRow {
  id: string;
  action: string;
  created_at: string;
}

interface KycDocRow {
  id: string;
  document_url: string;
  document_type?: string;
  status: string;
}

interface TransactionRow {
  id: string;
  type: string;
  amount: number;
  status: string;
  method?: string;
  created_at: string;
}

interface BetRow {
  id: string;
  session_code: string;
  selection: string;
  stake: number;
  actual_payout: number;
  result?: string;
  status: string;
  created_at: string;
}

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    WibDatePipe,
    SelectModule,
    TagModule,
    ConfirmDialogModule,
    PaginatorModule,
    InputTextModule,
    PageHeaderComponent,
    LoadingErrorComponent,
    RefreshButtonComponent,
    FilterBarComponent,
    SeverityMapPipe,
  ],
  providers: [ConfirmationService],
  template: `
    <div data-page="users" class="space-y-6">
      <app-page-header icon="users" title="Users" subtitle="Manage all platform users">
        <app-refresh-button [loading]="loading" (clicked)="load()" />
      </app-page-header>

      <app-filter-bar [search]="search" (searchChange)="search=$event; onFilterChange()" placeholder="Search username, email, name…">
        <p-select
          [(ngModel)]="roleFilter"
          (ngModelChange)="onFilterChange()"
          [options]="roleOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Role"
          class="w-32"
          styleClass="!text-xs !w-full" />
        <p-select
          [(ngModel)]="statusFilter"
          (ngModelChange)="onFilterChange()"
          [options]="statusOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Status"
          class="w-40"
          styleClass="!text-xs !w-full" />
        <p-select
          [(ngModel)]="kycFilter"
          (ngModelChange)="onFilterChange()"
          [options]="kycOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="KYC Status"
          class="w-36"
          styleClass="!text-xs !w-full" />
      </app-filter-bar>

      <app-loading-error [loading]="loading" [error]="error" (retry)="load()" />

      <div class="bg-card border-border rounded-lg page-accent-card" [class.hidden]="loading">
        <div class="overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr
                class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">User</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Role</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Balance</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Referral</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">KYC</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Registration</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Created</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 w-48">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (u of paginatedUsers; track u.id) {
                <tr
                  class="border-border hover:bg-accent/30 border-b transition-colors cursor-pointer"
                  (click)="openModal(u)">
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" (click)="$event.stopPropagation()">
                    <div class="flex items-center gap-2">
                      <span class="relative flex h-2 w-2 shrink-0">
                        @if (isOnline(u.id)) {
                          <span
                            class="absolute inline-flex h-full w-full animate-ping rounded-full bg-foreground opacity-30"></span>
                          <span class="relative inline-flex h-2 w-2 rounded-full bg-foreground"></span>
                        } @else {
                          <span class="relative inline-flex h-2 w-2 rounded-full bg-border"></span>
                        }
                      </span>
                      <div>
                        <p class="font-semibold text-foreground">{{ u.display_name || u.username }}</p>
                        <p class="text-muted-foreground text-[10px]">&#64;{{ u.username }} &middot; {{ u.email }}</p>
                        <p class="text-muted-foreground text-[9px]">{{ u.country }} &middot; {{ u.phone }}</p>
                        <p class="text-muted-foreground text-[9px] font-mono mt-0.5 select-all">{{ u.id }}</p>
                      </div>
                    </div>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" (click)="$event.stopPropagation()">
                    <span
                      class="bg-card border-border text-foreground rounded border px-2 py-0.5 text-[10px] font-medium"
                      >{{ u.role }}</span
                    >
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <span class="font-mono text-foreground font-semibold">{{
                      walletBalance(u.id) | number: '1.2-2'
                    }}</span>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <span class="font-mono text-[10px] text-muted-foreground">{{ u.referral_code || '-' }}</span>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p-tag [value]="u.kyc_status" [severity]="u.kyc_status | severityMap" />
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p-tag [value]="u.registration_status" [severity]="u.registration_status | severityMap" />
                  </td>
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-[10px]">
                    {{ u.created_at | wibDate: 'short' }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" (click)="$event.stopPropagation()">
                    <div class="flex flex-wrap gap-1">
                      @if (u.registration_status === 'PENDING' || u.registration_status === 'PENDING_VERIFICATION') {
                        <button
                          (click)="confirmAction('approve', u)"
                          class="bg-foreground text-background rounded px-2 py-1 text-[10px] font-medium">
                          Approve
                        </button>
                        <button
                          (click)="confirmAction('reject', u)"
                          class="bg-card border-border text-muted-foreground hover:text-foreground rounded border px-2 py-1 text-[10px] font-medium">
                          Reject
                        </button>
                      }
                      @if (u.login_status === 'ACTIVE') {
                        <button
                          (click)="confirmAction('lock', u)"
                          class="bg-card border-border text-muted-foreground hover:text-foreground rounded border px-2 py-1 text-[10px] font-medium">
                          Lock
                        </button>
                      } @else {
                        <button
                          (click)="confirmAction('unlock', u)"
                          class="bg-card border-border text-muted-foreground hover:text-foreground rounded border px-2 py-1 text-[10px] font-medium">
                          Unlock
                        </button>
                      }
                      @if (isSuperadmin) {
                        <button
                          (click)="confirmAction('reset', u)"
                          class="bg-card border-border text-muted-foreground hover:text-foreground rounded border px-2 py-1 text-[10px] font-medium">
                          Reset
                        </button>
                      }
                      <button
                        (click)="openEditModal(u)"
                        class="bg-card border-border text-muted-foreground hover:text-foreground rounded border px-2 py-1 text-[10px] font-medium">
                        Edit
                      </button>
                      @if (editing[u.id] && changed(u)) {
                        <button
                          (click)="saveUser(u)"
                          class="bg-foreground text-background rounded px-2 py-1 text-[10px] font-medium">
                          Save
                        </button>
                        <button
                          (click)="editing[u.id] = {}"
                          class="text-muted-foreground rounded px-2 py-1 text-[10px] font-medium">
                          X
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="8" class="text-muted-foreground px-4 py-12 text-center text-xs">No users found.</td>
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

      @if (previewImage) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" (click)="previewImage = null">
          <img
            [src]="previewImage"
            class="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl"
            (click)="$event.stopPropagation()" />
          <button
            (click)="previewImage = null"
            class="absolute top-4 right-4 text-white text-2xl font-bold hover:opacity-70">
            &times;
          </button>
        </div>
      }

      @if (modalOpen && selectedUser) {
        <div
          class="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-4 sm:py-8"
          (click)="closeModal()">
          <div
            class="w-full max-w-4xl mx-2 sm:mx-4 bg-card rounded-xl border border-border shadow-2xl overflow-hidden"
            (click)="$event.stopPropagation()">
            <div class="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border">
              <div class="min-w-0">
                <h2 class="text-base sm:text-lg font-bold text-foreground truncate">
                  {{ selectedUser.display_name || selectedUser.username }}
                </h2>
                <p class="text-xs text-muted-foreground truncate">
                  &#64;{{ selectedUser.username }} &middot; {{ selectedUser.email }}
                </p>
              </div>
              <button
                (click)="closeModal()"
                class="shrink-0 ml-4 text-muted-foreground hover:text-foreground text-xl font-bold">
                &times;
              </button>
            </div>

            <div class="border-border border-b">
              <div class="flex gap-0 overflow-x-auto px-4 sm:px-6">
                @for (tab of tabs; track tab.key) {
                  <button
                    (click)="activeTab = tab.key"
                    class="px-3 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors"
                    [class.text-foreground]="activeTab === tab.key"
                    [class.text-muted-foreground]="activeTab !== tab.key"
                    [class.border-foreground]="activeTab === tab.key"
                    [class.border-transparent]="activeTab !== tab.key"
                    [class.hover:text-foreground]="activeTab !== tab.key">
                    {{ tab.label }}
                  </button>
                }
              </div>
            </div>

            <div class="overflow-y-auto max-h-[60vh] p-4 sm:p-6">
              @if (modalLoading) {
                <div class="text-muted-foreground py-12 text-center text-sm">Loading details…</div>
              } @else {
                @if (activeTab === 'overview') {
                  <div class="grid gap-6 sm:grid-cols-2">
                    <div class="space-y-3">
                      <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Profile</p>
                      <div class="text-sm space-y-1.5">
                        <p>
                          <span class="text-muted-foreground">Name: </span
                          ><span class="text-foreground font-medium">{{ selectedUser.display_name || '-' }}</span>
                        </p>
                        <p>
                          <span class="text-muted-foreground">Username: </span
                          ><span class="text-foreground font-medium">&#64;{{ selectedUser.username }}</span>
                        </p>
                        <p>
                          <span class="text-muted-foreground">Email: </span
                          ><span class="text-foreground font-medium">{{ selectedUser.email }}</span>
                        </p>
                        <p>
                          <span class="text-muted-foreground">Phone: </span
                          ><span class="text-foreground font-medium">{{ selectedUser.phone || '-' }}</span>
                        </p>
                        <p>
                          <span class="text-muted-foreground">Country: </span
                          ><span class="text-foreground font-medium">{{ selectedUser.country || '-' }}</span>
                        </p>
                        <p>
                          <span class="text-muted-foreground">User ID: </span
                          ><span class="text-foreground font-mono text-[10px] select-all">{{ selectedUser.id }}</span>
                        </p>
                        <p>
                          <span class="text-muted-foreground">Role: </span
                          ><span class="text-foreground font-medium">{{ selectedUser.role }}</span>
                        </p>
                        <p>
                          <span class="text-muted-foreground">Status: </span
                          ><span class="text-foreground font-medium">{{ selectedUser.account_status }}</span>
                        </p>
                        <p>
                          <span class="text-muted-foreground">Created: </span
                          ><span class="text-foreground font-medium">{{
                            selectedUser.created_at | wibDate: 'short'
                          }}</span>
                        </p>
                        <p>
                          <span class="text-muted-foreground">Approved: </span
                          ><span class="text-foreground font-medium">{{
                            selectedUser.approved_at | wibDate: 'short'
                          }}</span>
                        </p>
                      </div>

                      <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pt-2">Bank Info</p>
                      <div class="text-sm space-y-1.5">
                        <p>
                          <span class="text-muted-foreground">Bank: </span
                          ><span class="text-foreground font-medium">{{ selectedUser.bank_name || '-' }}</span>
                        </p>
                        <p>
                          <span class="text-muted-foreground">Acc No: </span
                          ><span class="text-foreground font-medium">{{
                            selectedUser.bank_account_number || '-'
                          }}</span>
                        </p>
                        <p>
                          <span class="text-muted-foreground">Acc Name: </span
                          ><span class="text-foreground font-medium">{{ selectedUser.bank_account_name || '-' }}</span>
                        </p>
                      </div>
                    </div>

                    <div class="space-y-3">
                      <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Wallet</p>
                      @if (modalData.wallet) {
                        <div class="bg-accent/20 rounded-lg p-4 space-y-2">
                          <div class="flex justify-between">
                            <span class="text-muted-foreground text-sm">Main Balance</span>
                            <span class="text-foreground font-bold font-mono">{{
                              modalData.wallet.balance_main | number: '1.2-2'
                            }}</span>
                          </div>
                          <div class="flex justify-between">
                            <span class="text-muted-foreground text-sm">Bonus Balance</span>
                            <span class="text-foreground font-bold font-mono">{{
                              modalData.wallet.balance_bonus | number: '1.2-2'
                            }}</span>
                          </div>
                          <div class="flex justify-between pt-1 border-t border-border">
                            <span class="text-muted-foreground text-sm">Total</span>
                            <span class="text-foreground font-bold font-mono">{{
                              modalData.wallet.balance_main + modalData.wallet.balance_bonus | number: '1.2-2'
                            }}</span>
                          </div>
                        </div>
                      } @else {
                        <p class="text-muted-foreground text-sm">No wallet data.</p>
                      }

                      <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pt-2">
                        Betting Stats
                      </p>
                      @if (modalData.bets?.length) {
                        <div class="bg-accent/20 rounded-lg p-4 space-y-2">
                          <div class="flex justify-between">
                            <span class="text-muted-foreground text-sm">Total Bets</span>
                            <span class="text-foreground font-medium">{{ modalData.bets.length }} <span class="text-[10px] text-muted-foreground">({{ modalBetsWinCount() + modalBetsLossCount() }} settled)</span></span>
                          </div>
                          <div class="flex justify-between">
                            <span class="text-muted-foreground text-sm">Wins / Losses</span>
                            <span class="text-foreground font-medium"
                              >{{ modalBetsWinCount() }} / {{ modalBetsLossCount() }}</span
                            >
                          </div>
                          <div class="flex justify-between">
                            <span class="text-muted-foreground text-sm">Stake (settled)</span>
                            <span class="text-foreground font-mono font-medium">{{
                              modalBetsTotalStake() | number: '1.2-2'
                            }}</span>
                          </div>
                          <div class="flex justify-between">
                            <span class="text-muted-foreground text-sm">Payout (settled)</span>
                            <span class="text-foreground font-mono font-medium">{{
                              modalBetsTotalPayout() | number: '1.2-2'
                            }}</span>
                          </div>
                          <div class="flex justify-between pt-1 border-t border-border">
                            <span class="text-muted-foreground text-sm font-semibold">Net P&L (settled)</span>
                            <span class="font-bold font-mono" [class.text-emerald-400]="modalBetsPnL() >= 0" [class.text-red-400]="modalBetsPnL() < 0">{{
                              modalBetsPnL() | number: '1.2-2'
                            }}</span>
                          </div>
                        </div>
                      } @else {
                        <p class="text-muted-foreground text-sm">No bets yet.</p>
                      }

                      <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pt-2">
                        Recent Activity
                      </p>
                      @for (a of modalData.auditLogs?.slice(0, 5); track a.id) {
                        <div class="border-border border-b pb-1 last:border-0 last:pb-0">
                          <p class="text-xs font-semibold text-foreground">{{ a.action }}</p>
                          <p class="text-[10px] text-muted-foreground">{{ a.created_at | wibDate: 'short' }}</p>
                        </div>
                      } @empty {
                        <p class="text-muted-foreground text-[10px]">No activity found.</p>
                      }
                    </div>
                  </div>
                }

                @if (activeTab === 'transactions') {
                  @if (modalData.transactions?.length) {
                    <div class="overflow-x-auto">
                      <table class="w-full text-left text-xs">
                        <thead>
                          <tr
                            class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                            <th class="px-3 py-2">Type</th>
                            <th class="px-3 py-2">Amount</th>
                            <th class="px-3 py-2">Status</th>
                            <th class="px-3 py-2">Method</th>
                            <th class="px-3 py-2">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (tx of modalData.transactions; track tx.id) {
                            <tr class="border-border border-b">
                              <td class="px-3 py-2 text-foreground font-medium">{{ tx.type }}</td>
                              <td class="px-3 py-2 font-mono text-foreground">{{ tx.amount | number: '1.2-2' }}</td>
                              <td class="px-3 py-2">
                                <p-tag [value]="tx.status" [severity]="tx.status | severityMap" />
                              </td>
                              <td class="px-3 py-2 text-muted-foreground">{{ tx.method || '-' }}</td>
                              <td class="px-3 py-2 text-muted-foreground">{{ tx.created_at | wibDate: 'short' }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  } @else {
                    <p class="text-muted-foreground py-8 text-center text-sm">No transactions found.</p>
                  }
                }

                @if (activeTab === 'bets') {
                  @if (modalData.bets?.length) {
                    <div class="overflow-x-auto">
                      <table class="w-full text-left text-xs">
                        <thead>
                          <tr
                            class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                            <th class="px-3 py-2">Session</th>
                            <th class="px-3 py-2">Selection</th>
                            <th class="px-3 py-2">Stake</th>
                            <th class="px-3 py-2">Payout</th>
                            <th class="px-3 py-2">Result</th>
                            <th class="px-3 py-2">Status</th>
                            <th class="px-3 py-2">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (b of modalData.bets; track b.id) {
                            <tr class="border-border border-b">
                              <td class="px-3 py-2 font-mono text-[10px] text-foreground">{{ b.session_code }}</td>
                              <td class="px-3 py-2 text-foreground">{{ b.selection }}</td>
                              <td class="px-3 py-2 font-mono text-foreground">{{ b.stake | number: '1.2-2' }}</td>
                              <td class="px-3 py-2 font-mono text-foreground">
                                {{ b.actual_payout | number: '1.2-2' }}
                              </td>
                              <td class="px-3 py-2">
                                <span
                                  class="bg-card border-border text-foreground rounded border px-2 py-0.5 text-[10px] font-medium"
                                  >{{ b.result || '-' }}</span
                                >
                              </td>
                              <td class="px-3 py-2">
                                <p-tag [value]="b.status" [severity]="b.status | severityMap" />
                              </td>
                              <td class="px-3 py-2 text-muted-foreground">{{ b.created_at | wibDate: 'short' }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  } @else {
                    <p class="text-muted-foreground py-8 text-center text-sm">No bets found.</p>
                  }
                }

                @if (activeTab === 'sessions') {
                  @if (modalData.sessions?.length) {
                    <div class="overflow-x-auto">
                      <table class="w-full text-left text-xs">
                        <thead>
                          <tr
                            class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                            <th class="px-3 py-2">IP Address</th>
                            <th class="px-3 py-2">Device / Browser</th>
                            <th class="px-3 py-2">Last Active</th>
                            <th class="px-3 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          @for (s of modalData.sessions; track s.id) {
                            <tr class="border-border border-b">
                              <td class="px-3 py-2 font-mono text-[10px] text-foreground">
                                {{ s.ip_address || 'Unknown IP' }}
                              </td>
                              <td class="px-3 py-2 text-foreground">{{ s.browser_info || 'Unknown browser' }}</td>
                              <td class="px-3 py-2 text-muted-foreground">{{ s.last_activity | wibDate: 'short' }}</td>
                              <td class="px-3 py-2">
                                <span
                                  class="bg-card border-border text-foreground rounded border px-2 py-0.5 text-[10px] font-medium">
                                  {{ s.logged_out_at ? 'Ended' : 'Active' }}
                                </span>
                              </td>
                            </tr>
                          }
                        </tbody>
                      </table>
                    </div>
                  } @else {
                    <p class="text-muted-foreground py-8 text-center text-sm">No sessions found.</p>
                  }
                }

                @if (activeTab === 'kyc') {
                  @if (modalData.kycDocs?.length) {
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      @for (d of modalData.kycDocs; track d.id) {
                        <div class="relative group border border-border rounded-lg overflow-hidden bg-accent/10">
                          <img
                            [src]="d.document_url"
                            (click)="viewImage(d.document_url)"
                            class="w-full h-32 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                            [title]="(d.document_type || 'Doc') + ' (' + d.status + ')'" />
                          <div class="p-2 text-[10px]">
                            <p class="text-foreground font-medium truncate">{{ d.document_type || 'Document' }}</p>
                            <p class="text-muted-foreground">{{ d.status }}</p>
                          </div>
                        </div>
                      }
                    </div>
                  } @else {
                    <p class="text-muted-foreground py-8 text-center text-sm">No KYC documents found.</p>
                  }
                }
              }
            </div>
          </div>
        </div>
      }

      <p-confirmdialog />

      @if (editModal.open) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" (click)="closeEditModal()">
          <div
            class="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl"
            (click)="$event.stopPropagation()">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-base font-bold text-foreground">Edit User</h2>
              <button (click)="closeEditModal()" class="text-muted-foreground hover:text-foreground text-lg font-bold">
                &times;
              </button>
            </div>
            <div class="space-y-3">
              <div>
                <label class="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
                  >Bank Name</label
                >
                <input pInputText [(ngModel)]="editModal.bank_name" class="!w-full !text-xs" />
              </div>
              <div>
                <label class="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
                  >Account Number</label
                >
                <input pInputText [(ngModel)]="editModal.bank_account_number" class="!w-full !text-xs" />
              </div>
              <div>
                <label class="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
                  >Account Name</label
                >
                <input pInputText [(ngModel)]="editModal.bank_account_name" class="!w-full !text-xs" />
              </div>
              <div>
                <label class="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
                  >Email</label
                >
                <input pInputText [(ngModel)]="editModal.email" class="!w-full !text-xs" />
              </div>
              <div>
                <label class="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
                  >Phone</label
                >
                <input pInputText [(ngModel)]="editModal.phone" class="!w-full !text-xs" />
              </div>
            </div>
            <div class="mt-5 flex gap-2">
              <button
                (click)="closeEditModal()"
                class="h-9 flex-1 rounded-lg border border-border bg-background text-xs font-semibold text-foreground hover:bg-accent">
                Cancel
              </button>
              <button
                (click)="saveEditModal()"
                [disabled]="editModal.loading"
                class="h-9 flex-1 rounded-lg bg-foreground text-background text-xs font-bold disabled:opacity-50">
                {{ editModal.loading ? 'Saving...' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersComponent implements OnInit, OnDestroy {
  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private notification = inject(NotificationService);
  private realtime = inject(RealtimeService);
  private confirmation = inject(ConfirmationService);

  users: UserRow[] = [];
  filtered: UserRow[] = [];
  editing: Record<string, Partial<UserRow>> = {};
  search = '';
  statusFilter = '';
  kycFilter = '';
  roleFilter = '';
  loading = false;
  error: string | null = null;
  previewImage: string | null = null;
  isSuperadmin = false;
  private destroy$ = new Subject<void>();
  private onlineTimer: ReturnType<typeof setInterval> | null = null;

  currentPage = 1;
  pageSize = 20;

  modalOpen = false;
  selectedUser: UserRow | null = null;
  activeTab = 'overview';
  modalLoading = false;
  modalData: {
    wallet?: WalletRow | null;
    sessions?: SessionRow[];
    auditLogs?: AuditLogRow[];
    kycDocs?: KycDocRow[];
    transactions?: TransactionRow[];
    bets?: BetRow[];
  } = {};

  tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'bets', label: 'Bets' },
    { key: 'sessions', label: 'Sessions' },
    { key: 'kyc', label: 'KYC' },
  ];

  roleOptions = [
    { label: 'All Roles', value: '' },
    { label: 'User', value: 'user' },
    { label: 'Admin', value: 'admin' },
    { label: 'Superadmin', value: 'superadmin' },
  ];

  statusOptions = [
    { label: 'All Status', value: '' },
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Pending Verification', value: 'PENDING_VERIFICATION' },
    { label: 'Rejected', value: 'REJECTED' },
    { label: 'Suspended', value: 'SUSPENDED' },
  ];

  kycOptions = [
    { label: 'All KYC', value: '' },
    { label: 'KYC Approved', value: 'APPROVED' },
    { label: 'KYC Pending', value: 'PENDING' },
    { label: 'KYC Rejected', value: 'REJECTED' },
  ];

  walletMap: Record<string, { balance_main: number; balance_bonus: number }> = {};
  sessionMap: Record<string, { last_activity: string; device_info?: string; ip_address: string }> = {};

  editModal = {
    open: false,
    user: null as UserRow | null,
    bank_name: '',
    bank_account_number: '',
    bank_account_name: '',
    email: '',
    phone: '',
    loading: false,
  };

  ngOnInit() {
    this.isSuperadmin = this.auth.getCurrentUser()?.role === 'superadmin';
    this.load();
    this.realtime.subscribeUsers();
    this.realtime.users$.pipe(takeUntil(this.destroy$)).subscribe(() => this.silentRefresh());
    this.onlineTimer = setInterval(() => {
      if (this.users.length) this.loadOnlineStatus(this.users);
    }, 30000);
  }

  ngOnDestroy() {
    if (this.onlineTimer) clearInterval(this.onlineTimer);
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async silentRefresh() {
    try {
      const fresh = await this.admin.getUsersWithWallets();
      this.users = fresh;
      this.buildWalletMap(fresh);
      this.applyFilter();
      this.cdr.markForCheck();
    } catch (e) {
      if (environment.production) console.error('[users] refresh failed:', e);
    }
  }

  async load() {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();
    try {
      const data = await this.admin.getUsersWithWallets();
      this.users = data;
      this.buildWalletMap(data);
      this.loadOnlineStatus(data);
      this.applyFilter();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error = msg || 'Unknown error';
      this.notification.error('Load failed', msg || 'Could not load users.');
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private async loadOnlineStatus(users: UserRow[]) {
    try {
      const userIds = users.map((u) => u.id);
      if (!userIds.length) return;
      const sessions = await this.admin.getActiveSessionsForUsers(userIds);
      if (sessions) {
        this.sessionMap = {};
        for (const s of sessions) {
          if (
            !this.sessionMap[s.user_id] ||
            new Date(s.last_activity) > new Date(this.sessionMap[s.user_id].last_activity)
          ) {
            this.sessionMap[s.user_id] = s;
          }
        }
      }
    } catch (e) {
      if (environment.production) console.error('[users] loadOnlineStatus failed:', e);
    }
  }

  isOnline(userId: string): boolean {
    const session = this.sessionMap[userId];
    if (!session) return false;
    const lastActive = new Date(session.last_activity).getTime();
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    return lastActive > fiveMinAgo;
  }

  private buildWalletMap(data: UserRow[]) {
    this.walletMap = {};
    for (const u of data) {
      if (u.wallet) {
        if (Array.isArray(u.wallet) && u.wallet.length > 0) {
          this.walletMap[u.id] = u.wallet[0];
        } else if (!Array.isArray(u.wallet) && typeof u.wallet.balance_main === 'number') {
          this.walletMap[u.id] = u.wallet;
        }
      }
    }
  }

  walletBalance(userId: string): number {
    return this.walletMap[userId]?.balance_main ?? 0;
  }

  onFilterChange() {
    this.currentPage = 1;
    this.applyFilter();
  }

  applyFilter() {
    let result = this.roleFilter ? this.users.filter((u) => u.role === this.roleFilter) : this.users;
    if (this.search) {
      const q = this.search.toLowerCase();
      result = result.filter(
        (u) =>
          u.username?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q) ||
          u.display_name?.toLowerCase().includes(q) ||
          u.phone?.includes(q),
      );
    }
    if (this.statusFilter === 'PENDING') {
      result = result.filter(
        (u) =>
          u.account_status === 'PENDING' ||
          u.registration_status === 'PENDING' ||
          u.registration_status === 'PENDING_VERIFICATION',
      );
    } else if (this.statusFilter) {
      result = result.filter(
        (u) => u.account_status === this.statusFilter || u.registration_status === this.statusFilter,
      );
    }
    if (this.kycFilter) result = result.filter((u) => u.kyc_status === this.kycFilter);
    this.filtered = result;
  }

  get totalPages() {
    return Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
  }

  get paginatedUsers() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }

  onPageChange(event: { first?: number; rows?: number }) {
    const { page, pageSize } = PaginationHelper.onPageChange(event, this.pageSize);
    this.currentPage = page;
    this.pageSize = pageSize;
    this.cdr.markForCheck();
  }

  setEdit(u: UserRow, field: string, value: unknown) {
    this.editing[u.id] = { ...(this.editing[u.id] || {}), [field]: value };
  }

  changed(u: UserRow) {
    const e = this.editing[u.id];
    return e && Object.keys(e).some((k) => e[k] !== u[k]);
  }

  openModal(u: UserRow) {
    this.selectedUser = u;
    this.modalOpen = true;
    this.activeTab = 'overview';
    this.modalData = {};
    this.modalLoading = true;
    this.cdr.markForCheck();
    this.loadModalData(u.id);
  }

  closeModal() {
    this.modalOpen = false;
    this.selectedUser = null;
    this.modalData = {};
    this.cdr.markForCheck();
  }

  async loadModalData(userId: string) {
    const [walletResult, sessionsResult, auditResult, kycResult, txResult, betsResult] = await Promise.allSettled([
      this.admin.getWallet(userId),
      this.admin.getUserSessionsForUser(userId, 20),
      this.admin.getAuditLogsByResource(userId, 20),
      this.admin.getKycDocsByUser(userId),
      this.admin.getTransactionsByUser(userId, 50),
      this.admin.getBetsByUser(userId, 50),
    ]);
    this.modalData = {
      wallet: walletResult.status === 'fulfilled' ? (walletResult.value[0] ?? null) : null,
      sessions: sessionsResult.status === 'fulfilled' ? sessionsResult.value : [],
      auditLogs: auditResult.status === 'fulfilled' ? auditResult.value : [],
      kycDocs: kycResult.status === 'fulfilled' ? kycResult.value : [],
      transactions: txResult.status === 'fulfilled' ? txResult.value : [],
      bets: betsResult.status === 'fulfilled' ? betsResult.value : [],
    };
    const errors = [walletResult, sessionsResult, auditResult, kycResult, txResult, betsResult]
      .filter((r) => r.status === 'rejected')
      .map((r) => (r as PromiseRejectedResult).reason?.message || 'Unknown error');
    if (errors.length > 0) {
      this.notification.warning('Some details failed to load', errors.join('; '));
    }
    this.modalLoading = false;
    this.cdr.markForCheck();
  }

  private modalSettledBets(): BetRow[] {
    return (this.modalData.bets ?? []).filter((b) => b.status === 'SETTLED');
  }

  modalBetsTotalStake(): number {
    return this.modalSettledBets().reduce((s, b) => s + Number(b.stake || 0), 0);
  }

  modalBetsTotalPayout(): number {
    return this.modalSettledBets().reduce((s, b) => s + Number(b.actual_payout || 0), 0);
  }

  modalBetsPnL(): number {
    return this.modalBetsTotalPayout() - this.modalBetsTotalStake();
  }

  modalBetsWinCount(): number {
    return (this.modalData.bets ?? []).filter((b) => b.status === 'SETTLED' && b.result === 'WIN').length;
  }

  modalBetsLossCount(): number {
    return (this.modalData.bets ?? []).filter((b) => b.status === 'SETTLED' && b.result === 'LOSE').length;
  }

  saveUser(u: UserRow) {
    const data = this.editing[u.id];
    const admin = this.auth.getCurrentUser();
    this.admin
      .updateUser(u.id, data)
      .then(() => {
        if (admin) {
          const oldVal = JSON.stringify(
            Object.keys(data).reduce((o: Record<string, unknown>, k) => {
              o[k] = u[k];
              return o;
            }, {}),
          );
          this.admin.logAction(admin.username, 'UPDATE_USER', 'users', u.id, oldVal, JSON.stringify(data));
        }
        Object.assign(u, data);
        delete this.editing[u.id];
        this.cdr.markForCheck();
        this.notification.success('User updated', 'Changes saved successfully.');
      })
      .catch((e) => this.notification.error('Save failed', e.message || 'Could not update user.'));
  }

  confirmAction(action: string, u: UserRow) {
    const labels: Record<string, { header: string; message: string; accept: string; styled: boolean }> = {
      approve: {
        header: 'Approve User',
        message: `Approve ${u.display_name || u.username}? They will be able to log in immediately.`,
        accept: 'Approve',
        styled: true,
      },
      reject: {
        header: 'Reject User',
        message: `Reject ${u.display_name || u.username}? Their account will be locked.`,
        accept: 'Reject',
        styled: false,
      },
      lock: {
        header: 'Lock User',
        message: `Lock ${u.display_name || u.username}? They won't be able to log in.`,
        accept: 'Lock',
        styled: false,
      },
      unlock: {
        header: 'Unlock User',
        message: `Unlock ${u.display_name || u.username}? They will regain access.`,
        accept: 'Unlock',
        styled: true,
      },
      reset: {
        header: 'Reset Credentials',
        message: `Reset credentials for ${u.display_name || u.username}? Their account will be locked and they'll need to create a new password.`,
        accept: 'Reset',
        styled: false,
      },
    };
    const cfg = labels[action];
    if (!cfg) return;
    this.confirmation.confirm({
      message: cfg.message,
      header: cfg.header,
      rejectLabel: 'Cancel',
      acceptLabel: cfg.accept,
      accept: () => this.executeAction(action, u),
    });
  }

  private async executeAction(action: string, u: UserRow) {
    this.cdr.markForCheck();
    try {
      switch (action) {
        case 'approve':
          await this.approve(u);
          break;
        case 'reject':
          await this.reject(u);
          break;
        case 'lock':
          await this.lock(u);
          break;
        case 'unlock':
          await this.unlock(u);
          break;
        case 'reset':
          await this.resetCredentials(u);
          break;
      }
    } finally {
      this.cdr.markForCheck();
    }
  }

  async approve(u: UserRow) {
    const admin = this.auth.getCurrentUser();
    if (!admin) return;
    try {
      await this.admin.approveUser(u.id, admin.username);
      const kycDocs = await this.admin.getKycDocsByUser(u.id);
      for (const doc of kycDocs) {
        if (doc.status === 'PENDING') {
          await this.admin.updateKycStatus(doc.id, 'APPROVED');
          await this.admin.logAction(admin.username, 'APPROVE_KYC', 'kyc_documents', doc.id, 'PENDING', 'APPROVED');
        }
      }
      await this.admin.logAction(admin.username, 'APPROVE_USER', 'users', u.id, u.registration_status, 'APPROVED');
      await this.admin.updateUser(u.id, { kyc_status: 'APPROVED' });
      u.registration_status = 'APPROVED';
      u.account_status = 'ACTIVE';
      u.login_status = 'ACTIVE';
      u.kyc_status = 'APPROVED';
      this.applyFilter();
      this.notification.success('User approved', `${u.display_name || u.username} can now log in.`);
    } catch (e: unknown) {
      const err = e instanceof AdminRpcError ? e : AdminRpcError.fromMessage(e instanceof Error ? e.message : String(e));
      this.notification.error(err.code === 'FORBIDDEN' ? 'Akses Ditolak' : 'Approval failed', err.message);
    }
  }

  async reject(u: UserRow) {
    const admin = this.auth.getCurrentUser();
    if (!admin) return;
    const reason = 'Rejected by admin.';
    try {
      await this.admin.rejectUser(u.id, admin.username, reason);
      await this.admin.logAction(
        admin.username,
        'REJECT_USER',
        'users',
        u.id,
        u.registration_status,
        'REJECTED:' + reason,
      );
      u.registration_status = 'REJECTED';
      u.account_status = 'REJECTED';
      u.login_status = 'LOCKED';
      this.applyFilter();
      this.notification.success('User rejected', `${u.display_name || u.username} has been rejected.`);
    } catch (e: unknown) {
      const err = e instanceof AdminRpcError ? e : AdminRpcError.fromMessage(e instanceof Error ? e.message : String(e));
      this.notification.error(err.code === 'FORBIDDEN' ? 'Akses Ditolak' : 'Rejection failed', err.message);
    }
  }

  async lock(u: UserRow) {
    const admin = this.auth.getCurrentUser();
    try {
      await this.admin.lockUser(u.id);
      if (admin) await this.admin.logAction(admin.username, 'LOCK_USER', 'users', u.id, u.login_status, 'LOCKED');
      u.login_status = 'LOCKED';
      this.notification.success('User locked', `${u.display_name || u.username} is now locked.`);
    } catch (e: unknown) {
      this.notification.error('Lock failed', e instanceof Error ? e.message : String(e));
    }
  }

  async unlock(u: UserRow) {
    const admin = this.auth.getCurrentUser();
    try {
      await this.admin.unlockUser(u.id);
      if (admin) await this.admin.logAction(admin.username, 'UNLOCK_USER', 'users', u.id, u.login_status, 'ACTIVE');
      u.login_status = 'ACTIVE';
      this.notification.success('User unlocked', `${u.display_name || u.username} is now active.`);
    } catch (e: unknown) {
      this.notification.error('Unlock failed', e instanceof Error ? e.message : String(e));
    }
  }

  async resetCredentials(u: UserRow) {
    const admin = this.auth.getCurrentUser();
    if (!admin) return;
    try {
      await this.admin.lockUser(u.id);
      await this.admin.logAction(
        admin.username,
        'RESET_CREDENTIALS',
        'users',
        u.id,
        u.login_status,
        'LOCKED_RESET_REQUIRED',
      );
      u.login_status = 'LOCKED';
      this.notification.success(
        'Credentials reset',
        `${u.display_name || u.username} is locked pending credential reset.`,
      );
    } catch (e: unknown) {
      this.notification.error('Reset failed', e instanceof Error ? e.message : String(e));
    }
  }

  viewImage(url: string) {
    this.previewImage = url;
  }

  openEditModal(u: UserRow) {
    this.editModal.open = true;
    this.editModal.user = u;
    this.editModal.bank_name = u.bank_name || '';
    this.editModal.bank_account_number = u.bank_account_number || '';
    this.editModal.bank_account_name = u.bank_account_name || '';
    this.editModal.email = u.email || '';
    this.editModal.phone = u.phone || '';
    this.editModal.loading = false;
    this.cdr.markForCheck();
  }

  closeEditModal() {
    this.editModal.open = false;
    this.editModal.user = null;
    this.cdr.markForCheck();
  }

  async saveEditModal() {
    const u = this.editModal.user;
    if (!u) return;
    this.editModal.loading = true;
    this.cdr.markForCheck();
    try {
      await this.admin.updateUser(u.id, {
        bank_name: this.editModal.bank_name,
        bank_account_number: this.editModal.bank_account_number,
        bank_account_name: this.editModal.bank_account_name,
        email: this.editModal.email,
        phone: this.editModal.phone,
      });
      Object.assign(u, {
        bank_name: this.editModal.bank_name,
        bank_account_number: this.editModal.bank_account_number,
        bank_account_name: this.editModal.bank_account_name,
        email: this.editModal.email,
        phone: this.editModal.phone,
      });
      this.closeEditModal();
      this.notification.success('User updated', 'Data saved.');
    } catch (e: unknown) {
      this.notification.error('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      this.editModal.loading = false;
      this.cdr.markForCheck();
    }
  }
}
