import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { AdminService } from 'src/app/core/services/admin.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { LoadingErrorComponent } from 'src/app/shared/components/loading-error/loading-error.component';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';

@Component({
  selector: 'app-tickets',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectModule, DialogModule, PageHeaderComponent, LoadingErrorComponent, WibDatePipe],
  template: `
    <div data-page="tickets" class="space-y-6">
      <app-page-header icon="bell" title="Support Tickets" subtitle="Balas pertanyaan customer service" />
      <app-loading-error [loading]="loading" [error]="error" (retry)="load()" />

      @if (!loading && !error) {
        <div class="bg-card border-border rounded-lg page-accent-card overflow-hidden">
          <div class="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <p-select [(ngModel)]="statusFilter" (onChange)="applyFilter()"
              [options]="STATUS_OPTS" optionLabel="label" optionValue="value" styleClass="!text-sm !w-44" />
            <input [(ngModel)]="search" (ngModelChange)="applyFilter()" placeholder="Cari subjek/kategori…"
              class="bg-muted border-border text-foreground rounded-lg border px-3 py-2 text-sm outline-none" />
          </div>
          <table class="saas-table w-full text-left text-xs">
            <thead>
              <tr class="border-b border-border text-muted-foreground uppercase tracking-wider">
                <th class="px-3 py-2.5">Subjek</th><th class="px-3 py-2.5">Kategori</th>
                <th class="px-3 py-2.5">Status</th><th class="px-3 py-2.5">Update</th><th class="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              @for (tk of filtered; track tk.id) {
                <tr class="border-b border-border/40 hover:bg-muted/25"
                    [class.font-semibold]="tk.last_sender === 'USER' && tk.status !== 'CLOSED'">
                  <td class="px-3 py-2 text-foreground">
                    @if (tk.last_sender === 'USER' && tk.status !== 'CLOSED') {
                      <span class="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500"></span>
                    }
                    {{ tk.subject }}
                  </td>
                  <td class="px-3 py-2 text-muted-foreground">{{ tk.category || '-' }}</td>
                  <td class="px-3 py-2"><span class="n9-badge" [ngClass]="badgeClass(tk.status)">{{ tk.status }}</span></td>
                  <td class="px-3 py-2 text-muted-foreground">{{ tk.last_message_at | wibDate: 'short' }}</td>
                  <td class="px-3 py-2 text-right">
                    <button (click)="open(tk)" class="n9-btn n9-btn-outline">Buka</button>
                  </td>
                </tr>
              }
              @if (filtered.length === 0) {
                <tr><td colspan="5" class="px-3 py-8 text-center text-muted-foreground">Tidak ada tiket</td></tr>
              }
            </tbody>
          </table>
        </div>
      }

      <p-dialog [(visible)]="detailVisible" [modal]="true" [style]="{ width: '560px', maxWidth: '95vw' }"
        [contentStyle]="{ 'max-height': '70vh', overflow: 'auto' }" styleClass="dashboard-dialog"
        [draggable]="false" [resizable]="false" (onHide)="active = null; detailVisible = false">
        <ng-template pTemplate="header"><span class="text-sm font-bold text-foreground">{{ active?.subject }}</span></ng-template>
        <ng-template pTemplate="content">
          @if (active) {
            <div class="space-y-2">
              @for (m of messages; track m.id) {
                <div class="flex" [class.justify-end]="m.sender_type === 'ADMIN'">
                  <div class="max-w-[80%] rounded-xl px-3 py-2 text-xs"
                       [ngClass]="m.sender_type === 'ADMIN' ? 'bg-primary/15 text-foreground' : 'bg-muted text-foreground'">
                    @if (m.image_url) { <img [src]="m.image_url" class="mb-1 max-h-40 rounded-lg" /> }
                    @if (m.body) { <p class="whitespace-pre-wrap break-words">{{ m.body }}</p> }
                    <p class="mt-0.5 text-[9px] text-muted-foreground">{{ m.created_at | wibDate: 'short' }}</p>
                  </div>
                </div>
              }
            </div>
          }
        </ng-template>
        <ng-template pTemplate="footer">
          @if (active && active.status !== 'CLOSED') {
            <div class="flex w-full flex-col gap-2">
              <textarea [(ngModel)]="replyBody" rows="2" placeholder="Tulis balasan…"
                class="bg-muted border-border text-foreground w-full rounded-lg border px-3 py-2 text-sm outline-none"></textarea>
              <div class="flex justify-between gap-2">
                <button (click)="closeTicket()" class="n9-btn n9-btn-danger">Tutup Tiket</button>
                <button (click)="sendReply()" [disabled]="sending || !replyBody.trim()" class="n9-btn n9-btn-primary">
                  {{ sending ? 'Mengirim…' : 'Kirim Balasan' }}
                </button>
              </div>
            </div>
          } @else if (active) {
            <button (click)="reopen()" class="n9-btn n9-btn-warn">Buka Kembali</button>
          }
        </ng-template>
      </p-dialog>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketsComponent implements OnInit, OnDestroy {
  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private notification = inject(NotificationService);
  private poll?: ReturnType<typeof setInterval>;

  readonly STATUS_OPTS = [
    { label: 'Semua', value: 'ALL' }, { label: 'Open', value: 'OPEN' },
    { label: 'Replied', value: 'REPLIED' }, { label: 'Closed', value: 'CLOSED' },
  ];
  tickets: any[] = [];
  filtered: any[] = [];
  statusFilter = 'ALL';
  search = '';
  loading = true;
  error: string | null = null;

  detailVisible = false;
  active: any = null;
  messages: any[] = [];
  replyBody = '';
  sending = false;

  ngOnInit() {
    this.load();
    // near-live: refresh the list every 15s (silent — no spinner after first load)
    this.poll = setInterval(() => this.load(true), 15000);
  }
  ngOnDestroy() { if (this.poll) clearInterval(this.poll); }

  async load(silent = false) {
    if (!silent) this.loading = true;
    this.error = null;
    try {
      this.tickets = (await this.admin.getTickets()) || [];
      this.applyFilter();
    } catch (e: unknown) {
      if (!silent) this.error = e instanceof Error ? e.message : 'Gagal memuat tiket.';
    }
    this.loading = false; this.cdr.markForCheck();
  }

  applyFilter() {
    const q = this.search.trim().toLowerCase();
    this.filtered = this.tickets.filter((t) =>
      (this.statusFilter === 'ALL' || t.status === this.statusFilter) &&
      (!q || `${t.subject} ${t.category}`.toLowerCase().includes(q)));
    this.cdr.markForCheck();
  }

  badgeClass(s: string) {
    return s === 'CLOSED' ? 'n9-badge-neutral' : s === 'REPLIED' ? 'n9-badge-success' : 'n9-badge-warn';
  }

  async open(tk: any) {
    this.active = tk; this.detailVisible = true; this.messages = []; this.replyBody = '';
    this.cdr.markForCheck();
    this.messages = (await this.admin.getTicketMessages(tk.id)) || [];
    this.cdr.markForCheck();
  }

  async sendReply() {
    if (!this.active || !this.replyBody.trim()) return;
    this.sending = true;
    try {
      const me = this.auth.getCurrentUser();
      await this.admin.replyTicket(this.active.id, this.replyBody.trim(), null, me?.id ?? null);
      this.replyBody = '';
      this.active.status = 'REPLIED';
      this.messages = (await this.admin.getTicketMessages(this.active.id)) || [];
      await this.load(true);
      this.notification.success('Terkirim', 'Balasan dikirim.');
    } catch (e: unknown) {
      this.notification.error('Gagal', e instanceof Error ? e.message : 'Tidak bisa kirim balasan.');
    }
    this.sending = false; this.cdr.markForCheck();
  }

  async closeTicket() {
    if (!this.active) return;
    await this.admin.setTicketStatus(this.active.id, 'CLOSED');
    this.active.status = 'CLOSED'; await this.load(true); this.cdr.markForCheck();
  }
  async reopen() {
    if (!this.active) return;
    await this.admin.setTicketStatus(this.active.id, 'OPEN');
    this.active.status = 'OPEN'; await this.load(true); this.cdr.markForCheck();
  }
}
