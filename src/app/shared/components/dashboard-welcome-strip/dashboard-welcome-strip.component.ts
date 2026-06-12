import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { APP_META, SECURITY_STACK } from 'src/app/core/constants/app-meta';
import { AuthService } from 'src/app/core/services/auth.service';
import { MfaService } from 'src/app/core/services/mfa.service';

const STORAGE_KEY = 'n9_dashboard_welcome_seen';

@Component({
  selector: 'app-dashboard-welcome-strip',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (visible) {
      <div class="n9-welcome-strip" role="dialog" aria-labelledby="n9-welcome-title" aria-modal="false">
        <div class="n9-welcome-strip__panel">
          <div class="n9-welcome-strip__head">
            <div>
              <p id="n9-welcome-title" class="n9-welcome-strip__title">
                {{ app.name }} <span class="n9-welcome-strip__ver">v{{ app.version }}</span>
              </p>
              <p class="n9-welcome-strip__channel">{{ app.channel }}</p>
            </div>
            <button type="button" class="n9-welcome-strip__close" (click)="dismiss()" aria-label="Tutup">✕</button>
          </div>

          <p class="n9-welcome-strip__label">Sistem keamanan</p>
          <ul class="n9-welcome-strip__stack">
            @for (item of stack; track item.key) {
              <li>
                <span class="n9-welcome-strip__dot" aria-hidden="true"></span>
                {{ item.label }}
              </li>
            }
          </ul>

          @if (mfaLabel) {
            <p class="n9-welcome-strip__mfa">
              Status 2FA akun Anda: <strong>{{ mfaLabel }}</strong>
            </p>
          }

          <div class="n9-welcome-strip__actions">
            <button type="button" class="n9-welcome-strip__btn" (click)="dismiss()">Mengerti</button>
          </div>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardWelcomeStripComponent implements OnInit {
  private auth = inject(AuthService);
  private mfa = inject(MfaService);
  private cdr = inject(ChangeDetectorRef);

  readonly app = APP_META;
  readonly stack = SECURITY_STACK;

  visible = false;
  mfaLabel = '';

  ngOnInit(): void {
    if (sessionStorage.getItem(STORAGE_KEY)) return;
    this.visible = true;
    void this.loadMfaStatus();
    this.cdr.markForCheck();
  }

  private async loadMfaStatus() {
    if (!this.auth.getCurrentUser()?.token) return;
    try {
      const s = await this.mfa.status();
      if (s.totpEnabled) this.mfaLabel = 'Aktif';
      else if (s.totpSkipped) this.mfaLabel = 'Dilewati — disarankan aktifkan';
      else this.mfaLabel = 'Belum diatur';
    } catch {
      this.mfaLabel = '';
    }
    this.cdr.markForCheck();
  }

  dismiss() {
    sessionStorage.setItem(STORAGE_KEY, '1');
    this.visible = false;
    this.cdr.markForCheck();
  }
}
