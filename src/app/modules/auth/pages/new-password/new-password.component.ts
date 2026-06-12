import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AngularSvgIconModule } from 'angular-svg-icon';
import { AdminService } from 'src/app/core/services/admin.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';

@Component({
  selector: 'app-new-password',
  standalone: true,
  templateUrl: './new-password.component.html',
  styleUrls: ['./new-password.component.css'],
  imports: [CommonModule, ReactiveFormsModule, RouterLink, AngularSvgIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NewPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly adminService = inject(AdminService);
  private readonly notificationService = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);

  form!: FormGroup;
  submitted = false;
  passwordVisible = false;
  confirmVisible = false;
  isLoading = false;

  ngOnInit(): void {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/auth/sign-in']);
      return;
    }
    this.form = this.fb.group(
      {
        oldPassword: ['', Validators.required],
        newPassword: ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', Validators.required],
      },
      { validators: this.passwordMatchValidator },
    );
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

    const user = this.authService.getCurrentUser();
    if (!user) {
      this.notificationService.error('Session expired');
      this.router.navigate(['/auth/sign-in']);
      return;
    }

    this.isLoading = true;
    try {
      await this.adminService.changeOwnPassword(
        user.username,
        this.f['oldPassword'].value,
        this.f['newPassword'].value,
      );
      this.notificationService.success('Password updated successfully');
      this.router.navigate(['/overview']);
    } catch (e: unknown) {
      this.notificationService.error(e instanceof Error ? e.message : 'Failed to update password');
    }
    this.isLoading = false;
    this.cdr.markForCheck();
  }
}
