import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminRpcError } from 'src/app/core/services/admin.service';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';

interface WhitelistEntry {
  id: string;
  ip_address: string;
  label?: string;
  created_at: string;
}

@Component({
  selector: 'app-ip-whitelist',
  standalone: true,
  imports: [CommonModule, FormsModule, WibDatePipe, PageHeaderComponent],
  template: `
    <div data-page="ip-whitelist" class="space-y-6">
      <app-page-header icon="shield-check" title="IP Whitelist Gateway">
        <span class="text-[11px] text-muted-foreground">{{ entries.length }} IP terdaftar</span>
      </app-page-header>

      <div class="bg-card border border-border page-accent-card rounded-lg p-5" style="border-top: 3px solid #94A3B8;">
        <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 mb-4">
          <input
            type="text"
            id="newIp"
            name="newIp"
            [(ngModel)]="newIp"
            placeholder="IP Address (cth: 1.2.3.4)"
            class="w-full px-5 py-4 bg-background border border-border rounded-lg text-foreground text-base focus:outline-none focus:border-amber-400"
            [class.opacity-50]="submitting" />
          <input
            type="text"
            id="newLabel"
            name="newLabel"
            [(ngModel)]="newLabel"
            placeholder="Label (opsional)"
            class="w-full sm:w-48 px-5 py-4 bg-background border border-border rounded-lg text-foreground text-base focus:outline-none focus:border-amber-400"
            [class.opacity-50]="submitting" />
          <button
            (click)="addIp()"
            [disabled]="submitting || !newIp.trim()"
            class="w-full sm:w-auto px-8 py-4 bg-amber-400 text-background text-base font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity whitespace-nowrap">
            Tambah
          </button>
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
                <th class="px-4 py-3">IP Address</th>
                <th class="px-4 py-3">Label</th>
                <th class="px-4 py-3">Ditambahkan</th>
                <th class="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              @for (e of entries; track e.id) {
                <tr class="border-b border-border text-muted-foreground hover:bg-muted/5">
                  <td class="px-4 py-3 font-mono text-foreground">{{ e.ip_address }}</td>
                  <td class="px-4 py-3">{{ e.label || '—' }}</td>
                  <td class="px-4 py-3 text-xs">{{ e.created_at | wibDate: 'short' }}</td>
                  <td class="px-4 py-3 text-right">
                    <button
                      (click)="removeIp(e.id)"
                      [disabled]="deleting === e.id"
                      class="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 disabled:opacity-40 transition-colors rounded hover:bg-red-400/10">
                      {{ deleting === e.id ? '...' : 'Hapus' }}
                    </button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="4" class="px-4 py-8 text-center text-muted-foreground">
                    Belum ada IP terdaftar. Whitelist tidak aktif.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="mt-4 pt-3 border-t border-border text-xs text-muted-foreground space-y-1">
          <p>ℹ️ IP whitelist aktif jika minimal 1 IP terdaftar. Cache gateway diperbarui setiap 60 detik.</p>
          <p>
            ℹ️ IP yang tidak terdaftar akan mendapat response
            <code class="text-foreground">403 Akses ditolak</code> dari gateway.
          </p>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IpWhitelistComponent implements OnInit {
  private admin = inject(AdminService);
  private cdr = inject(ChangeDetectorRef);

  entries: WhitelistEntry[] = [];
  newIp = '';
  newLabel = '';
  error = '';
  success = '';
  submitting = false;
  deleting = '';

  ngOnInit() {
    this.load();
  }

  async load() {
    try {
      this.entries = await this.admin.rpc('get_allowed_ips', {}) as WhitelistEntry[];
    } catch (e) {
      this.error = e instanceof AdminRpcError ? e.message : 'Gagal memuat daftar IP.';
    }
    this.cdr.markForCheck();
  }

  async addIp() {
    const ip = this.newIp.trim();
    if (!ip) return;
    this.submitting = true;
    this.error = '';
    this.success = '';
    this.cdr.markForCheck();

    try {
      await this.admin.rpc('add_allowed_ip', { p_ip: ip, p_label: this.newLabel.trim() });
      this.newIp = '';
      this.newLabel = '';
      this.success = 'IP berhasil ditambahkan.';
      await this.load();
    } catch (e) {
      this.error = e instanceof AdminRpcError ? e.message : 'Gagal menambah IP.';
    }

    this.submitting = false;
    this.cdr.markForCheck();
  }

  async removeIp(id: string) {
    this.deleting = id;
    this.error = '';
    this.cdr.markForCheck();

    try {
      await this.admin.rpc('remove_allowed_ip', { p_id: id });
      this.success = 'IP berhasil dihapus.';
      await this.load();
    } catch (e) {
      this.error = e instanceof AdminRpcError ? e.message : 'Gagal menghapus IP.';
    }

    this.deleting = '';
    this.cdr.markForCheck();
  }
}
