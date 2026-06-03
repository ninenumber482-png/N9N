import { Component, computed, EventEmitter, input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (totalPages() > 1) {
      <div class="flex items-center justify-between border-t border-border px-4 py-3">
        <span class="text-xs text-muted-foreground">
          {{ firstItem() }}–{{ lastItem() }} of {{ totalItems() }}
        </span>
        <div class="flex items-center gap-1">
          <button (click)="goTo(currentPage() - 1)" [disabled]="currentPage() <= 1"
            class="px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-30
                   bg-muted text-foreground hover:bg-muted/80 disabled:cursor-not-allowed">
            ‹ Prev
          </button>
          @for (p of pageNumbers(); track p) {
            @if (p === -1) {
              <span class="px-1 text-muted-foreground text-xs">…</span>
            } @else {
              <button (click)="goTo(p)"
                class="w-7 h-7 rounded text-xs font-medium transition-colors"
                [class.bg-primary]="p === currentPage()"
                [class.text-primary-foreground]="p === currentPage()"
                [class.bg-muted]="p !== currentPage()"
                [class.text-foreground]="p !== currentPage()"
                [class.hover:bg-muted/80]="p !== currentPage()">
                {{ p }}
              </button>
            }
          }
          <button (click)="goTo(currentPage() + 1)" [disabled]="currentPage() >= totalPages()"
            class="px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-30
                   bg-muted text-foreground hover:bg-muted/80 disabled:cursor-not-allowed">
            Next ›
          </button>
        </div>
      </div>
    }
  `,
})
export class PaginationComponent {
  currentPage = input(1);
  totalItems = input(0);
  pageSize = input(20);

  @Output() pageChange = new EventEmitter<number>();

  totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize())));

  firstItem = computed(() =>
    this.totalItems() === 0 ? 0 : (this.currentPage() - 1) * this.pageSize() + 1
  );

  lastItem = computed(() =>
    Math.min(this.currentPage() * this.pageSize(), this.totalItems())
  );

  pageNumbers = computed(() => {
    const total = this.totalPages();
    const cur = this.currentPage();
    if (total <= 7) {
      const pages: number[] = [];
      for (let i = 1; i <= total; i++) pages.push(i);
      return pages;
    }
    const pages: number[] = [1];
    if (cur > 3) pages.push(-1);
    const start = Math.max(2, cur - 1);
    const end = Math.min(total - 1, cur + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (cur < total - 2) pages.push(-1);
    pages.push(total);
    return pages;
  });

  goTo(p: number) {
    if (p < 1 || p > this.totalPages()) return;
    this.pageChange.emit(p);
  }
}
