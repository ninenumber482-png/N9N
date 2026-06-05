import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { SecurityService } from 'src/app/core/services/security.service';
import { SupabaseService, SupabaseLoginResult } from 'src/app/core/services/supabase.service';

export interface User {
  username: string;
  isAuthenticated: boolean;
  token?: string;
  timestamp?: number;
  role?: string;
  unlimited?: boolean;
  email?: string;
}

export interface Credentials {
  username: string;
  password: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private userSubject = new BehaviorSubject<User | null>(this.getStoredUser());
  public user$ = this.userSubject.asObservable();

  private readonly TOKEN_EXPIRY = 3600000; // 1 hour

  constructor(
    private router: Router,
    private securityService: SecurityService,
    private supabaseService: SupabaseService,
  ) {}

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

  login(user: User, serverToken?: string): void {
    const token = serverToken || this.securityService.generateToken();
    const userWithToken: User = {
      ...user,
      token,
      timestamp: Date.now(),
    };

    localStorage.setItem('auth_user', JSON.stringify(userWithToken));
    this.userSubject.next(userWithToken);
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
