import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-forbidden',
  standalone: true,
  template: `
    <div class="forbidden-container">
      <div class="card">
        <div class="code">403</div>
        <div class="title">No Authorized</div>
        <div class="ip-info">
          IP Anda: <span class="ip">{{ ip }}</span>
        </div>
        <div class="desc">Akses ditolak. IP Anda tidak terdaftar dalam whitelist.</div>
      </div>
    </div>
  `,
  styles: [
    `
      .forbidden-container {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0a0a0f;
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
      }
      .card {
        background: #18181b;
        border: 1px solid #27272a;
        border-radius: 12px;
        padding: 48px;
        width: 420px;
        text-align: center;
      }
      .code {
        font-size: 72px;
        font-weight: 800;
        background: linear-gradient(135deg, #ef4444, #dc2626);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        line-height: 1;
        margin-bottom: 8px;
      }
      .title {
        font-size: 20px;
        font-weight: 600;
        color: #e4e4e7;
        margin-bottom: 24px;
        text-transform: uppercase;
        letter-spacing: 2px;
      }
      .ip-info {
        color: #a1a1aa;
        font-size: 14px;
        margin-bottom: 16px;
        padding: 12px;
        background: #09090b;
        border-radius: 8px;
        border: 1px solid #27272a;
      }
      .ip {
        color: #f59e0b;
        font-weight: 600;
        font-family: monospace;
        font-size: 16px;
      }
      .desc {
        color: #71717a;
        font-size: 13px;
        line-height: 1.5;
      }
    `,
  ],
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForbiddenComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  ip = '';

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      this.ip = params['ip'] || 'unknown';
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
