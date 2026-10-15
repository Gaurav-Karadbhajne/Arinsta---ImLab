import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ConfigService } from '../core/config.service';

@Component({
  selector: 'app-shell', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
  <header class="top">
    <a class="brand" routerLink="/dashboard" (click)="close()">
      <span class="mk">Im<i>Lab</i></span><span class="tag">Laboratory suite</span>
    </a>

    <button class="ibtn burger" (click)="nav.set(!nav()); $event.stopPropagation()" aria-label="Toggle menu">
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    </button>

    <nav [class.open]="nav()">
      <a routerLink="/dashboard" routerLinkActive="on" (click)="close()">Dashboard</a>
      <div class="has-menu" routerLinkActive #pata="routerLinkActive" (click)="$event.stopPropagation()">
        <button class="grp" [class.on]="pata.isActive" (click)="pt.set(!pt())">Patients
          <svg class="chev" [class.up]="pt()" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="menu" [class.open]="pt()">
          <a routerLink="/patient/registration" routerLinkActive="on" (click)="close()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>New registration</a>
          <a routerLink="/patient/search" routerLinkActive="on" (click)="close()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>Search patients</a>
          <a routerLink="/patient/outsource" routerLinkActive="on" (click)="close()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>Outsource tests</a>
        </div>
      </div>
    </nav>

    <span class="sp"></span>

    <div class="has-menu me" (click)="$event.stopPropagation()">
      <button class="user" (click)="um.set(!um())">
        <span class="av">{{ initials() }}</span>
        <span class="who"><b>{{ auth.user()?.companyName }}</b><small>{{ auth.user()?.fullName }} · {{ auth.user()?.role }}</small></span>
      </button>
      <div class="menu end" [class.open]="um()">
        <div class="mi head"><b>{{ auth.user()?.fullName }}</b><small>{{ auth.user()?.role }} · {{ auth.user()?.companyName }}</small></div>
        <button class="mi" (click)="out()">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3M16 17l5-5-5-5M21 12H9"/></svg>
          Sign out</button>
      </div>
    </div>
  </header>
  <main class="fade"><router-outlet /></main>`,
  styles: [`
    :host{display:block;min-height:100vh}
    .top{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:8px;padding:0 22px;height:62px;
      background:color-mix(in srgb,var(--card) 86%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
    .brand{display:flex;align-items:baseline;gap:10px;text-decoration:none;color:var(--ink);margin-right:14px}
    .mk{font-size:22px;font-weight:800;letter-spacing:-.02em}.mk i{font-style:normal;color:var(--teal)}
    .tag{font-size:11px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.08em}
    nav{display:flex;align-items:center;gap:4px}
    nav>a,.grp{display:flex;align-items:center;gap:6px;padding:9px 15px;border-radius:10px;border:0;background:none;
      color:var(--mut);font-weight:700;text-decoration:none;cursor:pointer;transition:all .15s ease;white-space:nowrap}
    nav>a:hover,.grp:hover{color:var(--ink);background:var(--bg)}
    nav>a.on,.grp.on{color:var(--td);background:var(--tl)}
    .chev{transition:transform .18s ease}.chev.up{transform:rotate(180deg)}
    .sp{flex:1}
    .burger{display:none}
    .has-menu{position:relative}
    .menu{position:absolute;top:calc(100% + 8px);left:0;min-width:210px;display:none;flex-direction:column;gap:2px;padding:6px;
      background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:var(--sh-lg)}
    .menu.open{display:flex}
    .menu.end{left:auto;right:0}
    .menu a,.mi{display:flex;align-items:center;gap:10px;width:100%;padding:9px 11px;border-radius:8px;border:0;background:none;
      color:var(--ink);font-weight:600;text-decoration:none;cursor:pointer;transition:background .12s}
    .menu a:hover,.mi:hover{background:var(--bg)}
    .menu a.on{color:var(--td);background:var(--tl)}
    .mi.head{flex-direction:column;align-items:flex-start;gap:1px;cursor:default;padding:10px 11px;border-bottom:1px solid var(--line);border-radius:8px 8px 0 0;margin-bottom:4px}
    .mi.head:hover{background:none}.mi.head b{font-size:14px}.mi.head small{color:var(--mut)}
    .user{display:flex;align-items:center;gap:10px;padding:5px 10px 5px 5px;border:1px solid var(--line);border-radius:99px;
      background:var(--card);cursor:pointer;transition:all .15s ease}
    .user:hover{border-color:var(--teal);box-shadow:var(--sh)}
    .av{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;
      background:linear-gradient(135deg,#12B3A0,#0B7A6D);color:#fff;font-size:12px;font-weight:800}
    .who{display:flex;flex-direction:column;align-items:flex-start;line-height:1.25}.who b{font-size:13px}.who small{color:var(--mut);font-size:11px}
    main{width:min(1480px,100%);margin:0 auto;padding:24px 28px 48px}
    @media(max-width:920px){
      .tag{display:none}.burger{display:inline-flex}
      nav{display:none;position:absolute;top:62px;left:0;right:0;flex-direction:column;align-items:stretch;gap:2px;padding:10px 14px 14px;
        background:var(--card);border-bottom:1px solid var(--line);box-shadow:var(--sh-lg)}
      nav.open{display:flex}
      .menu{position:static;box-shadow:none;border:0;padding:2px 2px 4px 10px;margin:0 0 4px}
      .who{display:none}.user{border-radius:50%;padding:5px}
      main{padding:18px 16px 40px}
    }
  `]
})
export class ShellComponent {
  auth = inject(AuthService); private router = inject(Router);
  pt = signal(false); um = signal(false); nav = signal(false);
  initials = computed(() => (this.auth.user()?.fullName ?? 'U').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase());
  constructor() { inject(ConfigService).load(); }

  @HostListener('document:click')
  close() { this.pt.set(false); this.um.set(false); this.nav.set(false); }

  out() { this.auth.logout(); this.router.navigateByUrl('/login'); }
}
