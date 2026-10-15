import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

/** Loads the lab's config once and lets screens read dynamic settings, for example whether a field is mandatory. */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private api = inject(ApiService);
  private values = signal<Record<string, string>>({});

  load() { this.api.config().subscribe({ next: c => { this.values.set(c.values); this.applyTheme(); }, error: () => {} }); }
  flag(key: string, fallback = false): boolean { const v = this.values()[key]; return v === undefined ? fallback : v === 'true'; }
  text(key: string, fallback = ''): string { return this.values()[key] ?? fallback; }
  private applyTheme() { const c = this.text('theme.primary_color'); if (c) document.documentElement.style.setProperty('--teal', c); }
}
