import { NgClass } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { MenuService } from '../../services/menu.service';
import { SidebarMenuComponent } from './sidebar-menu/sidebar-menu.component';
import { AdminService } from '../../../../core/services/admin.service';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css'],
  imports: [NgClass, AngularSvgIconModule, SidebarMenuComponent],
})
export class SidebarComponent implements OnInit, OnDestroy {
  private badgeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    public menuService: MenuService,
    private admin: AdminService,
  ) {}

  ngOnInit(): void {
    this.refreshBadges();
    // Dikurangi dari 30s ke 60s + pakai cache di AdminService
    this.badgeTimer = setInterval(() => this.refreshBadges(), 60_000);
  }

  ngOnDestroy(): void {
    if (this.badgeTimer) clearInterval(this.badgeTimer);
  }

  private async refreshBadges() {
    try {
      const [pendingDeposits, pendingWithdrawals, pendingKyc, pendingBets] = await Promise.all([
        this.admin.countPending('DEPOSIT').catch(() => 0),
        this.admin.countPending('WITHDRAWAL').catch(() => 0),
        this.admin.rpc('count_kyc_by_status', { p_status: 'PENDING' }).then(r => Number(r) || 0).catch(() => 0),
        this.admin.count('bets', 'status=eq.PENDING').catch(() => 0),
      ]);
      this.menuService.updateBadges({
        '/deposits': pendingDeposits,
        '/withdrawals': pendingWithdrawals,
        '/kyc': pendingKyc,
        '/bets': pendingBets,
      });
    } catch (e) {
      // Badge refresh failed — non-critical, next interval will retry
    }
  }

  public toggleSidebar() {
    this.menuService.toggleSidebar();
  }
}
