import { NgClass, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { SubMenuItem } from 'src/app/core/models/menu.model';
import { MenuService } from 'src/app/modules/layout/services/menu.service';

@Component({
  selector: 'app-navbar-mobile-submenu',
  standalone: true,
  templateUrl: './navbar-mobile-submenu.component.html',
  styleUrls: ['./navbar-mobile-submenu.component.css'],
  imports: [NgClass, NgTemplateOutlet, RouterLinkActive, RouterLink, AngularSvgIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarMobileSubmenuComponent implements OnInit {
  menuService = inject(MenuService);

  @Input() public submenu = <SubMenuItem>{};

  ngOnInit(): void {}

  public toggleMenu(menu: SubMenuItem) {
    this.menuService.toggleSubMenu(menu);
  }

  private collapse(items: Array<SubMenuItem>) {
    items.forEach((item) => {
      item.expanded = false;
      if (item.children) this.collapse(item.children as Array<SubMenuItem>);
    });
  }

  public closeMobileMenu() {
    this.menuService.showMobileMenu = false;
  }
}
