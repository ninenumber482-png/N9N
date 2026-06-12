import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { MenuService } from 'src/app/modules/layout/services/menu.service';
import { SidebarMenuComponent } from 'src/app/modules/layout/components/sidebar/sidebar-menu/sidebar-menu.component';
import { AdminService } from 'src/app/core/services/admin.service';

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
  private cdr = inject(ChangeDetectorRef);

  private badgeTimer: ReturnType<typeof setInterval> | null = null;
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  clockTime = '';

  ngOnInit(): void {
    this.refreshBadges();
    this.updateClock();
    this.badgeTimer = setInterval(() => this.refreshBadges(), 60_000);
    this.clockTimer = setInterval(() => this.updateClock(), 1_000);
  }

  ngOnDestroy(): void {
    if (this.badgeTimer) clearInterval(this.badgeTimer);
    if (this.clockTimer) clearInterval(this.clockTimer);
  }

  private updateClock() {
    const now = new Date();
    const wib = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.clockTime = wib;
    this.cdr.markForCheck();
  }

  private async refreshBadges() {
    try {
      const [pendingKyc, pendingBets, pendingDeposits, pendingWithdrawals] = await Promise.all([
        this.admin.rpc('count_kyc_by_status', { p_status: 'PENDING' }).then((r) => Number(r) || 0).catch(() => 0),
        this.admin.count('bets', 'status=eq.PENDING').catch(() => 0),
        this.admin.count('transactions', 'type=eq.DEPOSIT,status=eq.PENDING').catch(() => 0),
        this.admin.count('transactions', 'type=eq.WITHDRAWAL,status=eq.PENDING').catch(() => 0),
      ]);
      this.menuService.updateBadges({
        '/kyc': pendingKyc,
        '/bets': pendingBets,
        '/deposits': pendingDeposits,
        '/withdrawals': pendingWithdrawals,
      });
      this.cdr.markForCheck();
    } catch (e) {
      // Badge refresh failed — non-critical, next interval will retry
    }
  }

  public toggleSidebar() {
    this.menuService.toggleSidebar();
  }
}
