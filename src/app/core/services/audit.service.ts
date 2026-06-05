import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';

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
    // TODO: Send to audit logging RPC or API endpoint
    // This should be called asynchronously without blocking the UI
    // fetch('/api/audit', { method: 'POST', body: JSON.stringify(log) })
    //   .catch(err => this.logIfDev({ error: 'Failed to log audit event', details: err }));
  }

  private logIfDev(log: AuditLog): void {
    if (import.meta.env.DEV) {
      console.log('[AuditLog]', log);
    }
  }

  private getClientIp(): string {
    // In production, this would come from the request headers
    // For now, return a placeholder
    return 'unknown';
  }
}
