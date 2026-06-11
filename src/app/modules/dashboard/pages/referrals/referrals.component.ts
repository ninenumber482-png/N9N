import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AdminService } from 'src/app/core/services/admin.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { RealtimeService } from 'src/app/core/services/realtime.service';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { PaginatorModule } from 'primeng/paginator';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { LoadingErrorComponent } from 'src/app/shared/components/loading-error/loading-error.component';
import { FilterBarComponent } from 'src/app/shared/components/filter-bar/filter-bar.component';
import { PaginationHelper } from 'src/app/shared/utils/pagination.helper';
import { FilterHelper } from 'src/app/shared/utils/filter.helper';

interface ReferralRecord {
  id: string;
  code: string;
  status: string;
  used_count?: number;
  max_uses?: number;
  expires_at?: string;
  created_at: string;
  created_by?: string;
  creator?: { username?: string; display_name?: string };
}

@Component({
  selector: 'app-referrals',
  standalone: true,
  imports: [CommonModule, FormsModule,
    WibDatePipe, SelectModule, TagModule, ConfirmDialogModule, InputTextModule, PaginatorModule,
    PageHeaderComponent, LoadingErrorComponent, FilterBarComponent],
  providers: [ConfirmationService],
  template: `
    <div data-page="referrals" class="space-y-6">
      <app-page-header icon="gift" title="Referral Management" subtitle="Generate and manage referral codes">
        <button
          (click)="generate()"
          [disabled]="generating"
          class="bg-foreground text-background disabled:opacity-50 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors">
          @if (generating) {
            <span class="inline-flex items-center gap-2">
              <span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"></span>
              Generating...
            </span>
          } @else {
            + Generate New Code
          }
        </button>
      </app-page-header>

      <app-filter-bar [search]="search" (searchChange)="search=$event; applyFilter()" placeholder="Search code…">
        <p-select
          [(ngModel)]="statusFilter"
          (ngModelChange)="applyFilter()"
          [options]="statusOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="All Status"
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
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Code</th>
                <th class="max-sm:hidden sm:px-4 sm:py-3">Creator</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Status</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Used / Max</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Expires</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Created</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 w-44">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (r of paginatedReferrals; track r.id) {
                <tr
                  class="border-border hover:bg-accent/30 border-b transition-colors cursor-pointer"
                  (click)="toggleDetail(r)">
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono text-xs font-bold text-foreground">
                    {{ r.code }}
                    @if (!r.created_by) {
                      <span
                        class="bg-card border-border text-foreground rounded border px-1 py-0.5 text-[8px] font-medium ml-1"
                        >PLATFORM</span
                      >
                    }
                  </td>
                  <td class="max-sm:hidden sm:px-4 sm:py-3">
                    @if (r.creator) {
                      <span class="text-foreground text-xs">{{ r.creator.display_name || r.creator.username }}</span>
                      <span class="text-muted-foreground text-[10px]">&#64;{{ r.creator.username }}</span>
                    } @else {
                      <span class="text-muted-foreground text-[10px]">—</span>
                    }
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p-tag [value]="r.status" [severity]="r.status === 'ACTIVE' ? 'success' : 'secondary'" />
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" (click)="$event.stopPropagation()">
                    @if (editingId === r.id) {
                      <input
                        pInputText
                        type="number"
                        [(ngModel)]="editMaxUses"
                        placeholder="∞"
                        min="1"
                        class="!w-16 !text-xs" />
                    } @else {
                      <span class="font-mono text-xs font-bold text-foreground">{{ r.used_count || 0 }}</span>
                      <span class="text-muted-foreground text-[10px]"> / {{ r.max_uses ?? '∞' }}</span>
                    }
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" (click)="$event.stopPropagation()">
                    @if (editingId === r.id) {
                      <input pInputText type="date" [(ngModel)]="editExpiresAt" class="!w-32 !text-xs" />
                    } @else {
                      <span class="text-muted-foreground text-[10px]">{{
                        r.expires_at ? (r.expires_at | wibDate: 'shortDate') : '—'
                      }}</span>
                    }
                  </td>
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-[10px]">
                    {{ r.created_at | wibDate: 'short' }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" (click)="$event.stopPropagation()">
                    <div class="flex flex-wrap gap-1">
                      <button
                        (click)="confirmToggle(r)"
                        class="bg-card border-border text-muted-foreground hover:text-foreground rounded border px-2 py-1 text-[10px] font-medium transition-colors">
                        {{ r.status === 'ACTIVE' ? 'Deactivate' : 'Activate' }}
                      </button>
                      @if (editingId === r.id) {
                        <button
                          (click)="saveEdit(r)"
                          class="bg-foreground text-background rounded px-2 py-1 text-[10px] font-medium">
                          Save
                        </button>
                        <button
                          (click)="cancelEdit()"
                          class="text-muted-foreground rounded px-2 py-1 text-[10px] font-medium">
                          X
                        </button>
                      } @else {
                        <button
                          (click)="startEdit(r)"
                          class="bg-card border-border text-muted-foreground hover:text-foreground rounded border px-2 py-1 text-[10px] font-medium">
                          Edit
                        </button>
                      }
                    </div>
                  </td>
                </tr>
                @if (selectedId === r.id) {
                  <tr class="bg-accent/10 border-border border-b">
                    <td colspan="7" class="px-4 pb-4 pt-0">
                      @if (loadingDetail) {
                        <p class="text-muted-foreground py-4 text-center text-xs">Loading…</p>
                      } @else {
                        <div class="grid gap-4 sm:grid-cols-2 pt-3">
                          <div class="space-y-1.5">
                            <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                              Registered Users
                            </p>
                            @for (u of detail.users; track u.id) {
                              <div class="border-border border-b pb-1 last:border-0 last:pb-0">
                                <p class="text-xs font-semibold text-foreground">{{ u.display_name || u.username }}</p>
                                <p class="text-[10px] text-muted-foreground">
                                  &#64;{{ u.username }} · {{ u.created_at | wibDate: 'short' }}
                                </p>
                              </div>
                            } @empty {
                              <p class="text-muted-foreground text-[10px]">No users registered with this code.</p>
                            }
                          </div>
                          <div class="space-y-1.5">
                            <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                              Activity Log
                            </p>
                            @for (a of detail.auditLogs; track a.id) {
                              <div class="border-border border-b pb-1 last:border-0 last:pb-0">
                                <p class="text-xs font-semibold text-foreground">{{ a.action }}</p>
                                <p class="text-[10px] text-muted-foreground">{{ a.created_at | wibDate: 'short' }}</p>
                              </div>
                            } @empty {
                              <p class="text-muted-foreground text-[10px]">No activity recorded.</p>
                            }
                          </div>
                        </div>
                      }
                    </td>
                  </tr>
                }
              } @empty {
                <tr>
                  <td colspan="7" class="text-muted-foreground px-4 py-12 text-center text-xs">
                    No referral codes found.
                  </td>
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
    </div>

    <p-confirmdialog />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReferralsComponent implements OnInit, OnDestroy {
  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private notification = inject(NotificationService);
  private cdr = inject(ChangeDetectorRef);
  private realtime = inject(RealtimeService);
  private confirmation = inject(ConfirmationService);

  referrals: ReferralRecord[] = [];
  filtered: ReferralRecord[] = [];
  currentPage = 1;
  pageSize = 20;
  generating = false;
  search = '';
  statusFilter = '';
  selectedId: string | null = null;
  detail: { users?: any[]; auditLogs?: any[] } = {};
  loading = false;
  loadingDetail = false;
  error: string | null = null;
  editingId: string | null = null;
  editMaxUses: number | null = null;
  editExpiresAt = '';

  statusOptions = [
    { label: 'All Status', value: '' },
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Inactive', value: 'INACTIVE' },
    { label: 'Expired', value: 'EXPIRED' },
  ];

  private destroy$ = new Subject<void>();

  ngOnInit() {
    this.load();
    this.realtime.subscribeReferrals();
    this.realtime.referrals$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.load();
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async load() {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();
    try {
      this.referrals = (await this.admin.getReferrals()) as ReferralRecord[];
      this.applyFilter();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      this.error = msg;
      this.notification.error('Gagal memuat', msg);
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  get paginatedReferrals() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }

  onPageChange(event: { first?: number; rows?: number }) {
    const { page, pageSize } = PaginationHelper.onPageChange(event, this.pageSize);
    this.currentPage = page;
    this.pageSize = pageSize;
    this.cdr.markForCheck();
  }

  applyFilter() {
    this.currentPage = 1;
    let result = FilterHelper.applySearch(this.referrals, this.search, ['code']);
    if (this.statusFilter) result = FilterHelper.applyStatus(result, 'status', this.statusFilter);
    this.filtered = result;
  }

  async generate() {
    const admin = this.auth.getCurrentUser();
    if (!admin) return;
    this.generating = true;
    try {
      const code = await this.admin.generateReferralCode(admin.username);
      this.notification.success('Kode dibuat', `Kode referral baru: ${code}`);
      await this.load();
    } catch (e: unknown) {
      this.notification.error('Gagal membuat kode', e instanceof Error ? e.message : 'Tidak bisa membuat kode referral.');
    } finally {
      this.generating = false;
      this.cdr.markForCheck();
    }
  }

  confirmToggle(r: ReferralRecord) {
    const next = r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.confirmation.confirm({
      message: `${next === 'INACTIVE' ? 'Nonaktifkan' : 'Aktifkan'} kode referral ${r.code}?`,
      header: next === 'INACTIVE' ? 'Nonaktifkan Referral' : 'Aktifkan Referral',
      rejectLabel: 'Batal',
      acceptLabel: next === 'INACTIVE' ? 'Nonaktifkan' : 'Aktifkan',
      accept: () => this.toggleStatus(r, next),
    });
  }

  private async toggleStatus(r: ReferralRecord, next: string) {
    const admin = this.auth.getCurrentUser();
    try {
      await this.admin.updateReferralStatus(r.id, next);
      if (admin)
        await this.admin.logAction(
          admin.username,
          next === 'ACTIVE' ? 'ACTIVATE_REFERRAL' : 'DEACTIVATE_REFERRAL',
          'referrals',
          r.id,
          r.status,
          next,
        );
      r.status = next;
      this.notification.success('Status diperbarui', `Referral ${r.code} sekarang ${next}.`);
    } catch (e: unknown) {
      this.notification.error('Gagal memperbarui', e instanceof Error ? e.message : 'Tidak bisa memperbarui status.');
    }
    this.cdr.markForCheck();
  }

  startEdit(r: ReferralRecord) {
    this.editingId = r.id;
    this.editMaxUses = r.max_uses ?? null;
    this.editExpiresAt = r.expires_at ? r.expires_at.slice(0, 10) : '';
  }

  cancelEdit() {
    this.editingId = null;
    this.editMaxUses = null;
    this.editExpiresAt = '';
  }

  async saveEdit(r: ReferralRecord) {
    const admin = this.auth.getCurrentUser();
    const data: Record<string, unknown> = {
      max_uses: this.editMaxUses ?? null,
      expires_at: this.editExpiresAt ? new Date(this.editExpiresAt).toISOString() : null,
    };
    try {
      await this.admin.updateReferral(r.id, data);
      if (admin)
        await this.admin.logAction(
          admin.username,
          'UPDATE_REFERRAL',
          'referrals',
          r.id,
          JSON.stringify({ max_uses: r.max_uses, expires_at: r.expires_at }),
          JSON.stringify(data),
        );
      Object.assign(r, data);
      this.cancelEdit();
      this.notification.success('Referral diperbarui', `${r.code} telah diperbarui.`);
      this.cdr.markForCheck();
    } catch (e: unknown) {
      this.notification.error('Gagal memperbarui', e instanceof Error ? e.message : 'Tidak bisa memperbarui referral.');
    }
  }

  toggleDetail(r: ReferralRecord) {
    if (this.selectedId === r.id) {
      this.selectedId = null;
      this.detail = {};
    } else {
      this.selectedId = r.id;
      this.loadDetail(r.id);
    }
  }

  async loadDetail(referralId: string) {
    this.loadingDetail = true;
    this.cdr.markForCheck();
    try {
      const [users, auditLogs] = await Promise.all([
        this.admin.getUsersByReferral(referralId),
        this.admin.getAuditLogsByResource(referralId, 10),
      ]);
      this.detail = { users, auditLogs };
    } catch {
      this.detail = {};
      this.notification.error('Gagal memuat detail', 'Tidak bisa memuat detail referral.');
    }
    this.loadingDetail = false;
    this.cdr.markForCheck();
  }
}
