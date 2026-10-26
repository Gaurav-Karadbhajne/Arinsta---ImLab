// Registration screen — full eazylab parity. One call (registration-data) fills departments,
// packages and masters. Bill lines live above the billing box on the right; discount can be
// % or ₹ amount; booking date can be backdated; title auto-fills gender; required fields
// carry a red asterisk; a toast confirms a successful registration.
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { IstDatePipe } from '../../core/ist-date.pipe';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { ConfigService } from '../../core/config.service';
import { BookingCreated, BookingForm, MasterOption, PatientMatch, PatientVisit, RegTestItem, RegistrationData } from '../../core/models';
import { debounceTime } from 'rxjs';                            // waits 400ms after typing stops before asking the server

// One picked line. Individuals: editable charge + sample flag. Package lines: price 0, charge sits on the group.
interface Picked { key: string; testId: number; packageId: number | null; name: string; sampleType: string; price: number; overridden: boolean; sampleCollected: boolean; }

// Today's date as yyyy-mm-dd on the lab's IST day - never the browser's or the server's day.
const todayStr = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

@Component({
  selector: 'app-registration', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReactiveFormsModule, DecimalPipe, IstDatePipe], template: `
  <div class="ph">
    <div><h1>New registration</h1><p class="mut">Patient, tests, packages and billing in one flow.</p></div>
  </div>

 

  @if (done(); as d) {
    <div class="card done rise">
      <div class="tk"><span>Token</span><b>{{ d.tokenNo }}</b></div>
      <div class="meta">
        <div><span>Lab no</span><b>{{ d.labNo }}</b></div>
        <div><span>Bill no</span><b>{{ d.billNo }}</b></div>
        <div><span>Patient</span><b>{{ d.patientUid }}</b></div>
        <div><span>Total</span><b>₹{{ d.total | number:'1.2-2' }}</b></div>
        <div><span>Balance</span><b [class.neg]="d.balance > 0">₹{{ d.balance | number:'1.2-2' }}</b></div>
      </div>
      <div class="row">
        <button class="btn acc" (click)="reset()">Register next patient</button>
        <button class="btn ghost" (click)="router.navigate(['/patient/search'])">Go to search</button>
      </div>
      <!-- @if (receipt(); as html) { <iframe [srcdoc]="safeReceipt()" title="Receipt"></iframe> } -->
    </div>

    
  }

  
  @else {
  <div class="layout" [formGroup]="f">
    <div class="main">
      <!-- 1. Identity -->
      <div class="card">
                <h3 class="ph3">Patient details @if (rebook(); as rb) { <span class="rbtag">REBOOK · {{ rb.uid }}<button type="button" class="x" (click)="clearRebook()" title="Undo rebook - create a new patient instead">×</button></span> }</h3>
        <div class="fields">
          <div class="sp2"><label class="lb">Title</label><select class="inp" formControlName="title"><option>Mr</option><option>Ms</option><option>Mrs</option><option>Dr</option><option>Baby</option></select></div>
          <div class="sp4"><label class="lb req">First name</label><input class="inp" formControlName="firstName" placeholder="e.g. Ramesh"></div>
          <div class="sp3"><label class="lb" [class.req]="lastNameReq()">Last name</label><input class="inp" formControlName="lastName"></div>
          <div class="sp3"><label class="lb">Gender</label><select class="inp" formControlName="gender"><option>Male</option><option>Female</option><option>Other</option></select></div>
          <div class="sp2"><label class="lb">Age (Y)</label><input type="number" min="0" class="inp" formControlName="ageYears"></div>
          <div class="sp2"><label class="lb">M</label><input type="number" min="0" max="11" class="inp" formControlName="ageMonths"></div>
          <div class="sp2"><label class="lb">D</label><input type="number" min="0" max="31" class="inp" formControlName="ageDays"></div>
          <div class="sp3"><label class="lb">Booking date</label><input type="date" class="inp" formControlName="bookingDate"></div>
          <div class="sp3"><label class="lb" [class.req]="mobileReq()">Mobile</label><input class="inp" formControlName="mobile" placeholder="98XXXXXXXX"></div>
          <div class="sp3"><label class="lb">Email</label><input class="inp" formControlName="email"></div>
          <div class="sp3"><label class="lb">Corporate</label><select class="inp" formControlName="patientType"><option>WalkIn</option><option>OPD</option><option>IPD</option><option>Corporate</option></select></div>
          <div class="sp6"><label class="lb">Address</label><input class="inp" formControlName="address"></div>
          <div class="sp6"><label class="lb">Remark</label><input class="inp" formControlName="remark"></div>
        </div>
      </div>

      <!-- 2. Referral + collection (+ quick-add) -->
      <div class="card">
        <h3>Referral &amp; collection</h3>
        <div class="fields">
          <div class="sp6">
            <label class="lb">Referral doctor</label>
            <div class="qa-row"><select class="inp" formControlName="referralDoctorId"><option [ngValue]="null">— None —</option>
              @for (o of data()?.doctors; track o.id) { <option [ngValue]="o.id">{{ o.name }}</option> }</select>
            <button type="button" class="plus" title="Add doctor" (click)="openQa('doctor')">+</button></div>
          </div>
          <div class="sp6">
            <label class="lb">Hospital</label>
            <div class="qa-row"><select class="inp" formControlName="hospitalId"><option [ngValue]="null">— None —</option>
              @for (o of data()?.hospitals; track o.id) { <option [ngValue]="o.id">{{ o.name }}</option> }</select>
            <button type="button" class="plus" title="Add hospital" (click)="openQa('hospital')">+</button></div>
          </div>
          <div div class="sp4">
            <label class="lb">Sample collector</label>
            <div class="qa-row"><select class="inp" formControlName="sampleCollectorId"><option [ngValue]="null">— None —</option>
              @for (o of data()?.collectors; track o.id) { <option [ngValue]="o.id">{{ o.name }}</option> }</select>
            <button type="button" class="plus" title="Add collector" (click)="openQa('collector')">+</button></div>
          </div>
          <div class="sp4"><label class="lb">Collector fee ₹</label><input type="number" min="0" class="inp" formControlName="collectorFee"></div>
        </div>
      </div>

      <!-- 3. Picker: All Tests (every department, no packages) + one tab per department + Packages. -->
      <div class="card">
        <h3>Select tests / packages</h3>
        <div class="tabs">
          <button type="button" class="tab" [class.on]="activeTab() === -1" (click)="activeTab.set(-1)">All Tests</button>
          @for (dep of data()?.departments; track dep.id) {
            <button type="button" class="tab" [class.on]="activeTab() === dep.id" (click)="activeTab.set(dep.id)">{{ dep.name }}</button>
          }
          <button type="button" class="tab pk" [class.on]="activeTab() === 0" (click)="activeTab.set(0)">Packages</button>
        </div>
        <input class="inp search" placeholder="Search in this tab…" [value]="q()" (input)="q.set($any($event.target).value)">
        @if (activeTab() === 0) {
          <div class="tests">
            @for (p of filteredPackages(); track p.id) {
              <button type="button" class="test rise" [class.on]="hasPackage(p.id)" (click)="addPackage(p)">
                <span class="nm">{{ p.name }} <i class="mut">({{ p.tests.length }} tests)</i></span><b>₹{{ p.price }}</b>
              </button>
            } @empty { <p class="mut">No packages match.</p> }
          </div>
        } @else {
          <div class="tests">
            @for (t of filteredTests(); track t.id) {
              <button type="button" class="test rise" [class.on]="hasTest(t.id)" (click)="toggleTest(t)">
                <span class="nm">{{ t.name }} <i class="mut">{{ t.sampleType }}</i></span><b>₹{{ t.price }}</b>
              </button>
            } @empty { <p class="mut">No tests match.</p> }
          </div>
        }
      </div>
    </div>

    <!-- Right side: bill lines ABOVE billing (both stick together while scrolling). -->
    <aside class="side">
      <div class="card">
        <h3>Bill lines <span class="mut" style="font-size:12px;font-weight:600">({{ lines().length }})</span></h3>
        @if (lines().length) {
        <table class="tbl mini">
          <thead><tr><th>Test</th><th class="r">Charge ₹</th><th class="c">Collected</th><th></th></tr></thead>
          <tbody>
            @for (l of groups().indiv; track l.key) {
              <tr>
                                <td><div class="tn">{{ l.name }}</div><div class="st">{{ l.sampleType }}</div></td>
                <td class="r"><input type="number" min="0" class="inp sm" [value]="l.price" (input)="setPrice(l.key, $any($event.target).value)"></td>
                <td class="c"><input type="checkbox" [checked]="l.sampleCollected" (change)="toggleCollected(l.key)"></td>
                <td class="c"><button type="button" class="x" (click)="removeLine(l.key)">×</button></td>
              </tr>
            }
            @for (g of groups().pkgs; track g.pkg.id) {
              <tr class="pkg"><td colspan="4"><b>{{ g.pkg.name }}</b> <span class="mut">₹{{ g.pkg.price | number:'1.2-2' }}</span></td></tr>
              @for (l of g.rows; track l.key) {
                <tr>
                                    <td class="ind"><div class="tn">{{ l.name }}</div><div class="st">{{ l.sampleType }}</div></td>
                  <td class="r mut">—</td>
                  <td class="c"><input type="checkbox" [checked]="l.sampleCollected" (change)="toggleCollected(l.key)"></td>
                  <td class="c"><button type="button" class="x" (click)="removeLine(l.key)">×</button></td>
                </tr>
              }
            }
          </tbody>
        </table>
        } @else { <p class="mut">Pick tests or a package — they appear here.</p> }
      </div>

      <div class="card bill">
        <h3>Billing</h3>
        <div class="ln"><span>Total</span><b>₹{{ total() | number:'1.2-2' }}</b></div>
        <div class="ln"><span>Discount</span>
          <div class="seg">
            <label><input type="radio" name="dm" [checked]="discMode() === 'pct'" (change)="discMode.set('pct')"> %</label>
            <label><input type="radio" name="dm" [checked]="discMode() === 'amt'" (change)="discMode.set('amt')"> ₹</label>
          </div>
        </div>
        @if (discMode() === 'pct') {
          <div class="ln"><span>Discount %</span><input type="number" min="0" max="100" class="inp sm" formControlName="discountPercent"></div>
        } @else {
          <div class="ln"><span>Discount ₹</span><input type="number" min="0" class="inp sm" formControlName="discountAmount"></div>
        }
        <div class="ln"><span>Discount remark</span><input class="inp sm" formControlName="discountRemark" placeholder="reason"></div>
        <div class="ln net"><span>Net payable</span><b>₹{{ net() | number:'1.2-2' }}</b></div>
        <div class="ln"><span>Paid now</span><input type="number" min="0" class="inp sm" [attr.max]="net()" formControlName="paidAmount"></div>
        @if (overPaid()) { <p class="err">Collected amount cannot be more than the bill total. You can collect at most ₹{{net() | number:'1.2-2'}}.</p> }
        <div class="ln"><span>Payment mode</span><select class="inp sm" formControlName="paymentMode"><option>Cash</option><option>UPI</option><option>Card</option><option>Cheque</option><option>Credit</option></select></div>
        <div class="ln"><span>Balance</span><b [class.neg]="balance() > 0" [class.okbal]="balance() <= 0">₹{{ balance() | number:'1.2-2' }}</b></div>
        <div class="ln"><span>Delivery</span><select class="inp sm" formControlName="deliveryMode"><option>ByHand</option><option>Email</option><option>WhatsApp</option><option>Courier</option></select></div>
        <label class="chk"><input type="checkbox" formControlName="printReceipt"> Print receipt</label>
        <label class="chk"><input type="checkbox" formControlName="goToResult"> Go to result entry after save</label>
        <button class="btn acc full" [disabled]="busy() || f.invalid || !lines().length || overPaid()" (click)="save()">
          {{ busy() ? 'Registering…' : 'Register' }}</button>
        <p class="err">{{ error() }}</p>
      </div>
    </aside>
  </div>
  }

    <!-- Rebook popup: same mobile/name already exists - pick one to reuse the UID, or ignore. -->
   <!-- Rebook popup (eazylab-style "Available Records"): one row per past visit. Rebook reuses the UID. -->
  @if (matches().length) {
    <div class="qa-bg" (click.self)="dismissMatches()">
      <div class="card qa wide av">
        <div class="avh"><span>Available Records</span><button type="button" class="avx" (click)="dismissMatches()" title="Close">×</button></div>
        <table class="avt">
          <thead><tr><th>Name</th><th>Patient ID</th><th>Mobile</th><th class="r">Balance</th><th>Date</th><th class="c">Action</th></tr></thead>
          <tbody>
            @for (row of matchRows(); track row.key) {
              <tr>
                <td>{{ row.name }}</td>
                <td>{{ row.m.uid }}</td>
                <td>{{ row.m.mobile ?? '—' }}</td>
                <td class="r"><b [class.red]="row.balance !== 0">₹{{ row.balance | number:'1.2-2' }}</b></td>
                <td>{{ row.visit ? (row.visit.bookedAt | istDate:'date') : '—' }}</td>
                <td class="c">
                  @if (row.visit) { <button type="button" class="btn vw" (click)="viewBooking(row.visit.bookingId)">View</button> }
                  <button type="button" class="btn rb2" (click)="applyRebook(row.m)">Rebook</button>
                </td>
              </tr>
            }
          </tbody>
        </table>
        @if (viewReceipt()) { <iframe class="avf" [srcdoc]="safeView()"></iframe> }
        <button type="button" class="btn ghost full" (click)="dismissMatches()">New patient — ignore these</button>
      </div>
    </div>
  }
  <!-- Quick-add popup (doctor also captures degree). -->
  @if (qa(); as kind) {
    <div class="qa-bg" (click.self)="qa.set('')">
      <form class="card qa" [formGroup]="qaF" (ngSubmit)="saveQa()">
        <h3>New {{ kind }}</h3>
        <div><label class="lb">Name *</label><input class="inp" formControlName="name"></div>
        <div><label class="lb">Mobile</label><input class="inp" formControlName="mobile"></div>
        @if (kind === 'doctor') { <div><label class="lb">Degree</label><input class="inp" formControlName="degree" placeholder="e.g. MBBS, MD"></div> }
        <div class="row">
          <button class="btn acc" [disabled]="qaF.invalid || qaBusy()">{{ qaBusy() ? 'Saving…' : 'Save' }}</button>
          <button type="button" class="btn ghost" (click)="qa.set('')">Cancel</button>
        </div>
        <p class="err">{{ qaError() }}</p>
      </form>
    </div>
  }
   @if (receipt()) {
    <div class="qa-bg rcpg" (click.self)="closeReceipt()">
      <div class="card rcp">
        <div class="rcph"><b>Receipt</b>
          <div class="rcpb">
            <button type="button" class="btn sm" (click)="downloadReceipt()">Download PDF</button>
            <button type="button" class="btn sm ghost" (click)="printReceipt()">Print</button>
            <button type="button" class="avx" (click)="closeReceipt()" title="Close">×</button>
          </div>
        </div>
        <iframe class="rcpf" [srcdoc]="safeReceipt()" title="Receipt"></iframe>
      </div>
    </div>
  }`,
  
  styles: [`
        .layout{display:grid;grid-template-columns:minmax(0,2.6fr) minmax(400px,1.25fr);gap:10px;align-items:start}
    .main{display:flex;flex-direction:column;gap:10px;min-width:0}
    .side{display:flex;flex-direction:column;gap:10px;position:sticky;top:86px}
    /* 12-column grid: each field takes only the columns it needs, so no dead gaps between short fields. */
    .fields{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:10px}
    .sp2{grid-column:span 2}.sp3{grid-column:span 3}.sp4{grid-column:span 4}.sp5{grid-column:span 5}.sp6{grid-column:span 6}
    .w110{max-width:120px}
    .lb.req::after{content:' *';color:#C0392B;font-weight:700}   // red asterisk marks compulsory fields
    .qa-row{display:flex;gap:6px;align-items:center}.qa-row .inp{flex:1;min-width:0}
    .plus{width:32px;height:32px;flex:none;border-radius:10px;border:1.5px solid var(--teal);background:var(--tl);color:var(--td);font-size:17px;font-weight:700;cursor:pointer;line-height:1}
    .plus:hover{background:var(--teal);color:#fff}
    .tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
    .tab{padding:6px 12px;border-radius:99px;border:1.5px solid var(--fld);background:var(--card);font-weight:600;font-size:13px;cursor:pointer;color:var(--mut)}
    .tab.on{border-color:var(--teal);background:var(--tl);color:var(--td)}
    .tab.pk.on{border-color:#E8A13D;background:#FBF1E0;color:#9A6B1B}
    .search{margin-bottom:10px}
    .tests{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
    .test{position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1.5px solid var(--fld);border-radius:12px;background:var(--card);cursor:pointer;font-weight:600;text-align:left;transition:all .15s ease}
    .test:hover{border-color:var(--teal);transform:translateY(-1px);box-shadow:var(--sh)}
    .test .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.test .nm i{font-style:normal;font-size:12px}
    .test b{color:var(--mut);font-size:13px;flex:none}
    .test.on{border-color:var(--teal);background:var(--tl)}.test.on b{color:var(--td)}
    .tbl{width:100%;border-collapse:collapse;font-size:13px}
    .tbl th{text-align:left;color:var(--mut);font-weight:600;font-size:11px;padding:5px 6px;border-bottom:1px solid var(--line)}
    .tbl td{padding:6px;border-bottom:1px dashed var(--line);vertical-align:middle}
    .tbl .r{text-align:right}.tbl .c{text-align:center}
    .tbl tr.pkg td{background:var(--tl);color:var(--td);font-weight:700;border-bottom:none}
    .tbl tr.pkg td .mut{font-weight:600;font-size:11px}
    .tbl td.ind{padding-left:18px}
    .tbl .tn{font-weight:600}
    .tbl .st{font-size:11px;color:var(--mut)}
    .tbl .inp.sm{width:80px}
    .x{border:none;background:none;color:var(--mut);font-size:17px;cursor:pointer;line-height:1}.x:hover{color:#C0392B}
    .ln{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px dashed var(--line);font-size:14px}
    .ln span{color:var(--mut)}.ln b{font-weight:700}
    .ln.net b{font-size:20px;color:var(--td)}
    .seg{display:flex;gap:10px;font-size:13px;font-weight:600;color:var(--mut)}
    .seg label{display:flex;gap:4px;align-items:center;cursor:pointer}
    .neg{color:#C0392B}.okbal{color:var(--td)}
    .chk{display:flex;gap:8px;align-items:center;font-size:13px;font-weight:600;color:var(--mut);margin-top:8px;cursor:pointer}
    .bill .btn{margin-top:14px}
    .done .tk{display:flex;align-items:baseline;gap:12px;margin-bottom:12px}
    .done .tk span{color:var(--mut);font-weight:600}
    .done .tk b{font-size:44px;color:var(--td)}
    .done .meta{display:flex;flex-wrap:wrap;gap:10px 26px;margin-bottom:14px}
    .done .meta span{display:block;font-size:12px;color:var(--mut)}
    .done .meta b{font-size:16px}
    .row{display:flex;gap:10px;margin-top:4px}
    iframe{width:100%;height:340px;border:1px solid var(--line);border-radius:12px;background:#fff;margin-top:12px}
    .qa-bg{position:fixed;inset:0;background:rgba(8,23,38,.45);display:flex;align-items:center;justify-content:center;z-index:60}
    .qa{width:360px;max-width:92vw;display:flex;flex-direction:column;gap:12px;padding:22px}
        .ph3{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .rbtag{display:inline-flex;align-items:center;gap:8px;padding:3px 10px;border:1.5px solid #C0392B;color:#C0392B;border-radius:99px;font-size:11px;font-weight:800;letter-spacing:1px}
    .rbtag .x{color:#C0392B}
    .qa.wide{width:560px}

        /* eazylab-style "Available Records" popup: purple header, dark table head, View/Rebook buttons. */
    .av{padding:0;overflow:auto;max-height:86vh}
    .avh{display:flex;align-items:center;justify-content:space-between;background:#6B4FA0;color:#fff;font-weight:700;padding:12px 16px;border-radius:12px 12px 0 0}
    .avx{border:none;background:none;color:#fff;font-size:20px;line-height:1;cursor:pointer;padding:0 4px}
    .avt{width:100%;border-collapse:collapse;font-size:13px;margin:10px}
    .avt th{background:#2F4A7A;color:#fff;font-weight:600;text-align:left;padding:8px 10px;font-size:12px}
    .avt td{padding:8px 10px;border-bottom:1px solid var(--line)}
    .avt .r{text-align:right}.avt .c{text-align:center}
    .avt td.red{color:#C0392B;font-weight:700}
    .btn.vw{background:#2F6FBA;color:#fff;padding:5px 12px;font-size:12px}
    .btn.rb2{background:#2E9E5B;color:#fff;padding:5px 12px;font-size:12px}
    .avf{width:calc(100% - 20px);height:300px;border:1px solid var(--line);border-radius:10px;background:#fff;margin:0 10px}
        .rcpg{z-index:80}
    .rcp{width:460px;max-width:94vw;padding:0;overflow:hidden}
        .rcph .avx{color:var(--mut)}
    .rcph .avx:hover{color:#C0392B}
    .rcph{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--line)}
    .rcpb{display:flex;align-items:center;gap:8px}
    .rcpf{width:100%;height:480px;border:0;background:#F4F7F6}
    .qa.wide .btn.ghost.full{margin:10px}
    .qa.wide>p.mut{font-size:12px;margin:0 0 10px}
    .match{display:flex;flex-direction:column;gap:8px;border:1.5px solid var(--fld);border-radius:12px;padding:12px;margin-bottom:10px}
    .mi{display:flex;flex-direction:column;gap:2px}
    .vh{background:#F4F7F6;border-radius:8px;padding:6px 10px}
    .vrow{display:flex;gap:12px;font-size:12px;color:var(--mut);padding:2px 0}
    .vrow .r{margin-left:auto}
    .vrow i{font-style:normal}
    .btn.full{width:100%}
   // .toast{position:fixed;top:74px;right:18px;z-index:70;background:var(--teal);color:#fff;font-weight:600;font-size:14px;padding:11px 18px;border-radius:12px;box-shadow:var(--sh-lg);animation:tin .25s ease}
    @keyframes tin{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
    @media(max-width:960px){.layout{grid-template-columns:1fr}.side{position:static}.fields{grid-template-columns:repeat(12,minmax(0,1fr))}.sp2,.sp3,.sp4{grid-column:span 6}.sp5,.sp6{grid-column:span 12}}
  `]
})
export class RegistrationComponent implements OnInit {
    private fb = inject(FormBuilder); private api = inject(ApiService); private notify = inject(ToastService); private cfg = inject(ConfigService); private san = inject(DomSanitizer);
  readonly router = inject(Router);

