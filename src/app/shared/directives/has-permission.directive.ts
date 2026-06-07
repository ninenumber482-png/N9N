import { Directive, Input, TemplateRef, ViewContainerRef, OnInit, inject } from '@angular/core';
import { AuthService } from 'src/app/core/services/auth.service';

/**
 * Directive to conditionally show/hide elements based on user permissions.
 * Usage: *appHasPermission="'users.delete'" or *appHasPermission="['users.delete', 'users.edit']"
 */
@Directive({
  selector: '[appHasPermission]',
  standalone: true,
})
export class HasPermissionDirective implements OnInit {
  private requiredPermissions: string[] = [];
  private hasView = false;

  @Input()
  set appHasPermission(permissions: string | string[]) {
    this.requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
    this.updateView();
  }

  private templateRef = inject(TemplateRef<unknown>);
  private viewContainer = inject(ViewContainerRef);
  private authService = inject(AuthService);

  ngOnInit(): void {
    this.updateView();
  }

  private updateView(): void {
    const user = this.authService.getCurrentUser();
    const userPermissions = this.getPermissionsForRole(user?.role || '');
    const hasRequiredPermission = this.requiredPermissions.some(perm =>
      userPermissions.includes(perm)
    );

    if (hasRequiredPermission && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!hasRequiredPermission && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }

  private getPermissionsForRole(role: string): string[] {
    // Permission mapping by role
    const permissionsMap: Record<string, string[]> = {
      admin: [
        'users.view',
        'users.create',
        'users.edit',
        'users.delete',
        'users.approve',
        'users.lock',
        'transactions.view',
        'transactions.approve',
        'transactions.reject',
        'bets.view',
        'bets.settle',
        'config.edit',
        'audit.view',
        'system.manage',
      ],
      moderator: [
        'users.view',
        'users.approve',
        'users.lock',
        'transactions.view',
        'transactions.approve',
        'transactions.reject',
        'bets.view',
        'audit.view',
      ],
      user: [
        'users.view.own',
        'transactions.view.own',
        'bets.view.own',
      ],
    };

    return permissionsMap[role] || [];
  }
}
