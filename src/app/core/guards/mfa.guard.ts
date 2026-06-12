import { Injectable, inject } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from 'src/app/core/services/auth.service';

@Injectable({ providedIn: 'root' })
export class MfaGuard implements CanActivate {
  private auth = inject(AuthService);
  private router = inject(Router);

  canActivate(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
    const user = this.auth.getCurrentUser();
    if (!user?.token) {
      this.router.navigate(['/auth/sign-in'], { queryParams: { returnUrl: state.url } });
      return false;
    }
    if (user.mfaComplete !== false) {
      this.router.navigate(['/']);
      return false;
    }
    return true;
  }
}

@Injectable({ providedIn: 'root' })
export class MfaCompleteGuard implements CanActivate {
  private auth = inject(AuthService);
  private router = inject(Router);

  canActivate(_route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): boolean {
    const user = this.auth.getCurrentUser();
    if (!user?.token) {
      this.router.navigate(['/auth/sign-in']);
      return false;
    }
    if (user.mfaComplete === false) {
      this.router.navigate(['/auth/two-factor']);
      return false;
    }
    return true;
  }
}
