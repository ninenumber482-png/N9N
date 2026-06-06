import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { environment } from 'src/environments/environment';

export interface AuditLog {
  id?: string;
  timestamp: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  oldValue?: any;
  newValue?: any;
  reason?: string;
  ipAddress?: string;
  success: boolean;
}

/**
 * Service for logging security and admin events for compliance and security auditing.
 */
@Injectable({ providedIn: 'root' })
export class AuditService {
  constructor(private auth: AuthService) {}

  /**
   * Log an admin action (user approval, deposit approval, etc.)
   */
  logAdminAction(
    action: string,
    resourceType: string,
    resourceId: string,
    oldValue?: any,
    newValue?: any
  ): void {
    const user = this.auth.getCurrentUser();
    if (!user) return;

    const auditLog: AuditLog = {
      timestamp: new Date().toISOString(),
      userId: user.username,
      action,
      resourceType,
      resourceId,
      oldValue,
      newValue,
      ipAddress: this.getClientIp(),
      success: true,
    };

    this.sendToServer(auditLog);
    this.logIfDev(auditLog);
  }

  /**
   * Log a failed access attempt
   */
  logFailedAccess(
    action: string,
    resourceType: string,
    reason: string,
    userId?: string
  ): void {
    const user = this.auth.getCurrentUser();

    const auditLog: AuditLog = {
      timestamp: new Date().toISOString(),
      userId: userId || user?.username || 'unknown',
      action,
      resourceType,
      reason,
      ipAddress: this.getClientIp(),
      success: false,
    };

    this.sendToServer(auditLog);
    this.logIfDev(auditLog);
  }

  /**
   * Log a security event (login, logout, permission change, etc.)
   */
  logSecurityEvent(
    action: string,
    details: Record<string, any>,
    success: boolean = true
  ): void {
    const user = this.auth.getCurrentUser();

    const auditLog: AuditLog = {
      timestamp: new Date().toISOString(),
      userId: user?.username || 'unknown',
      action,
      resourceType: 'SECURITY',
      newValue: details,
      ipAddress: this.getClientIp(),
      success,
    };

    this.sendToServer(auditLog);
    this.logIfDev(auditLog);
  }

  /**
   * Log a data change by a user
   */
  logUserAction(
    action: string,
    resourceType: string,
    resourceId: string
  ): void {
    const user = this.auth.getCurrentUser();
    if (!user) return;

    const auditLog: AuditLog = {
      timestamp: new Date().toISOString(),
      userId: user.username,
      action,
      resourceType,
      resourceId,
      ipAddress: this.getClientIp(),
      success: true,
    };

    this.sendToServer(auditLog);
  }

  private sendToServer(log: AuditLog): void {
    // Send to backend audit_log_event RPC for official audit trail
    // This should be called asynchronously without blocking the UI
    this.callAuditLoggingRpc(log).catch(err => {
      this.logIfDev({ error: 'Failed to log audit event', details: err });
    });
  }

  /**
   * Call backend audit_log_event RPC to create official audit trail
   * CRITICAL: This is the source of truth for security-sensitive events
   */
  private async callAuditLoggingRpc(log: AuditLog): Promise<void> {
    const user = this.auth.getCurrentUser();
    if (!user) return;

    try {
      // Call Supabase RPC function
      const response = await fetch(
        `${this.getSupabaseUrl()}/rest/v1/rpc/audit_log_event`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': this.getSupabaseKey(),
            'Authorization': `Bearer ${user.token}`,
            'x-session-token': user.token,
          },
          body: JSON.stringify({
            p_admin_id: user.id,
            p_action: log.action,
            p_resource_type: log.resourceType,
            p_resource_id: log.resourceId,
            p_old_value: log.oldValue,
            p_new_value: log.newValue,
            p_reason: log.reason,
            p_ip_address: this.getClientIp(),
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Audit RPC failed: ${response.status} - ${error}`);
      }

      this.logIfDev({ message: 'Audit event logged to backend', audit_id: log.id });
    } catch (err) {
      console.error('[AuditService] Failed to call audit_log_event RPC:', err);
      throw err;
    }
  }

  /**
   * Get Supabase configuration from environment
   */
  private getSupabaseUrl(): string {
    // Would normally come from environment config
    return 'https://dqsmpdetiqsqfnidekik.supabase.co';
  }

  private getSupabaseKey(): string {
    // Would normally come from environment config
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Placeholder
  }

  private logIfDev(log: AuditLog): void {
    if (!environment.production) {
      //
    }
  }

  private getClientIp(): string {
    // In production, this would come from the request headers
    // For now, return a placeholder
    return 'unknown';
  }
}
