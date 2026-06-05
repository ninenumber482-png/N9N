import { Injectable } from '@angular/core';
import { environment } from 'src/app/environments/environment';

export interface SupabaseLoginPayload {
  username: string;
  password: string;
  email: string;
}

export interface SupabaseLoginResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    username: string;
    role: string;
    isNewAccount: boolean;
    unlimited?: boolean;
  };
  session?: {
    access_token: string;
  };
  error?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private readonly functionBase = `${environment.supabaseUrl}/functions/v1`;

  async login(payload: SupabaseLoginPayload): Promise<SupabaseLoginResult> {
    try {
      const res = await fetch(`${this.functionBase}/auth-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${environment.supabaseKey}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Login failed' };
      }
      return data as SupabaseLoginResult;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection error';
      return { success: false, error: msg };
    }
  }
}
