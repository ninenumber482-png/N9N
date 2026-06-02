import { Injectable } from '@angular/core';
import { Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class RoleGuard {
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.router.navigate(['/auth/sign-in']);
      return false;
    }

    const requiredRole = route.data['requiredRole'] as string;
    if (requiredRole && user.role !== requiredRole) {
      this.router.navigate(['/overview']);
      return false;
    }

    const requireUnlimited = route.data['requireUnlimited'] as boolean;
    if (requireUnlimited && !user.unlimited) {
      this.router.navigate(['/overview']);
      return false;
    }

    return true;
  }
}
