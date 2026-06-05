import { ChangeDetectionStrategy, Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { MenuService } from 'src/app/services/menu.service';
import { NavbarMenuComponent } from 'src/app/modules/layout/components/navbar/navbar-menu/navbar-menu.component';
import { NavbarMobileComponent } from 'src/app/modules/layout/components/navbar/navbar-mobile/navbar-mobilecomponent';
import { ThemeService } from 'src/app/core/services/theme.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { ToastService, ToastMessage } from 'src/app/core/services/toast.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css'],
  imports: [AngularSvgIconModule, NavbarMenuComponent, NavbarMobileComponent, CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarComponent implements OnInit, OnDestroy {
  isDarkMode = false;
  user$ = this.authService.user$;
  currentTime = '';
  unreadCount = 0;
  showNotifPanel = false;
  isMuted = false;
  notifications: ToastMessage[] = [];
  private clockTimer: ReturnType<typeof setInterval> | null = null;
  private unreadSub: any;
  private historySub: any;

  constructor(
    private menuService: MenuService,
    private themeService: ThemeService,
    public authService: AuthService,
    private toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.isDarkMode = this.themeService.isDarkMode();
    this.updateClock();
    this.clockTimer = setInterval(() => this.updateClock(), 1000);
    this.unreadSub = this.toastService.unread$.subscribe(count => {
      this.unreadCount = count;
    });
    this.historySub = this.toastService.history$.subscribe(list => {
      this.notifications = list;
    });
  }

  ngOnDestroy(): void {
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.unreadSub?.unsubscribe();
    this.historySub?.unsubscribe();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.notif-wrapper')) {
      this.showNotifPanel = false;
    }
  }

  private updateClock(): void {
    this.currentTime = new Date().toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  public toggleMobileMenu(): void {
    this.menuService.showMobileMenu = true;
  }

  public toggleTheme(): void {
    this.themeService.toggleTheme();
    this.isDarkMode = this.themeService.isDarkMode();
  }

  public logout(): void {
    this.authService.logout();
  }

  public clearNotifications(): void {
    this.toastService.clearUnread();
    this.showNotifPanel = false;
  }

  public clearAllNotifications(): void {
    this.toastService.clearHistory();
    this.showNotifPanel = false;
  }

  public toggleMute(): void {
    this.toastService.toggleMute();
    this.isMuted = this.toastService.muted;
  }
}
