import { AngularSvgIconModule } from 'angular-svg-icon';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminRpcError } from 'src/app/core/services/admin.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { RouterModule } from '@angular/router';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';

interface BannerData {
  id: string;
  title?: string;
  link_url?: string;
  image_url: string;
  active: boolean;
  created_at: string;
}

@Component({
  selector: 'app-popup-banner',
  standalone: true,
  imports: [CommonModule, FormsModule,
    AngularSvgIconModule, RouterModule, WibDatePipe, ConfirmDialogModule],
  providers: [ConfirmationService],
  template: `
    <div data-page="popup-banner" class="space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
        <div class="page-header-icon"><svg-icon src="assets/icons/heroicons/outline/bell.svg" svgClass="h-4 w-4"></svg-icon></div>
        <h1 class="max-sm:text-lg sm:text-xl font-bold text-foreground tracking-tight">Popup Banner</h1>
      </div>
        <span class="text-[11px] text-muted-foreground">{{ banners.length }} banner</span>
      </div>

      <div class="bg-card border border-border page-accent-card rounded-lg p-5" style="border-top: 3px solid #FBBF24;">
        <div class="space-y-6 mb-6">
          <div class="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-3">
            <input
              type="text"
              [(ngModel)]="title"
              placeholder="Judul Banner (opsional)"
              class="w-full px-5 py-4 bg-background border border-border rounded-lg text-foreground text-base focus:outline-none focus:border-amber-400"
              [class.opacity-50]="submitting" />
            <input
              type="text"
              [(ngModel)]="linkUrl"
              placeholder="Link URL (opsional)"
              class="w-full px-5 py-4 bg-background border border-border rounded-lg text-foreground text-base focus:outline-none focus:border-amber-400"
              [class.opacity-50]="submitting" />
          </div>

          <div class="flex items-center gap-4">
            <label class="flex items-center gap-3 cursor-pointer">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                (change)="onFileSelected($event)"
                class="hidden"
                #fileInput
                [disabled]="submitting" />
              <span
                class="px-6 py-3 bg-amber-400 text-background text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
                [class.opacity-50]="submitting"
                (click)="fileInput.click()">
                {{ editId ? 'Ganti Gambar' : 'Pilih Gambar' }}
              </span>
            </label>
            @if (previewUrl) {
              <span class="text-xs text-muted-foreground">File terpilih</span>
            }
          </div>

          @if (previewUrl) {
            <div class="relative inline-block">
              <img [src]="previewUrl" class="max-h-48 rounded-lg border border-border object-contain" />
            </div>
          }

          @if (editId) {
            <div class="flex gap-2">
              <button
                (click)="submitBanner()"
                [disabled]="submitting || !previewUrl"
                class="px-6 py-3 bg-amber-400 text-background text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity">
                {{ submitting ? 'Menyimpan...' : 'Update Banner' }}
              </button>
              <button
                (click)="cancelEdit()"
                class="px-6 py-3 bg-zinc-700 text-white text-sm font-semibold rounded-lg hover:bg-zinc-600 transition-colors">
                Batal
              </button>
            </div>
          } @else {
            <button
              (click)="submitBanner()"
              [disabled]="submitting || !previewUrl"
              class="px-6 py-3 bg-amber-400 text-background text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity">
              {{ submitting ? 'Mengupload...' : 'Upload Banner' }}
            </button>
          }
        </div>

        @if (error) {
          <div class="text-red-400 text-sm mb-4 px-1">{{ error }}</div>
        }
        @if (success) {
          <div class="text-emerald-400 text-sm mb-4 px-1">Berhasil disimpan.</div>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-border text-muted-foreground uppercase tracking-wider text-xs bg-muted/10">
                <th class="px-4 py-3">Preview</th>
                <th class="px-4 py-3">Judul</th>
                <th class="px-4 py-3">Status</th>
                <th class="px-4 py-3">Dibuat</th>
                <th class="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              @for (b of banners; track b.id) {
                <tr class="border-b border-border text-muted-foreground hover:bg-muted/5">
                  <td class="px-4 py-2">
                    <img [src]="b.image_url" class="w-20 h-12 object-cover rounded border border-border" />
                  </td>
                  <td class="px-4 py-3">{{ b.title || '—' }}</td>
                  <td class="px-4 py-3">
                    <button
                      (click)="toggleActive(b)"
                      [disabled]="toggling === b.id"
                      class="px-3 py-1 text-xs font-semibold rounded-full transition-colors"
                      [class.bg-emerald-400/20]="b.active"
                      [class.text-emerald-400]="b.active"
                      [class.bg-zinc-700]="!b.active"
                      [class.text-zinc-400]="!b.active">
                      {{ b.active ? 'Aktif' : 'Nonaktif' }}
                    </button>
                  </td>
                  <td class="px-4 py-3 text-xs">{{ b.created_at | wibDate: 'short' }}</td>
                  <td class="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      (click)="editBanner(b)"
                      class="px-3 py-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors rounded hover:bg-amber-400/10">
                      Edit
                    </button>
                    <button
                      (click)="confirmDelete(b.id)"
                      [disabled]="deleting === b.id"
                      class="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 disabled:opacity-40 transition-colors rounded hover:bg-red-400/10 ml-1">
                      {{ deleting === b.id ? '...' : 'Hapus' }}
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5" class="px-4 py-8 text-center text-muted-foreground">Belum ada banner.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="mt-4 pt-3 border-t border-border text-xs text-muted-foreground space-y-1">
          <p>ℹ️ Banner aktif akan tampil sebagai popup di aplikasi user setelah login.</p>
          <p>ℹ️ Format: PNG, JPEG, WebP, GIF. Maks 5MB. Ukuran rekomendasi: 600x800px.</p>
        </div>
      </div>
      <p-confirmdialog />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PopupBannerComponent implements OnInit {
  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private confirmation = inject(ConfirmationService);

  banners: BannerData[] = [];
  title = '';
  linkUrl = '';
  previewUrl = '';
  editId = '';
  selectedFile: File | null = null;
  error = '';
  success = '';
  submitting = false;
  deleting = '';
  toggling = '';

  ngOnInit() {
    this.load();
  }

  async load() {
    try {
      this.banners = await this.admin.getPopupBanners();
    } catch (e) {
      this.error = e instanceof AdminRpcError ? e.message : 'Gagal memuat banner.';
    }
    this.cdr.markForCheck();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const valid = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!valid.includes(file.type)) {
      this.error = 'Format file tidak didukung. Gunakan PNG, JPEG, WebP, atau GIF.';
      this.cdr.markForCheck();
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.error = 'File terlalu besar. Maksimal 5MB.';
      this.cdr.markForCheck();
      return;
    }
    this.selectedFile = file;
    this.error = '';
    const reader = new FileReader();
    reader.onload = () => {
      this.previewUrl = reader.result as string;
      this.cdr.markForCheck();
    };
    reader.readAsDataURL(file);
  }

  async submitBanner() {
    if (!this.previewUrl) return;
    this.submitting = true;
    this.error = '';
    this.success = '';
    this.cdr.markForCheck();

    try {
      await this.admin.uploadPopupImage(this.previewUrl, this.title, this.linkUrl, this.editId || undefined);
      this.success = 'Banner berhasil disimpan.';
      this.resetForm();
      await this.load();
    } catch (e) {
      this.error = e instanceof AdminRpcError ? e.message : 'Gagal upload banner.';
    }

    this.submitting = false;
    this.cdr.markForCheck();
  }

  async toggleActive(banner: BannerData) {
    this.toggling = banner.id;
    this.error = '';
    this.cdr.markForCheck();

    try {
      const user = this.auth.getCurrentUser();
      if (!user?.username) throw new Error('Not authenticated');
      await this.admin.rpc('admin_toggle_popup_banner', {
        p_admin_id: user.username,
        p_banner_id: banner.id,
        p_active: !banner.active,
      });
      await this.load();
    } catch (e) {
      this.error = e instanceof AdminRpcError ? e.message : 'Gagal toggle status.';
    }

    this.toggling = '';
    this.cdr.markForCheck();
  }

  editBanner(banner: BannerData) {
    this.editId = banner.id;
    this.title = banner.title || '';
    this.linkUrl = banner.link_url || '';
    this.previewUrl = banner.image_url;
    this.selectedFile = null;
    this.error = '';
    this.success = '';
    this.cdr.markForCheck();
  }

  cancelEdit() {
    this.resetForm();
    this.cdr.markForCheck();
  }

  confirmDelete(id: string) {
    const banner = this.banners.find((b) => b.id === id);
    this.confirmation.confirm({
      message: `Hapus banner "${banner?.title || id.slice(0, 8)}"? Tindakan ini tidak dapat dibatalkan.`,
      header: 'Hapus Banner',
      rejectLabel: 'Batal',
      acceptLabel: 'Hapus',
      accept: () => this.deleteBanner(id),
    });
  }

  async deleteBanner(id: string) {
    this.deleting = id;
    this.error = '';
    this.success = '';
    this.cdr.markForCheck();

    try {
      const user = this.auth.getCurrentUser();
      if (!user?.username) throw new Error('Not authenticated');
      await this.admin.rpc('admin_delete_popup_banner', {
        p_admin_id: user.username,
        p_banner_id: id,
      });
      this.success = 'Banner berhasil dihapus.';
      await this.load();
    } catch (e) {
      this.error = e instanceof AdminRpcError ? e.message : 'Gagal menghapus banner.';
    }

    this.deleting = '';
    this.cdr.markForCheck();
  }

  private resetForm() {
    this.editId = '';
    this.title = '';
    this.linkUrl = '';
    this.previewUrl = '';
    this.selectedFile = null;
  }
}
