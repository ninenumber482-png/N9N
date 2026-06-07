import { Pipe, PipeTransform } from '@angular/core';

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

type SeverityType = 'success' | 'info' | 'secondary' | 'warn' | 'danger' | 'contrast';

@Pipe({ name: 'severityMap', standalone: true })
export class SeverityMapPipe implements PipeTransform {
  transform(value: string | null | undefined): SeverityType {
    if (!value) return 'secondary';
    return (SEVERITY[value.toUpperCase()] ?? 'secondary') as SeverityType;
  }
}
