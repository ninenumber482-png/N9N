import { Injectable, inject } from '@angular/core';
import { Router, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from 'src/app/core/services/auth.service';
import { AdminService } from 'src/app/core/services/admin.service';
import { AuditService } from 'src/app/core/services/audit.service';

@Injectable({ providedIn: 'root' })
export class RoleGuard {
  private authService = inject(AuthService);
  private admin = inject(AdminService);
  private audit = inject(AuditService);
  private router = inject(Router);

  private failedAttempts = new Map<string, { count: number; resetAt: number }>();
  private roleCache = new Map<string, { role: string; ts: number }>();
  private readonly ROLE_CACHE_TTL = 30000;

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<boolean> {
    return Promise.resolve().then(async () => {
      const user = this.authService.getCurrentUser();
      if (!user) {
        this.audit.logFailedAccess('ROUTE_GUARD', state.url, 'Not authenticated');
        this.router.navigate(['/auth/sign-in']);
        return false;
      }

      if (this.isRateLimited(user.username)) {
        this.audit.logFailedAccess('ROUTE_GUARD', state.url, 'Rate limited');
        return false;
      }

      const requiredRole = route.data['requiredRole'] as string;
      if (requiredRole) {
        if (user.role !== requiredRole && user.role !== 'superadmin') {
          this.recordFailedAttempt(user.username);
          this.audit.logFailedAccess('ROUTE_GUARD', state.url, `Role mismatch: ${user.role} != ${requiredRole}`);
          this.router.navigate(['/overview']);
          return false;
        }

        const ok = await this.verifyRoleWithServer(user.username, requiredRole);
        if (!ok) {
          this.recordFailedAttempt(user.username);
          this.audit.logFailedAccess('ROUTE_GUARD', state.url, 'Server role verification failed');
          this.router.navigate(['/overview']);
          return false;
        }
      }

      const requireUnlimited = route.data['requireUnlimited'] as boolean;
      if (requireUnlimited && !user.unlimited) {
        this.recordFailedAttempt(user.username);
        this.audit.logFailedAccess('ROUTE_GUARD', state.url, 'Unlimited access required');
        this.router.navigate(['/overview']);
        return false;
      }

      this.failedAttempts.delete(user.username);
      this.audit.logAccessGranted(state.url);
      return true;
    });
  }

  private async verifyRoleWithServer(username: string, requiredRole: string): Promise<boolean> {
    const cached = this.roleCache.get(username);
    if (cached && Date.now() - cached.ts < this.ROLE_CACHE_TTL) {
      return this.roleSatisfies(cached.role, requiredRole);
    }
    try {
      const rows = await this.admin.getUserByUsername(username);
      const serverRole = rows[0]?.['role'] as string | undefined;
      if (serverRole) this.roleCache.set(username, { role: serverRole, ts: Date.now() });
      return serverRole ? this.roleSatisfies(serverRole, requiredRole) : false;
    } catch {
      return false;
    }
  }

  private roleSatisfies(actualRole: string, requiredRole: string): boolean {
    return actualRole === requiredRole || actualRole === 'superadmin';
  }

  private isRateLimited(username: string): boolean {
    const attempt = this.failedAttempts.get(username);
    if (!attempt) return false;
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
}
