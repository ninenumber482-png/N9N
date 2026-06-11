import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from 'src/app/core/services/admin.service';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { InputTextModule } from 'primeng/inputtext';
import { environment } from 'src/environments/environment';
import { PageHeaderComponent } from 'src/app/shared/components/page-header/page-header.component';
import { LoadingErrorComponent } from 'src/app/shared/components/loading-error/loading-error.component';
import { RefreshButtonComponent } from 'src/app/shared/components/refresh-button/refresh-button.component';

interface ConfigEntry {
  key: string;
  value: string;
  updated_at: string;
}

@Component({
  selector: 'app-system',
  standalone: true,
  imports: [CommonModule, FormsModule,
    WibDatePipe, InputTextModule,
    PageHeaderComponent, LoadingErrorComponent, RefreshButtonComponent],
  template: `
    <div data-page="system" class="space-y-6">
      <app-page-header icon="cog-6-tooth" title="System Control" subtitle="Platform configuration and operational controls">
        <app-refresh-button [loading]="loading" (clicked)="load()" />
      </app-page-header>

      <app-loading-error [loading]="loading" [error]="error" (retry)="load()" />

      @if (!loading && !error) {
        <!-- Marketplace + Maintenance Controls -->
        <div class="bg-card border border-border rounded-lg">
          <div class="border-b border-border px-5 py-3.5">
            <h3 class="text-sm font-medium text-foreground">Marketplace Control</h3>
          </div>
          <div class="divide-y divide-border">
            <!-- King Status -->
            <div class="flex items-center justify-between px-5 py-3.5">
              <div class="flex items-center gap-3">
                <span class="text-base">🎮</span>
                <div>
                  <p class="text-sm text-foreground">3D King Marketplace</p>
                  <p class="text-[11px] text-muted-foreground">Engine tetap berjalan saat marketplace ditutup</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-[11px] text-muted-foreground">{{ kingStatus === 'OPEN' ? 'Open' : 'Closed' }}</span>
                <button
                  (click)="toggleKing()"
                  [disabled]="saving"
                  class="px-3 py-1.5 rounded text-xs text-foreground bg-muted hover:bg-muted/60 transition-colors disabled:opacity-50">
                  {{ saving ? '...' : kingStatus === 'OPEN' ? 'Close' : 'Open' }}
                </button>
              </div>
            </div>

            <!-- Maintenance -->
            <div class="flex items-center justify-between px-5 py-3.5">
              <div class="flex items-center gap-3">
                <span class="text-base">🔧</span>
                <div>
                  <p class="text-sm text-foreground">Maintenance Mode</p>
                  <p class="text-[11px] text-muted-foreground">Block user access during maintenance</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-[11px] text-muted-foreground">{{ maintenanceMode ? 'On' : 'Off' }}</span>
                <button
                  (click)="toggleMaintenance()"
                  [disabled]="saving"
                  class="px-3 py-1.5 rounded text-xs text-foreground bg-muted hover:bg-muted/60 transition-colors disabled:opacity-50">
                  {{ saving ? '...' : maintenanceMode ? 'Disable' : 'Enable' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Engine Status -->
        <div class="bg-card border border-border rounded-lg">
          <div class="border-b border-border px-5 py-3.5">
            <h3 class="text-sm font-medium text-foreground">Engine Status</h3>
          </div>
          <div class="p-5">
            @if (engineData) {
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[11px]">
                <div>
                  <p class="text-muted-foreground mb-0.5">Status</p>
                  <p class="font-mono text-foreground">{{ engineData.engine_status }}</p>
                </div>
                <div>
                  <p class="text-muted-foreground mb-0.5">Last Settlement</p>
                  <p class="font-mono text-foreground">
                    {{ engineData.last_settlement ? (engineData.last_settlement | wibDate: 'short') : '—' }}
                  </p>
                </div>
                <div>
                  <p class="text-muted-foreground mb-0.5">Result Age</p>
                  <p class="font-mono text-foreground">
                    {{ engineData.result_age_sec ? engineData.result_age_sec + 's' : '—' }}
                  </p>
                </div>
                <div>
                  <p class="text-muted-foreground mb-0.5">Watchdog</p>
                  <p class="font-mono text-foreground">
                    {{ engineData.last_watchdog ? (engineData.last_watchdog | wibDate: 'short') : '—' }}
                  </p>
                </div>
              </div>
            } @else {
              <p class="text-[11px] text-muted-foreground">No engine data available</p>
            }
          </div>
        </div>

        <!-- Config Table -->
        <div class="bg-card border border-border rounded-lg overflow-hidden">
          <div class="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <h3 class="text-sm font-medium text-foreground">Configuration</h3>
            <button
              (click)="openAddForm()"
              class="px-2.5 py-1 rounded text-xs text-foreground bg-muted hover:bg-muted/60 transition-colors">
              + Add
            </button>
          </div>
          @if (addForm.open) {
            <div class="px-5 py-3.5 border-b border-border bg-accent/10 flex flex-wrap gap-2 items-end">
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold text-muted-foreground uppercase tracking-wider">Config Key</label>
                <input pInputText [(ngModel)]="addForm.key" placeholder="e.g. max_bet_amount" class="!text-xs !py-1.5 !px-2.5 !w-44" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold text-muted-foreground uppercase tracking-wider">Value</label>
                <input pInputText [(ngModel)]="addForm.value" placeholder="Value" class="!text-xs !py-1.5 !px-2.5 !w-44" />
              </div>
              <div class="flex gap-1.5">
                <button
                  (click)="submitAddConfig()"
                  [disabled]="!addForm.key.trim() || saving"
                  class="bg-foreground text-background rounded px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50">
                  {{ saving ? '...' : 'Save' }}
                </button>
                <button
                  (click)="addForm = { open: false, key: '', value: '' }"
                  class="bg-card border-border text-muted-foreground rounded border px-2.5 py-1.5 text-[11px] font-medium">
                  Cancel
                </button>
              </div>
            </div>
          }
          <table class="saas-table w-full text-left text-[11px]">
            <thead>
              <tr class="border-b border-border text-muted-foreground uppercase tracking-wider text-xs bg-muted/10">
                <th class="px-3 py-2.5">Key</th>
                <th class="px-3 py-2.5">Value</th>
                <th class="px-3 py-2.5">Updated</th>
                <th class="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              @for (c of configs; track c.key) {
                <tr class="border-b border-border">
                  <td class="px-3 py-2 font-mono text-foreground">{{ c.key }}</td>
                  <td class="px-3 py-2">
                    @if (editingKey === c.key) {
                      <input
                        [(ngModel)]="editingValue"
                        class="bg-card border border-border text-foreground rounded px-2 py-1 text-xs outline-none w-full" />
                    } @else {
                      <span class="text-muted-foreground">{{ c.value }}</span>
                    }
                  </td>
                  <td class="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {{ c.updated_at | wibDate: 'short' }}
                  </td>
                  <td class="px-3 py-2">
                    @if (editingKey === c.key) {
                      <button
                        (click)="saveConfig(c.key)"
                        class="text-[11px] text-foreground hover:text-muted-foreground mr-2">
                        Save
                      </button>
                      <button (click)="cancelEdit()" class="text-[11px] text-muted-foreground hover:text-foreground">
                        Cancel
                      </button>
                    } @else {
                      <button (click)="startEdit(c)" class="text-[11px] text-foreground hover:text-muted-foreground">
                        Edit
                      </button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="4" class="text-center py-10 text-muted-foreground">No configuration</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <!-- EC2 Server Monitor — selalu tampil, independen dari loading configs -->
      <div class="bg-card border border-border rounded-lg">
        <div class="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h3 class="text-sm font-medium text-foreground">EC2 Server Monitor</h3>
          <span
            class="flex items-center gap-1.5 text-[11px]"
            [class.text-green-500]="serverStatus === 'online'"
            [class.text-red-500]="serverStatus === 'offline'"
            [class.text-muted-foreground]="serverStatus === 'loading'">
            <span
              class="inline-block w-1.5 h-1.5 rounded-full"
              [class.bg-green-500]="serverStatus === 'online'"
              [class.bg-red-500]="serverStatus === 'offline'"
              [class.bg-muted-foreground]="serverStatus === 'loading'">
            </span>
            {{ serverStatus === 'online' ? 'Online' : serverStatus === 'offline' ? 'Offline' : 'Connecting...' }}
          </span>
        </div>
        <div class="p-5">
          <div class="grid grid-cols-2 gap-4 text-[11px]">
            <div>
              <p class="text-muted-foreground mb-1">CPU Usage</p>
              <p class="font-mono text-foreground text-base font-semibold">
                {{ serverData ? serverData.cpu.toFixed(1) + '%' : '—' }}
              </p>
              @if (serverData) {
                <div class="mt-1.5 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-500"
                    [style.width.%]="serverData.cpu"
                    [class.bg-green-500]="serverData.cpu < 70"
                    [class.bg-yellow-500]="serverData.cpu >= 70 && serverData.cpu < 90"
                    [class.bg-red-500]="serverData.cpu >= 90"></div>
                </div>
              }
            </div>
            <div>
              <p class="text-muted-foreground mb-1">RAM Usage</p>
              <p class="font-mono text-foreground text-base font-semibold">
                {{ serverData ? serverData.ram.toFixed(1) + '%' : '—' }}
              </p>
              @if (serverData) {
                <div class="mt-1.5 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-500"
                    [style.width.%]="serverData.ram"
                    [class.bg-green-500]="serverData.ram < 70"
                    [class.bg-yellow-500]="serverData.ram >= 70 && serverData.ram < 90"
                    [class.bg-red-500]="serverData.ram >= 90"></div>
                </div>
              }
            </div>
          </div>
          <p class="text-[11px] text-muted-foreground mt-3">Auto-refresh setiap 5 detik via Cloudflare Worker</p>
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SystemComponent implements OnInit, OnDestroy {
  private admin = inject(AdminService);
  private cdr = inject(ChangeDetectorRef);

  configs: ConfigEntry[] = [];
  maintenanceMode = false;
  kingStatus = 'OPEN';
  engineData: any = null;
  loading = true;
  error: string | null = null;
  saving = false;
  editingKey: string | null = null;
  editingValue = '';
  addForm = { open: false, key: '', value: '' };

  serverData: { cpu: number; ram: number } | null = null;
  serverStatus: 'loading' | 'online' | 'offline' | 'error' = 'loading';
  private serverPollTimer!: ReturnType<typeof setInterval>;
  private consecutiveErrors = 0;
  private maxRetries = 3;

  ngOnInit() {
    this.load();
    this.pollServer();
    this.serverPollTimer = setInterval(() => this.pollServer(), 5000);
  }

  ngOnDestroy() {
    if (this.serverPollTimer) {
      clearInterval(this.serverPollTimer);
    }
  }

  private async pollServer() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(environment.serverMonitorUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();

      if (typeof data.cpu === 'number' && typeof data.ram === 'number') {
        this.serverData = {
          cpu: Math.max(0, Math.min(100, data.cpu)),
          ram: Math.max(0, Math.min(100, data.ram))
        };
        this.serverStatus = 'online';
        this.consecutiveErrors = 0;
      } else {
        throw new Error('Invalid server response format');
      }
    } catch (error) {
      console.warn('Server monitor poll failed:', error);
      this.consecutiveErrors++;

      if (this.consecutiveErrors >= this.maxRetries) {
        this.serverStatus = 'offline';
        this.serverData = null;
      } else if (this.serverStatus === 'loading') {
        this.serverStatus = 'error';
      }
    }
    this.cdr.markForCheck();
  }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      const [configs, engineRows] = await Promise.all([this.admin.getConfigs(), this.admin.getEngineStatus()]);
      this.configs = configs;
      this.engineData = engineRows?.[0] || null;
      this.maintenanceMode = configs.find((c: ConfigEntry) => c.key === 'maintenance_mode')?.value === 'true';
      this.kingStatus = configs.find((c: ConfigEntry) => c.key === 'king_marketplace')?.value || 'OPEN';
    } catch (e: unknown) {
      this.error = (e instanceof Error ? e.message : '') || 'Could not load system data';
    }
    this.loading = false;
    this.cdr.markForCheck();
  }

  startEdit(c: ConfigEntry) {
    this.editingKey = c.key;
    this.editingValue = c.value;
  }
  cancelEdit() {
    this.editingKey = null;
    this.editingValue = '';
  }

  async saveConfig(key: string) {
    this.saving = true;
    try {
      const existing = await this.admin.getConfig(key);
      if (existing) {
        await this.admin.updateConfig(key, this.editingValue);
      } else {
        await this.admin.insertConfig({ key, value: this.editingValue });
      }
      const c = this.configs.find((x: ConfigEntry) => x.key === key);
      if (c) {
        c.value = this.editingValue;
        c.updated_at = new Date().toISOString();
      }
      if (key === 'maintenance_mode') this.maintenanceMode = this.editingValue === 'true';
      if (key === 'king_marketplace') this.kingStatus = this.editingValue;
      this.editingKey = null;
    } catch (e: unknown) {
      this.error = (e instanceof Error ? e.message : '') || 'Failed to save config';
    }
    this.saving = false;
    this.cdr.markForCheck();
  }

  async toggleKing() {
    const newVal = this.kingStatus === 'OPEN' ? 'CLOSED' : 'OPEN';
    this.saving = true;
    try {
      const existing = await this.admin.getConfig('king_marketplace');
      if (existing) {
        await this.admin.updateConfig('king_marketplace', newVal);
      } else {
        await this.admin.insertConfig({ key: 'king_marketplace', value: newVal });
      }
      this.kingStatus = newVal;
    } catch (e: unknown) {
      this.error = (e instanceof Error ? e.message : '') || 'Failed';
    }
    this.saving = false;
    this.cdr.markForCheck();
  }

  async toggleMaintenance() {
    const newVal = this.maintenanceMode ? 'false' : 'true';
    this.saving = true;
    try {
      const existing = await this.admin.getConfig('maintenance_mode');
      if (existing) {
        await this.admin.updateConfig('maintenance_mode', newVal);
      } else {
        await this.admin.insertConfig({ key: 'maintenance_mode', value: newVal });
      }
      this.maintenanceMode = newVal === 'true';
      const c = this.configs.find((x: ConfigEntry) => x.key === 'maintenance_mode');
      if (c) {
        c.value = newVal;
        c.updated_at = new Date().toISOString();
      } else {
        this.configs.unshift({ key: 'maintenance_mode', value: newVal, updated_at: new Date().toISOString() });
      }
    } catch (e: unknown) {
      this.error = (e instanceof Error ? e.message : '') || 'Failed to toggle maintenance';
    }
    this.saving = false;
    this.cdr.markForCheck();
  }

  openAddForm() {
    this.addForm = { open: true, key: '', value: '' };
    this.cdr.markForCheck();
  }

  async submitAddConfig() {
    const key = this.addForm.key.trim();
    if (!key) return;
    if (this.configs.some(c => c.key === key)) {
      this.error = 'Config key already exists';
      this.cdr.markForCheck();
      return;
    }
    this.saving = true;
    this.cdr.markForCheck();
    try {
      await this.admin.insertConfig({ key, value: this.addForm.value });
      this.configs.unshift({ key, value: this.addForm.value, updated_at: new Date().toISOString() });
      this.addForm = { open: false, key: '', value: '' };
    } catch (e: unknown) {
      this.error = (e instanceof Error ? e.message : '') || 'Failed to add config';
    }
    this.saving = false;
    this.cdr.markForCheck();
  }
}
