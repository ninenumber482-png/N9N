import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'wibDate', standalone: true })
export class WibDatePipe implements PipeTransform {
  transform(value: string | number | Date | null | undefined, format: 'short' | 'medium' | 'shortDate' | 'mediumDate' | 'time' = 'short'): string {
    if (!value) return '-';
    const s = typeof value === 'string' && !value.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(value)
      ? value + '+00:00' : value;
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(value);

    const opts: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Jakarta' };
    switch (format) {
      case 'short':
        Object.assign(opts, { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        break;
      case 'medium':
        Object.assign(opts, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        break;
      case 'shortDate':
        Object.assign(opts, { year: 'numeric', month: '2-digit', day: '2-digit' });
        break;
      case 'mediumDate':
        Object.assign(opts, { year: 'numeric', month: 'short', day: 'numeric' });
        break;
      case 'time':
        Object.assign(opts, { hour: '2-digit', minute: '2-digit' });
        break;
    }
    return d.toLocaleString('id-ID', opts);
  }
}
