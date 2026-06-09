import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'idr', standalone: true })
export class IdrPipe implements PipeTransform {
  transform(value: number | string | null | undefined): string {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
}
