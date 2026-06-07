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
import { PaginatorModule } from 'primeng/paginator';
import { InputTextModule } from 'primeng/inputtext';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { LoadingErrorComponent } from 'src/app/shared/components/loading-error/loading-error.component';
import { FilterBarComponent } from 'src/app/shared/components/filter-bar/filter-bar.component';
import { SeverityMapPipe } from 'src/app/shared/pipes/severity-map.pipe';
import { PaginationHelper } from 'src/app/shared/utils/pagination.helper';
import { FilterHelper } from 'src/app/shared/utils/filter.helper';

interface KycDocument {
  id: string;
  user_display_name?: string;
  user_username?: string;
  user_id?: string;
  document_type?: string;
  status: string;
  rejection_reason?: string;
  created_at?: string;
}

@Component({
  selector: 'app-kyc',
  standalone: true,
  imports: [CommonModule, FormsModule,
    WibDatePipe, SelectModule, TagModule, ConfirmDialogModule, PaginatorModule, InputTextModule,
    PageHeaderComponent, LoadingErrorComponent, FilterBarComponent, SeverityMapPipe],
  providers: [ConfirmationService],
  template: `
    <div data-page="kyc" class="space-y-6">
      <app-page-header icon="identification" title="KYC Documents" subtitle="Review identity documents">
        <app-filter-bar [search]="search" (searchChange)="search=$event; applyFilter()" placeholder="Cari username…">
          <p-select
            [(ngModel)]="statusFilter"
            (ngModelChange)="applyFilter()"
            [options]="statusOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Semua"
            class="w-36"
            styleClass="!text-xs !w-full" />
        </app-filter-bar>
      </app-page-header>

      <app-loading-error [loading]="loading" [error]="error" (retry)="load()" />

      <div class="bg-card border-border rounded-lg page-accent-card" [class.hidden]="loading">
        <div class="overflow-x-auto">
          <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
            <thead>
              <tr
                class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">User</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Tipe</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Status</th>
                <th class="max-sm:hidden sm:px-4 sm:py-3">Tanggal</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Dokumen</th>
                <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              @for (k of displayDocs; track k.id) {
                <tr class="border-border border-b text-xs">
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p class="font-semibold text-foreground">
                      {{ k.user_display_name || k.user_username || k.user_id?.slice(0, 16) || '—' }}
                    </p>
                    @if (k.user_username) {
                      <p class="text-muted-foreground text-[10px]">&#64;{{ k.user_username }}</p>
                    }
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground">
                    {{ k.document_type || 'ID' }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    <p-tag [value]="k.status" [severity]="k.status | severityMap" />
                    @if (k.rejection_reason) {
                      <p class="text-[9px] text-muted-foreground mt-0.5">{{ k.rejection_reason }}</p>
                    }
                  </td>
                  <td class="max-sm:hidden text-muted-foreground whitespace-nowrap sm:px-4 sm:py-3 text-[10px]">
                    {{ k.created_at | wibDate: 'short' }}
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    @if (docUrls[k.id]) {
                      <img
                        [src]="docUrls[k.id]"
                        (click)="viewImage(docUrls[k.id])"
                        class="h-10 w-16 rounded border border-border object-cover cursor-pointer hover:opacity-80 transition-opacity"
                        title="Klik untuk perbesar" />
                    } @else {
                      <button
                        (click)="loadDocUrl(k.id)"
                        [disabled]="loadingUrls.has(k.id)"
                        class="text-muted-foreground hover:text-foreground text-[10px] underline">
                        {{ loadingUrls.has(k.id) ? '...' : 'Lihat' }}
                      </button>
                    }
                  </td>
                  <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                    @if (k.status === 'PENDING') {
                      <div class="flex flex-wrap gap-1">
                        <button
                          (click)="confirmApprove(k)"
                          [disabled]="approving.has(k.id)"
                          class="bg-foreground text-background disabled:opacity-50 rounded px-2 py-1 text-[10px] font-medium">
                          {{ approving.has(k.id) ? '...' : 'Setujui' }}
                        </button>
                        <button
                          (click)="confirmReject(k)"
                          [disabled]="approving.has(k.id)"
                          class="bg-card border-border text-muted-foreground hover:text-foreground disabled:opacity-50 rounded border px-2 py-1 text-[10px] font-medium">
                          Tolak
                        </button>
                      </div>
                    }
                    @if (k.status === 'REJECTED') {
                      <button
                        (click)="confirmReverify(k)"
                        [disabled]="approving.has(k.id)"
                        class="bg-card border-border text-muted-foreground hover:text-foreground disabled:opacity-50 rounded border px-2 py-1 text-[10px] font-medium">
                        {{ approving.has(k.id) ? '...' : 'Verifikasi Ulang' }}
                      </button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="text-muted-foreground px-4 py-12 text-center text-xs">
                    Tidak ada dokumen KYC ditemukan.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        <p-paginator
          (onPageChange)="onPageChange($event)"
          [first]="(currentPage - 1) * pageSize"
          [rows]="pageSize"
          [totalRecords]="filtered.length"
          [showCurrentPageReport]="true"
          currentPageReportTemplate="" />
        </div>
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

      @if (rejectModal.open && rejectModal.doc) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          (click)="closeRejectModal()">
          <div
            class="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl"
            (click)="$event.stopPropagation()">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-sm font-bold text-foreground">Tolak KYC</h2>
              <button (click)="closeRejectModal()" class="text-muted-foreground hover:text-foreground text-lg font-bold">&times;</button>
            </div>
            <p class="text-xs text-muted-foreground mb-3">
              Tolak KYC <span class="text-foreground font-medium">{{ rejectModal.doc.document_type || 'ID' }}</span>
              milik <span class="text-foreground font-medium">{{ rejectModal.doc.user_username || rejectModal.doc.user_id?.slice(0, 16) }}</span>?
            </p>
            <div class="mb-4">
              <label class="block text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Alasan Penolakan</label>
              <input pInputText [(ngModel)]="rejectModal.reason" placeholder="Dokumen tidak lengkap" class="!w-full !text-xs" />
            </div>
            <div class="flex gap-2">
              <button
                (click)="closeRejectModal()"
                class="h-9 flex-1 rounded-lg border border-border bg-background text-xs font-semibold text-foreground hover:bg-accent">
                Batal
              </button>
              <button
                (click)="submitReject()"
                class="h-9 flex-1 rounded-lg bg-red-500 text-white text-xs font-bold">
                Tolak KYC
              </button>
            </div>
          </div>
        </div>
      }

      <p-confirmdialog />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KycComponent implements OnInit, OnDestroy {
  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private notification = inject(NotificationService);
  private realtime = inject(RealtimeService);
  private confirmation = inject(ConfirmationService);

  documents: KycDocument[] = [];
  filtered: KycDocument[] = [];
  statusFilter = '';
  search = '';
  previewImage: string | null = null;
  docUrls: Record<string, string> = {};
  loadingUrls = new Set<string>();
  currentPage = 1;
  pageSize = 20;

  get displayDocs() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filtered.slice(start, start + this.pageSize);
  }
  error: string | null = null;
  loading = false;
  approving = new Set<string>();
  private destroy$ = new Subject<void>();

  statusOptions = [
    { label: 'Semua', value: '' },
    { label: 'Pending', value: 'PENDING' },
    { label: 'Approved', value: 'APPROVED' },
    { label: 'Rejected', value: 'REJECTED' },
  ];

  ngOnInit() {
    this.load();
    this.realtime.subscribeKyc();
    this.realtime.kyc$.pipe(takeUntil(this.destroy$)).subscribe(() => {
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
      const d = await this.admin.getKycDocuments() as KycDocument[];
      this.documents = d;
      this.applyFilter();
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  applyFilter() {
    this.currentPage = 1;
    let result = this.documents;
    result = FilterHelper.applyStatus(result, 'status', this.statusFilter);
    result = FilterHelper.applySearch(result, this.search, ['user_username', 'user_display_name']);
    this.filtered = result;
  }

  onPageChange(event: { first?: number; rows?: number }) {
    const { page, pageSize } = PaginationHelper.onPageChange(event, this.pageSize);
    this.currentPage = page;
    this.pageSize = pageSize;
    this.cdr.markForCheck();
  }

  viewImage(url: string) {
    this.previewImage = url;
  }

  async loadDocUrl(id: string) {
    if (this.loadingUrls.has(id) || this.docUrls[id]) return;
    this.loadingUrls.add(id);
    this.cdr.markForCheck();
    try {
      const url = await this.admin.getKycDocumentUrl(id);
      if (url) this.docUrls[id] = url as string;
    } catch {
      /* silent */
    }
    this.loadingUrls.delete(id);
    this.cdr.markForCheck();
  }

  confirmApprove(k: KycDocument) {
    this.confirmation.confirm({
      message: `Setujui dokumen KYC ${k.document_type || 'ID'} milik ${k.user_username || k.user_id?.slice(0, 16)}? Pengguna akan terverifikasi.`,
      header: 'Setujui KYC',

      rejectLabel: 'Batal',
      acceptLabel: 'Setujui',
      accept: () => this.approve(k),
    });
  }

  rejectModal: { open: boolean; doc: KycDocument | null; reason: string } = { open: false, doc: null, reason: '' };

  confirmReject(k: KycDocument) {
    this.rejectModal = { open: true, doc: k, reason: 'Dokumen tidak lengkap' };
    this.cdr.markForCheck();
  }

  closeRejectModal() {
    this.rejectModal = { open: false, doc: null, reason: '' };
    this.cdr.markForCheck();
  }

  async submitReject() {
    const k = this.rejectModal.doc;
    if (!k) return;
    const reason = this.rejectModal.reason.trim() || 'Dokumen tidak lengkap';
    this.closeRejectModal();
    await this.reject(k, reason);
  }

  confirmReverify(k: KycDocument) {
    this.confirmation.confirm({
      message: `Verifikasi ulang dokumen KYC ${k.document_type || 'ID'} milik ${k.user_username || k.user_id?.slice(0, 16)}? KYC akan disetujui.`,
      header: 'Verifikasi Ulang KYC',

      rejectLabel: 'Batal',
      acceptLabel: 'Verifikasi',
      accept: () => this.approve(k),
    });
  }

  async approve(k: KycDocument) {
    if (this.approving.has(k.id)) return;
    if (!k.user_id) {
      this.notification.error('Approval failed', 'Document has no associated user.');
      return;
    }
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
    } catch (e: unknown) {
      this.notification.error('Persetujuan gagal', e instanceof Error ? e.message : 'Tidak bisa menyetujui KYC.');
    } finally {
      this.approving.delete(k.id);
      this.cdr.markForCheck();
    }
  }

  async reject(k: KycDocument, reason = 'Dokumen tidak lengkap') {
    if (this.approving.has(k.id)) return;
    this.approving.add(k.id);
    this.cdr.markForCheck();
    const admin = this.auth.getCurrentUser();
    try {
      await this.admin.updateKycStatus(k.id, 'REJECTED', reason);
      await this.admin.updateUser(k.user_id!, { kyc_status: 'REJECTED' });
      if (admin) {
        await this.admin.logAction(
          admin.username,
          'REJECT_KYC',
          'kyc_documents',
          k.id,
          'PENDING',
          'REJECTED:' + reason,
        );
      }
      this.notification.success('KYC ditolak', `Pengguna ${k.user_username || k.user_id?.slice(0, 16)} telah ditolak.`);
      await this.load();
    } catch (e: unknown) {
      this.notification.error('Penolakan gagal', e instanceof Error ? e.message : 'Tidak bisa menolak KYC.');
    } finally {
      this.approving.delete(k.id);
      this.cdr.markForCheck();
    }
  }
}
