import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { BookingCreated, TestPickerItem } from '../../core/models';

@Component({
  selector: 'app-registration', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReactiveFormsModule, DecimalPipe],
  template: `
  <div class="ph">
    <div><h1>New registration</h1><p class="mut">Register a patient and book tests in one flow.</p></div>
  </div>
  <div class="layout" [formGroup]="f">
    <div class="card">
      <h3>Patient details</h3>
      <div class="fields">
        <div><label class="lb" for="t">Title</label><input id="t" class="inp" formControlName="title"></div>
        <div><label class="lb" for="fn">First name</label><input id="fn" class="inp" formControlName="firstName" placeholder="e.g. Ramesh"></div>
        <div><label class="lb" for="ln">Last name</label><input id="ln" class="inp" formControlName="lastName"></div>
        <div><label class="lb" for="ag">Age (years)</label><input id="ag" type="number" min="0" class="inp" formControlName="ageYears"></div>
        <div><label class="lb" for="g">Gender</label><select id="g" class="inp" formControlName="gender"><option>Male</option><option>Female</option><option>Other</option></select></div>
        <div><label class="lb" for="m">Mobile</label><input id="m" class="inp" formControlName="mobile" placeholder="98XXXXXXXX"></div>
        <div><label class="lb" for="r">Referral doctor</label><input id="r" class="inp" formControlName="referralDoctor"></div>
        <div><label class="lb" for="c">Corporate</label><input id="c" class="inp" formControlName="corporate"></div>
      </div>

      <h3 style="margin-top:20px">Select tests <span class="mut" style="font-weight:600;font-size:12px">({{ selected().size }} selected)</span></h3>
      <div class="tests">
        @for (t of catalog(); track t.id) {
          <button type="button" class="test rise" [style.--i]="$index" [class.on]="selected().has(t.id)" (click)="toggle(t.id)">
            <span class="nm">{{ t.name }}</span><b>₹{{ t.price }}</b>
            <span class="ck"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg></span>
          </button>
        }
      </div>
    </div>

    <aside class="card bill">
      <h3>Bill summary</h3>
      <div class="ln"><span>Tests selected</span><b>{{ selected().size }}</b></div>
      <div class="ln"><span>Total</span><b>₹{{ total() | number:'1.2-2' }}</b></div>
      <div class="ln"><span>Discount (%)</span><input class="inp sm" type="number" min="0" max="100" formControlName="discountPercent"></div>
      <div class="ln net"><span>Net payable</span><b>₹{{ net() | number:'1.2-2' }}</b></div>
      <div class="ln"><span>Paid now</span><input class="inp sm" type="number" min="0" formControlName="paidAmount"></div>
      <button class="btn acc full" [disabled]="busy() || !selected().size || f.invalid" (click)="save()">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        {{ busy() ? 'Registering…' : 'Register' }}</button>
      <p class="err">{{ error() }}</p>
      @if (done(); as d) {
        <p class="ok"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m5 13 4 4L19 7"/></svg>
          Saved — lab no <b>{{ d.labNo }}</b>, bill {{ d.billNo }}, balance {{ d.balance | number:'1.2-2' }}.</p>
        <iframe [srcdoc]="receipt()" title="Receipt"></iframe>
      }
    </aside>
  </div>`,
  styles: [`
    .layout{display:grid;grid-template-columns:minmax(0,3fr) minmax(300px,1.2fr);gap:14px;align-items:start}
    .fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px}
    .tests{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
    .test{position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;border:1.5px solid var(--fld);
      border-radius:12px;background:var(--card);cursor:pointer;font-weight:600;text-align:left;transition:all .15s ease}
    .test:hover{border-color:var(--teal);transform:translateY(-1px);box-shadow:var(--sh)}
    .test .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .test b{color:var(--mut);font-size:13px;flex:none}
    .test.on{border-color:var(--teal);background:var(--tl)}
    .test.on b{color:var(--td)}
    .ck{position:absolute;top:-7px;right:-7px;width:20px;height:20px;border-radius:50%;background:var(--teal);color:#fff;display:none;align-items:center;justify-content:center}
    .test.on .ck{display:flex}
    .bill{position:sticky;top:86px}
    .ln{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px dashed var(--line);font-size:14px}
    .ln span{color:var(--mut)}.ln b{font-weight:700}
    .ln.net b{font-size:20px;color:var(--td)}
    .bill .btn{margin-top:14px}
    iframe{width:100%;height:340px;border:1px solid var(--line);border-radius:12px;background:#fff;margin-top:12px}
    @media(max-width:960px){.layout{grid-template-columns:1fr}.bill{position:static}}
  `]
})
export class RegistrationComponent implements OnInit {
  private fb = inject(FormBuilder); private api = inject(ApiService); private cfg = inject(ConfigService);
  catalog = signal<TestPickerItem[]>([]); selected = signal<Set<number>>(new Set());
  busy = signal(false); error = signal(''); done = signal<BookingCreated | null>(null); receipt = signal('');
  total = computed(() => this.catalog().filter(t => this.selected().has(t.id)).reduce((a, t) => a + t.price, 0));
  discount = signal(0);
  net = computed(() => this.total() - Math.round(this.total() * this.discount()) / 100);

  // Mandatory flags come from the config table, so each lab can change them without a release.
  f = this.fb.nonNullable.group({
    title: ['Mr'], firstName: ['', Validators.required], lastName: [''], ageYears: [0], gender: ['Male', Validators.required],
    mobile: [''], referralDoctor: [''], corporate: ['Walk-in'], discountPercent: [0], paidAmount: [0]
  });

  ngOnInit() {
    this.api.catalog().subscribe(c => this.catalog.set(c));
    if (this.cfg.flag('registration.last_name_mandatory')) this.f.controls.lastName.addValidators(Validators.required);
    if (this.cfg.flag('registration.mobile_mandatory')) this.f.controls.mobile.addValidators(Validators.required);
    if (this.cfg.flag('registration.referral_mandatory', true)) this.f.controls.referralDoctor.addValidators(Validators.required);
    this.f.controls.discountPercent.valueChanges.subscribe(v => this.discount.set(+v || 0));
  }

  toggle(id: number) { const s = new Set(this.selected()); s.has(id) ? s.delete(id) : s.add(id); this.selected.set(s); }

  save() {
    this.busy.set(true); this.error.set('');
    const v = this.f.getRawValue();
    this.api.createBooking({ ...v, tests: [...this.selected()].map(testId => ({ testId })), paymentMode: 'Cash' }).subscribe({
      next: d => { this.done.set(d); this.busy.set(false); this.api.receiptHtml(d.bookingId).subscribe(h => this.receipt.set(h)); },
      error: e => { this.error.set(e.error?.message ?? 'Could not save.'); this.busy.set(false); }
    });
  }
}
