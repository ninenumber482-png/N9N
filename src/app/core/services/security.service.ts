import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class SecurityService {
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
   * Generate a cryptographically secure token (fallback session id when the
   * server does not return one). Uses the Web Crypto API, not Math.random().
   */
  generateToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Check token expiration
   */
  isTokenExpired(tokenTimestamp: number, maxAge: number = 3600000): boolean {
    return Date.now() - tokenTimestamp > maxAge;
  }

  /**
   * Rate limiting check (client-side UX guard only — server enforces the real
   * limit via the user_rpc_rate_limit migration).
   */
  checkRateLimit(key: string, maxAttempts: number = 5, windowMs: number = 60000): boolean {
    const storageKey = `ratelimit_${key}`;
    const data = localStorage.getItem(storageKey);

    if (!data) {
      localStorage.setItem(storageKey, JSON.stringify({ count: 1, timestamp: Date.now() }));
      return true;
    }

    let count: number;
    let timestamp: number;
    try {
      ({ count, timestamp } = JSON.parse(data));
    } catch {
      localStorage.setItem(storageKey, JSON.stringify({ count: 1, timestamp: Date.now() }));
      return true;
    }
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