    private route = inject(ActivatedRoute);   // reads ?rebook=<patientId> coming from Search

  data = signal<RegistrationData | null>(null);
  lines = signal<Picked[]>([]);
  activeTab = signal<number>(-1);        // -1 = All Tests, 0 = Packages, else department id
  q = signal('');
  busy = signal(false); error = signal(''); done = signal<BookingCreated | null>(null); receipt = signal('');
    lastSaved = signal<BookingCreated | null>(null);   // newest booking - receipt popup/PDF use this
  // toast = signal('');
  qa = signal<'' | 'doctor' | 'hospital' | 'collector'>('');
  qaBusy = signal(false); qaError = signal('');

  // Rebook state: matched patients for the popup, and the chosen one (its UID is reused on save).
  matches = signal<PatientMatch[]>([]);
  rebook = signal<PatientMatch | null>(null);


  discMode = signal<'pct' | 'amt'>('pct');
  disc = signal(0); discAmt = signal(0); paid = signal(0);
  lastNameReq = signal(false); mobileReq = signal(false);
  private lastLookupKey = '';   // query we already sent - don't pop it up twice
  private dismissedKey = '';    // query the clerk dismissed with "New patient - ignore these"

  f = this.fb.group({
    title: ['Mr'], firstName: ['', Validators.required], lastName: [''], gender: ['Male'],
    ageYears: [0], ageMonths: [0], ageDays: [0], bookingDate: [todayStr()],
    mobile: [''], email: [''], patientType: ['WalkIn'],
    referralDoctorId: [null as number | null], hospitalId: [null as number | null],
    address: [''], remark: [''], sampleCollectorId: [null as number | null], collectorFee: [0],
    discountPercent: [0], discountAmount: [0], discountRemark: [''],
    paidAmount: [0], paymentMode: ['Cash'], deliveryMode: ['ByHand'],
    printReceipt: [true], goToResult: [false],
  });
  qaF = this.fb.nonNullable.group({ name: ['', Validators.required], mobile: [''], degree: [''] });

