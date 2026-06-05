import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { AuditService } from './audit.service';

/**
 * Session management service for handling session lifecycle, timeouts, and security.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private router = inject(Router);
  private authService = inject(AuthService);
  private auditService = inject(AuditService);

  private readonly SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  private readonly TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // Refresh 5 min before expiry
  private sessionTimeoutTimer: any;
  private inactivityTimer: any;
  private lastActivityTime = Date.now();

  constructor() {
    this.initializeSessionMonitoring();
  }

  /**
   * Initialize session monitoring and timeout detection
   */
  private initializeSessionMonitoring(): void {
    // Track user activity
    if (typeof window !== 'undefined') {
      ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event => {
        window.addEventListener(event, () => this.recordActivity(), { passive: true });
      });
    }

    // Start inactivity check
    this.startInactivityTimer();
  }

  /**
   * Record user activity and reset inactivity timer
   */
  private recordActivity(): void {
    this.lastActivityTime = Date.now();
    // Reset inactivity timer
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
    this.startInactivityTimer();
  }

  /**
   * Start the inactivity timeout
   */
  private startInactivityTimer(): void {
    this.inactivityTimer = setTimeout(() => {
      const inactivityDuration = Date.now() - this.lastActivityTime;
      if (inactivityDuration > this.SESSION_TIMEOUT_MS) {
        this.handleSessionTimeout();
      }
    }, this.SESSION_TIMEOUT_MS);
  }

  /**
   * Handle session timeout - log out user and redirect
   */
  private handleSessionTimeout(): void {
    this.auditService.logSecurityEvent('SESSION_TIMEOUT', { reason: 'User inactivity' }, true);
    this.authService.logout();
    this.router.navigate(['/auth/sign-in'], {
      queryParams: { reason: 'session-expired', message: 'Your session has expired. Please log in again.' },
    });
  }

  /**
   * Invalidate session immediately (on logout)
   */
  invalidateSession(): void {
    // Clear all timers
    if (this.sessionTimeoutTimer) clearTimeout(this.sessionTimeoutTimer);
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);

    // Clear session storage
    sessionStorage.clear();

    // Log logout event
    this.auditService.logSecurityEvent('LOGOUT', { type: 'user-initiated' }, true);
  }

  /**
   * Validate current session is still active
   */
  isSessionActive(): boolean {
    const user = this.authService.getCurrentUser();
    if (!user) return false;

    // Check if token is expired
    if (!user.timestamp) return false;

    const tokenAge = Date.now() - user.timestamp;
    const MAX_TOKEN_AGE = 24 * 60 * 60 * 1000; // 24 hours
    if (tokenAge > MAX_TOKEN_AGE) {
      this.invalidateSession();
      return false;
    }

    // Check inactivity
    const inactivityDuration = Date.now() - this.lastActivityTime;
    if (inactivityDuration > this.SESSION_TIMEOUT_MS) {
      this.handleSessionTimeout();
      return false;
    }

    return true;
  }

  /**
   * Get remaining session time in milliseconds
   */
  getRemainingSessionTime(): number {
    const inactivityDuration = Date.now() - this.lastActivityTime;
    return Math.max(0, this.SESSION_TIMEOUT_MS - inactivityDuration);
  }

  /**
   * Get session expiry time as ISO string
   */
  getSessionExpiryTime(): string {
    const expiryTime = this.lastActivityTime + this.SESSION_TIMEOUT_MS;
    return new Date(expiryTime).toISOString();
  }

  /**
   * Cleanup on component destroy
   */
  destroy(): void {
    if (this.sessionTimeoutTimer) clearTimeout(this.sessionTimeoutTimer);
    if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
  }
}
