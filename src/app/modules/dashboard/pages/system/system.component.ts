import { AngularSvgIconModule } from 'angular-svg-icon';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from 'src/app/core/services/admin.service';
import { WibDatePipe } from 'src/app/shared/pipes/wib-date.pipe';
import { InputTextModule } from 'primeng/inputtext';
import { environment } from 'src/environments/environment';

interface ConfigEntry {
  key: string;
  value: string;
  updated_at: string;
}

@Component({
  selector: 'app-system',
  standalone: true,
  imports: [CommonModule, FormsModule,
    AngularSvgIconModule, WibDatePipe, InputTextModule],
  template: `
    <div data-page="system" class="space-y-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="page-header-icon"><svg-icon src="assets/icons/heroicons/outline/cog-6-tooth.svg" svgClass="h-4 w-4"></svg-icon></div>
          <div>
            <h1 class="max-sm:text-lg sm:text-xl font-bold text-foreground tracking-tight">System Control</h1>
            <p class="text-muted-foreground mt-0.5 text-xs">Platform configuration and operational controls</p>
          </div>
        </div>
        <button
          (click)="load()"
          [disabled]="loading"
          class="bg-card border-border text-muted-foreground hover:text-foreground rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50">
          <svg class="h-3.5 w-3.5" [class.animate-spin]="loading" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      @if (loading) {
        <div class="bg-card border border-border page-accent-card rounded-lg p-5" style="border-top: 3px solid #737373;">
          <div class="space-y-3">
            @for (_ of [1, 2, 3, 4, 5]; track _) {
              <div class="h-10 rounded-lg bg-muted/20"></div>
            }
          </div>
        </div>
      } @else if (error) {
        <div class="bg-card border border-border rounded-lg p-5 text-center">
          <p class="text-sm text-muted-foreground">{{ error }}</p>
          <button
            (click)="load()"
            class="mt-3 px-4 py-1.5 rounded text-xs text-foreground bg-muted hover:bg-muted/60 transition-colors">
            Retry
          </button>
        </div>
      } @else {
        <!-- Marketplace + Maintenance Controls -->
        <div class="bg-card border border-border rounded-lg">
          <div class="border-b border-border px-4 py-3">
            <h3 class="text-sm font-medium text-foreground">Marketplace Control</h3>
          </div>
          <div class="divide-y divide-border">
            <!-- King Status -->
            <div class="flex items-center justify-between px-4 py-3">
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
            <div class="flex items-center justify-between px-4 py-3">
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
          <div class="border-b border-border px-4 py-3">
            <h3 class="text-sm font-medium text-foreground">Engine Status</h3>
          </div>
          <div class="p-4">
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
          <div class="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 class="text-sm font-medium text-foreground">Configuration</h3>
            <button
              (click)="openAddForm()"
              class="px-2.5 py-1 rounded text-xs text-foreground bg-muted hover:bg-muted/60 transition-colors">
              + Add
            </button>
          </div>
          @if (addForm.open) {
            <div class="px-4 py-3 border-b border-border bg-accent/10 flex flex-wrap gap-2 items-end">
              <div class="flex flex-col gap-1">
                <label class="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Config Key</label>
                <input pInputText [(ngModel)]="addForm.key" placeholder="e.g. max_bet_amount" class="!text-xs !py-1.5 !px-2.5 !w-44" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Value</label>
                <input pInputText [(ngModel)]="addForm.value" placeholder="Value" class="!text-xs !py-1.5 !px-2.5 !w-44" />
              </div>
              <div class="flex gap-1.5">
                <button
                  (click)="submitAddConfig()"
                  [disabled]="!addForm.key.trim() || saving"
                  class="bg-foreground text-background rounded px-3 py-1.5 text-[10px] font-semibold disabled:opacity-50">
                  {{ saving ? '...' : 'Save' }}
                </button>
                <button
                  (click)="addForm = { open: false, key: '', value: '' }"
                  class="bg-card border-border text-muted-foreground rounded border px-2.5 py-1.5 text-[10px] font-medium">
                  Cancel
                </button>
              </div>
            </div>
          }
          <table class="w-full text-left text-[11px]">
            <thead>
              <tr class="border-b border-border text-muted-foreground uppercase tracking-wider text-[9px] bg-muted/10">
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
                        class="text-[10px] text-foreground hover:text-muted-foreground mr-2">
                        Save
                      </button>
                      <button (click)="cancelEdit()" class="text-[10px] text-muted-foreground hover:text-foreground">
                        Cancel
                      </button>
                    } @else {
                      <button (click)="startEdit(c)" class="text-[10px] text-foreground hover:text-muted-foreground">
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
        <div class="flex items-center justify-between border-b border-border px-4 py-3">
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
        <div class="p-4">
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
          <p class="text-[10px] text-muted-foreground mt-3">Auto-refresh setiap 5 detik via Cloudflare Worker</p>
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
  serverStatus: 'loading' | 'online' | 'offline' = 'loading';
  private serverPollTimer!: ReturnType<typeof setInterval>;

  ngOnInit() {
    this.load();
    this.pollServer();
    this.serverPollTimer = setInterval(() => this.pollServer(), 5000);
  }

  ngOnDestroy() {
    clearInterval(this.serverPollTimer);
  }

  private async pollServer() {
    try {
      const res = await fetch(environment.serverMonitorUrl);
      if (!res.ok) throw new Error('upstream');
      const data = await res.json();
      this.serverData = data;
      this.serverStatus = 'online';
    } catch {
      this.serverStatus = 'offline';
      this.serverData = null;
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