  filteredTests = computed<RegTestItem[]>(() => {
    const all = this.data(); if (!all) return [];
    const needle = this.q().trim().toLowerCase();
    const src = this.activeTab() === -1 ? all.departments.flatMap(d => d.tests)
      : all.departments.find(d => d.id === this.activeTab())?.tests ?? [];
    return needle ? src.filter(t => (t.name + t.shortName + (t.sampleType ?? '')).toLowerCase().includes(needle)) : src;
  });
  filteredPackages = computed(() => {
    const needle = this.q().trim().toLowerCase();
    const pkgs = this.data()?.packages ?? [];
    return needle ? pkgs.filter(p => p.name.toLowerCase().includes(needle)) : pkgs;
  });

  hasTest = (id: number) => this.lines().some(l => !l.packageId && l.testId === id);
  hasPackage = (id: number) => this.lines().some(l => l.packageId === id);

  groups = computed(() => {
    const ls = this.lines();
    const indiv = ls.filter(l => !l.packageId);
    const byPkg = new Map<number, Picked[]>();
    for (const l of ls) if (l.packageId) { const a = byPkg.get(l.packageId) ?? []; a.push(l); byPkg.set(l.packageId, a); }
    const pkgs = [...byPkg.entries()]
      .map(([pid, rows]) => ({ pkg: this.data()?.packages.find(p => p.id === pid)!, rows }))
      .filter(g => g.pkg != null);
    return { indiv, pkgs };
  });
  total = computed(() =>
    this.groups().indiv.reduce((a, l) => a + l.price, 0) +
    this.groups().pkgs.reduce((a, g) => a + g.pkg.price, 0));
  // Mirrors the server: amount mode clamps to the bill; % mode rounds like BookingTotals.Calc.
  net = computed(() => this.total() - (this.discMode() === 'amt'
    ? Math.min(this.discAmt(), this.total())
    : Math.round(this.total() * this.disc()) / 100));
  balance = computed(() => this.net() - this.paid());
  // Every collection path is capped: never take more than the bill can absorb.
  overPaid = computed(() => this.paid() > this.net() + 0.005);

