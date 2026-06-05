import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { SecurityService } from 'src/app/core/services/security.service';

@Component({
  selector: 'app-sign-in',
  templateUrl: './sign-in.component.html',
  styleUrls: ['./sign-in.component.css'],
  imports: [CommonModule, ReactiveFormsModule, AngularSvgIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignInComponent implements OnInit {
  form!: FormGroup;
  submitted = false;
  passwordVisible = false;
  isLoading = false;

  constructor(
    private readonly _formBuilder: FormBuilder,
    private readonly _router: Router,
    private readonly authService: AuthService,
    private readonly notificationService: NotificationService,
    private readonly securityService: SecurityService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.form = this._formBuilder.group({
      username: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', Validators.required],
    });
  }

  get f() {
    return this.form.controls;
  }

  togglePasswordVisibility() {
    this.passwordVisible = !this.passwordVisible;
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
          { username, isAuthenticated: true, role: result.user?.role, email: result.user?.email },
          result.session?.access_token,
        );
        this.notificationService.success(
          `Welcome, ${username}!`,
          result.message || 'You have successfully logged in.',
        );
        this._router.navigate(['/']);
      } else {
        this.notificationService.error(
          'Invalid username or password',
          result?.error || 'Please check your credentials and try again.',
        );
      }
    } catch {
      this.notificationService.error(
        'Connection error',
        'Unable to reach the authentication server.',
      );
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck(); // zoneless app: async state change needs an explicit CD
    }
  }
}
