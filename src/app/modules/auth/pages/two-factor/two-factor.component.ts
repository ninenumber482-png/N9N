import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/core/services/auth.service';
import { MfaService } from 'src/app/core/services/mfa.service';
import { NotificationService } from 'src/app/core/services/notification.service';

type Step = 'loading' | 'setup' | 'backup' | 'verify';

@Component({
  selector: 'app-two-factor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './two-factor.component.html',
  styleUrls: ['./two-factor.component.css', '../sign-in/sign-in.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TwoFactorComponent implements OnInit {
  private auth = inject(AuthService);
  private mfa = inject(MfaService);
  private router = inject(Router);
  private notify = inject(NotificationService);
  private cdr = inject(ChangeDetectorRef);

  step: Step = 'loading';
  code = '';
  backupCode = '';
  useBackup = false;
  busy = false;
  error = '';

  qrUrl = '';
  secret = '';
  backupCodes: string[] = [];
  backupSaved = false;

  ngOnInit(): void {
    const user = this.auth.getCurrentUser();
    if (!user?.token) {
      this.router.navigate(['/auth/sign-in']);
      return;
    }
    void this.init();
  }

  private async init() {
    try {
      const status = await this.mfa.status();
      if (status.mfaVerified || status.phase === 'complete') {
        this.auth.completeMfa();
        this.router.navigate(['/']);
        return;
      }
      if (status.phase === 'verify') {
        this.step = 'verify';
      } else {
        await this.startSetup();
      }
    } catch {
      const user = this.auth.getCurrentUser();
      if (user?.mfaPhase === 'verify') {
        this.step = 'verify';
      } else {
        await this.startSetup();
      }
    } finally {
      this.cdr.markForCheck();
    }
  }

  private async startSetup() {
    this.step = 'setup';
    this.busy = true;
    this.cdr.markForCheck();
    try {
      const res = await this.mfa.setup();
      this.qrUrl = res.qrUrl;
      this.secret = res.secret;
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Setup failed';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  async confirmSetup() {
    if (!/^\d{6}$/.test(this.code.trim())) {
      this.error = 'Enter the 6-digit code from Google Authenticator';
      this.cdr.markForCheck();
      return;
    }
    this.busy = true;
    this.error = '';
    this.cdr.markForCheck();
    try {
      const res = await this.mfa.confirm(this.code.trim());
      this.backupCodes = res.backupCodes;
      this.step = 'backup';
      this.code = '';
      this.notify.success('2FA enabled', 'Save your backup codes before continuing.');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Invalid code';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  finishBackup() {
    if (!this.backupSaved) {
      this.error = 'Confirm that you have saved the backup codes';
      this.cdr.markForCheck();
      return;
    }
    this.auth.completeMfa();
    this.notify.success('Access granted', 'Welcome to the admin panel.');
    this.router.navigate(['/']);
  }

  copyBackupCodes() {
    const text = this.backupCodes.join('\n');
    void navigator.clipboard.writeText(text);
    this.notify.success('Copied', 'Backup codes copied to clipboard.');
  }

  async verifyLogin() {
    this.busy = true;
    this.error = '';
    this.cdr.markForCheck();
    try {
      if (this.useBackup) {
        await this.mfa.verify(undefined, this.backupCode.trim());
      } else {
        await this.mfa.verify(this.code.trim());
      }
      this.auth.completeMfa();
      this.notify.success('Verified', '2FA check passed.');
      this.router.navigate(['/']);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Invalid code';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  async skipSetup() {
    this.busy = true;
    this.error = '';
    this.cdr.markForCheck();
    try {
      await this.mfa.skip();
      this.auth.completeMfa();
      this.notify.success('Skipped', 'You can enable 2FA later from Security Center.');
      this.router.navigate(['/']);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not skip';
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  toggleBackupMode() {
    this.useBackup = !this.useBackup;
    this.error = '';
    this.cdr.markForCheck();
  }
}
