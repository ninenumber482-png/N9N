import { Directive, Input, TemplateRef, ViewContainerRef, OnInit, inject } from '@angular/core';
import { AuthService } from 'src/app/core/services/auth.service';

/**
 * Directive to conditionally show/hide elements based on user role.
 * Usage: *appHasRole="'admin'" or *appHasRole="['admin', 'moderator']"
 */
@Directive({
  selector: '[appHasRole]',
  standalone: true,
})
export class HasRoleDirective implements OnInit {
  private requiredRoles: string[] = [];
  private hasView = false;

  @Input()
  set appHasRole(roles: string | string[]) {
    this.requiredRoles = Array.isArray(roles) ? roles : [roles];
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
    const userRole = user?.role || '';
    const hasRequiredRole = this.requiredRoles.includes(userRole);

    if (hasRequiredRole && !this.hasView) {
      this.viewContainer.createEmbeddedView(this.templateRef);
      this.hasView = true;
    } else if (!hasRequiredRole && this.hasView) {
      this.viewContainer.clear();
      this.hasView = false;
    }
  }
}
