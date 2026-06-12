import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { Subscription } from 'rxjs';
import { MenuService } from 'src/app/modules/layout/services/menu.service';
import { SidebarMenuComponent } from 'src/app/modules/layout/components/sidebar/sidebar-menu/sidebar-menu.component';
import { AdminService } from 'src/app/core/services/admin.service';
import { RealtimeService } from 'src/app/core/services/realtime.service';
import { ToastService } from 'src/app/core/services/toast.service';
import { environment } from 'src/environments/environment';

const PENDING_NOTIF_KEY = 'n9_pending_notif_seeded';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css'],
  imports: [NgClass, AngularSvgIconModule, SidebarMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent implements OnInit, OnDestroy {
  menuService = inject(MenuService);
  private admin = inject(AdminService);
  private realtime = inject(RealtimeService);
  private toast = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  private badgeTimer: ReturnType<typeof setInterval> | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private txSub: Subscription | null = null;
  clockTime = '';
  readonly buildLabel = `v${environment.appVersion} · ${environment.buildHash}`;
  readonly buildDate = environment.buildTime.slice(0, 10);

  ngOnInit(): void {
    this.refreshBadges();
    this.seedPendingNotifications();
    this.updateClock();
    this.badgeTimer = setInterval(() => this.refreshBadges(), 30_000);
    this.clockTimer = setInterval(() => this.updateClock(), 1_000);
    this.txSub = this.realtime.transactions$.subscribe(() => this.refreshBadges());
  }

  ngOnDestroy(): void {
    if (this.badgeTimer) clearInterval(this.badgeTimer);
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.txSub?.unsubscribe();
  }

  private updateClock() {
    const now = new Date();
    const wib = now.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    this.clockTime = wib;
    this.cdr.markForCheck();
  }

  private async refreshBadges() {
    try {
      const [pendingKyc, pendingBets, pendingDeposits, pendingWithdrawals] = await Promise.all([
        this.admin
          .rpc('count_kyc_by_status', { p_status: 'PENDING' })
          .then((r) => Number(r) || 0)
          .catch(() => 0),
        this.admin.count('bets', 'status=eq.PENDING', true).catch(() => 0),
        this.admin.countPending('DEPOSIT', true).catch(() => 0),
        this.admin.countPending('WITHDRAWAL', true).catch(() => 0),
      ]);
      this.menuService.updateBadges({
        '/kyc': pendingKyc,
        '/bets': pendingBets,
        '/deposits': pendingDeposits,
        '/withdrawals': pendingWithdrawals,
      });
      this.cdr.markForCheck();
    } catch {
      // Badge refresh failed — non-critical, next interval will retry
    }
  }

  /** Seed navbar bell with existing pending deposit/WD (once per browser session). */
  private async seedPendingNotifications() {
    if (sessionStorage.getItem(PENDING_NOTIF_KEY)) return;
    try {
      const [deposits, withdrawals] = await Promise.all([
        this.admin.getPendingTransactions('DEPOSIT'),
        this.admin.getPendingTransactions('WITHDRAWAL'),
      ]);
      for (const tx of deposits || []) {
        const who = tx.user?.username || tx.user?.display_name || 'User';
        this.toast.addHistoryEntry(
          'warning',
          'Deposit Pending',
          `${who}: ${Number(tx.amount).toLocaleString('id-ID')}P`,
        );
      }
      for (const tx of withdrawals || []) {
        const who = tx.user?.username || tx.user?.display_name || 'User';
        this.toast.addHistoryEntry(
          'warning',
          'Withdrawal Pending',
          `${who}: ${Number(tx.amount).toLocaleString('id-ID')}P`,
        );
      }
      if ((deposits?.length || 0) + (withdrawals?.length || 0) > 0) {
        sessionStorage.setItem(PENDING_NOTIF_KEY, '1');
      }
    } catch {
      /* non-blocking */
    }
  }

  public toggleSidebar() {
    this.menuService.toggleSidebar();
  }
}
