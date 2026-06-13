import { Injectable, OnDestroy, signal, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { Menu } from 'src/app/core/constants/menu';
import { MenuItem, SubMenuItem } from 'src/app/core/models/menu.model';
import { AuthService } from 'src/app/core/services/auth.service';
import { isPageAllowed } from 'src/app/core/constants/admin-features';

@Injectable({
  providedIn: 'root',
})
export class MenuService implements OnDestroy {
  private router = inject(Router);

  private static readonly SIDEBAR_KEY = 'n9_sidebar_open';

  private _showSidebar = signal(MenuService.loadSidebarState());
  private _showMobileMenu = signal(false);
  private _pagesMenu = signal<MenuItem[]>([]);
  private _subscription = new Subscription();

  /** Persisted rail-collapse state so the sidebar width survives reloads. */
  private static loadSidebarState(): boolean {
    try {
      const v = localStorage.getItem(MenuService.SIDEBAR_KEY);
      return v === null ? true : v === '1';
    } catch {
      return true;
    }
  }

  private persistSidebarState(value: boolean): void {
    try {
      localStorage.setItem(MenuService.SIDEBAR_KEY, value ? '1' : '0');
    } catch {
      /* storage unavailable — non-critical */
    }
  }

  constructor() {
    /** Set dynamic menu — Finance & Marketplace always expanded; filtered by per-page permissions */
    const user = inject(AuthService).getCurrentUser();
    const isSuper = user?.role === 'superadmin';
    const perms = user?.permissions;
    const visible = (route?: string | null) => !route || isSuper || isPageAllowed(route, perms);
    this._pagesMenu.set(
      Menu.pages
        .map((m) => ({
          ...m,
          expanded: m.collapsible === false ? true : (m.expanded ?? false),
          items: m.items.filter((it) => visible(it.route)),
        }))
        .filter((m) => m.items.length > 0),
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
    this.persistSidebarState(value);
  }
  set showMobileMenu(value: boolean) {
    this._showMobileMenu.set(value);
  }

  public toggleSidebar() {
    this.showSideBar = !this._showSidebar();
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
      const selfActive = !!item.route && this.isActive(item.route);
      const children = item.children ? this.expandItems(item.children) : undefined;
      // `active` bubbles up: an item is active if its own route OR any
      // descendant route is active (drives highlight + transient auto-open).
      const childActive = children?.some((c) => c.active) ?? false;
      return {
        ...item,
        active: selfActive || childActive,
        // Same rule as groups: `expanded` only holds the user's manual intent.
        // Never bake the active-route auto-open into it, or submenus stay open
        // forever after navigating away. Display opens on `expanded || active`.
        expanded: item.expanded ?? false,
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
          // Keep `active` (transient: show the current page's group) SEPARATE
          // from `expanded` (the user's manual open/close intent). Baking the
          // active-route auto-expand into `expanded` made groups stay open
          // forever after navigating away → the open/closed composition drifted.
          // Non-collapsible groups are always open; everything else preserves
          // whatever the user last set (or its constructor default).
          expanded: menu.collapsible === false ? true : menu.expanded,
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
