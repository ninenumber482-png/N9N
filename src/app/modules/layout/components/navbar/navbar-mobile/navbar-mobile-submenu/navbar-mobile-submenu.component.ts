import { NgClass, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';
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
  @Input() public submenu = <SubMenuItem>{};

  constructor(public menuService: MenuService) {}

  ngOnInit(): void {}

  public toggleMenu(menu: any) {
    this.menuService.toggleSubMenu(menu);
  }

  private collapse(items: Array<any>) {
    items.forEach((item) => {
      item.expanded = false;
      if (item.children) this.collapse(item.children);
    });
  }

  public closeMobileMenu() {
    this.menuService.showMobileMenu = false;
  }
}
