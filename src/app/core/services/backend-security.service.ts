import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';

/**
 * Backend Security Integration Service
 *
 * Enforces server-side security that cannot be bypassed by frontend manipulation.
 * This is CRITICAL - frontend security is NOT sufficient.
 *
 * Prevents:
 * - Role spoofing (localStorage override)
 * - Brute force attacks (failed login tracking)
 * - Session reuse (token invalidation)
 * - Unauthorized API calls (RBAC enforcement)
 */
@Injectable({ providedIn: 'root' })
export class BackendSecurityService {
  constructor(private auth: AuthService) {}

  /**
   * CRITICAL: Verify user role with backend (not localStorage)
   * Call this before ANY permission-sensitive operation
   */
  async verifyRoleWithBackend(requiredRole: string): Promise<boolean> {
    const user = this.auth.getCurrentUser();
    if (!user) return false;

    try {
      const response = await this.callRpc('verify_user_role', {
        p_user_id: user.id,
        p_required_role: requiredRole,
      });

      const result = response[0];
      if (!result.valid) {
        console.warn(`[BackendSecurity] Role verification failed: ${result.reason}`);
        return false;
      }

      return true;
    } catch (err) {
      console.error('[BackendSecurity] Role verification error:', err);
      return false;
    }
  }

  /**
   * CRITICAL: Validate session is still active (not logged out)
   * Call before sensitive operations (approve deposit, withdraw, etc.)
   */
  async validateSessionActive(): Promise<boolean> {
    const user = this.auth.getCurrentUser();
    if (!user || !user.token) return false;

    try {
      const tokenHash = this.hashToken(user.token);
      const response = await this.callRpc('validate_session', {
        p_token_hash: tokenHash,
        p_user_id: user.id,
      });

      const result = response[0];
      if (!result.valid) {
        console.warn(`[BackendSecurity] Session validation failed: ${result.reason}`);
        // Session is invalid - log out user
        this.auth.logout();
        return false;
      }

      return true;
    } catch (err) {
      console.error('[BackendSecurity] Session validation error:', err);
      return false;
    }
  }

  /**
   * CRITICAL: Invalidate session on logout
   * Prevents old tokens from being reused
   */
  async invalidateSessionOnLogout(): Promise<boolean> {
    const user = this.auth.getCurrentUser();
    if (!user || !user.token) return false;

    try {
      const tokenHash = this.hashToken(user.token);
      const response = await this.callRpc('invalidate_session', {
        p_token_hash: tokenHash,
        p_user_id: user.id,
        p_logout_reason: 'user-logout',
      });

      const result = response[0];
      return result.success;
    } catch (err) {
      console.error('[BackendSecurity] Session invalidation error:', err);
      return false;
    }
  }

  /**
   * Log failed login for brute force detection
   * Backend will apply rate limiting and account lockout
   */
  async logFailedLogin(username: string, reason: string): Promise<void> {
    try {
      const ipAddress = await this.getClientIp();
      const userAgent = navigator.userAgent;

      await this.callRpc('log_failed_login', {
        p_username: username,
        p_ip_address: ipAddress,
        p_reason: reason,
        p_user_agent: userAgent,
      });
    } catch (err) {
      console.error('[BackendSecurity] Failed login logging error:', err);
    }
  }

  /**
   * Check if user is rate limited for an operation
   * Backend enforces rate limiting independently of frontend
   */
  async checkRateLimit(operation: string): Promise<{ allowed: boolean; reason?: string }> {
    const user = this.auth.getCurrentUser();
    if (!user) return { allowed: false, reason: 'Not authenticated' };

    try {
      const response = await this.callRpc('check_rate_limit', {
        p_identifier: user.id,
        p_operation: operation,
        p_limit_per_minute: 10,
      });

      const result = response[0];
      if (!result.allowed) {
        return {
          allowed: false,
          reason: `Rate limited. ${result.time_until_reset_seconds}s remaining`,
        };
      }

      return { allowed: true };
    } catch (err) {
      console.error('[BackendSecurity] Rate limit check error:', err);
      // Fail open - allow operation but log error
      return { allowed: true };
    }
  }

  /**
   * Enforce RBAC at backend level
   * Frontend checks are not sufficient - backend must enforce
   */
  async enforceRbac(action: string, resourceType: string): Promise<boolean> {
    const user = this.auth.getCurrentUser();
    if (!user) return false;

    try {
      const response = await this.callRpc('enforce_rbac', {
        p_user_id: user.id,
        p_action: action,
        p_resource_type: resourceType,
      });

      const result = response[0];
      if (!result.allowed) {
        console.warn(`[BackendSecurity] RBAC denied: ${result.reason}`);
        return false;
      }

      return true;
    } catch (err) {
      console.error('[BackendSecurity] RBAC enforcement error:', err);
      return false;
    }
  }

  /**
   * CRITICAL: Call Supabase RPC function with proper authentication
   * All RPC calls must include user token for RLS verification
   */
  private async callRpc(
    functionName: string,
    params: Record<string, any>
  ): Promise<any[]> {
    const user = this.auth.getCurrentUser();
    if (!user || !user.token) {
      throw new Error('User not authenticated');
    }

    const supabaseUrl = this.getSupabaseUrl();
    const supabaseKey = this.getSupabaseKey();

    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/${functionName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'x-session-token': user.token, // RLS verification header
        },
        body: JSON.stringify(params),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`${functionName} RPC failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data;
  }

  /**
   * Simple token hash for session lookup
   * In production, use proper hashing algorithm
   */
  private hashToken(token: string): string {
    // This is a placeholder - in production use SHA256 or similar
    return Buffer.from(token).toString('base64').substring(0, 64);
  }

  /**
   * Get client IP address from request headers
   * Backend should also verify IP matches session creation
   */
  private async getClientIp(): Promise<string> {
    try {
      // Call an endpoint that returns client IP
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private getSupabaseUrl(): string {
    // Would come from environment config
    return 'https://dqsmpdetiqsqfnidekik.supabase.co';
  }

  private getSupabaseKey(): string {
    // Would come from environment config (public/anon key)
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
  }
}