  ngOnInit() {
    this.load();

    // Search > Rebook sends the patient id in the URL; load that patient and prefill the form.
    const rebookId = Number(this.route.snapshot.queryParamMap.get('rebook'));
    if (rebookId > 0) {
      this.api.patientForRebook(rebookId).subscribe({
        next: m => { if (m && !this.rebook()) this.applyRebook(m); },
        error: () => this.notify.info('Could not prefill the rebook patient. Search for them instead.')
      });
    }

    // Mirror money inputs into signals so the computed() totals stay live.
    this.f.controls.discountPercent.valueChanges.subscribe(v => this.disc.set(Math.min(100, Math.max(0, +(v ?? 0) || 0))));
    this.f.controls.discountAmount.valueChanges.subscribe(v => this.discAmt.set(Math.max(0, +(v ?? 0) || 0)));
    this.f.controls.paidAmount.valueChanges.subscribe(v => this.paid.set(Math.max(0, +(v ?? 0) || 0)));
    // Title picks the gender automatically (Mr -> Male, Ms/Mrs -> Female); other titles leave it alone.
    this.f.controls.title.valueChanges.subscribe(t => {
      if (t === 'Mr') this.f.controls.gender.setValue('Male');
      if (t === 'Ms' || t === 'Mrs') this.f.controls.gender.setValue('Female');
    });
    if (this.cfg.flag('registration.last_name_mandatory')) { this.f.controls.lastName.addValidators(Validators.required); this.lastNameReq.set(true); }
    if (this.cfg.flag('registration.mobile_mandatory')) { this.f.controls.mobile.addValidators(Validators.required); this.mobileReq.set(true); }

    // Rebook detection: a full mobile (10 digits) or a name (3+ chars) triggers the lookup popup.
    this.f.controls.mobile.valueChanges.pipe(debounceTime(400)).subscribe(() => this.maybeLookup());
    this.f.controls.firstName.valueChanges.pipe(debounceTime(400)).subscribe(() => this.maybeLookup());
  }

