import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from 'src/app/core/services/admin.service';
import { AuthService } from 'src/app/core/services/auth.service';
import { NotificationService } from 'src/app/core/services/notification.service';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { LoadingErrorComponent } from 'src/app/shared/components/loading-error/loading-error.component';

@Component({
  selector: 'app-cs-contact',
  standalone: true,
  imports: [PageHeaderComponent, LoadingErrorComponent, CommonModule, FormsModule],
  template: `
    <div data-page="cs-contact" class="space-y-6">
      <app-page-header
        icon="user-circle"
        title="Customer Service Contact"
        subtitle="Configure the customer service widget on the platform" />

      <app-loading-error [loading]="loading" [error]="error" (retry)="load()" />

      @if (!loading && !error) {
        <div class="grid gap-6 lg:grid-cols-2">
          <!-- Settings Form -->
          <div class="bg-card border-border rounded-lg p-5">
            <h3 class="text-sm font-bold text-foreground mb-1">CS Channels</h3>
            <p class="text-muted-foreground text-[11px] mb-4">
              Widget hanya tampil untuk user login. Tiap channel punya ON/OFF sendiri; channel OFF
              tidak muncul ke user. Kalau dua-duanya OFF (atau Widget Active OFF), widget hilang.
            </p>

            <div class="space-y-4">
              <div>
                <label class="text-muted-foreground text-xs font-semibold uppercase tracking-wider block mb-1"
                  >WhatsApp Number <span class="text-destructive">*</span></label
                >
                <input
                  [(ngModel)]="form.wa_number"
                  placeholder="e.g. 13088802313 (without +)"
                  class="bg-muted border-border text-foreground rounded-lg border px-3 py-2.5 text-sm outline-none w-full focus:border-primary/50 transition-colors" />
                <p class="text-muted-foreground text-[11px] mt-1">International format, no leading + or spaces</p>
              </div>

              <div class="flex items-center gap-3">
                <label class="relative inline-flex cursor-pointer items-center">
                  <input type="checkbox" [(ngModel)]="form.wa_active" class="peer sr-only" />
                  <div
                    class="peer h-6 w-11 rounded-full bg-zinc-700 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full"></div>
                </label>
                <span class="text-sm font-semibold text-foreground">WhatsApp Active</span>
              </div>

              <div class="border-border border-t pt-4">
                <label class="text-muted-foreground text-xs font-semibold uppercase tracking-wider block mb-1"
                  >Telegram Link</label
                >
                <input
                  [(ngModel)]="form.telegram_link"
                  placeholder="e.g. https://t.me/your_cs"
                  class="bg-muted border-border text-foreground rounded-lg border px-3 py-2.5 text-sm outline-none w-full focus:border-primary/50 transition-colors" />
                <p class="text-muted-foreground text-[11px] mt-1">Full Telegram URL (https://t.me/...)</p>
              </div>

              <div class="flex items-center gap-3">
                <label class="relative inline-flex cursor-pointer items-center">
                  <input type="checkbox" [(ngModel)]="form.telegram_active" class="peer sr-only" />
                  <div
                    class="peer h-6 w-11 rounded-full bg-zinc-700 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-sky-500 peer-checked:after:translate-x-full"></div>
                </label>
                <span class="text-sm font-semibold text-foreground">Telegram Active</span>
              </div>

              <div class="border-border border-t pt-4">
                <label class="text-muted-foreground text-xs font-semibold uppercase tracking-wider block mb-1"
                  >Display Name</label
                >
                <input
                  [(ngModel)]="form.display_name"
                  placeholder="e.g. Customer Service"
                  class="bg-muted border-border text-foreground rounded-lg border px-3 py-2.5 text-sm outline-none w-full focus:border-primary/50 transition-colors" />
              </div>

              <div>
                <label class="text-muted-foreground text-xs font-semibold uppercase tracking-wider block mb-1"
                  >Welcome Message</label
                >
                <input
                  [(ngModel)]="form.welcome_message"
                  placeholder="e.g. Hello, I need assistance."
                  class="bg-muted border-border text-foreground rounded-lg border px-3 py-2.5 text-sm outline-none w-full focus:border-primary/50 transition-colors" />
              </div>

              <div>
                <label class="text-muted-foreground text-xs font-semibold uppercase tracking-wider block mb-1"
                  >Avatar URL</label
                >
                <input
                  [(ngModel)]="form.avatar_url"
                  placeholder="e.g. https://example.com/avatar.png"
                  class="bg-muted border-border text-foreground rounded-lg border px-3 py-2.5 text-sm outline-none w-full focus:border-primary/50 transition-colors" />
              </div>

              <div class="flex items-center gap-3">
                <label class="relative inline-flex cursor-pointer items-center">
                  <input type="checkbox" [(ngModel)]="form.active" class="peer sr-only" />
                  <div
                    class="peer h-6 w-11 rounded-full bg-zinc-700 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full"></div>
                </label>
                <span class="text-sm font-semibold text-foreground">Widget Active</span>
              </div>

              <div class="flex gap-3 pt-2">
                <button
                  (click)="save()"
                  [disabled]="saving"
                  class="bg-primary text-primary-foreground hover:bg-primary/80 rounded-lg px-5 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 flex items-center gap-2">
                  @if (saving) {
                    <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  }
                  {{ saving ? 'Saving…' : 'Save Changes' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Preview + Info -->
          <div class="space-y-4">
            <div class="bg-card border-border rounded-lg p-5">
              <h3 class="text-sm font-bold text-foreground mb-4">Widget Preview</h3>
              @if (form.active && ((form.wa_active && form.wa_number) || (form.telegram_active && form.telegram_link))) {
                <div class="flex flex-col items-center gap-3 py-6">
                  <div class="relative">
                    <div class="h-16 w-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      @if (form.avatar_url) {
                        <img [src]="form.avatar_url" class="h-16 w-16 rounded-full object-cover" />
                      } @else {
                        <svg class="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      }
                    </div>
                    <div
                      class="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-emerald-500 border-2 border-card flex items-center justify-center">
                      <svg class="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fill-rule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clip-rule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <div class="text-center">
                    <p class="text-sm font-bold text-foreground">{{ form.display_name || 'Customer Service' }}</p>
                    <p class="text-xs text-muted-foreground mt-1">Online</p>
                  </div>
                  <div class="flex w-full flex-col gap-2">
                    @if (form.telegram_active && form.telegram_link) {
                      <a
                        [href]="form.telegram_link"
                        target="_blank"
                        class="bg-sky-500 hover:bg-sky-400 text-white rounded-xl px-6 py-2.5 text-sm font-bold transition-colors flex items-center justify-center gap-2">
                        Chat via Telegram
                      </a>
                    }
                    @if (form.wa_active && form.wa_number) {
                      <a
                        [href]="'https://wa.me/' + form.wa_number + '?text=' + encodeURI(form.welcome_message)"
                        target="_blank"
                        class="bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl px-6 py-2.5 text-sm font-bold transition-colors flex items-center justify-center gap-2">
                        Chat via WhatsApp
                      </a>
                    }
                  </div>
                </div>
              } @else {
                <div class="py-8 text-center">
                  <svg
                    class="h-12 w-12 mx-auto text-zinc-600 mb-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p class="text-muted-foreground text-sm">
                    Aktifkan Widget + minimal satu channel (WhatsApp/Telegram) untuk melihat preview
                  </p>
                </div>
              }
            </div>

            <div class="bg-card border-border rounded-lg p-5">
              <h3 class="text-sm font-bold text-foreground mb-2">Quick Links</h3>
              <div class="space-y-2">
                @if (form.telegram_link) {
                  <a
                    [href]="form.telegram_link"
                    target="_blank"
                    class="flex items-center gap-3 rounded-lg border border-border p-3 text-sm font-semibold text-foreground hover:bg-sky-500/5 hover:border-sky-500/30 transition-colors">
                    <span class="text-sky-400">✈</span>
                    Open Telegram Direct
                  </a>
                }
                @if (form.wa_number) {
                  <a
                    [href]="'https://wa.me/' + form.wa_number"
                    target="_blank"
                    class="flex items-center gap-3 rounded-lg border border-border p-3 text-sm font-semibold text-foreground hover:bg-emerald-500/5 hover:border-emerald-500/30 transition-colors">
                    <svg class="h-5 w-5 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    Open WhatsApp Direct
                  </a>
                }
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsContactComponent implements OnInit {
  private admin = inject(AdminService);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private notification = inject(NotificationService);

  form = {
    wa_number: '',
    wa_active: false,
    telegram_link: '',
    telegram_active: false,
    display_name: 'Customer Service',
    welcome_message: 'Hello, I need assistance.',
    avatar_url: '',
    active: false,
  };
  loading = true;
  error: string | null = null;
  saving = false;

  ngOnInit() {
    this.load();
  }

  encodeURI(s: string) {
    return encodeURIComponent(s);
  }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      const configs = await this.admin.getConfigs();
      const map: Record<string, string> = {};
      for (const c of configs) map[c.key] = c.value;
      this.form.wa_number = map['cs_wa_number'] || '';
      // cs_wa_active falls back to legacy cs_active so existing WA stays on.
      this.form.wa_active = (map['cs_wa_active'] ?? map['cs_active']) === 'true';
      this.form.telegram_link = map['cs_telegram_link'] || '';
      this.form.telegram_active = map['cs_telegram_active'] === 'true';
      this.form.display_name = map['cs_display_name'] || 'Customer Service';
      this.form.welcome_message = map['cs_welcome_message'] || 'Hello, I need assistance.';
      this.form.avatar_url = map['cs_avatar_url'] || '';
      this.form.active = map['cs_active'] !== 'false';
    } catch (e: unknown) {
      this.error = e instanceof Error ? e.message : 'Could not load CS config.';
      this.notification.error('Load failed', this.error);
    }
    this.loading = false;
    this.cdr.markForCheck();
  }

  async save() {
    this.saving = true;
    try {
      const admin = this.auth.getCurrentUser();
      const entries = [
        { key: 'cs_wa_number', value: this.form.wa_number },
        { key: 'cs_wa_active', value: this.form.wa_active ? 'true' : 'false' },
        { key: 'cs_telegram_link', value: this.form.telegram_link },
        { key: 'cs_telegram_active', value: this.form.telegram_active ? 'true' : 'false' },
        { key: 'cs_display_name', value: this.form.display_name },
        { key: 'cs_welcome_message', value: this.form.welcome_message },
        { key: 'cs_avatar_url', value: this.form.avatar_url },
        { key: 'cs_active', value: this.form.active ? 'true' : 'false' },
      ];
      for (const e of entries) {
        const existing = await this.admin.getConfig(e.key);
        if (existing) {
          await this.admin.updateConfig(e.key, e.value);
        } else {
          await this.admin.insertConfig(e);
        }
      }
      if (admin) {
        await this.admin.logAction(
          admin.username,
          'UPDATE_CS_CONTACT',
          'platform_config',
          '',
          '',
          JSON.stringify(this.form),
        );
      }
      this.notification.success('Saved', 'CS contact settings updated successfully.');
    } catch (e: unknown) {
      this.notification.error('Save failed', e instanceof Error ? e.message : 'Could not save CS config.');
    }
    this.saving = false;
    this.cdr.markForCheck();
  }
}
