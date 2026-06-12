import { Injectable, OnDestroy, signal, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { Menu } from 'src/app/core/constants/menu';
import { MenuItem, SubMenuItem } from 'src/app/core/models/menu.model';

@Injectable({
  providedIn: 'root',
})
export class MenuService implements OnDestroy {
  private router = inject(Router);

  private _showSidebar = signal(true);
  private _showMobileMenu = signal(false);
  private _pagesMenu = signal<MenuItem[]>([]);
  private _subscription = new Subscription();

  constructor() {
    /** Set dynamic menu — Finance & Marketplace always expanded */
    this._pagesMenu.set(
      Menu.pages.map((m) => ({
        ...m,
        expanded: m.collapsible === false ? true : (m.expanded ?? false),
      })),
    );

    const sub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.syncActiveRoute();
      }
    });
    this._subscription.add(sub);
    this.syncActiveRoute();
  }

  get showSideBar() {
    return this._showSidebar();
  }
  get showMobileMenu() {
    return this._showMobileMenu();
  }
  get pagesMenu() {
    return this._pagesMenu();
  }

  set showSideBar(value: boolean) {
    this._showSidebar.set(value);
  }
  set showMobileMenu(value: boolean) {
    this._showMobileMenu.set(value);
  }

  public toggleSidebar() {
    this._showSidebar.set(!this._showSidebar());
  }

  public toggleMenu(menu: SubMenuItem) {
    if (!menu.children?.length) return;
    this.showSideBar = true;

    /** collapse all submenus except the selected one. */
    const updatedMenu = this._pagesMenu().map((menuGroup) => {
      return {
        ...menuGroup,
        items: menuGroup.items.map((item) => {
          return {
            ...item,
            expanded: item === menu ? !item.expanded : false,
          };
        }),
      };
    });

    this._pagesMenu.set(updatedMenu);
  }

  public toggleGroup(group: MenuItem) {
    if (group.collapsible === false) return;
    this.showSideBar = true;
    const updatedMenu = this._pagesMenu().map((menuGroup) => {
      if (menuGroup === group) {
        return { ...menuGroup, expanded: !menuGroup.expanded };
      }
      return menuGroup;
    });
    this._pagesMenu.set(updatedMenu);
  }

  public toggleSubMenu(submenu: SubMenuItem) {
    submenu.expanded = !submenu.expanded;
  }

  private expandItems(items: SubMenuItem[]): SubMenuItem[] {
    return items.map((item) => {
      const active = !!item.route && this.isActive(item.route);
      const children = item.children ? this.expandItems(item.children) : undefined;
      const childActive = children?.some((c) => c.active || c.expanded) ?? false;
      return {
        ...item,
        active,
        expanded: item.children?.length ? active || childActive || item.expanded : false,
        children,
      };
    });
  }

  private syncActiveRoute(): void {
    this._pagesMenu.update((menus) =>
      menus.map((menu) => {
        let activeGroup = false;
        const items = this.expandItems(menu.items);
        for (const subMenu of items) {
          if (subMenu.active) activeGroup = true;
        }
        return {
          ...menu,
          items,
          active: activeGroup,
          expanded: activeGroup || menu.collapsible === false ? true : menu.expanded,
        };
      }),
    );
  }

  public updateBadges(badges: Record<string, number>) {
    this._pagesMenu.update((menus) =>
      menus.map((group) => ({
        ...group,
        items: group.items.map((item) => ({
          ...item,
          badgeCount: item.route ? (badges[item.route] ?? item.badgeCount) : item.badgeCount,
        })),
      })),
    );
  }

  public isActive(instruction: string | string[]): boolean {
    return this.router.isActive(this.router.createUrlTree([instruction]), {
      paths: 'subset',
      queryParams: 'subset',
      fragment: 'ignored',
      matrixParams: 'ignored',
    });
  }

  ngOnDestroy(): void {
    this._subscription.unsubscribe();
  }
}