  load() { this.api.registrationData().subscribe(d => this.data.set(d)); }

  // Builds the current lookup key, or '' when nothing searchable yet / rebook already chosen / on the done panel.
  private lookupKey(): string {
    if (this.done() || this.qa() || this.rebook()) return '';
    const mobile = (this.f.controls.mobile.value ?? '').replace(/\D/g, '');
    const name = (this.f.controls.firstName.value ?? '').trim().toLowerCase();
    if (mobile.length >= 10) return 'm|' + mobile;   // mobile is the reliable key - check it first
    if (name.length >= 3) return 'n|' + name;
    return '';
  }
  // Asks the server only when the typed value changes to something new (and not already shown/dismissed).
  maybeLookup() {
    const key = this.lookupKey();
    if (!key) { this.matches.set([]); return; }
    if (key === this.lastLookupKey || key === this.dismissedKey) return;
    this.api.patientLookup(key.startsWith('m|') ? key.slice(2) : '', key.startsWith('n|') ? key.slice(2) : '').subscribe(list => {
      this.lastLookupKey = key;
      if (list.length) this.matches.set(list);
    });
  }
  dismissMatches() { this.dismissedKey = this.lookupKey(); this.matches.set([]); this.viewReceipt.set(''); }   // × button / outside click / ignore   // "New patient - ignore these"
  // One-click rebook: reuse the patient (same UID, new lab no on save) and prefill the demographics.
  applyRebook(m: PatientMatch) {
    this.rebook.set(m);
    this.matches.set([]);
    this.f.patchValue({
      title: m.title ?? 'Mr', firstName: m.firstName, lastName: m.lastName ?? '',
      gender: m.gender || 'Male', ageYears: m.ageYears, ageMonths: m.ageMonths, ageDays: m.ageDays,
      mobile: m.mobile ?? '', email: m.email ?? '', address: m.address ?? '',
    });
  }
  clearRebook() { this.rebook.set(null); }   // undo the chip - next save creates a brand-new patient again

