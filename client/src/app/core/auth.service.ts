import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { Captcha, LoginResult } from './models';

const KEY = 'imlab.session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private session = signal<LoginResult | null>(this.restore());
  readonly user = this.session.asReadonly();
  readonly isSignedIn = computed(() => !!this.session());

  /** Company ID, then username, then password. The server finds the lab's database from the company ID. */
    /** Company ID, username, password — plus a captcha (id + typed answer) once the server demands it (428). */
  login(companyId: string, username: string, password: string, captcha?: Captcha | null, captchaAnswer?: string) {
    return this.http.post<LoginResult>('/api/v1/auth/login', {
      companyId, username, password,
      captchaId: captcha?.captchaId ?? null,       // null when not required -> server ignores it
      captchaAnswer: captchaAnswer || null
    }).pipe(tap(r => { this.session.set(r); sessionStorage.setItem(KEY, JSON.stringify(r)); }));
  }

  logout() { this.session.set(null); sessionStorage.removeItem(KEY); }
  token(): string | null { return this.session()?.token ?? null; }

  private restore(): LoginResult | null {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as LoginResult | null;
      return s && new Date(s.expiresAt) > new Date() ? s : null;
    } catch { return null; }
  }
}
