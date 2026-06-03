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
  selector: 'app-kyc',
  standalone: true,
  imports: [CommonModule, FormsModule, WibDatePipe, ConfirmDialogComponent],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="max-sm:text-lg sm:text-2xl font-extrabold text-foreground">KYC Documents</h1>
          <p class="text-muted-foreground mt-1 text-sm">Review identity documents</p>
        </div>
        <select [(ngModel)]="statusFilter" (ngModelChange)="applyFilter()" class="bg-card border-border text-foreground rounded-lg border px-3 py-2 text-xs font-semibold outline-none">
          <option value="">Semua</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      @if (error) {
        <div class="bg-red-400/10 border border-red-400/30 rounded-xl p-4 text-sm text-red-400">
          <p class="font-bold">Gagal memuat dokumen KYC</p>
          <p class="text-xs mt-1">{{ error }}</p>
          <button (click)="load()" class="mt-2 bg-card border border-border rounded-lg px-3 py-1.5 text-xs font-semibold">Coba Lagi</button>
        </div>
      }

      @if (loading) {
        <div class="text-muted-foreground py-12 text-center">Memuat dokumen KYC...</div>
      }

      <div class="bg-card border-border rounded-xl border shadow-sm" [class.hidden]="loading">
        <div class="overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">User</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Tipe</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Status</th>
                <th class="max-sm:hidden sm:px-4 sm:py-3">Tanggal</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Dokumen</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              @for (k of filtered; track k.id) {
                <tr class="border-border border-b text-xs">
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p class="font-semibold text-foreground">{{ k.user?.display_name || k.user?.username || k.user_id?.slice(0,16) || '—' }}</p>
                    @if (k.user?.username) {
                      <p class="text-muted-foreground text-[10px]">&#64;{{ k.user.username }}</p>
                    }
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground">{{ k.document_type || 'ID' }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <span [class]="'rounded px-2 py-0.5 text-[10px] font-bold ' + statusClass(k.status)">{{ k.status }}</span>
                    @if (k.rejection_reason) {
                      <p class="text-[9px] text-red-400 mt-0.5">{{ k.rejection_reason }}</p>
                    }
                  </td>
                  <td class="max-sm:hidden text-muted-foreground whitespace-nowrap sm:px-4 sm:py-3 text-[10px]">{{ k.created_at | wibDate:'short' }}</td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    @if (k.document_url) {
                      <img [src]="k.document_url" (click)="viewImage(k.document_url)" class="h-10 w-16 rounded border border-border object-cover cursor-pointer hover:opacity-80 transition-opacity" title="Klik untuk perbesar" />
                    } @else {
                      <span class="text-muted-foreground text-[10px]">—</span>
                    }
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    @if (k.status === 'PENDING') {
                      <div class="flex flex-wrap gap-1">
                        <button (click)="confirmAction('approve', k)" [disabled]="approving.has(k.id)"
                          class="bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 disabled:opacity-50 rounded px-2 py-1 text-[10px] font-bold">
                          {{ approving.has(k.id) ? '...' : 'Setujui' }}
                        </button>
                        <button (click)="confirmAction('reject', k)" [disabled]="approving.has(k.id)"
                          class="bg-red-400/10 text-red-400 hover:bg-red-400/20 disabled:opacity-50 rounded px-2 py-1 text-[10px] font-bold">Tolak</button>
                      </div>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="text-muted-foreground px-4 py-12 text-center">Tidak ada dokumen KYC ditemukan.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (previewImage) {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" (click)="previewImage = null">
          <img [src]="previewImage" class="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl" (click)="$event.stopPropagation()" />
          <button (click)="previewImage = null" class="absolute top-4 right-4 text-white text-2xl font-bold hover:opacity-70">&times;</button>
        </div>
      }
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
export class KycComponent implements OnInit, OnDestroy {
  documents: any[] = [];
  filtered: any[] = [];
  statusFilter = '';
  previewImage: string | null = null;
  error: string | null = null;
  loading = false;
  approving = new Set<string>();
  private destroy$ = new Subject<void>();

  confirm = {
    open: false, title: '', message: '', icon: '', iconBg: 'bg-primary/10',
    confirmText: 'Confirm', cancelText: 'Cancel', loading: false,
    loadingText: 'Processing…', confirmVariant: 'primary' as 'primary' | 'danger' | 'success' | 'warning',
    action: '', doc: null as any,
  };

  constructor(
    private admin: AdminService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private notification: NotificationService,
    private realtime: RealtimeService,
  ) {}

  ngOnInit() {
    this.load();
    this.realtime.subscribeKyc();
    this.realtime.kyc$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.load();
      });
  }

  ngOnDestroy() {
    this.realtime.unsubscribeKyc();
    this.destroy$.next();
    this.destroy$.complete();
  }

  async load() {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();
    try {
      const d = await this.admin.getKycDocuments();
      this.documents = d;
      this.applyFilter();
    } catch (e: any) {
      this.error = e.message || 'Unknown error';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  applyFilter() { this.filtered = this.statusFilter ? this.documents.filter(d => d.status === this.statusFilter) : this.documents; }

  cancelDialog() {
    this.confirm.open = false;
    this.cdr.markForCheck();
  }

  viewImage(url: string) { this.previewImage = url; }

  statusClass(s: string) { const m: Record<string,string> = { APPROVED: 'bg-emerald-400/10 text-emerald-400', PENDING: 'bg-amber-400/10 text-amber-400', REJECTED: 'bg-red-400/10 text-red-400' }; return m[s] || 'bg-zinc-400/10 text-zinc-400'; }

  confirmAction(action: string, k: any) {
    this.confirm.loading = false;
    this.confirm.doc = k;
    this.confirm.action = action;
    if (action === 'approve') {
      this.confirm.title = 'Setujui KYC';
      this.confirm.message = `Setujui dokumen KYC ${k.document_type || 'ID'} milik ${k.user?.username || k.user_id?.slice(0,16)}? Pengguna akan terverifikasi.`;
      this.confirm.icon = '✓';
      this.confirm.iconBg = 'bg-emerald-400/10';
      this.confirm.confirmText = 'Setujui';
      this.confirm.confirmVariant = 'success';
    } else {
      this.confirm.title = 'Tolak KYC';
      this.confirm.message = `Tolak dokumen KYC ${k.document_type || 'ID'} milik ${k.user?.username || k.user_id?.slice(0,16)}?`;
      this.confirm.icon = '✕';
      this.confirm.iconBg = 'bg-red-400/10';
      this.confirm.confirmText = 'Tolak';
      this.confirm.confirmVariant = 'danger';
    }
    this.confirm.open = true;
    this.cdr.markForCheck();
  }

  async executeConfirm() {
    const action = this.confirm.action;
    const k = this.confirm.doc;
    if (!k) return;
    this.confirm.loading = true;
    this.cdr.markForCheck();
    try {
      if (action === 'approve') await this.approve(k);
      else await this.reject(k);
    } finally {
      this.confirm.open = false;
      this.confirm.loading = false;
      this.confirm.doc = null;
      this.cdr.markForCheck();
    }
  }

  async approve(k: any) {
    if (this.approving.has(k.id)) return;
    this.approving.add(k.id);
    this.cdr.markForCheck();
    const admin = this.auth.getCurrentUser();
    try {
      await this.admin.updateKycStatus(k.id, 'APPROVED');
      await this.admin.updateUser(k.user_id, { kyc_status: 'APPROVED' });
      if (admin) {
        await this.admin.logAction(admin.username, 'APPROVE_KYC', 'kyc_documents', k.id, 'PENDING', 'APPROVED');
      }
      this.notification.success('KYC disetujui', `Pengguna ${k.user_id?.slice(0, 16)} telah disetujui.`);
      await this.load();
      this.cdr.markForCheck();
    } catch (e: any) {
      this.notification.error('Persetujuan gagal', e.message || 'Tidak bisa menyetujui KYC.');
    } finally {
      this.approving.delete(k.id);
      this.cdr.markForCheck();
    }
  }

  async reject(k: any) {
    if (this.approving.has(k.id)) return;
    this.approving.add(k.id);
    this.cdr.markForCheck();
    const admin = this.auth.getCurrentUser();
    const reason = 'Dokumen tidak lengkap';
    try {
      await this.admin.updateKycStatus(k.id, 'REJECTED', reason);
      await this.admin.updateUser(k.user_id, { kyc_status: 'REJECTED' });
      if (admin) {
        await this.admin.logAction(admin.username, 'REJECT_KYC', 'kyc_documents', k.id, 'PENDING', 'REJECTED:' + reason);
      }
      this.notification.success('KYC ditolak', `Pengguna ${k.user?.username || k.user_id?.slice(0, 16)} telah ditolak.`);
      await this.load();
      this.cdr.markForCheck();
    } catch (e: any) {
      this.notification.error('Penolakan gagal', e.message || 'Tidak bisa menolak KYC.');
    } finally {
      this.approving.delete(k.id);
      this.cdr.markForCheck();
    }
  }
}
