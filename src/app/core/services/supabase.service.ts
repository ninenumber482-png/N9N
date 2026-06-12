import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';

export interface SupabaseLoginPayload {
  username: string;
  password: string;
  email: string;
}

export interface SupabaseLoginResult {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    email: string;
    username: string;
    role: string;
    isNewAccount: boolean;
    unlimited?: boolean;
  };
  mfa?: {
    phase: 'setup' | 'verify' | 'complete';
    complete: boolean;
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
      console.log('[SupabaseService] Calling auth-login for user:', payload.username);
      const url = `${this.functionBase}/auth-login`;
      console.log('[SupabaseService] URL:', url);
      console.log('[SupabaseService] Headers:', {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${environment.supabaseKey?.substring(0, 20)}...`,
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => {
        console.warn('[SupabaseService] Login timeout after 30s, aborting');
        controller.abort();
      }, 30000);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${environment.supabaseKey}`,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      console.log('[SupabaseService] Response status:', res.status, 'ok:', res.ok);
      const data = await res.json();
      console.log('[SupabaseService] Response data:', data);
      if (!res.ok) {
        const error = data.error || 'Login failed';
        console.error('[SupabaseService] Login error:', error);
        return { success: false, error };
      }
      console.log('[SupabaseService] Login successful for:', data.user?.username);
      return data as SupabaseLoginResult;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection error';
      const errName = err instanceof Error ? err.name : 'Unknown';
      console.error('[SupabaseService] Login exception:', errName, msg, err);
      console.error('[SupabaseService] Full error object:', {
        name: errName,
        message: msg,
        stack: err instanceof Error ? err.stack : undefined,
        type: typeof err,
        toString: String(err),
      });

      if (errName === 'AbortError') {
        return { success: false, error: 'Request timeout (30s)' };
      }
      if (msg.includes('Failed to fetch')) {
        return { success: false, error: 'Failed to connect to server. Check CORS, network, or try again.' };
      }
      return { success: false, error: msg };
    }
  }
}
