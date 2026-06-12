import { Injectable, inject } from '@angular/core';
import { environment } from 'src/environments/environment';
import { AuthService } from 'src/app/core/services/auth.service';

export type MfaPhase = 'setup' | 'verify' | 'complete';

export interface MfaStatus {
  phase: MfaPhase;
  mfaVerified: boolean;
  totpEnabled: boolean;
  totpSkipped: boolean;
}

export interface MfaSetupResult {
  secret: string;
  uri: string;
  qrUrl: string;
}

@Injectable({ providedIn: 'root' })
export class MfaService {
  private auth = inject(AuthService);
  private base = `${environment.supabaseUrl}/functions/v1/auth-2fa`;

  private headers(): Record<string, string> {
    const user = this.auth.getCurrentUser();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${environment.supabaseKey}`,
      apikey: environment.supabaseKey,
      ...(user?.token ? { 'x-session-token': user.token } : {}),
    };
  }

  private async post<T>(body: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.base, {
      method: 'POST',
      headers: this.headers(),
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '2FA request failed');
    }
    return data as T;
  }

  status() {
    return this.post<MfaStatus & { success: boolean }>({ action: 'status' });
  }

  setup() {
    return this.post<MfaSetupResult & { success: boolean }>({ action: 'setup' });
  }

  confirm(code: string) {
    return this.post<{ success: boolean; backupCodes: string[]; message: string }>({
      action: 'confirm',
      code,
    });
  }

  verify(code?: string, backupCode?: string) {
    return this.post<{ success: boolean; message: string }>({
      action: 'verify',
      code: code || '',
      backupCode: backupCode || '',
    });
  }

  skip() {
    return this.post<{ success: boolean; message: string }>({ action: 'skip' });
  }

  reset(targetUserId: string) {
    return this.post<{ success: boolean; message: string }>({ action: 'reset', targetUserId });
  }

  listAdmins() {
    return this.post<{
      success: boolean;
      admins: Array<{
        id: string;
        username: string;
        display_name: string;
        role: string;
        totp_enabled: boolean;
        totp_skipped_at: string | null;
      }>;
    }>({ action: 'list-admins' });
  }
}
