import { Pipe, PipeTransform } from '@angular/core';
import { badgeTone } from 'src/app/shared/utils/status-badge.helper';

const SEVERITY: Record<string, string> = {
  // Status positif
  ACTIVE: 'success',
  COMPLETED: 'success',
  SETTLED: 'success',
  APPROVED: 'success',
  WIN: 'success',
  VERIFIED: 'success',
  ONLINE: 'success',
  ENABLED: 'success',
  // Status menunggu
  PENDING: 'warn',
  OPEN: 'warn',
  PROCESSING: 'warn',
  HIGH: 'warn',
  MEDIUM: 'warn',
  // Status negatif
  REJECTED: 'danger',
  FAILED: 'danger',
  LOSE: 'danger',
  CRITICAL: 'danger',
  BANNED: 'danger',
  BLOCKED: 'danger',
  // Status netral
  INACTIVE: 'secondary',
  LOW: 'secondary',
  CLOSED: 'secondary',
  CANCELLED: 'secondary',
};

@Pipe({ name: 'severityMap', standalone: true })
export class SeverityMapPipe implements PipeTransform {
  transform(value: string | null | undefined): 'success' | 'info' | 'secondary' | 'warn' | 'danger' | 'contrast' {
    if (!value) return 'secondary';
    const tone = badgeTone(value);
    const map: Record<string, 'success' | 'info' | 'secondary' | 'warn' | 'danger' | 'contrast'> = {
      success: 'success',
      warn: 'warn',
      danger: 'danger',
      info: 'info',
      neutral: 'secondary',
    };
    return map[tone] ?? (SEVERITY[value.toUpperCase()] as 'success' | 'warn' | 'danger' | 'secondary') ?? 'secondary';
  }
}
