import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { environment } from 'src/environments/environment';

export interface AuditLog {
  id?: string;
  timestamp: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  ipAddress?: string;
  success: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  private auth = inject(AuthService);

  private readonly supabaseUrl = environment.supabaseUrl;
  private readonly supabaseKey = environment.supabaseKey;
  private readonly logEndpoint = `${environment.supabaseUrl}/rest/v1/rpc/audit_log_event`;
  private logQueue: AuditLog[] = [];
  private flushing = false;

  logAdminAction(action: string, resourceType: string, resourceId: string, oldValue?: unknown, newValue?: unknown): void {
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
  }

  logFailedAccess(action: string, resourceType: string, reason: string, userId?: string): void {
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
  }

  logSecurityEvent(action: string, details: Record<string, unknown>, success: boolean = true): void {
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
  }

  logUserAction(action: string, resourceType: string, resourceId: string): void {
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

  logAccessGranted(route: string, reason?: string): void {
    const user = this.auth.getCurrentUser();
    if (!user || environment.production) return;
    console.debug(`[Audit] Access granted to ${route}`, reason || '');
  }

  private sendToServer(log: AuditLog): void {
    this.logQueue.push(log);
    this.flush();
    this.logIfDev(log);
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.logQueue.length === 0) return;
    this.flushing = true;

    while (this.logQueue.length > 0) {
      const batch = this.logQueue.splice(0, 10);
      try {
        await Promise.all(batch.map((log) => this.callAuditLoggingRpc(log)));
      } catch (err) {
        if (!environment.production) {
          console.warn('[Audit] Batch log failed, requeueing:', err);
        }
        this.logQueue.push(...batch);
        break;
      }
    }

    this.flushing = false;
  }

  private async callAuditLoggingRpc(log: AuditLog): Promise<void> {
    const user = this.auth.getCurrentUser();
    if (!user) return;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: this.supabaseKey,
      Authorization: `Bearer ${this.supabaseKey}`,
    };
    const response = await fetch(this.logEndpoint, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        p_admin_id: user.id,
        p_action: log.action,
        p_resource_type: log.resourceType,
        p_resource_id: log.resourceId || null,
        p_old_value: log.oldValue ? JSON.stringify(log.oldValue) : null,
        p_new_value: log.newValue ? JSON.stringify(log.newValue) : null,
        p_reason: log.reason || null,
        p_ip_address: log.ipAddress || 'unknown',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Audit RPC failed: ${response.status} - ${error}`);
    }
  }

  private logIfDev(log: AuditLog): void {
    if (environment.production) return;
    console.debug(
      `[Audit] ${log.action} on ${log.resourceType}${log.resourceId ? ` #${log.resourceId}` : ''} by ${log.userId} — ${log.success ? 'OK' : 'FAIL'}`,
      log.reason || '',
    );
  }

  private getClientIp(): string {
    return 'unknown';
  }
}
