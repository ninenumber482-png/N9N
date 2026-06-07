import { Component, OnInit, inject } from '@angular/core';
import { MenuService } from 'src/app/modules/layout/services/menu.service';
import { NavbarMobileMenuComponent } from 'src/app/modules/layout/components/navbar/navbar-mobile/navbar-mobile-menu/navbar-mobile-menu.component';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { NgClass } from '@angular/common';

@Component({
  selector: 'app-navbar-mobile',
  templateUrl: './navbar-mobile.component.html',
  styleUrls: ['./navbar-mobile.component.css'],
  imports: [NgClass, AngularSvgIconModule, NavbarMobileMenuComponent],
})
export class NavbarMobileComponent implements OnInit {
  menuService = inject(MenuService);

  ngOnInit(): void {}

  public toggleMobileMenu(): void {
    this.menuService.showMobileMenu = false;
  }
}
