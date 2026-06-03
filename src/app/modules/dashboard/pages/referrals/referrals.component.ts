import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { AdminService } from '../../../../core/services/admin.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { RealtimeService } from '../../../../core/services/realtime.service';
import { WibDatePipe } from '../../../../shared/pipes/wib-date.pipe';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-referrals',
  standalone: true,
  imports: [CommonModule, FormsModule, WibDatePipe, ConfirmDialogComponent],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="max-sm:text-lg sm:text-2xl font-extrabold text-foreground">Referral Management</h1>
          <p class="text-muted-foreground mt-1 text-sm">Generate and manage referral codes</p>
        </div>
        <button (click)="generate()" [disabled]="generating"
          class="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 rounded-lg px-4 py-2 text-sm font-bold transition-colors">
          @if (generating) {
            <span class="inline-flex items-center gap-2">
              <span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"></span>
              Generating...
            </span>
          } @else { + Generate New Code }
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <input [(ngModel)]="search" (ngModelChange)="applyFilter()" placeholder="Search code…"
          class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs outline-none w-48" />
        <select [(ngModel)]="statusFilter" (ngModelChange)="applyFilter()" class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs font-semibold outline-none">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="EXPIRED">Expired</option>
        </select>
      </div>

      @if (error) {
        <div class="bg-red-400/10 border border-red-400/30 rounded-xl p-4 text-sm text-red-400">
          <p class="font-bold">Failed to load referrals</p>
          <p class="text-xs mt-1">{{ error }}</p>
          <button (click)="load()" class="mt-2 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-semibold">Retry</button>
        </div>
      }

      @if (loading) {
        <div class="text-muted-foreground py-12 text-center">Loading referrals...</div>
      }

      <div class="bg-card border-border rounded-xl border shadow-sm overflow-hidden" [class.hidden]="loading">
        <div class="overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
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
              @for (r of filtered; track r.id) {
                <tr class="border-border hover:bg-muted/30 border-b transition-colors cursor-pointer"
                    (click)="toggleDetail(r)">
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono text-xs font-bold text-foreground">
                    {{ r.code }}
                    @if (!r.created_by) {
                      <span class="bg-muted text-foreground rounded px-1 py-0.5 text-[8px] font-medium ml-1">PLATFORM</span>
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
                    <span [class]="'rounded px-2 py-0.5 text-[10px] font-bold ' + statusClass(r.status)">{{ r.status }}</span>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" (click)="$event.stopPropagation()">
                    @if (editingId === r.id) {
                      <input type="number" [(ngModel)]="editMaxUses" placeholder="∞" min="1"
                        class="bg-card border-border text-foreground rounded border px-2 py-0.5 text-xs w-16 outline-none" />
                    } @else {
                      <span class="font-mono text-xs font-bold text-foreground">{{ r.used_count || 0 }}</span>
                      <span class="text-muted-foreground text-[10px]"> / {{ r.max_uses ?? '∞' }}</span>
                    }
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" (click)="$event.stopPropagation()">
                    @if (editingId === r.id) {
                      <input type="date" [(ngModel)]="editExpiresAt"
                        class="bg-card border-border text-foreground rounded border px-2 py-0.5 text-xs outline-none" />
                    } @else {
                      <span class="text-muted-foreground text-[10px]">{{ r.expires_at ? (r.expires_at | wibDate:'shortDate') : '—' }}</span>
                    }
                  </td>
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-[10px]">{{ r.created_at | wibDate:'short' }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" (click)="$event.stopPropagation()">
                    <div class="flex flex-wrap gap-1">
                      <button (click)="confirmAction(r)"
                        class="bg-muted text-foreground hover:bg-muted/80 rounded px-2 py-1 text-[10px] font-medium transition-colors">
                        {{ r.status === 'ACTIVE' ? 'Deactivate' : 'Activate' }}
                      </button>
                      @if (editingId === r.id) {
                        <button (click)="saveEdit(r)" class="bg-primary text-primary-foreground rounded px-2 py-1 text-[10px] font-bold">Save</button>
                        <button (click)="cancelEdit()" class="text-muted-foreground rounded px-2 py-1 text-[10px] font-bold">X</button>
                      } @else {
                        <button (click)="startEdit(r)" class="bg-muted/30 text-muted-foreground hover:text-foreground rounded px-2 py-1 text-[10px] font-bold">Edit</button>
                      }
                    </div>
                  </td>
                </tr>
                @if (selectedId === r.id) {
                  <tr class="bg-muted/5 border-border border-b">
                    <td colspan="7" class="px-4 pb-4 pt-0">
                      @if (loadingDetail) {
                        <p class="text-muted-foreground py-4 text-center text-xs">Loading…</p>
                      } @else {
                        <div class="grid gap-4 sm:grid-cols-2 pt-3">
                          <div class="space-y-1.5">
                            <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Registered Users</p>
                            @for (u of detail.users; track u.id) {
                              <div class="border-border border-b pb-1 last:border-0 last:pb-0">
                                <p class="text-xs font-semibold text-foreground">{{ u.display_name || u.username }}</p>
                                <p class="text-[10px] text-muted-foreground">&#64;{{ u.username }} · {{ u.created_at | wibDate:'short' }}</p>
                              </div>
                            } @empty {
                              <p class="text-muted-foreground text-[10px]">No users registered with this code.</p>
                            }
                          </div>
                          <div class="space-y-1.5">
                            <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Activity Log</p>
                            @for (a of detail.auditLogs; track a.id) {
                              <div class="border-border border-b pb-1 last:border-0 last:pb-0">
                                <p class="text-xs font-semibold text-foreground">{{ a.action }}</p>
                                <p class="text-[10px] text-muted-foreground">{{ a.created_at | wibDate:'short' }}</p>
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
                <tr><td colspan="7" class="text-muted-foreground px-4 py-12 text-center">No referral codes found.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <app-confirm-dialog
      [open]="confirm.open"
      [title]="confirm.title"
      [message]="confirm.message"
      [icon]="confirm.icon"
      [iconBg]="confirm.iconBg"
      [confirmText]="confirm.confirmText"
      [cancelText]="confirm.cancelText"
      [loading]="confirm.loading"
      [loadingText]="confirm.loadingText"
      [confirmVariant]="confirm.confirmVariant"
      (onConfirm)="executeConfirm()"
      (onCancel)="cancelDialog()"
    />
  `,
})
export class ReferralsComponent implements OnInit, OnDestroy {
  referrals: any[] = [];
  filtered: any[] = [];
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

  confirm = {
    open: false, title: '', message: '', icon: '', iconBg: 'bg-primary/10',
    confirmText: 'Confirm', cancelText: 'Cancel', loading: false,
    loadingText: 'Processing…', confirmVariant: 'primary' as 'primary' | 'danger' | 'success' | 'warning',
    action: '', ref: null as any,
  };

  private destroy$ = new Subject<void>();

  constructor(
    private admin: AdminService,
    private auth: AuthService,
    private notification: NotificationService,
    private cdr: ChangeDetectorRef,
    private realtime: RealtimeService,
  ) {}

  ngOnInit() {
    this.load();
    this.realtime.subscribeReferrals();
    this.realtime.referrals$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
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
      this.referrals = await this.admin.getReferrals();
      this.applyFilter();
    } catch (e: any) {
      this.error = e?.message || 'Unknown error';
      this.notification.error('Gagal memuat', e.message || 'Tidak bisa memuat referral.');
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  applyFilter() {
    let result = this.referrals;
    if (this.search) {
      const q = this.search.toLowerCase();
      result = result.filter(r => r.code?.toLowerCase().includes(q));
    }
    if (this.statusFilter) result = result.filter(r => r.status === this.statusFilter);
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
    } catch (e: any) {
      this.notification.error('Gagal membuat kode', e.message || 'Tidak bisa membuat kode referral.');
    } finally {
      this.generating = false;
      this.cdr.markForCheck();
    }
  }

  confirmAction(r: any) {
    this.confirm.loading = false;
    this.confirm.ref = r;
    this.confirm.action = 'toggleStatus';
    const next = r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    this.confirm.title = next === 'INACTIVE' ? 'Nonaktifkan Referral' : 'Aktifkan Referral';
    this.confirm.message = `${next === 'INACTIVE' ? 'Nonaktifkan' : 'Aktifkan'} kode referral ${r.code}?`;
    this.confirm.icon = next === 'INACTIVE' ? '◌' : '✓';
    this.confirm.iconBg = 'bg-muted';
    this.confirm.confirmText = next === 'INACTIVE' ? 'Nonaktifkan' : 'Aktifkan';
    this.confirm.confirmVariant = next === 'INACTIVE' ? 'danger' : 'success';
    this.confirm.open = true;
    this.cdr.markForCheck();
  }

  async executeConfirm() {
    const r = this.confirm.ref;
    if (!r) return;
    this.confirm.loading = true;
    this.cdr.markForCheck();
    try {
      const admin = this.auth.getCurrentUser();
      const next = r.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await this.admin.updateReferralStatus(r.id, next);
      if (admin) await this.admin.logAction(admin.username, next === 'ACTIVE' ? 'ACTIVATE_REFERRAL' : 'DEACTIVATE_REFERRAL', 'referrals', r.id, r.status, next);
      r.status = next;
      this.notification.success('Status diperbarui', `Referral ${r.code} sekarang ${next}.`);
    } catch (e: any) {
      this.notification.error('Gagal memperbarui', e.message || 'Tidak bisa memperbarui status.');
    } finally {
      this.confirm.open = false;
      this.confirm.loading = false;
      this.confirm.ref = null;
      this.cdr.markForCheck();
    }
  }

  startEdit(r: any) {
    this.editingId = r.id;
    this.editMaxUses = r.max_uses ?? null;
    this.editExpiresAt = r.expires_at ? r.expires_at.slice(0, 10) : '';
  }

  cancelEdit() {
    this.editingId = null;
    this.editMaxUses = null;
    this.editExpiresAt = '';
  }

  async saveEdit(r: any) {
    const admin = this.auth.getCurrentUser();
    const data: any = {
      max_uses: this.editMaxUses ?? null,
      expires_at: this.editExpiresAt ? new Date(this.editExpiresAt).toISOString() : null,
    };
    try {
      await this.admin.updateReferral(r.id, data);
      if (admin) await this.admin.logAction(admin.username, 'UPDATE_REFERRAL', 'referrals', r.id, JSON.stringify({ max_uses: r.max_uses, expires_at: r.expires_at }), JSON.stringify(data));
      Object.assign(r, data);
      this.cancelEdit();
      this.notification.success('Referral diperbarui', `${r.code} telah diperbarui.`);
      this.cdr.markForCheck();
    } catch (e: any) {
      this.notification.error('Gagal memperbarui', e.message || 'Tidak bisa memperbarui referral.');
    }
  }

  toggleDetail(r: any) {
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
    } catch (e: any) {
      this.detail = {};
      this.notification.error('Gagal memuat detail', e?.message || 'Tidak bisa memuat detail referral.');
    }
    this.loadingDetail = false;
    this.cdr.markForCheck();
  }

  cancelDialog() {
    this.confirm.open = false;
    this.cdr.markForCheck();
  }

  statusClass(s: string) {
    return 'bg-muted text-foreground';
  }
}