  // One table row per past visit (like eazylab's popup); patients with no visits still get one row.
  matchRows = computed(() => this.matches().flatMap(m => {
    const name = ((m.title ?? '') + ' ' + m.firstName + ' ' + (m.lastName ?? '')).trim();
    if (!m.recentVisits.length) return [{ key: `p${m.id}`, m, name, visit: null as PatientVisit | null, balance: 0 }];
    return m.recentVisits.map(v => ({ key: `p${m.id}-b${v.bookingId}`, m, name, visit: v, balance: v.balance }));
  }));
  // View button: fetch that old booking's receipt and preview it inside the popup.
  viewReceipt = signal('');
    // Receipt HTML comes from our own server, so bypass Angular's sanitizer (it was stripping the <style> tag -> warning).
  safeReceipt = computed(() => this.san.bypassSecurityTrustHtml(this.receipt()));
  safeView = computed(() => this.san.bypassSecurityTrustHtml(this.viewReceipt()));
  viewBooking(id: number) { this.api.receiptHtml(id).subscribe(h => this.viewReceipt.set(h)); }

  toggleTest(t: RegTestItem) {
    if (this.hasTest(t.id)) this.lines.set(this.lines().filter(l => l.packageId || l.testId !== t.id));
    else this.lines.set([...this.lines(), { key: `t${t.id}`, testId: t.id, packageId: null, name: t.name, sampleType: t.sampleType ?? '', price: t.price, overridden: false, sampleCollected: false }]);
  }
  addPackage(p: RegistrationData['packages'][number]) {
    if (this.hasPackage(p.id)) { this.lines.set(this.lines().filter(l => l.packageId !== p.id)); return; }
    const add: Picked[] = p.tests.map(t => ({ key: `p${p.id}-${t.id}`, testId: t.id, packageId: p.id, name: t.name, sampleType: t.sampleType ?? '', price: 0, overridden: false, sampleCollected: false }));
    this.lines.set([...this.lines(), ...add]);
  }
  setPrice(key: string, v: string) {
    const price = Math.max(0, +v || 0);
    this.lines.set(this.lines().map(l => l.key === key ? { ...l, price, overridden: true } : l));
  }
  toggleCollected(key: string) { this.lines.set(this.lines().map(l => l.key === key ? { ...l, sampleCollected: !l.sampleCollected } : l)); }
  removeLine(key: string) { this.lines.set(this.lines().filter(l => l.key !== key)); }

