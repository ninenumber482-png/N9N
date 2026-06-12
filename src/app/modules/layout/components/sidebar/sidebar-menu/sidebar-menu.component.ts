import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { MenuItem, SubMenuItem } from 'src/app/core/models/menu.model';
import { MenuService } from 'src/app/modules/layout/services/menu.service';
import { SidebarSubmenuComponent } from 'src/app/modules/layout/components/sidebar/sidebar-submenu/sidebar-submenu.component';

@Component({
  selector: 'app-sidebar-menu',
  standalone: true,
  templateUrl: './sidebar-menu.component.html',
  styleUrls: ['./sidebar-menu.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass, AngularSvgIconModule, RouterLink, RouterLinkActive, SidebarSubmenuComponent],
})
export class SidebarMenuComponent implements OnInit {
  menuService = inject(MenuService);

  public toggleMenu(subMenu: SubMenuItem) {
    this.menuService.toggleMenu(subMenu);
  }

  public toggleGroup(menu: MenuItem) {
    this.menuService.toggleGroup(menu);
  }

  ngOnInit(): void {}
}
