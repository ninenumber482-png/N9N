import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { SecurityService } from 'src/app/core/services/security.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-sign-in',
  standalone: true,
  templateUrl: './sign-in.component.html',
  styleUrls: ['./sign-in.component.css'],
  imports: [CommonModule, ReactiveFormsModule, FormsModule, AngularSvgIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInComponent implements OnInit {
  private readonly _formBuilder = inject(FormBuilder);
  private readonly _router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly securityService = inject(SecurityService);
  private readonly cdr = inject(ChangeDetectorRef);

  form!: FormGroup;
  submitted = false;
  passwordVisible = false;
  isLoading = false;
  ipBlocked = false;
  blockedIp = '';
  checkingIp = true;
  unlockKey = '';
  unlocking = false;
  unlockError = '';
  unlockSuccess = false;

  async ngOnInit(): Promise<void> {
    this.form = this._formBuilder.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', Validators.required],
    });

    if (typeof window === 'undefined') {
      this.checkingIp = false;
      this.cdr.markForCheck();
      return;
    }

    try {
      const ipRes = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipRes.json();
      const clientIp: string = ipData.ip || '';
      this.blockedIp = clientIp;

      const whitelistRes = await fetch(`${environment.supabaseUrl}/rest/v1/rpc/is_ip_allowed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: environment.supabaseKey,
          Authorization: `Bearer ${environment.supabaseKey}`,
        },
        body: JSON.stringify({ p_ip: clientIp }),
      });
      if (!whitelistRes.ok) {
        this.ipBlocked = true;
        return;
      }
      const allowed = await whitelistRes.json();
      this.ipBlocked = allowed !== true;
    } catch {
      this.ipBlocked = true;
    } finally {
      this.checkingIp = false;
      this.cdr.markForCheck();
    }
  }

  get f() {
    return this.form.controls;
  }

  togglePasswordVisibility() {
    this.passwordVisible = !this.passwordVisible;
  }

  async emergencyUnlock() {
    if (!this.unlockKey.trim()) return;
    this.unlocking = true;
    this.unlockError = '';
    this.unlockSuccess = false;
    try {
      const formData = new FormData();
      formData.append('gateway_key', this.unlockKey.trim());
      const res = await fetch('/', { method: 'POST', body: formData });
      if (res.ok || res.status === 302) {
        this.unlockSuccess = true;
        this.unlockKey = '';
        setTimeout(() => window.location.reload(), 1500);
      } else {
        const html = await res.text();
        this.unlockError = html.includes('salah') ? 'Gateway key salah.' : 'Gagal mendaftarkan IP. Coba lagi.';
      }
    } catch {
      this.unlockError = 'Gagal terhubung ke server.';
    } finally {
      this.unlocking = false;
      this.cdr.markForCheck();
    }
  }

  async onSubmit() {
    this.submitted = true;

    if (this.form.invalid) {
      return;
    }

    const { username, password } = this.form.value;

    // Synchronous validation runs BEFORE the loading flag, so `isLoading` is
    // never toggled true→false within a single change-detection pass (NG0100).
    if (!this.securityService.isValidUsername(username)) {
      this.notificationService.error(
        'Invalid username format',
        'Username must be 3-20 characters (letters, numbers, underscore, dash)',
      );
      return;
    }

    if (!password || password.length < 1) {
      this.notificationService.error('Password is required', 'Please enter your password.');
      return;
    }

    this.isLoading = true;
    const credentials = { username, password };

    try {
      const result = await this.authService.authenticate(credentials);

      if (result?.success) {
        this.authService.login(
          {
            id: result.user?.id,
            username,
            isAuthenticated: true,
            role: result.user?.role,
            email: result.user?.email,
            unlimited: result.user?.unlimited,
            token: result.token,
          },
        );
        this.notificationService.success(`Welcome, ${username}!`, result.message || 'You have successfully logged in.');
        this._router.navigate(['/']);
      } else {
        this.notificationService.error(
          'Invalid username or password',
          result?.error || 'Please check your credentials and try again.',
        );
      }
    } catch {
      this.notificationService.error('Connection error', 'Unable to reach the authentication server.');
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck(); // zoneless app: async state change needs an explicit CD
    }
  }
}
