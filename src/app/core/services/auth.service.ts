import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SecurityService } from 'src/app/core/services/security.service';
import { SupabaseService, SupabaseLoginResult } from 'src/app/core/services/supabase.service';

export interface User {
  id?: string;
  username: string;
  isAuthenticated: boolean;
  timestamp?: number;
  role?: string;
  unlimited?: boolean;
  email?: string;
  token?: string;
}

export interface Credentials {
  username: string;
  password: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private router = inject(Router);
  private securityService = inject(SecurityService);
  private supabaseService = inject(SupabaseService);

  private userSubject = new BehaviorSubject<User | null>(this.getStoredUser());
  public user$ = this.userSubject.asObservable();

  private readonly TOKEN_EXPIRY = 3600000;

  async authenticate(credentials: Credentials): Promise<SupabaseLoginResult | null> {
    if (!this.securityService.checkRateLimit('login_attempt', 5)) {
      return null;
    }

    if (!this.securityService.isValidUsername(credentials.username)) {
      return null;
    }

    if (!credentials.password || credentials.password.length < 1) {
      return null;
    }

    const sanitizedUsername = this.securityService.sanitizeInput(credentials.username);
    const email = `${sanitizedUsername}@number9.local`;

    const result = await this.supabaseService.login({
      username: sanitizedUsername,
      password: credentials.password,
      email,
    });

    if (result.success) {
      this.securityService.clearRateLimit('login_attempt');
    }
    return result;
  }

  login(user: User): void {
    const userWithTimestamp: User = {
      ...user,
      timestamp: Date.now(),
    };

    localStorage.setItem('auth_user', JSON.stringify(userWithTimestamp));
    this.userSubject.next(userWithTimestamp);
  }

  logout(): void {
    localStorage.removeItem('auth_user');
    this.securityService.clearRateLimit('login_attempt');
    this.userSubject.next(null);
    this.router.navigate(['/auth/sign-in']);
  }

  isAuthenticated(): boolean {
    const user = this.getStoredUser();
    if (!user) return false;

    // Old sessions without a token are invalid (migrated to cookie+token auth)
    if (!user.token) {
      this.logout();
      return false;
    }

    if (user.timestamp && this.securityService.isTokenExpired(user.timestamp, this.TOKEN_EXPIRY)) {
      this.logout();
      return false;
    }

    return true;
  }

  getCurrentUser(): User | null {
    if (this.isAuthenticated()) {
      return this.getStoredUser();
    }
    return null;
  }

  private getStoredUser(): User | null {
    const stored = localStorage.getItem('auth_user');
    if (!stored) return null;
    try {
      return JSON.parse(stored) as User;
    } catch {
      // Corrupted auth_user would otherwise throw during service construction
      // (userSubject is initialised from this) and break app bootstrap.
      localStorage.removeItem('auth_user');
      return null;
    }
  }
}
