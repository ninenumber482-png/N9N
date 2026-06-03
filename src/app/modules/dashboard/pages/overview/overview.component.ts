import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../../../core/services/admin.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { WibDatePipe } from '../../../../shared/pipes/wib-date.pipe';

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, AngularSvgIconModule, RouterLink, WibDatePipe],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="max-sm:text-lg sm:text-2xl font-extrabold text-foreground">Dashboard Overview</h1>
          <p class="text-muted-foreground mt-1 text-sm">Real-time platform statistics from Supabase</p>
        </div>
        <div class="flex gap-2">
          <button (click)="testToast('success')" class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-xs font-bold hover:bg-emerald-500/20 transition-colors">Test Success</button>
          <button (click)="testToast('error')" class="bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg px-3 py-1.5 text-xs font-bold hover:bg-red-500/20 transition-colors">Test Error</button>
          <button (click)="testToast('info')" class="bg-sky-500/10 text-sky-400 border border-sky-500/30 rounded-lg px-3 py-1.5 text-xs font-bold hover:bg-sky-500/20 transition-colors">Test Info</button>
        </div>
      </div>

      @if (loading) {
        <div class="bg-card border-border animate-pulse rounded-xl border p-5 shadow-sm">
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            @for (_ of [1,2,3,4,5,6]; track _) {
              <div class="h-24 rounded-lg bg-zinc-700/20"></div>
            }
          </div>
        </div>
      } @else if (error) {
        <div class="bg-card border-border rounded-xl border p-5 shadow-sm">
          <div class="flex flex-col items-center gap-3 py-6">
            <p class="text-red-400 text-sm font-semibold">{{ error }}</p>
            <button (click)="load()" class="bg-primary/10 text-primary rounded-lg px-4 py-2 text-xs font-bold">Retry</button>
          </div>
        </div>
      } @else {

      <!-- ─── STAT CARDS ─── -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <a routerLink="/users" class="bg-card border-border hover:border-emerald-500/30 rounded-xl border p-4 shadow-sm transition-all hover:shadow-md group">
          <div class="flex items-center justify-between">
            <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Total Users</p>
            <div class="rounded-lg bg-emerald-400/10 p-2 group-hover:bg-emerald-400/20 transition-colors">
              <svg-icon src="assets/icons/heroicons/outline/users.svg" svgClass="h-4 w-4 text-emerald-400"></svg-icon>
            </div>
          </div>
          <p class="mt-2 text-2xl font-black text-foreground">{{ stats.totalUsers }}</p>
          <div class="mt-1 flex items-center gap-1">
            <span class="text-[10px] font-semibold text-emerald-400">● Registered</span>
          </div>
        </a>

        <a routerLink="/transactions" class="bg-card border-border hover:border-sky-500/30 rounded-xl border p-4 shadow-sm transition-all hover:shadow-md group">
          <div class="flex items-center justify-between">
            <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Transactions</p>
            <div class="rounded-lg bg-sky-400/10 p-2 group-hover:bg-sky-400/20 transition-colors">
              <svg-icon src="assets/icons/heroicons/outline/currency-dollar.svg" svgClass="h-4 w-4 text-sky-400"></svg-icon>
            </div>
          </div>
          <p class="mt-2 text-2xl font-black text-foreground">{{ stats.totalTransactions }}</p>
          <div class="mt-1 flex items-center gap-1">
            <span class="text-[10px] font-semibold text-sky-400">● Total processed</span>
          </div>
        </a>

        <a routerLink="/bets" class="bg-card border-border hover:border-violet-500/30 rounded-xl border p-4 shadow-sm transition-all hover:shadow-md group">
          <div class="flex items-center justify-between">
            <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Pending Bets</p>
            <div class="rounded-lg bg-violet-400/10 p-2 group-hover:bg-violet-400/20 transition-colors">
              <svg-icon src="assets/icons/heroicons/outline/trending-up.svg" svgClass="h-4 w-4 text-violet-400"></svg-icon>
            </div>
          </div>
          <p class="mt-2 text-2xl font-black text-foreground">{{ stats.pendingBets }}</p>
          <div class="mt-1 flex items-center gap-1">
            <span [class]="'text-[10px] font-semibold ' + (stats.pendingBets > 0 ? 'text-amber-400' : 'text-emerald-400')">
              {{ stats.pendingBets > 0 ? '● Needs attention' : '● All settled' }}
            </span>
          </div>
        </a>

        <a routerLink="/kyc" class="bg-card border-border hover:border-amber-500/30 rounded-xl border p-4 shadow-sm transition-all hover:shadow-md group">
          <div class="flex items-center justify-between">
            <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Pending KYC</p>
            <div class="rounded-lg bg-amber-400/10 p-2 group-hover:bg-amber-400/20 transition-colors">
              <svg-icon src="assets/icons/heroicons/outline/identification.svg" svgClass="h-4 w-4 text-amber-400"></svg-icon>
            </div>
          </div>
          <p class="mt-2 text-2xl font-black text-foreground">{{ stats.pendingKyc }}</p>
          <div class="mt-1 flex items-center gap-1">
            <span [class]="'text-[10px] font-semibold ' + (stats.pendingKyc > 0 ? 'text-amber-400' : 'text-emerald-400')">
              {{ stats.pendingKyc > 0 ? '● Requires review' : '● All verified' }}
            </span>
          </div>
        </a>

        <a routerLink="/deposits" class="bg-card border-border hover:border-emerald-500/30 rounded-xl border p-4 shadow-sm transition-all hover:shadow-md group">
          <div class="flex items-center justify-between">
            <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Pending Deposits</p>
            <div class="rounded-lg bg-emerald-400/10 p-2 group-hover:bg-emerald-400/20 transition-colors">
              <svg-icon src="assets/icons/heroicons/outline/arrow-sm-down.svg" svgClass="h-4 w-4 text-emerald-400"></svg-icon>
            </div>
          </div>
          <p class="mt-2 text-2xl font-black text-foreground">{{ pendingDeposits }}</p>
          <div class="mt-1 flex items-center gap-1">
            <span [class]="'text-[10px] font-semibold ' + (pendingDeposits > 0 ? 'text-amber-400' : 'text-emerald-400')">
              {{ pendingDeposits > 0 ? '● Awaiting approval' : '● All cleared' }}
            </span>
          </div>
        </a>

        <a routerLink="/withdrawals" class="bg-card border-border hover:border-rose-500/30 rounded-xl border p-4 shadow-sm transition-all hover:shadow-md group">
          <div class="flex items-center justify-between">
            <p class="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Pending WD</p>
            <div class="rounded-lg bg-rose-400/10 p-2 group-hover:bg-rose-400/20 transition-colors">
              <svg-icon src="assets/icons/heroicons/outline/arrow-sm-up.svg" svgClass="h-4 w-4 text-rose-400"></svg-icon>
            </div>
          </div>
          <p class="mt-2 text-2xl font-black text-foreground">{{ pendingWithdrawals }}</p>
          <div class="mt-1 flex items-center gap-1">
            <span [class]="'text-[10px] font-semibold ' + (pendingWithdrawals > 0 ? 'text-rose-400' : 'text-emerald-400')">
              {{ pendingWithdrawals > 0 ? '● Requires payment' : '● All processed' }}
            </span>
          </div>
        </a>
      </div>

      <!-- ─── BOTTOM ROW ─── -->
      <div class="grid gap-6 lg:grid-cols-3">
        <!-- Quick Actions -->
        <div class="bg-card border-border rounded-xl border p-5 shadow-sm">
          <h3 class="mb-4 text-sm font-bold text-foreground flex items-center gap-2">
            <svg-icon src="assets/icons/heroicons/outline/lightning-bolt.svg" svgClass="h-4 w-4 text-primary"></svg-icon>
            Quick Actions
          </h3>
          <div class="grid grid-cols-2 gap-2">
            <a routerLink="/users" class="border-border hover:bg-emerald-500/5 hover:border-emerald-500/30 flex items-center gap-2.5 rounded-lg border p-3 text-xs font-semibold text-foreground transition-colors">
              <svg-icon src="assets/icons/heroicons/outline/users.svg" svgClass="h-4 w-4 text-emerald-400 shrink-0"></svg-icon>
              <span>Users</span>
            </a>
            <a routerLink="/transactions" class="border-border hover:bg-sky-500/5 hover:border-sky-500/30 flex items-center gap-2.5 rounded-lg border p-3 text-xs font-semibold text-foreground transition-colors">
              <svg-icon src="assets/icons/heroicons/outline/currency-dollar.svg" svgClass="h-4 w-4 text-sky-400 shrink-0"></svg-icon>
              <span>Transactions</span>
            </a>
            <a routerLink="/3dking" class="border-border hover:bg-violet-500/5 hover:border-violet-500/30 flex items-center gap-2.5 rounded-lg border p-3 text-xs font-semibold text-foreground transition-colors">
              <svg-icon src="assets/icons/heroicons/outline/trending-up.svg" svgClass="h-4 w-4 text-violet-400 shrink-0"></svg-icon>
              <span>3D King</span>
            </a>
            <a routerLink="/kyc" class="border-border hover:bg-amber-500/5 hover:border-amber-500/30 flex items-center gap-2.5 rounded-lg border p-3 text-xs font-semibold text-foreground transition-colors">
              <svg-icon src="assets/icons/heroicons/outline/identification.svg" svgClass="h-4 w-4 text-amber-400 shrink-0"></svg-icon>
              <span>KYC</span>
            </a>
            <a routerLink="/deposits" class="border-border hover:bg-emerald-500/5 hover:border-emerald-500/30 flex items-center gap-2.5 rounded-lg border p-3 text-xs font-semibold text-foreground transition-colors">
              <svg-icon src="assets/icons/heroicons/outline/arrow-sm-down.svg" svgClass="h-4 w-4 text-emerald-400 shrink-0"></svg-icon>
              <span>Deposits</span>
            </a>
            <a routerLink="/withdrawals" class="border-border hover:bg-rose-500/5 hover:border-rose-500/30 flex items-center gap-2.5 rounded-lg border p-3 text-xs font-semibold text-foreground transition-colors">
              <svg-icon src="assets/icons/heroicons/outline/arrow-sm-up.svg" svgClass="h-4 w-4 text-rose-400 shrink-0"></svg-icon>
              <span>Withdrawals</span>
            </a>
            <a routerLink="/cs-contact" class="border-border hover:bg-emerald-500/5 hover:border-emerald-500/30 flex items-center gap-2.5 rounded-lg border p-3 text-xs font-semibold text-foreground transition-colors">
              <svg-icon src="assets/icons/heroicons/outline/phone.svg" svgClass="h-4 w-4 text-emerald-400 shrink-0"></svg-icon>
              <span>CS Contact</span>
            </a>
            <a routerLink="/referrals" class="border-border hover:bg-indigo-500/5 hover:border-indigo-500/30 flex items-center gap-2.5 rounded-lg border p-3 text-xs font-semibold text-foreground transition-colors">
              <svg-icon src="assets/icons/heroicons/outline/gift.svg" svgClass="h-4 w-4 text-indigo-400 shrink-0"></svg-icon>
              <span>Referrals</span>
            </a>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="bg-card border-border rounded-xl border p-5 shadow-sm">
          <h3 class="mb-4 text-sm font-bold text-foreground flex items-center gap-2">
            <svg-icon src="assets/icons/heroicons/outline/cursor-click.svg" svgClass="h-4 w-4 text-primary"></svg-icon>
            Recent Activity
          </h3>
          <div class="space-y-2">
            @for (log of recentLogs; track log.id) {
              <div class="border-border flex items-start gap-3 border-b pb-2 last:border-0 last:pb-0">
                <div class="bg-primary/10 mt-0.5 rounded-lg p-1.5">
                  <svg-icon src="assets/icons/heroicons/outline/cursor-click.svg" svgClass="h-3 w-3 text-primary"></svg-icon>
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-xs font-semibold text-foreground">{{ log.action }}</p>
                  <p class="text-muted-foreground truncate text-[10px]">{{ log.resource_type }} {{ log.resource_id?.slice(0,8) }}</p>
                  <p class="text-muted-foreground mt-0.5 text-[9px]">{{ log.created_at | wibDate:'short' }}</p>
                </div>
              </div>
            } @empty {
              <p class="text-muted-foreground py-6 text-center text-sm">No recent activity</p>
            }
          </div>
        </div>

        <!-- CS Contact Status -->
        <div class="bg-card border-border rounded-xl border p-5 shadow-sm">
          <h3 class="mb-4 text-sm font-bold text-foreground flex items-center gap-2">
            <svg-icon src="assets/icons/heroicons/outline/phone.svg" svgClass="h-4 w-4 text-emerald-400"></svg-icon>
            CS Contact
          </h3>
          @if (csLoading) {
            <div class="animate-pulse space-y-3">
              <div class="h-4 rounded bg-zinc-700/20 w-3/4"></div>
              <div class="h-4 rounded bg-zinc-700/20 w-1/2"></div>
            </div>
          } @else {
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs text-muted-foreground">Status</span>
                <span [class]="'text-xs font-bold ' + (csActive ? 'text-emerald-400' : 'text-zinc-500')">
                  {{ csActive ? 'ACTIVE' : 'INACTIVE' }}
                </span>
              </div>
              @if (csActive && csWaNumber) {
                <div class="flex items-center justify-between">
                  <span class="text-xs text-muted-foreground">WhatsApp</span>
                  <a [href]="'https://wa.me/' + csWaNumber" target="_blank" class="text-xs font-bold text-emerald-400 hover:underline">{{ csWaNumber }}</a>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-xs text-muted-foreground">Display Name</span>
                  <span class="text-xs font-semibold text-foreground">{{ csDisplayName }}</span>
                </div>
              } @else {
                <p class="text-xs text-muted-foreground">CS widget is not configured or inactive.</p>
              }
              <a routerLink="/cs-contact" class="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors">
                <svg-icon src="assets/icons/heroicons/outline/settings.svg" svgClass="h-3.5 w-3.5"></svg-icon>
                Manage CS Settings →
              </a>
            </div>
          }
        </div>
      </div>
      }
    </div>
  `,
})
export class OverviewComponent implements OnInit {
  stats = { totalUsers: 0, totalTransactions: 0, pendingBets: 0, pendingKyc: 0 };
  pendingDeposits = 0;
  pendingWithdrawals = 0;
  recentLogs: any[] = [];
  loading = true;
  error: string | null = null;

  csLoading = true;
  csActive = false;
  csWaNumber = '';
  csDisplayName = '';

  constructor(private admin: AdminService, private cdr: ChangeDetectorRef, private notification: NotificationService) {}

  ngOnInit() { this.load(); this.loadCsConfig(); }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      const [s, l, pd, pw] = await Promise.all([
        this.admin.getDashboardStats(),
        this.admin.getAuditLogs(5),
        this.admin.countPending('DEPOSIT'),
        this.admin.countPending('WITHDRAWAL'),
      ]);
      this.stats = s;
      this.recentLogs = l;
      this.pendingDeposits = pd;
      this.pendingWithdrawals = pw;
    } catch (e: any) {
      this.error = e?.message || 'Could not load overview';
    }
    this.loading = false;
    this.cdr.markForCheck();
  }

  async loadCsConfig() {
    this.csLoading = true;
    try {
      const configs = await this.admin.getConfigs();
      const map: Record<string, string> = {};
      for (const c of configs) map[c.key] = c.value;
      this.csActive = map['cs_active'] === 'true';
      this.csWaNumber = map['cs_wa_number'] || '';
      this.csDisplayName = map['cs_display_name'] || 'Customer Service';
    } catch {}
    this.csLoading = false;
    this.cdr.markForCheck();
  }

  testToast(type: 'success' | 'error' | 'info') {
    switch (type) {
      case 'success':
        this.notification.success('Test Success', 'Notifikasi badge berhasil muncul!');
        break;
      case 'error':
        this.notification.error('Test Error', 'Notifikasi error berhasil muncul!');
        break;
      case 'info':
        this.notification.info('Test Info', 'Notifikasi info berhasil muncul!');
        break;
    }
  }
}