  openQa(kind: 'doctor' | 'hospital' | 'collector') { this.qaF.reset({ name: '', mobile: '', degree: '' }); this.qaError.set(''); this.qa.set(kind); }
 
saveQa() {
  const kind = this.qa();

  if (!kind || this.qaBusy()) return;

  const v = this.qaF.getRawValue();
  const name = (v.name ?? '').trim();

  if (!name) {
    this.qaError.set('Name is required.');
    return;
  }

  this.qaBusy.set(true);
  this.qaError.set('');

  const call =
    kind === 'doctor'
      ? this.api.quickAddDoctor({
          name,
          mobile: v.mobile || undefined,
          degree: v.degree || undefined,
        })
      : kind === 'hospital'
        ? this.api.quickAddHospital({
            name,
            mobile: v.mobile || undefined,
          })
        : this.api.quickAddCollector({
            name,
            mobile: v.mobile || undefined,
          });

  call.subscribe({
    next: opt => {
      this.api.registrationData().subscribe({
        next: d => {
          this.data.set(d);

          const ctl =
            kind === 'doctor'
              ? this.f.controls.referralDoctorId
              : kind === 'hospital'
                ? this.f.controls.hospitalId
                : this.f.controls.sampleCollectorId;

          ctl.setValue(opt.id);
          this.qa.set('');
          this.qaBusy.set(false);
          this.notify.ok('Saved.');
        },
        error: e => {
          this.qaBusy.set(false);
          const message =
            e.error?.message ??
            'Saved, but could not refresh registration data.';

          this.qaError.set(message);
          this.notify.err(message);
        },
      });
    },
    error: e => {
      const message = e.error?.message ?? 'Could not save.';
      this.qaError.set(message);
      this.qaBusy.set(false);
      this.notify.err(message);
    },
  });
}


