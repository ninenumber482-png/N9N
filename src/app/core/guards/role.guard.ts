import { Injectable } from '@angular/core';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from 'src/app/core/services/auth.service';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class RoleGuard {
  // Rate limiting: max 10 failed attempts per minute per user
  private failedAttempts = new Map<string, { count: number; resetAt: number }>();

  constructor(private authService: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<boolean> {
    return Promise.resolve().then(async () => {
      const user = this.authService.getCurrentUser();
      if (!user) {
        this.logFailedAccess(route, state, 'Not authenticated');
        this.router.navigate(['/auth/sign-in']);
        return false;
      }

      // Check rate limiting
      if (this.isRateLimited(user.username)) {
        this.logFailedAccess(route, state, 'Rate limited');
        return false;
      }

      const requiredRole = route.data['requiredRole'] as string;
      if (requiredRole) {
        // Verify role matches (frontend check is not sufficient)
        if (user.role !== requiredRole) {
          this.recordFailedAttempt(user.username);
          this.logFailedAccess(route, state, `Role mismatch: ${user.role} != ${requiredRole}`);
          this.router.navigate(['/overview']);
          return false;
        }

        // TODO: Add server-side role verification via RPC call
        // const validRole = await this.verifyRoleWithServer(user.id, requiredRole);
        // if (!validRole) { ... }
      }

      const requireUnlimited = route.data['requireUnlimited'] as boolean;
      if (requireUnlimited && !user.unlimited) {
        this.recordFailedAttempt(user.username);
        this.logFailedAccess(route, state, 'Unlimited access required');
        this.router.navigate(['/overview']);
        return false;
      }

      // Clear failed attempts on successful access
      this.failedAttempts.delete(user.username);
      return true;
    });
  }

  private isRateLimited(username: string): boolean {
    const attempt = this.failedAttempts.get(username);
    if (!attempt) return false;

    // Reset if minute has passed
    if (Date.now() > attempt.resetAt) {
      this.failedAttempts.delete(username);
      return false;
    }

    return attempt.count >= 10;
  }

  private recordFailedAttempt(username: string): void {
    const attempt = this.failedAttempts.get(username);
    if (!attempt) {
      this.failedAttempts.set(username, { count: 1, resetAt: Date.now() + 60000 });
    } else {
      attempt.count++;
    }
  }

  private logFailedAccess(route: ActivatedRouteSnapshot, state: RouterStateSnapshot, reason: string): void {
    const user = this.authService.getCurrentUser();
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId: user?.username || 'unknown',
      attemptedRoute: state.url,
      reason,
      ip: this.getClientIp(),
    };
    // TODO: Send to audit logging service
    if (!environment.production) {
      console.warn('[RoleGuard] Access denied:', logEntry);
    }
  }

  private getClientIp(): string {
    // In production, this would come from the request headers
    // For now, return a placeholder that would be set by backend
    return 'unknown';
  }
}
