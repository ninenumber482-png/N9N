import { Injectable, inject } from '@angular/core';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from 'src/app/core/services/auth.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard {
  private authService = inject(AuthService);
  private router = inject(Router);

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<boolean> {
    return Promise.resolve().then(async () => {
      // Check if user is authenticated
      if (!this.authService.isAuthenticated()) {
        // Store return URL for post-login redirect
        sessionStorage.setItem('auth_return_url', state.url);
        this.router.navigate(['/auth/sign-in']);
        return false;
      }

      // Validate token expiry
      const user = this.authService.getCurrentUser();
      if (!user || !user.timestamp) {
        this.router.navigate(['/auth/sign-in']);
        return false;
      }

      // Check token age (7 days — must match AuthService.TOKEN_EXPIRY and admin-proxy session expiry)
      const tokenAge = Date.now() - user.timestamp;
      const MAX_TOKEN_AGE = 7 * 24 * 60 * 60 * 1000;
      if (tokenAge > MAX_TOKEN_AGE) {
        this.authService.logout();
        this.router.navigate(['/auth/sign-in']);
        return false;
      }

      return true;
    });
  }
}
