import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
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
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, WibDatePipe, ConfirmDialogComponent],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="max-sm:text-lg sm:text-2xl font-extrabold text-foreground">Users</h1>
          <p class="text-muted-foreground mt-1 text-sm">Manage all platform users</p>
        </div>
        <button (click)="load()" class="bg-card border-border text-muted-foreground hover:text-foreground rounded-lg border px-3 py-2 text-xs font-semibold transition-colors">
          ↻ Refresh
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <input [(ngModel)]="search" (ngModelChange)="applyFilter()" placeholder="Search username, email, name…"
          class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs outline-none w-56" />
        <select [(ngModel)]="statusFilter" (ngModelChange)="applyFilter()" class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs font-semibold outline-none">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING">Pending</option>
          <option value="PENDING_VERIFICATION">Pending Verification</option>
          <option value="REJECTED">Rejected</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
        <select [(ngModel)]="kycFilter" (ngModelChange)="applyFilter()" class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs font-semibold outline-none">
          <option value="">All KYC</option>
          <option value="APPROVED">KYC Approved</option>
          <option value="PENDING">KYC Pending</option>
          <option value="REJECTED">KYC Rejected</option>
        </select>
      </div>

      @if (error) {
        <div class="bg-red-400/10 border border-red-400/30 rounded-xl p-4 text-sm text-red-400">
          <p class="font-bold">Failed to load users</p>
          <p class="text-xs mt-1">{{ error }}</p>
          <button (click)="load()" class="mt-2 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-semibold">Retry</button>
        </div>
      }

      @if (loading) {
        <div class="text-muted-foreground py-12 text-center">Loading users...</div>
      }

      <div class="bg-card border-border rounded-xl border shadow-sm" [class.hidden]="loading">
        <div class="overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">User</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Role</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Status</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Referral</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">KYC</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Registration</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Created</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 w-48">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (u of filtered; track u.id) {
                <tr class="border-border hover:bg-muted/30 border-b transition-colors cursor-pointer"
                    (click)="toggleDetail(u)">
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" (click)="$event.stopPropagation()">
                    <p class="font-semibold text-foreground">{{ u.display_name || u.username }}</p>
                    <p class="text-muted-foreground text-[10px]">&#64;{{ u.username }} · {{ u.email }}</p>
                    <p class="text-muted-foreground text-[9px]">{{ u.country }} · {{ u.phone }}</p>
                    <p class="text-muted-foreground text-[9px] font-mono mt-0.5 select-all">{{ u.id }}</p>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" (click)="$event.stopPropagation()">
                    <span class="bg-primary/10 text-primary rounded px-2 py-0.5 text-[10px] font-bold">{{ u.role }}</span>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" (click)="$event.stopPropagation()">
                    <select [ngModel]="editing[u.id]?.account_status ?? u.account_status" (ngModelChange)="setEdit(u,'account_status',$event)"
                      class="rounded border-0 bg-transparent text-[10px] font-bold outline-none"
                      [class.text-emerald-400]="(editing[u.id]?.account_status ?? u.account_status) === 'ACTIVE'"
                      [class.text-amber-400]="(editing[u.id]?.account_status ?? u.account_status) === 'SUSPENDED'"
                      [class.text-red-400]="(editing[u.id]?.account_status ?? u.account_status) === 'BANNED'">
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                      <option value="BANNED">BANNED</option>
                    </select>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <span class="font-mono text-[10px] text-yellow-400">{{ u.referral_code || '-' }}</span>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <span [class]="'rounded px-2 py-0.5 text-[10px] font-bold ' + kycClass(u.kyc_status)">{{ u.kyc_status }}</span>
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <span [class]="'rounded px-2 py-0.5 text-[10px] font-bold ' + regClass(u.registration_status)">{{ u.registration_status }}</span>
                  </td>
                  <td class="text-muted-foreground max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-[10px]">{{ u.created_at | wibDate:'short' }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3" (click)="$event.stopPropagation()">
                    <div class="flex flex-wrap gap-1">
                      @if (u.registration_status === 'PENDING' || u.registration_status === 'PENDING_VERIFICATION') {
                        <button (click)="confirmAction('approve', u)" class="bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 rounded px-2 py-1 text-[10px] font-bold">Approve</button>
                        <button (click)="confirmAction('reject', u)" class="bg-red-400/10 text-red-400 hover:bg-red-400/20 rounded px-2 py-1 text-[10px] font-bold">Reject</button>
                      }
                      @if (u.login_status === 'ACTIVE') {
                        <button (click)="confirmAction('lock', u)" class="bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 rounded px-2 py-1 text-[10px] font-bold">Lock</button>
                      } @else {
                        <button (click)="confirmAction('unlock', u)" class="bg-sky-400/10 text-sky-400 hover:bg-sky-400/20 rounded px-2 py-1 text-[10px] font-bold">Unlock</button>
                      }
                      @if (isSuperadmin) {
                        <button (click)="confirmAction('reset', u)" class="bg-violet-400/10 text-violet-400 hover:bg-violet-400/20 rounded px-2 py-1 text-[10px] font-bold">Reset</button>
                      }
                      <button (click)="openEditModal(u)" class="bg-muted text-foreground hover:bg-muted/80 rounded px-2 py-1 text-[10px] font-bold">Edit</button>
                      @if (editing[u.id] && changed(u)) {
                        <button (click)="saveUser(u)" class="bg-primary text-primary-foreground rounded-lg px-2 py-1 text-[10px] font-bold">Save</button>
                        <button (click)="editing[u.id] = null" class="text-muted-foreground rounded-lg px-2 py-1 text-[10px] font-bold">X</button>
                      }
                    </div>
                  </td>
                </tr>
                @if (selectedId === u.id) {
                  <tr class="bg-muted/5 border-border border-b">
                    <td colspan="8" class="px-4 pb-4 pt-0">
                      @if (loadingDetail) {
                        <p class="text-muted-foreground py-4 text-center text-xs">Loading…</p>
                      } @else {
                        <div class="grid gap-4 sm:grid-cols-3 pt-3">
                          <div class="space-y-1.5">
                            <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Profile</p>
                            @if (userDetail.wallet) {
                              <p class="text-xs"><span class="text-muted-foreground">Balance: </span><span class="font-semibold text-emerald-400">{{ userDetail.wallet.balance_main | number:'1.2-2' }} P</span></p>
                              <p class="text-xs"><span class="text-muted-foreground">Bonus: </span><span class="font-semibold text-amber-400">{{ userDetail.wallet.balance_bonus | number:'1.2-2' }} P</span></p>
                            }
                            <p class="text-xs"><span class="text-muted-foreground">Bank: </span><span class="text-foreground font-semibold">{{ u.bank_name || '-' }}</span></p>
                            <p class="text-xs"><span class="text-muted-foreground">Acc No: </span><span class="text-foreground font-semibold">{{ u.bank_account_number || '-' }}</span></p>
                            <p class="text-xs"><span class="text-muted-foreground">Acc Name: </span><span class="text-foreground font-semibold">{{ u.bank_account_name || '-' }}</span></p>
                            <p class="text-xs"><span class="text-muted-foreground">Approved: </span><span class="text-foreground font-semibold">{{ u.approved_at | wibDate:'short' }}</span></p>
                            @if (userDetail.kycDocs?.length) {
                              <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-3 mb-1">KYC Docs</p>
                              <div class="flex flex-wrap gap-2">
                                @for (d of userDetail.kycDocs; track d.id) {
                                  <div class="relative group">
                                    <img [src]="d.document_url" (click)="viewImage(d.document_url)" class="h-16 w-24 rounded-lg border border-border object-cover cursor-pointer hover:opacity-80 transition-opacity" title="{{ d.document_type || 'Doc' }} ({{ d.status }})" />
                                    <span class="absolute -top-1 -right-1 bg-card border border-border text-[8px] font-bold px-1 rounded">{{ d.status?.charAt(0) }}</span>
                                  </div>
                                }
                              </div>
                            }
                          </div>
                          <div class="space-y-1.5">
                            <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Login History</p>
                            @for (s of userDetail.sessions; track s.id) {
                              <div class="border-border border-b pb-1 last:border-0 last:pb-0">
                                <p class="text-xs text-foreground font-semibold">{{ s.ip_address || 'Unknown IP' }}</p>
                                <p class="text-[10px] text-muted-foreground">{{ s.browser_info || 'Unknown browser' }}</p>
                                <p class="text-[10px] text-muted-foreground">
                                  {{ s.last_activity | wibDate:'short' }}
                                  <span [class]="s.logged_out_at ? 'text-zinc-400' : 'text-emerald-400'">
                                    · {{ s.logged_out_at ? 'Ended' : 'Active' }}
                                  </span>
                                </p>
                              </div>
                            } @empty {
                              <p class="text-muted-foreground text-[10px]">No sessions found.</p>
                            }
                          </div>
                          <div class="space-y-1.5">
                            <p class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Recent Activity</p>
                            @for (a of userDetail.auditLogs; track a.id) {
                              <div class="border-border border-b pb-1 last:border-0 last:pb-0">
                                <p class="text-xs font-semibold text-foreground">{{ a.action }}</p>
                                <p class="text-[10px] text-muted-foreground">{{ a.created_at | wibDate:'short' }}</p>
                              </div>
                            } @empty {
                              <p class="text-muted-foreground text-[10px]">No activity found.</p>
                            }
                          </div>
                        </div>
                      }
                    </td>
                  </tr>
                }
              } @empty {
                <tr><td colspan="8" class="text-muted-foreground px-4 py-12 text-center">No users found.</td></tr>
              }
            </tbody>
          </table>
        </div>
      @if (previewImage) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" (click)="previewImage = null">
          <img [src]="previewImage" class="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl" (click)="$event.stopPropagation()" />
          <button (click)="previewImage = null" class="absolute top-4 right-4 text-white text-2xl font-bold hover:opacity-70">&times;</button>
        </div>
      }
      </div>
    </div>

    <app-confirm-dialog
      [open]="confirmDialog.open"
      [title]="confirmDialog.title"
      [message]="confirmDialog.message"
      [icon]="confirmDialog.icon"
      [iconBg]="confirmDialog.iconBg"
      [confirmText]="confirmDialog.confirmText"
      [cancelText]="confirmDialog.cancelText"
      [loading]="confirmDialog.loading"
      [loadingText]="confirmDialog.loadingText"
      [confirmVariant]="confirmDialog.confirmVariant"
      (onConfirm)="executeConfirm()"
      (onCancel)="cancelDialog()"
    />

    @if (editModal.open) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" (click)="closeEditModal()">
        <div class="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-base font-extrabold text-foreground">Edit User</h2>
            <button (click)="closeEditModal()" class="text-muted-foreground hover:text-foreground text-lg font-bold">&times;</button>
          </div>
          <div class="space-y-3">
            <div>
              <label class="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Bank Name</label>
              <input [(ngModel)]="editModal.bank_name" class="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none" placeholder="Bank name" />
            </div>
            <div>
              <label class="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Account Number</label>
              <input [(ngModel)]="editModal.bank_account_number" class="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none" placeholder="Account number" />
            </div>
            <div>
              <label class="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Account Name</label>
              <input [(ngModel)]="editModal.bank_account_name" class="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none" placeholder="Account name" />
            </div>
            <div>
              <label class="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Email</label>
              <input [(ngModel)]="editModal.email" class="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none" placeholder="Email" />
            </div>
            <div>
              <label class="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Phone</label>
              <input [(ngModel)]="editModal.phone" class="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none" placeholder="Phone" />
            </div>
          </div>
          <div class="mt-5 flex gap-2">
            <button (click)="closeEditModal()" class="h-9 flex-1 rounded-lg border border-border bg-background text-xs font-semibold text-foreground hover:bg-muted">Cancel</button>
            <button (click)="saveEditModal()" [disabled]="editModal.loading" class="h-9 flex-1 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 disabled:opacity-50">
              {{ editModal.loading ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class UsersComponent implements OnInit, OnDestroy {
  users: any[] = [];
  filtered: any[] = [];
  editing: Record<string, any> = {};
  search = '';
  statusFilter = '';
  kycFilter = '';
  roleFilter = 'user';
  rejectReason = '';
  selectedId: string | null = null;
  userDetail: { wallet?: any; sessions?: any[]; auditLogs?: any[]; kycDocs?: any[] } = {};
  loading = false;
  loadingDetail = false;
  error: string | null = null;
  previewImage: string | null = null;
  editModal = {
    open: false,
    user: null as any,
    bank_name: '',
    bank_account_number: '',
    bank_account_name: '',
    email: '',
    phone: '',
    loading: false,
  };
  isSuperadmin = false;
  private destroy$ = new Subject<void>();

  confirmDialog = {
    open: false,
    title: '',
    message: '',
    icon: '',
    iconBg: 'bg-primary/10',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    loading: false,
    loadingText: 'Processing…',
    confirmVariant: 'primary' as 'primary' | 'danger' | 'success' | 'warning',
    action: '',
    user: null as any,
    rejectReason: '',
  };

  constructor(private admin: AdminService, private auth: AuthService, private cdr: ChangeDetectorRef, private notification: NotificationService, private realtime: RealtimeService) {}

  ngOnInit() {
    this.isSuperadmin = this.auth.getCurrentUser()?.role === 'superadmin';
    this.load();
    this.realtime.subscribeUsers();
    this.realtime.users$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.silentRefresh();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private async silentRefresh() {
    try {
      const fresh = await this.admin.getUsers();
      this.users = fresh;
      this.applyFilter();
      if (this.selectedId) this.loadUserDetail(this.selectedId);
      this.cdr.markForCheck();
    } catch (e: any) {
    }
  }

  async load() {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();
    try {
      this.users = await this.admin.getUsers();
      this.applyFilter();
    } catch (e: any) {
      this.error = e?.message || 'Unknown error';
      this.notification.error('Load failed', e?.message || 'Could not load users.');
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  applyFilter() {
    let result = this.roleFilter ? this.users.filter(u => u.role === this.roleFilter) : this.users;
    if (this.search) {
      const q = this.search.toLowerCase();
      result = result.filter(u =>
        u.username?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.display_name?.toLowerCase().includes(q) ||
        u.phone?.includes(q)
      );
    }
    if (this.statusFilter === 'PENDING') {
      result = result.filter(u => u.account_status === 'PENDING' || u.registration_status === 'PENDING' || u.registration_status === 'PENDING_VERIFICATION');
    } else if (this.statusFilter) {
      result = result.filter(u => u.account_status === this.statusFilter || u.registration_status === this.statusFilter);
    }
    if (this.kycFilter) result = result.filter(u => u.kyc_status === this.kycFilter);
    this.filtered = result;
  }

  setEdit(u: any, field: string, value: any) {
    this.editing[u.id] = { ...(this.editing[u.id] || {}), [field]: value };
  }

  changed(u: any) {
    const e = this.editing[u.id];
    return e && Object.keys(e).some(k => e[k] !== u[k]);
  }

  toggleDetail(u: any) {
    if (this.selectedId === u.id) {
      this.selectedId = null;
      this.userDetail = {};
    } else {
      this.selectedId = u.id;
      this.loadUserDetail(u.id);
    }
  }

  async loadUserDetail(userId: string) {
    this.loadingDetail = true;
    this.cdr.markForCheck();
    const [walletResult, sessionsResult, auditResult, kycResult] = await Promise.allSettled([
      this.admin.getWallet(userId),
      this.admin.getUserSessionsForUser(userId, 5),
      this.admin.getAuditLogsByResource(userId, 10),
      this.admin.getKycDocsByUser(userId),
    ]);
    this.userDetail = {
      wallet: walletResult.status === 'fulfilled' ? (walletResult.value[0] ?? null) : null,
      sessions: sessionsResult.status === 'fulfilled' ? sessionsResult.value : [],
      auditLogs: auditResult.status === 'fulfilled' ? auditResult.value : [],
      kycDocs: kycResult.status === 'fulfilled' ? kycResult.value : [],
    };
    const errors = [walletResult, sessionsResult, auditResult, kycResult]
      .filter(r => r.status === 'rejected')
      .map(r => (r as PromiseRejectedResult).reason?.message || 'Unknown error');
    if (errors.length > 0) {
      this.notification.warning('Some details failed to load', errors.join('; '));
    }
    this.loadingDetail = false;
    this.cdr.markForCheck();
  }

  saveUser(u: any) {
    const data = this.editing[u.id];
    const admin = this.auth.getCurrentUser();
    this.admin.updateUser(u.id, data).then(() => {
      if (admin) {
        const oldVal = JSON.stringify(Object.keys(data).reduce((o: any, k) => { o[k] = u[k]; return o; }, {}));
        this.admin.logAction(admin.username, 'UPDATE_USER', 'users', u.id, oldVal, JSON.stringify(data));
      }
      Object.assign(u, data);
      delete this.editing[u.id];
      this.cdr.markForCheck();
      this.notification.success('User updated', 'Changes saved successfully.');
    }).catch(e => this.notification.error('Save failed', e.message || 'Could not update user.'));
  }

  confirmAction(action: string, u: any) {
    this.confirmDialog.loading = false;
    this.confirmDialog.user = u;
    this.confirmDialog.action = action;
    this.confirmDialog.rejectReason = '';
    switch (action) {
      case 'approve':
        this.confirmDialog.title = 'Approve User';
        this.confirmDialog.message = `Approve ${u.display_name || u.username}? They will be able to log in immediately.`;
        this.confirmDialog.icon = '✓';
        this.confirmDialog.iconBg = 'bg-emerald-400/10';
        this.confirmDialog.confirmText = 'Approve';
        this.confirmDialog.confirmVariant = 'success';
        break;
      case 'reject':
        this.confirmDialog.title = 'Reject User';
        this.confirmDialog.message = `Reject ${u.display_name || u.username}? Their account will be locked.`;
        this.confirmDialog.icon = '✕';
        this.confirmDialog.iconBg = 'bg-red-400/10';
        this.confirmDialog.confirmText = 'Reject';
        this.confirmDialog.confirmVariant = 'danger';
        break;
      case 'lock':
        this.confirmDialog.title = 'Lock User';
        this.confirmDialog.message = `Lock ${u.display_name || u.username}? They won't be able to log in.`;
        this.confirmDialog.icon = '🔒';
        this.confirmDialog.iconBg = 'bg-amber-400/10';
        this.confirmDialog.confirmText = 'Lock';
        this.confirmDialog.confirmVariant = 'warning';
        break;
      case 'unlock':
        this.confirmDialog.title = 'Unlock User';
        this.confirmDialog.message = `Unlock ${u.display_name || u.username}? They will regain access.`;
        this.confirmDialog.icon = '🔓';
        this.confirmDialog.iconBg = 'bg-sky-400/10';
        this.confirmDialog.confirmText = 'Unlock';
        this.confirmDialog.confirmVariant = 'success';
        break;
      case 'reset':
        this.confirmDialog.title = 'Reset Credentials';
        this.confirmDialog.message = `Reset credentials for ${u.display_name || u.username}? Their account will be locked and they'll need to create a new password.`;
        this.confirmDialog.icon = '🔄';
        this.confirmDialog.iconBg = 'bg-violet-400/10';
        this.confirmDialog.confirmText = 'Reset';
        this.confirmDialog.confirmVariant = 'warning';
        break;
    }
    this.confirmDialog.open = true;
    this.cdr.markForCheck();
  }

  async executeConfirm() {
    const action = this.confirmDialog.action;
    const u = this.confirmDialog.user;
    if (!u) return;
    this.confirmDialog.loading = true;
    this.cdr.markForCheck();
    try {
      switch (action) {
        case 'approve': await this.approve(u); break;
        case 'reject': await this.reject(u); break;
        case 'lock': await this.lock(u); break;
        case 'unlock': await this.unlock(u); break;
        case 'reset': await this.resetCredentials(u); break;
      }
    } finally {
      this.confirmDialog.open = false;
      this.confirmDialog.loading = false;
      this.confirmDialog.user = null;
      this.cdr.markForCheck();
    }
  }

  async approve(u: any) {
    const admin = this.auth.getCurrentUser();
    if (!admin) return;
    try {
      await this.admin.approveUser(u.id, admin.username);
      await this.admin.logAction(admin.username, 'APPROVE_USER', 'users', u.id, u.registration_status, 'APPROVED');
      const kycDocs = await this.admin.getKycDocsByUser(u.id);
      for (const doc of kycDocs) {
        if (doc.status === 'PENDING') {
          await this.admin.updateKycStatus(doc.id, 'APPROVED');
          await this.admin.logAction(admin.username, 'APPROVE_KYC', 'kyc_documents', doc.id, 'PENDING', 'APPROVED');
        }
      }
      await this.admin.updateUser(u.id, { kyc_status: 'APPROVED' });
      u.registration_status = 'APPROVED';
      u.account_status = 'ACTIVE';
      u.login_status = 'ACTIVE';
      u.kyc_status = 'APPROVED';
      this.applyFilter();
      this.notification.success('User approved', `${u.display_name || u.username} can now log in.`);
    } catch (e: any) {
      this.notification.error('Approval failed', e.message || 'Could not approve user.');
    }
  }

  async reject(u: any) {
    const admin = this.auth.getCurrentUser();
    if (!admin) return;
    const reason = this.confirmDialog.rejectReason || 'Rejected by admin.';
    try {
      await this.admin.rejectUser(u.id, admin.username, reason);
      await this.admin.logAction(admin.username, 'REJECT_USER', 'users', u.id, u.registration_status, 'REJECTED:' + reason);
      u.registration_status = 'REJECTED';
      u.account_status = 'REJECTED';
      u.login_status = 'LOCKED';
      this.applyFilter();
      this.notification.success('User rejected', `${u.display_name || u.username} has been rejected.`);
    } catch (e: any) {
      this.notification.error('Rejection failed', e.message || 'Could not reject user.');
    }
  }

  async lock(u: any) {
    const admin = this.auth.getCurrentUser();
    try {
      await this.admin.lockUser(u.id);
      if (admin) await this.admin.logAction(admin.username, 'LOCK_USER', 'users', u.id, u.login_status, 'LOCKED');
      u.login_status = 'LOCKED';
      this.notification.success('User locked', `${u.display_name || u.username} is now locked.`);
    } catch (e: any) {
      this.notification.error('Lock failed', e.message || 'Could not lock user.');
    }
  }

  async unlock(u: any) {
    const admin = this.auth.getCurrentUser();
    try {
      await this.admin.unlockUser(u.id);
      if (admin) await this.admin.logAction(admin.username, 'UNLOCK_USER', 'users', u.id, u.login_status, 'ACTIVE');
      u.login_status = 'ACTIVE';
      this.notification.success('User unlocked', `${u.display_name || u.username} is now active.`);
    } catch (e: any) {
      this.notification.error('Unlock failed', e.message || 'Could not unlock user.');
    }
  }

  async resetCredentials(u: any) {
    const admin = this.auth.getCurrentUser();
    if (!admin) return;
    try {
      await this.admin.lockUser(u.id);
      await this.admin.logAction(admin.username, 'RESET_CREDENTIALS', 'users', u.id, u.login_status, 'LOCKED_RESET_REQUIRED');
      u.login_status = 'LOCKED';
      this.notification.success('Credentials reset', `${u.display_name || u.username} is locked pending credential reset.`);
    } catch (e: any) {
      this.notification.error('Reset failed', e.message || 'Could not reset credentials.');
    }
  }

  cancelDialog() {
    this.confirmDialog.open = false;
    this.confirmDialog.rejectReason = '';
    this.cdr.markForCheck();
  }

  viewImage(url: string) { this.previewImage = url; }

  openEditModal(u: any) {
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
    } catch (e: any) {
      this.notification.error('Save failed', e.message || 'Could not update user.');
    } finally {
      this.editModal.loading = false;
      this.cdr.markForCheck();
    }
  }

  kycClass(s: string) {
    const m: Record<string, string> = { APPROVED: 'bg-emerald-400/10 text-emerald-400', PENDING: 'bg-amber-400/10 text-amber-400', REJECTED: 'bg-red-400/10 text-red-400' };
    return m[s] || 'bg-zinc-400/10 text-zinc-400';
  }

  regClass(s: string) {
    const m: Record<string, string> = { APPROVED: 'bg-emerald-400/10 text-emerald-400', PENDING: 'bg-amber-400/10 text-amber-400', PENDING_VERIFICATION: 'bg-amber-400/10 text-amber-400', REJECTED: 'bg-red-400/10 text-red-400' };
    return m[s] || 'bg-zinc-400/10 text-zinc-400';
  }
}
