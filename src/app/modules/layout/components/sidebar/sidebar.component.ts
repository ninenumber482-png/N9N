import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { MenuService } from 'src/app/services/menu.service';
import { SidebarMenuComponent } from 'src/app/modules/layout/components/sidebar/sidebar-menu/sidebar-menu.component';
import { AdminService } from 'src/app/core/services/admin.service';

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css'],
  imports: [NgClass, AngularSvgIconModule, SidebarMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
      const [pendingKyc, pendingBets] = await Promise.all([
        this.admin.rpc('count_kyc_by_status', { p_status: 'PENDING' }).then(r => Number(r) || 0).catch(() => 0),
        this.admin.count('bets', 'status=eq.PENDING').catch(() => 0),
      ]);
      this.menuService.updateBadges({
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