  save() {
    if (this.f.invalid || !this.lines().length || this.overPaid()) return;
    this.busy.set(true); this.error.set('');
    const v = this.f.getRawValue();
    const form: BookingForm = {
      patientId: this.rebook()?.id ?? null,   // set = rebook: server reuses the UID, issues a new lab no, flags is_rebook
      title: v.title || null, firstName: v.firstName!.trim(), lastName: v.lastName || null, gender: v.gender!,
      ageYears: +v.ageYears! || 0, ageMonths: +v.ageMonths! || 0, ageDays: +v.ageDays! || 0,
      mobile: v.mobile || null, email: v.email || null, bookingDate: v.bookingDate || null,
      patientType: v.patientType!, referralDoctorId: v.referralDoctorId, hospitalId: v.hospitalId,
      address: v.address || null, remark: v.remark || null,
      sampleCollectorId: v.sampleCollectorId, collectorFee: +v.collectorFee! || 0,
      discountPercent: this.discMode() === 'pct' ? this.disc() : 0,
      discountAmount: this.discMode() === 'amt' ? this.discAmt() : null,
      discountRemark: v.discountRemark || null,
      paidAmount: this.paid(), paymentMode: v.paymentMode!, deliveryMode: v.deliveryMode!,
      tests: [
        ...this.groups().indiv.map(l => ({ testId: l.testId, packageId: null, price: l.overridden ? l.price : null, sampleCollected: l.sampleCollected })),
        ...this.groups().pkgs.flatMap(g => g.rows.map(l => ({ testId: l.testId, packageId: g.pkg.id, price: null, sampleCollected: l.sampleCollected }))),
      ],
      packageIds: this.groups().pkgs.map(g => g.pkg.id),
      printReceipt: !!v.printReceipt,
    };
  this.api.createBooking(form).subscribe({
  next: d => {
   this.busy.set(false);
        this.lastSaved.set(d);                        // remember for the receipt popup / PDF button
        this.notify.ok(`${this.rebook() ? 'Rebook' : 'Registration'} saved — Token ${d.tokenNo} · Lab ${d.labNo} · Bill ${d.billNo}`);
        this.reset();                                 // form clears instantly - next patient can be typed at once
        if (form.printReceipt) this.api.receiptHtml(d.bookingId).subscribe(h => this.receipt.set(h));

    if (form.printReceipt) {
      this.api.receiptHtml(d.bookingId).subscribe({
        next: html => this.receipt.set(html),
        error: err => {
          console.error('Receipt loading failed:', err);
          this.notify.err(
            'Registration saved, but the receipt could not be loaded.'
          );
        }
      });
    }

    if (v.goToResult) {
      this.router.navigate(['/patient/search']);
    }
  },
  error: (err: unknown) => {
    console.error('Patient registration failed:', err);

    this.busy.set(false);

    const message =
      (err as { error?: { message?: string } })?.error?.message
      ?? 'Could not save registration. Please check the Console and API response.';

    this.error.set(message);
    this.notify.err(message);
  }
});
  }

  reset() {
    this.done.set(null); this.receipt.set(''); this.lines.set([]); this.error.set('');
    this.rebook.set(null); this.matches.set([]);
    this.disc.set(0); this.discAmt.set(0); this.paid.set(0); this.discMode.set('pct');
    this.f.reset({ title: 'Mr', firstName: '', lastName: '', gender: 'Male', ageYears: 0, ageMonths: 0, ageDays: 0, bookingDate: todayStr(), mobile: '', email: '', patientType: 'WalkIn', referralDoctorId: null, hospitalId: null, address: '', remark: '', sampleCollectorId: null, collectorFee: 0, discountPercent: 0, discountAmount: 0, discountRemark: '', paidAmount: 0, paymentMode: 'Cash', deliveryMode: 'ByHand', printReceipt: true, goToResult: false });
    
  }
     printReceipt() { const f = document.querySelector<HTMLIFrameElement>('.rcpf'); f?.contentWindow?.focus(); f?.contentWindow?.print(); }
  // Opens the receipt in a new tab and brings up the print dialog - in Chrome pick "Save as PDF" as the destination to download it.
  // Direct PDF download: fetch the file bytes, hand them to the browser as a temporary <a download> link.
  downloadReceipt() {
     const d = this.lastSaved(); if (!d) return;
    this.api.receiptPdf(d.bookingId).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);          // temp in-memory file URL
        const a = document.createElement('a');
        a.href = url;
        a.download = `Receipt-${d.billNo}.pdf`;         // browser saves this straight to Downloads
        a.click();
        URL.revokeObjectURL(url);                       // free the memory afterwards
      },
      error: () => this.notify.err('Could not download the PDF.')
    });
  }
  closeReceipt() { this.receipt.set(''); }   // × button / outside click: popup disappears
}