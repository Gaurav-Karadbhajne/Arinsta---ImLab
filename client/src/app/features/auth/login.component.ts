// Login screen, including the captcha flow: after 3 failed passwords the API answers 428.
// We then fetch a math captcha from /auth/captcha, show it under the password field,
// and send its id + the typed answer together with the next login attempt.
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { Captcha } from '../../core/models';
import { ToastService } from '../../core/toast.service';


@Component({
  selector: 'app-login', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReactiveFormsModule],
  template: `
  <div class="wrap">
    <section class="brand">
      <div class="logo rise" style="--i:0">Im<i>Lab</i></div>
      <div class="pitch">
        <h1 class="rise" style="--i:1">Every test, every report,<br>in one place.</h1>
        <p class="rise" style="--i:2">Registration, billing, results and reports for your laboratory — fast, clear and always in sync.</p>
        <ul class="rise" style="--i:3">
          <li><span class="tick"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg></span>One-click patient registration &amp; billing</li>
          <li><span class="tick"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg></span>Result entry with automatic flagging</li>
          <li><span class="tick"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg></span>Reports on WhatsApp, email &amp; print</li>
        </ul>
      </div>
      <small>&copy; ImLab</small>
    </section>
    <section class="form">
      <form [formGroup]="f" (ngSubmit)="submit()" class="rise" style="--i:2">
        <h2>Welcome back</h2><p class="mut">Sign in with your lab credentials.</p>
        <div><label class="lb" for="cid">Company ID</label><input id="cid" class="inp" formControlName="companyId" autocomplete="organization" placeholder="e.g. 100001"></div>
        <div><label class="lb" for="un">Username</label><input id="un" class="inp" formControlName="username" autocomplete="username" placeholder="Admin"></div>
        <div><label class="lb" for="pw">Password</label><input id="pw" type="password" class="inp" formControlName="password" autocomplete="current-password" placeholder="••••••••"></div>

        @if (captcha(); as c) {
        <div class="cap rise">
          <label class="lb" for="cap">Security check</label>
          <div class="qrow">
            <span class="q">{{ c.question }}</span>
            <button type="button" class="re" (click)="refreshCaptcha()" title="New question" aria-label="New question">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"/></svg>
            </button>
          </div>
          <input id="cap" class="inp" [formControl]="answer" placeholder="Your answer" autocomplete="off">
        </div>
        }

        <button class="btn full" [disabled]="f.invalid || busy()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
        <p class="err">{{ error() }}</p>
      </form>
    </section>
  </div>`,
  styles: [`
    .wrap{display:flex;flex-wrap:wrap;min-height:100vh}
    .wrap>section{flex:1 1 440px}
    .brand{position:relative;overflow:hidden;background:linear-gradient(155deg,#081726,#0E3A45 60%,#0B7A6D);color:#fff;padding:56px;display:flex;flex-direction:column;justify-content:space-between;gap:40px}
    .brand::before,.brand::after{content:'';position:absolute;border-radius:50%;filter:blur(70px);opacity:.5;pointer-events:none}
    .brand::before{width:420px;height:420px;background:#12B3A0;top:-120px;right:-100px;animation:float 9s ease-in-out infinite}
    .brand::after{width:320px;height:320px;background:#14506A;bottom:-100px;left:-80px;animation:float 11s ease-in-out infinite reverse}
    .logo{font-size:30px;font-weight:800;position:relative}.logo i{font-style:normal;color:#4FD8C5}
    .pitch{position:relative;max-width:520px}
    h1{font-size:clamp(30px,4vw,44px);line-height:1.08;margin:0 0 16px;color:#fff}
    .pitch p{color:#B9CFDA;font-size:16px;line-height:1.65;margin:0 0 26px;max-width:440px}
    ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:13px}
    li{display:flex;align-items:center;gap:11px;color:#DCE9F0;font-weight:600}
    .tick{display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:rgba(79,216,197,.18);color:#4FD8C5;flex:none}
    small{color:#7F9AAB;position:relative}
    .form{display:flex;align-items:center;justify-content:center;padding:32px;background:var(--bg)}
    form{width:380px;max-width:100%;background:var(--card);border:1px solid var(--line);border-radius:20px;box-shadow:var(--sh-lg);padding:34px;display:flex;flex-direction:column;gap:15px}
    h2{font-size:26px;margin:0}.mut{margin:-6px 0 6px}
    /* Captcha box: question chip + small refresh icon-button + answer input. */
    .cap{display:flex;flex-direction:column;gap:8px;background:var(--bg);border:1px dashed var(--line);border-radius:12px;padding:12px}
    .qrow{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .q{font-weight:800;letter-spacing:.03em;color:var(--ink)}
    .re{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--mut);cursor:pointer;transition:all .15s}
    .re:hover{color:var(--teal);border-color:var(--teal)}
  `]
})
export class LoginComponent {
  private fb = inject(FormBuilder); private auth = inject(AuthService); private api = inject(ApiService); private router = inject(Router); private notify = inject(ToastService);  // Null = server has not demanded a captcha yet; set on the first 428, cleared on successful login (page navigates away).
  busy = signal(false);
error = signal('');
  captcha = signal<Captcha | null>(null);
  answer = new FormControl('', { nonNullable: true });
  f = this.fb.nonNullable.group({
    companyId: ['', [Validators.required, Validators.maxLength(30)]],
    username: ['', Validators.required], password: ['', Validators.required]
  });

  submit() {
    if (this.f.invalid) return;
    if (this.captcha() && !this.answer.value.trim()) return;   // captcha visible -> an answer is mandatory
    this.busy.set(true); this.error.set('');
    const v = this.f.getRawValue();
    this.auth.login(v.companyId, v.username, v.password, this.captcha(), this.answer.value.trim()).subscribe({
      next: () => { this.notify.ok('Welcome back'); this.router.navigateByUrl('/dashboard'); },

      error: e => {
        // 428 = captcha now required; if a captcha was already shown it was consumed (wrong answer/password) -> fetch a fresh one.
        if (e.status === 428 || this.captcha()) this.refreshCaptcha();
        this.error.set(e.error?.message ?? 'Could not sign in.');
        this.notify.err(e.error?.message ?? 'Could not sign in.');
        this.busy.set(false);
      }
    });
  }

  refreshCaptcha() {
    this.answer.setValue('');
    this.api.captcha().subscribe(c => this.captcha.set(c));
  }
}