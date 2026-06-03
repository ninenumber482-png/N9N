import { ChangeDetectorRef, Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../../core/services/admin.service';
import { WibDatePipe } from '../../../../shared/pipes/wib-date.pipe';

@Component({
  selector: 'app-session-monitor',
  standalone: true,
  imports: [CommonModule, FormsModule, WibDatePipe],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="max-sm:text-lg sm:text-2xl font-extrabold text-foreground">Session Monitor</h1>
          <p class="text-muted-foreground mt-1 max-sm:text-[10px] sm:text-sm">Active user sessions and login activity</p>
        </div>
        <div class="flex gap-2">
          <button (click)="load()" class="bg-primary/10 text-primary rounded-lg max-sm:px-2 max-sm:py-1.5 sm:px-3 sm:py-2 max-sm:text-[9px] sm:text-xs font-bold" [disabled]="loading">Refresh</button>
        </div>
      </div>

      @if (loading) {
        <div class="bg-card border-border animate-pulse rounded-xl border p-5 shadow-sm">
          <div class="space-y-3">@for (_ of [1,2,3,4,5]; track _) { <div class="h-10 rounded-lg bg-zinc-700/20"></div> }</div>
        </div>
      } @else if (error) {
        <div class="bg-card border-border rounded-xl border p-5 shadow-sm">
          <div class="flex flex-col items-center gap-3 py-6">
            <p class="text-red-400 text-sm font-semibold">{{ error }}</p>
            <button (click)="load()" class="bg-primary/10 text-primary rounded-lg px-4 py-2 text-xs font-bold">Retry</button>
          </div>
        </div>
      } @else {
      <div class="bg-card border-border rounded-xl border shadow-sm overflow-x-auto">
        <table class="w-full text-left max-sm:text-[9px] sm:text-xs">
          <thead><tr class="border-border text-muted-foreground border-b text-[10px] font-semibold uppercase tracking-wider">
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">User</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">IP Address</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">Browser</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 max-sm:hidden">Device</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Last Activity</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Expires</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">Status</th>
            <th class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3"></th>
          </tr></thead>
          <tbody>
            @for (s of sessions; track s.id) {
              <tr class="border-border hover:bg-muted/30 border-b">
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-semibold text-foreground">{{ s.user_id?.slice(0,8) }}</td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 font-mono text-muted-foreground max-sm:hidden">{{ s.ip_address || '-' }}</td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground max-sm:hidden">{{ s.browser_info || '-' }}</td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground max-sm:hidden">{{ s.device_info?.model || s.user_agent?.slice(0,30) || '-' }}</td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground whitespace-nowrap">{{ s.last_activity | wibDate:'short' }}</td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3 text-muted-foreground whitespace-nowrap">{{ s.expires_at | wibDate:'short' }}</td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                  @if (s.logged_out_at) {
                    <span class="rounded px-2 py-0.5 text-[10px] font-bold bg-zinc-400/10 text-zinc-400">Ended</span>
                  } @else if (isExpired(s.expires_at)) {
                    <span class="rounded px-2 py-0.5 text-[10px] font-bold bg-amber-400/10 text-amber-400">Expired</span>
                  } @else {
                    <span class="rounded px-2 py-0.5 text-[10px] font-bold bg-emerald-400/10 text-emerald-400">Active</span>
                  }
                </td>
                <td class="max-sm:px-1.5 max-sm:py-1.5 sm:px-4 sm:py-3">
                  @if (!s.logged_out_at && !isExpired(s.expires_at)) {
                    <button (click)="killSession(s.id)" [disabled]="killing === s.id" class="text-[10px] font-bold text-red-400 hover:text-red-300 transition">{{ killing === s.id ? '...' : 'Kill' }}</button>
                  }
                </td>
              </tr>
            } @empty { <tr><td colspan="8" class="text-center py-12 text-muted-foreground">No sessions</td></tr> }
          </tbody>
        </table>
      </div>
      }
    </div>
  `,
})
export class SessionMonitorComponent implements OnInit, OnDestroy {
  sessions: any[] = [];
  loading = true;
  error: string | null = null;
  killing: string | null = null;
  private interval: any;

  constructor(private admin: AdminService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.load();
    // Dikurangi dari 10s ke 30s — session data tidak berubah secepat itu
    this.interval = setInterval(() => this.load(), 30000);
  }

  ngOnDestroy() {
    if (this.interval) clearInterval(this.interval);
  }

  async load() {
    if (!this.loading && this.sessions.length === 0) this.loading = true;
    this.error = null;
    try {
      this.sessions = await this.admin.getUserSessions(100);
    } catch (e: any) {
      this.error = e?.message || 'Could not load sessions';
    }
    this.loading = false;
    this.cdr.markForCheck();
  }

  isExpired(expiresAt: string) {
    return new Date(expiresAt).getTime() < Date.now();
  }

  async killSession(id: string) {
    this.killing = id;
    try {
      await this.admin.endUserSession(id);
      await this.load();
    } catch (e: any) {
      this.error = e?.message || 'Failed to end session';
    }
    this.killing = null;
    this.cdr.markForCheck();
  }
}
