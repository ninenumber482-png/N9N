import { Injectable } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

@Injectable({
  providedIn: 'root',
})
export class SecurityService {
  constructor(private sanitizer: DomSanitizer) {}

  /**
   * Simple password hash simulation (for demo only)
   * In production, use bcrypt or server-side hashing
   */
  hashPassword(password: string): string {
    return btoa(password); // Base64 encode (NOT secure for production)
  }

  /**
   * Verify password against hash
   */
  verifyPassword(password: string, hash: string): boolean {
    return btoa(password) === hash;
  }

  /**
   * Sanitize user input to prevent XSS
   */
  sanitizeInput(input: string): string {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
  }

  /**
   * Validate username format
   */
  isValidUsername(username: string): boolean {
    const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;
    return usernameRegex.test(username);
  }

  /**
   * Validate password strength
   */
  isStrongPassword(password: string): boolean {
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return passwordRegex.test(password);
  }

  /**
   * Generate secure token (for session management)
   */
  generateToken(): string {
    return Math.random().toString(36).substr(2) + Date.now().toString(36);
  }

  /**
   * Check token expiration
   */
  isTokenExpired(tokenTimestamp: number, maxAge: number = 3600000): boolean {
    return Date.now() - tokenTimestamp > maxAge;
  }

  /**
   * Prevent XSS in HTML content
   */
  sanitizeHtml(html: string) {
    return this.sanitizer.sanitize(1, html);
  }

  /**
   * Rate limiting check (simple client-side)
   */
  checkRateLimit(key: string, maxAttempts: number = 5, windowMs: number = 60000): boolean {
    const storageKey = `ratelimit_${key}`;
    const data = localStorage.getItem(storageKey);

    if (!data) {
      localStorage.setItem(storageKey, JSON.stringify({ count: 1, timestamp: Date.now() }));
      return true;
    }

    const { count, timestamp } = JSON.parse(data);
    const now = Date.now();

    if (now - timestamp > windowMs) {
      localStorage.setItem(storageKey, JSON.stringify({ count: 1, timestamp: now }));
      return true;
    }

    if (count >= maxAttempts) {
      return false;
    }

    localStorage.setItem(storageKey, JSON.stringify({ count: count + 1, timestamp }));
    return true;
  }

  /**
   * Clear rate limit
   */
  clearRateLimit(key: string): void {
    localStorage.removeItem(`ratelimit_${key}`);
  }
}
