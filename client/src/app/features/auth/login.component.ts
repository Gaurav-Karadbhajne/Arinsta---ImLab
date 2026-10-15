import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

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
  `]
})
export class LoginComponent {
  private fb = inject(FormBuilder); private auth = inject(AuthService); private router = inject(Router);
  busy = signal(false); error = signal('');
  f = this.fb.nonNullable.group({
    companyId: ['', [Validators.required, Validators.maxLength(30)]],
    username: ['', Validators.required], password: ['', Validators.required]
  });

  submit() {
    if (this.f.invalid) return;
    this.busy.set(true); this.error.set('');
    const v = this.f.getRawValue();
    this.auth.login(v.companyId, v.username, v.password).subscribe({
      next: () => this.router.navigateByUrl('/dashboard'),
      error: e => { this.error.set(e.error?.message ?? 'Could not sign in.'); this.busy.set(false); }
    });
  }
}
