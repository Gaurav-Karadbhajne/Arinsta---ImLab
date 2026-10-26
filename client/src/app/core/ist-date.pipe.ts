// One formatter for every timestamp in the UI. The lab works on Indian Standard Time,
// so times are shown in IST no matter which timezone the browser itself is set to.
import { DatePipe } from '@angular/common';
import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'istDate', standalone: true })
export class IstDatePipe implements PipeTransform {
  private readonly pipe = new DatePipe('en-IN');

  transform(value: string | Date | null | undefined, mode: 'date' | 'datetime' = 'datetime'): string {
    if (!value) return '—';
    const date = this.parse(value);
    if (Number.isNaN(date.getTime())) return '—';
    if (mode === 'date') return this.pipe.transform(date, 'dd/MM/yyyy', 'Asia/Kolkata') ?? '—';
    const text = this.pipe.transform(date, 'dd/MM/yyyy, hh:mm a', 'Asia/Kolkata') ?? '—';
    return text.replace(/\b(am|pm)\b/gi, m => m.toUpperCase()) + ' IST';
  }

  private parse(value: string | Date): Date {
    if (value instanceof Date) return value;
    // A date without a time is a calendar day, not an instant. A datetime without a
    // zone suffix came from an old payload and is UTC (MySQL DATETIME), not browser-local.
    const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
    return new Date(hasZone || value.length === 10 ? value : value + 'Z');
  }
}
