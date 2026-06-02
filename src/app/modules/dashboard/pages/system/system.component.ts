import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../../core/services/admin.service';
import { WibDatePipe } from '../../../../shared/pipes/wib-date.pipe';

@Component({
  selector: 'app-system',
  standalone: true,
  imports: [CommonModule, FormsModule, WibDatePipe],
  template: `
    <div class="space-y-5">
      <div>
        <h2 class="text-lg font-semibold text-foreground tracking-tight">System Control</h2>
        <p class="text-muted-foreground text-[13px] mt-0.5">Platform configuration and operational controls</p>
      </div>

      @if (loading) {
        <div class="bg-card border border-border rounded-lg p-5">
          <div class="space-y-3">@for (_ of [1,2,3,4,5]; track _) { <div class="h-10 rounded-lg bg-muted/20"></div> }</div>
        </div>
      } @else if (error) {
        <div class="bg-card border border-border rounded-lg p-5 text-center">
          <p class="text-sm text-muted-foreground">{{ error }}</p>
          <button (click)="load()" class="mt-3 px-4 py-1.5 rounded text-xs text-foreground bg-muted hover:bg-muted/60 transition-colors">Retry</button>
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
              <button (click)="toggleKing()" [disabled]="saving"
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
              <button (click)="toggleMaintenance()" [disabled]="saving"
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
                <p class="font-mono text-foreground">{{ engineData.last_settlement ? (engineData.last_settlement | wibDate:'short') : '—' }}</p>
              </div>
              <div>
                <p class="text-muted-foreground mb-0.5">Result Age</p>
                <p class="font-mono text-foreground">{{ engineData.result_age_sec ? engineData.result_age_sec + 's' : '—' }}</p>
              </div>
              <div>
                <p class="text-muted-foreground mb-0.5">Watchdog</p>
                <p class="font-mono text-foreground">{{ engineData.last_watchdog ? (engineData.last_watchdog | wibDate:'short') : '—' }}</p>
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
          <button (click)="addConfig()" class="px-2.5 py-1 rounded text-xs text-foreground bg-muted hover:bg-muted/60 transition-colors">+ Add</button>
        </div>
        <table class="w-full text-left text-[11px]">
          <thead><tr class="border-b border-border text-muted-foreground uppercase tracking-wider text-[9px] bg-muted/10">
            <th class="px-3 py-2.5">Key</th>
            <th class="px-3 py-2.5">Value</th>
            <th class="px-3 py-2.5">Updated</th>
            <th class="px-3 py-2.5"></th>
          </tr></thead>
          <tbody>
            @for (c of configs; track c.key) {
              <tr class="border-b border-border">
                <td class="px-3 py-2 font-mono text-foreground">{{ c.key }}</td>
                <td class="px-3 py-2">
                  @if (editingKey === c.key) {
                    <input [(ngModel)]="editingValue" class="bg-card border border-border text-foreground rounded px-2 py-1 text-xs outline-none w-full" />
                  } @else {
                    <span class="text-muted-foreground">{{ c.value }}</span>
                  }
                </td>
                <td class="px-3 py-2 text-muted-foreground whitespace-nowrap">{{ c.updated_at | wibDate:'short' }}</td>
                <td class="px-3 py-2">
                  @if (editingKey === c.key) {
                    <button (click)="saveConfig(c.key)" class="text-[10px] text-foreground hover:text-muted-foreground mr-2">Save</button>
                    <button (click)="cancelEdit()" class="text-[10px] text-muted-foreground hover:text-foreground">Cancel</button>
                  } @else {
                    <button (click)="startEdit(c)" class="text-[10px] text-foreground hover:text-muted-foreground">Edit</button>
                  }
                </td>
              </tr>
            } @empty { <tr><td colspan="4" class="text-center py-10 text-muted-foreground">No configuration</td></tr> }
          </tbody>
        </table>
      </div>

      }
    </div>
  `,
})
export class SystemComponent implements OnInit {
  configs: any[] = [];
  maintenanceMode = false;
  kingStatus = 'OPEN';
  engineData: any = null;
  loading = true;
  error: string | null = null;
  saving = false;
  editingKey: string | null = null;
  editingValue = '';

  constructor(private admin: AdminService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.load(); }

  async load() {
    this.loading = true;
    this.error = null;
    try {
      const [configs, engineRows] = await Promise.all([
        this.admin.getConfigs(),
        this.admin.getEngineStatus(),
      ]);
      this.configs = configs;
      this.engineData = engineRows?.[0] || null;
      this.maintenanceMode = configs.find((c: any) => c.key === 'maintenance_mode')?.value === 'true';
      this.kingStatus = configs.find((c: any) => c.key === 'king_marketplace')?.value || 'OPEN';
    } catch (e: any) {
      this.error = e?.message || 'Could not load system data';
    }
    this.loading = false;
    this.cdr.markForCheck();
  }

  startEdit(c: any) { this.editingKey = c.key; this.editingValue = c.value; }
  cancelEdit() { this.editingKey = null; this.editingValue = ''; }

  async saveConfig(key: string) {
    this.saving = true;
    try {
      const existing = await this.admin.getConfig(key);
      if (existing) { await this.admin.updateConfig(key, this.editingValue); }
      else { await this.admin.insertConfig({ key, value: this.editingValue }); }
      const c = this.configs.find((x: any) => x.key === key);
      if (c) { c.value = this.editingValue; c.updated_at = new Date().toISOString(); }
      if (key === 'maintenance_mode') this.maintenanceMode = this.editingValue === 'true';
      if (key === 'king_marketplace') this.kingStatus = this.editingValue;
      this.editingKey = null;
    } catch (e: any) { this.error = e?.message || 'Failed to save config'; }
    this.saving = false;
    this.cdr.markForCheck();
  }

  async toggleKing() {
    const newVal = this.kingStatus === 'OPEN' ? 'CLOSED' : 'OPEN';
    this.saving = true;
    try {
      const existing = await this.admin.getConfig('king_marketplace');
      if (existing) { await this.admin.updateConfig('king_marketplace', newVal); }
      else { await this.admin.insertConfig({ key: 'king_marketplace', value: newVal }); }
      this.kingStatus = newVal;
    } catch (e: any) { this.error = e?.message || 'Failed'; }
    this.saving = false;
    this.cdr.markForCheck();
  }

  async toggleMaintenance() {
    const newVal = this.maintenanceMode ? 'false' : 'true';
    this.saving = true;
    try {
      const existing = await this.admin.getConfig('maintenance_mode');
      if (existing) { await this.admin.updateConfig('maintenance_mode', newVal); }
      else { await this.admin.insertConfig({ key: 'maintenance_mode', value: newVal }); }
      this.maintenanceMode = newVal === 'true';
      const c = this.configs.find((x: any) => x.key === 'maintenance_mode');
      if (c) { c.value = newVal; c.updated_at = new Date().toISOString(); }
      else { this.configs.unshift({ key: 'maintenance_mode', value: newVal, updated_at: new Date().toISOString() }); }
    } catch (e: any) { this.error = e?.message || 'Failed to toggle maintenance'; }
    this.saving = false;
    this.cdr.markForCheck();
  }

  async addConfig() {
    const key = prompt('Enter config key:');
    if (!key) return;
    const value = prompt('Enter config value:');
    if (value === null) return;
    this.saving = true;
    try {
      await this.admin.insertConfig({ key, value });
      this.configs.unshift({ key, value, updated_at: new Date().toISOString() });
    } catch (e: any) { this.error = e?.message || 'Failed to add config'; }
    this.saving = false;
    this.cdr.markForCheck();
  }
}
