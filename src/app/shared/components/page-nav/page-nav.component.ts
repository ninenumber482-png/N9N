import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

export interface PageNavItem {
  label: string;
  route: string;
}

@Component({
  selector: 'app-page-nav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="flex items-center justify-between pt-6 mt-6 border-t border-border">
      <div>
        @if (prev) {
          <a [routerLink]="prev.route" class="group flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground hover:border-primary/30 hover:text-primary transition-colors">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
            <div class="text-left">
              <p class="text-[10px] text-muted-foreground group-hover:text-primary/70">Previous</p>
              <p class="text-xs font-bold">{{ prev.label }}</p>
            </div>
          </a>
        }
      </div>
      <div class="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">
        {{ currentLabel }}
      </div>
      <div>
        @if (next) {
          <a [routerLink]="next.route" class="group flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground hover:border-primary/30 hover:text-primary transition-colors">
            <div class="text-right">
              <p class="text-[10px] text-muted-foreground group-hover:text-primary/70">Next</p>
              <p class="text-xs font-bold">{{ next.label }}</p>
            </div>
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </a>
        }
      </div>
    </div>
  `,
})
export class PageNavComponent {
  @Input() prev: PageNavItem | null = null;
  @Input() next: PageNavItem | null = null;
  @Input() currentLabel = '';
}
