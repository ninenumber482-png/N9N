import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-btn',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [type]="type"
      [disabled]="disabled || loading"
      (click)="onClick.emit()"
      [class]="classes"
    >
      @if (loading) {
        <span class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"></span>
      }
      <ng-content></ng-content>
    </button>
  `,
})
export class BtnComponent {
  @Input() variant: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' = 'secondary';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() type: 'button' | 'submit' = 'button';
  @Input() fullWidth = false;
  @Output() onClick = new EventEmitter<void>();

  get classes(): string {
    const base = 'inline-flex items-center justify-center gap-1.5 transition-all select-none font-medium';
    const sizes = { sm: 'h-7 px-2.5 text-[11px] rounded', md: 'h-9 px-3.5 text-[12px] rounded-md', lg: 'h-11 px-5 text-[13px] rounded-lg' };
    const variants = {
      primary: 'bg-foreground text-background hover:opacity-80 disabled:opacity-40',
      secondary: 'bg-muted text-foreground hover:bg-muted/60 disabled:opacity-40',
      danger: 'bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40',
      success: 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40',
      ghost: 'text-muted-foreground hover:text-foreground disabled:opacity-40',
    };
    return `${base} ${sizes[this.size]} ${variants[this.variant]} ${this.fullWidth ? 'w-full' : ''}`;
  }
}
