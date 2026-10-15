import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ChartPoint, Dashboard } from '../../core/models';

const COLORS = ['#0E9F8E', '#F59E0B', '#8B5CF6', '#EF4444', '#0EA5E9', '#10B981'];

@Component({
  selector: 'app-dashboard', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RouterLink],
  template: `
  <div class="ph">
    <div><h1>Good morning, {{ auth.user()?.companyName }}</h1>
      <p class="mut">{{ today }} <span class="sep">·</span> <span class="lv"><i class="live"></i>live overview</span></p></div>
    <a class="btn acc" routerLink="/patient/registration">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      New registration</a>
  </div>

  @if (d(); as v) {
    <div class="kpis">
      @for (k of kpis(); track k.label; let i = $index) {
        <div class="card kpi rise" [style.--i]="i">
          <span class="ic" [class]="'ic ' + k.tone"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="icons[k.icon]"/></svg></span>
          <div><div class="lb">{{ k.label }}</div>
            <div class="big">{{ k.prefix }}{{ shown()[i] | number:'1.0-0' }}</div></div>
        </div>
      }
    </div>
    <div class="charts">
      <div class="card rise" style="--i:4"><div class="ct"><b>Revenue</b><span class="mut">last 7 days</span></div>
        <svg viewBox="0 0 520 170" width="100%">
          <path [attr.d]="areaFill()" fill="var(--teal)" class="ar"/>
          <path [attr.d]="areaLine()" fill="none" stroke="var(--teal)" stroke-width="3" stroke-linecap="round" pathLength="1" class="ln"/>
          @for (p of points(); track $index) { <text [attr.x]="p.x" y="164" font-size="11" text-anchor="middle" fill="currentColor">{{ p.label }}</text> }
        </svg></div>
      <div class="card rise" style="--i:5"><div class="ct"><b>Pending by department</b><span class="mut">today</span></div>
        <svg viewBox="0 0 520 190" width="100%">
          @for (b of bars(); track b.label; let i = $index) {
            <rect class="bar" [style.--i]="i" [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" rx="6" [attr.fill]="b.color"/>
            <text [attr.x]="b.x + b.w / 2" y="184" font-size="11" text-anchor="middle" fill="currentColor">{{ b.label }}</text>
          }
        </svg></div>
      <div class="card rise" style="--i:6"><div class="ct"><b>Today by status</b><span class="mut">bookings</span></div>
        <div class="row" style="justify-content:space-around">
          <svg viewBox="0 0 42 42" width="168" style="transform:rotate(-90deg)">
            <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--line)" stroke-width="5"/>
            @for (s of slices(); track s.label) {
              <circle class="dn" cx="21" cy="21" r="15.9" fill="none" stroke-width="5" pathLength="100"
                [attr.stroke]="s.color" [attr.stroke-dasharray]="s.dash" [style.--o]="s.offset"/>
            }
          </svg>
          <div class="lg">@for (s of slices(); track s.label) { <div><span class="dot" [style.background]="s.color"></span> {{ s.label }} <b>{{ s.value }}</b></div> }</div>
        </div></div>
    </div>
  } @else {
    <div class="kpis">@for (x of [1,2,3,4,5,6]; track x) { <div class="sk" style="height:92px;border-radius:var(--r)"></div> }</div>
    <div class="charts">@for (x of [1,2,3]; track x) { <div class="sk" style="height:250px;border-radius:var(--r)"></div> }</div>
  }`,
  styles: [`
    .sep{margin:0 4px;color:var(--line)}
    .lv{display:inline-flex;align-items:center;gap:6px}.lv i{width:8px;height:8px;border-radius:50%;background:var(--teal);display:inline-block}
    .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:14px}
    .kpi{display:flex;align-items:center;gap:13px}
    .ic{display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:12px;flex:none}
    .ic.teal{background:var(--tl);color:var(--td)}.ic.g{background:#DDF3E8;color:#17724A}.ic.a{background:var(--aml);color:var(--amd)}
    .ic.s{background:#E0F2FE;color:#075985}.ic.r{background:#FDE2E0;color:#A12A22}.ic.v{background:#EDE9FE;color:#5B21B6}
    .big{font-size:26px;font-weight:800;letter-spacing:-.01em}
    .charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px}
    .ct{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px}
    .ct b{font-size:15px}.ct .mut{font-size:12px}
    .dot{display:inline-block;width:10px;height:10px;border-radius:50%}
    .lg{display:flex;flex-direction:column;gap:7px;font-size:13px;color:var(--mut)}
    .rise{opacity:0;transform:translateY(14px);animation:rise .6s cubic-bezier(.2,.7,.2,1) forwards;animation-delay:calc(var(--i,0)*70ms)}@keyframes rise{to{opacity:1;transform:none}}
    .ln{stroke-dasharray:1;stroke-dashoffset:1;animation:dr 1.6s .3s ease forwards}@keyframes dr{to{stroke-dashoffset:0}}
    .ar{opacity:0;animation:fi 1s 1.1s forwards}@keyframes fi{to{opacity:.16}}
    .bar{transform-box:fill-box;transform-origin:bottom;transform:scaleY(0);animation:gr .9s cubic-bezier(.2,.8,.2,1) forwards;animation-delay:calc(.2s + var(--i)*80ms)}@keyframes gr{to{transform:scaleY(1)}}
    .dn{stroke-dashoffset:var(--o);animation:dd 1.4s .3s ease backwards}@keyframes dd{from{stroke-dashoffset:100}}
  `]
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService); auth = inject(AuthService);
  d = signal<Dashboard | null>(null);
  kpis = signal<{ label: string; value: number; prefix: string; icon: string; tone: string }[]>([]);
  shown = signal<number[]>([0, 0, 0, 0, 0, 0]);
  points = signal<{ x: number; y: number; label: string }[]>([]);
  areaLine = signal(''); areaFill = signal('');
  bars = signal<{ x: number; y: number; w: number; h: number; label: string; color: string }[]>([]);
  slices = signal<{ label: string; value: number; color: string; dash: string; offset: number }[]>([]);
  today = new Date().toDateString();
  icons: Record<string, string> = {
    users: 'M9 7a3 3 0 1 0 6 0 3 3 0 0 0-6 0M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2',
    check: 'M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9ZM8.5 12.5l2.5 2.5 5-5',
    clock: 'M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9ZM12 7v5l3 2',
    rupee: 'M6 4h12M6 9h12M6 4c5 0 8 2 8 5s-3 5-8 5l8 6',
    alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
    send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z'
  };

  ngOnInit() {
    this.api.dashboard().subscribe(v => {
      this.d.set(v);
      this.kpis.set([
        { label: 'Today registrations', value: v.todayBookings, prefix: '', icon: 'users', tone: 'teal' },
        { label: 'Reports delivered', value: v.todayDelivered, prefix: '', icon: 'check', tone: 'g' },
        { label: 'Pending results', value: v.pending, prefix: '', icon: 'clock', tone: 'a' },
        { label: 'Revenue today', value: v.revenueToday, prefix: '₹', icon: 'rupee', tone: 's' },
        { label: 'Outstanding', value: v.outstandingToday, prefix: '₹', icon: 'alert', tone: 'r' },
        { label: 'Outsourced', value: v.outsourced, prefix: '', icon: 'send', tone: 'v' }]);
      this.buildCharts(v); this.countUp(this.kpis().map(k => k.value));
    });
  }

  private countUp(targets: number[]) {
    const start = performance.now();
    const step = (t: number) => {
      const k = Math.min((t - start) / 1200, 1), e = 1 - Math.pow(1 - k, 3);
      this.shown.set(targets.map(x => Math.round(x * e)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private buildCharts(v: Dashboard) {
    const r = v.revenue7Days, max = Math.max(1, ...r.map(p => p.value)) * 1.15, w = 520, h = 150;
    const pts = r.map((p, i) => ({ x: 20 + i * (w - 40) / Math.max(1, r.length - 1), y: h - 20 - p.value / max * (h - 40), label: p.label }));
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('');
    this.points.set(pts); this.areaLine.set(line);
    this.areaFill.set(`${line}L${pts[pts.length - 1].x} ${h - 20}L20 ${h - 20}Z`);

    const dp = v.departments, dm = Math.max(1, ...dp.map(p => p.value)), bw = 520 / Math.max(1, dp.length);
    this.bars.set(dp.map((p, i) => { const bh = p.value / dm * 150; return { x: i * bw + bw * .2, y: 170 - bh, w: bw * .6, h: bh, label: p.label, color: COLORS[i % COLORS.length] }; }));

    const total = v.statusSplit.reduce((a: number, p: ChartPoint) => a + p.value, 0) || 1; let off = 0;
    this.slices.set(v.statusSplit.map((p, i) => { const s = p.value / total * 100; const o = { label: p.label, value: p.value, color: COLORS[i % COLORS.length], dash: `${Math.max(s - .6, 0)} ${100 - s + .6}`, offset: -off }; off += s; return o; }));
  }
}
