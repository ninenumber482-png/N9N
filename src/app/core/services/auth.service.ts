import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { SecurityService } from './security.service';
import { SupabaseService, SupabaseLoginResult } from './supabase.service';

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
      console.warn('Too many login attempts. Please try again later.');
      return null;
    }

    if (!this.securityService.isValidUsername(credentials.username)) {
      console.warn('Invalid username format');
      return null;
    }

    if (!credentials.password || credentials.password.length < 1) {
      console.warn('Invalid password');
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
    } else {
      console.warn('Login failed:', result.error);
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
    return stored ? JSON.parse(stored) : null;
  }
}
