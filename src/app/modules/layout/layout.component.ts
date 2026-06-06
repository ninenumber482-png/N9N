import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Event, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Location } from '@angular/common';
import { NavbarComponent } from 'src/app/modules/layout/components/navbar/navbar.component';
import { SidebarComponent } from 'src/app/modules/layout/components/sidebar/sidebar.component';
import { ToastContainerComponent } from 'src/app/shared/components/toast-container/toast-container.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.css'],
  imports: [CommonModule, SidebarComponent, NavbarComponent, RouterOutlet, ToastContainerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutComponent implements OnInit {
  private mainContent: HTMLElement | null = null;
  clientIp = '';

  constructor(
    private router: Router,
    private readonly location: Location,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event: Event) => {
      if (event instanceof NavigationEnd) {
        if (this.mainContent) {
          this.mainContent!.scrollTop = 0;
        }
        if (this.clientIp) {
          this.updateUrlIp();
        }
      }
    });
  }

  private updateUrlIp(): void {
    const path = this.location.path().split('?')[0];
    this.location.replaceState(path, `ip=${this.clientIp}`);
  }

  async ngOnInit(): Promise<void> {
    this.mainContent = document.getElementById('main-content');
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      this.clientIp = data.ip || '';
    } catch {}

    if (this.clientIp) {
      this.updateUrlIp();
      document.title = `Number9 System D — ${this.clientIp}`;
    }

    this.cdr.markForCheck();
  }
}
