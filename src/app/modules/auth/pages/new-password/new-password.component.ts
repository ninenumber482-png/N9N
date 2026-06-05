import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { SecurityService } from 'src/app/core/services/security.service';

@Component({
  selector: 'app-new-password',
  standalone: true,
  templateUrl: './new-password.component.html',
  styleUrls: ['./new-password.component.css'],
  imports: [CommonModule, ReactiveFormsModule, RouterLink, AngularSvgIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewPasswordComponent implements OnInit {
  form!: FormGroup;
  submitted = false;
  passwordVisible = false;
  confirmVisible = false;
  isLoading = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly notificationService: NotificationService,
    private readonly securityService: SecurityService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/auth/sign-in']);
      return;
    }
    this.form = this.fb.group({
      oldPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    }, { validators: this.passwordMatchValidator });
  }

  get f() {
    return this.form.controls;
  }

  passwordMatchValidator(g: FormGroup) {
    return g.get('newPassword')?.value === g.get('confirmPassword')?.value ? null : { mismatch: true };
  }

  togglePasswordVisibility() {
    this.passwordVisible = !this.passwordVisible;
  }

  toggleConfirmVisibility() {
    this.confirmVisible = !this.confirmVisible;
  }

  async onSubmit() {
    this.submitted = true;
    if (this.form.invalid) return;

    const { oldPassword, newPassword } = this.form.value;
    const user = this.authService.getCurrentUser();
    if (!user) {
      this.notificationService.error('Session expired');
      this.router.navigate(['/auth/sign-in']);
      return;
    }

    this.isLoading = true;
    try {
      // TODO: Wire to backend password change endpoint when available
      // For now, simulate success after validation
      await new Promise(r => setTimeout(r, 800));
      this.notificationService.success('Password updated successfully');
      this.router.navigate(['/overview']);
    } catch (e: any) {
      this.notificationService.error(e?.message || 'Failed to update password');
    }
    this.isLoading = false;
    this.cdr.markForCheck();
  }
}
