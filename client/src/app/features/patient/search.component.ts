// Patient Search screen. Own UI: KPI strip, one filter panel, keyset-paged grid, and a
// right drawer for every action (collect, refund, add tests, preview receipts).
// All filtering happens on the server; the screen only ever holds 25 rows at a time.
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { IstDatePipe } from '../../core/ist-date.pipe';
import { debounceTime, distinctUntilChanged, forkJoin } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { BookingDetail, BookingMeta, BookingQuery, BookingRowVm, BookingStats, FilterOptions, PatientEdit } from '../../core/models';
import { BookingViewComponent } from './booking-view.component';

@Component({
  selector: 'app-search', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, DecimalPipe, IstDatePipe, BookingViewComponent],
  template: `
  <div class="ph">
    <div>
      <h1>Patient search</h1>
      <p class="mut">Find any visit, collect payments, refund and add tests — without leaving this screen.</p>
    </div>
    <div class="row">
      <button class="btn ghost" type="button" (click)="refresh()" [disabled]="loading()">Refresh</button>
      <a class="btn" routerLink="/patient/registration">+ New registration</a>
    </div>
  </div>

  <section class="cards">
    @if (cards().length) {
      @for (c of cards(); track c.key) {
        <div class="st" [class.good]="c.tone === 'good'" [class.warn]="c.tone === 'warn'" [class.bad]="c.tone === 'bad'">
          <span>{{c.label}}</span><b>{{c.value}}</b><small>{{c.note}}</small>
        </div>
      }
    } @else {
      @for (i of [1,2,3,4,5,6]; track i) { <div class="st sk" style="height:84px"></div> }
    }
  </section>

  <div class="card filters">
    <div class="searchwrap">
      <span class="sic">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      </span>
      <input [formControl]="q" aria-label="Search visits" placeholder="Search name, UID, mobile, lab number or bill number">
      @if (q.value) { <button type="button" class="xclear" (click)="clearSearch()" aria-label="Clear search">×</button> }
    </div>

    <div class="frow">
      <label>Location
        <select class="inp" [value]="fCenter() ?? ''" (change)="setCenter($any($event.target).value)">
          <option value="">All locations</option>
          @for (c of options()?.centers ?? []; track c.id) { <option [value]="c.id">{{c.name}}</option> }
        </select>
      </label>
      <label>Corporate
        <select class="inp" [value]="fCorporate()" (change)="fCorporate.set($any($event.target).value)">
          <option value="">All corporates</option>
          @for (c of options()?.corporates ?? []; track c) { <option [value]="c">{{c}}</option> }
        </select>
      </label>
      <label>Referral doctor
        <select class="inp" [value]="fReferral()" (change)="fReferral.set($any($event.target).value)">
          <option value="">All doctors</option>
          @for (d of options()?.doctors ?? []; track d) { <option [value]="d">{{d}}</option> }
        </select>
      </label>
      <label>From
        <input class="inp" type="date" [value]="fFrom()" (change)="fFrom.set($any($event.target).value)">
      </label>
      <label>To
        <input class="inp" type="date" [value]="fTo()" (change)="fTo.set($any($event.target).value)">
      </label>
      <div class="fbtns">
        <button type="button" class="chip" [class.on]="fOutstanding()" (click)="fOutstanding.set(!fOutstanding())">Outstanding only</button>
        <button type="button" class="btn" (click)="applyFilters()">Apply</button>
        <button type="button" class="btn ghost" (click)="clearFilters()">Clear</button>
      </div>
    </div>
  </div>

  <div class="listwrap">
    @if (loading()) { <div class="progress"><i></i></div> }
    <div class="tbl">
      <table>
        <thead>
          <tr><th>Lab no</th><th>Patient</th><th>Age / Sex</th><th>Mobile</th><th>Referral / Corporate</th><th class="num">Total</th><th class="num">Balance</th><th>Booked</th><th class="num">Actions</th></tr>
        </thead>
        <tbody>
          @for (r of rows(); track r.id) {
                       <tr>
              <td data-label="Lab no"><b>{{r.labNo}}</b></td>
              <td data-label="Patient"><b>{{r.patientName}}</b>@if (r.isRebook) { <span class="b y">Rebook</span> }<br><small class="mut">{{r.uid}}</small></td>
              <td data-label="Age / Sex">{{r.ageYears}}Y · {{r.gender}}</td>
              <td data-label="Mobile">{{r.mobile || '—'}}</td>
              <td data-label="Referral / Corporate">
                @if (r.referral) { <div>{{r.referral}}</div> }
                @if (r.corporate) { <small class="mut">{{r.corporate}}</small> }
                @if (!r.referral && !r.corporate) { <span class="mut">—</span> }
              </td>
              <td class="num" data-label="Total">₹{{r.total | number:'1.2-2'}}</td>
              <td class="num" data-label="Balance">
                @if (r.balance <= 0) { <span class="b g dot">Paid</span> }
                @else { <span class="b r dot">₹{{r.balance | number:'1.2-2'}}</span> }
              </td>
              <td data-label="Booked">{{r.bookedAt | istDate}}</td>
              <td class="num" data-label="Actions">
                <div class="acts">
                  <button class="btn sm ghost" type="button" (click)="openView(r)">View</button>
                  <button class="ibtn" type="button" (click)="openEdit(r)" title="Edit patient" aria-label="Edit patient">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  </button>
                  <button class="ibtn" type="button" (click)="receipts(r)" title="Receipts" aria-label="Receipts">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2Z"/><path d="M9 7h6M9 11h6"/></svg>
                  </button>
                  <button class="ibtn" type="button" (click)="rebook(r)" title="Rebook patient" aria-label="Rebook patient">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
                  </button>
                  <button class="ibtn del" type="button" (click)="askDelete(r)" title="Delete booking" aria-label="Delete booking">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="9">
              <div class="empty">
                <span class="eic"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></span>
                @if (noFilters()) {
                  <b>No visits booked today</b>
                  <p class="mut">Search a name, UID, mobile or lab number — or pick a date range to see another day.</p>
                } @else {
                  <b>No visits match these filters</b>
                  <p class="mut">Try another name, mobile or lab number, or clear the filters.</p>
                  <button class="btn ghost sm" type="button" (click)="clearFilters()">Clear filters</button>
                }
              </div>
            </td></tr>
          }
        </tbody>
      </table>
    </div>
    <div class="pager">
      <span class="mut">{{rows().length}} of {{stats()?.bookings ?? 0}} visit(s)</span>
      @if (more()) {
        <button class="btn ghost" type="button" [disabled]="loadingMore()" (click)="loadMore()">{{loadingMore() ? 'Loading…' : 'Load more'}}</button>
      }
    </div>
  </div>

  @if (viewId(); as id) {
    <app-booking-view [id]="id" [ids]="rowIds()" [startTab]="viewTab()" (closed)="closeDrawer()" (changed)="onDrawerChanged()" (navigate)="viewId.set($event)"></app-booking-view>
  }

  @if (editTarget(); as d) {
    <div class="mscrim" (click)="closeEdit()">
      <form class="modal pop" [formGroup]="editF" (ngSubmit)="saveEdit()" (click)="$event.stopPropagation()">
        <div class="mhead">
          <div><h3>Edit patient</h3><small class="mut">{{d.firstName}} {{d.lastName}} · {{d.uid}} · Lab {{d.labNo}}</small></div>
          <button type="button" class="ibtn" (click)="closeEdit()" aria-label="Close">×</button>
        </div>
        <div class="mbody">
          <div class="frow2">
            <label>Title
              <select class="inp" formControlName="title"><option value="">—</option><option>Mr</option><option>Mrs</option><option>Ms</option><option>Miss</option><option>Master</option><option>Dr</option></select>
            </label>
            <label>First name *<input class="inp" formControlName="firstName"></label>
            <label>Last name<input class="inp" formControlName="lastName"></label>
            <label>Gender
              <select class="inp" formControlName="gender"><option>Male</option><option>Female</option><option>Other</option></select>
            </label>
          </div>
          <div class="frow2">
            <label>Age · years<input class="inp" type="number" min="0" formControlName="ageYears"></label>
            <label>Age · months<input class="inp" type="number" min="0" formControlName="ageMonths"></label>
            <label>Age · days<input class="inp" type="number" min="0" formControlName="ageDays"></label>
          </div>
          <div class="frow2">
            <label>Mobile<input class="inp" formControlName="mobile"></label>
            <label>Email<input class="inp" type="email" formControlName="email"></label>
          </div>
          <label>Address<textarea class="inp" rows="2" formControlName="address"></textarea></label>

          <div class="divider"><span>Visit details</span></div>
          <div class="frow2">
            <label>Referral doctor<input class="inp" formControlName="referralDoctor" list="doctorHints"></label>
            <label>Corporate<input class="inp" formControlName="corporate"></label>
            <label>Patient type<input class="inp" formControlName="patientType" list="typeHints"></label>
            <label>Delivery<input class="inp" formControlName="deliveryMode" list="deliveryHints"></label>
          </div>
          <label>Remark<textarea class="inp" rows="2" formControlName="remark"></textarea></label>
          <datalist id="doctorHints">@for (doc of options()?.doctors ?? []; track doc) { <option [value]="doc"></option> }</datalist>
          <datalist id="typeHints"><option value="WalkIn"></option><option value="OPD"></option><option value="IPD"></option><option value="Corporate"></option><option value="Cash"></option></datalist>
          <datalist id="deliveryHints"><option value="ByHand"></option><option value="Email"></option><option value="WhatsApp"></option><option value="Courier"></option><option value="Report"></option></datalist>
          @if (editError()) { <p class="err">{{editError()}}</p> }
        </div>
        <div class="mfoot">
          <button type="button" class="btn ghost" (click)="closeEdit()">Cancel</button>
          <button class="btn" [disabled]="editF.invalid || editSaving()">{{editSaving() ? 'Saving…' : 'Save changes'}}</button>
        </div>
      </form>
    </div>
  }

  @if (delTarget(); as t) {
    <div class="mscrim" (click)="closeDelete()">
      <div class="modal sm pop" (click)="$event.stopPropagation()">
        <div class="mhead">
          <div><h3>Delete booking</h3><small class="mut">Lab {{t.labNo}} · {{t.patientName}}</small></div>
          <button class="ibtn" (click)="closeDelete()" aria-label="Close">×</button>
        </div>
        <div class="mbody">
          <p class="warnbox">The visit disappears from search and all totals. Nothing is erased — the record, its money rows and this reason stay in the database for the Delete log, where it can be restored later.</p>
          <label class="lb">Reason (required)</label>
          <textarea class="inp" rows="3" [value]="delReason()" (input)="delReason.set($any($event.target).value)" placeholder="Why is this booking being deleted?"></textarea>
          <p class="err">{{delReason().trim().length < 3 ? 'Enter at least 3 characters.' : ''}}</p>
        </div>
        <div class="mfoot">
          <button class="btn ghost" (click)="closeDelete()">Cancel</button>
          <button class="btn danger" [disabled]="delReason().trim().length < 3 || delBusy()" (click)="confirmDelete()">{{delBusy() ? 'Deleting…' : 'Delete booking'}}</button>
        </div>
      </div>
    </div>
  }`,
  styles: [`
    .ph a.btn{text-decoration:none}
    .cards{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin-bottom:14px}
    .st{position:relative;overflow:hidden;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:13px 15px;box-shadow:var(--sh)}
    .st::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--teal)}
    .st.good::before{background:#17724A}.st.warn::before{background:var(--amb)}.st.bad::before{background:#C0392B}
    .st span{display:block;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--mut)}
    .st b{display:block;font-size:21px;letter-spacing:-.02em;margin-top:4px}
    .st small{display:block;font-size:11px;color:var(--mut);margin-top:1px}
    /* Rebook marker: the drawer's amber chip, sized to sit inline with the patient name. */
    .tbl td .b.y{font-size:10px;padding:2px 7px;margin-left:6px;vertical-align:1px}
    .filters{margin-bottom:14px;padding:16px}
    .searchwrap{display:flex;align-items:center;gap:10px;border:1.5px solid var(--fld);border-radius:12px;padding:4px 10px 4px 13px;background:var(--card);transition:border-color .15s,box-shadow .15s}
    .searchwrap:focus-within{border-color:var(--teal);box-shadow:0 0 0 4px var(--tl)}
    .sic{display:flex;color:var(--mut);flex:none}
    .searchwrap input{border:0;outline:0;background:none;box-shadow:none;padding:8px 0;font-size:15px;width:100%;min-width:0}
    .xclear{border:0;background:none;color:var(--mut);font-size:19px;line-height:1;cursor:pointer;padding:0 2px}
    .xclear:hover{color:var(--ink)}
    .frow{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-top:12px;align-items:end}
    .frow label{display:flex;flex-direction:column;gap:5px;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--mut);min-width:0}
    .frow .inp{padding:8px 10px}
    .fbtns{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .listwrap{position:relative}
    .progress{height:3px;background:var(--line);border-radius:99px;overflow:hidden;margin-bottom:8px}
    .progress i{display:block;height:100%;width:35%;background:linear-gradient(90deg,var(--teal),#12B3A0);animation:run 1s infinite ease-in-out;border-radius:99px}
    @keyframes run{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
    .tbl table{min-width:1040px}
    .acts{display:flex;gap:5px;align-items:center;justify-content:flex-end}
    .acts a.ibtn{text-decoration:none}
    .ibtn.del:hover{color:#C0392B;border-color:#F3B4AE;background:#FDE2E0}
    .empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:34px 18px;text-align:center}
    .empty .eic{display:flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:50%;background:var(--tl);color:var(--td);margin-bottom:4px}
    .empty p{margin:0}
    .pager{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}
    .mscrim{position:fixed;inset:0;z-index:85;background:rgba(8,21,32,.45);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(2px)}
        /* First value is the fallback; browsers that understand dvh use the second. */
    .modal{width:min(700px,100%);max-height:90vh;max-height:90dvh;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--sh-lg);overflow:hidden}
    .modal.sm{width:min(470px,100%)}
    .mhead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-bottom:1px solid var(--line)}
    .mhead h3{margin:0}
    .mbody{padding:16px 18px;overflow:auto;display:flex;flex-direction:column;gap:12px}
    .mfoot{display:flex;justify-content:flex-end;gap:10px;padding:12px 18px;border-top:1px solid var(--line);background:var(--bg)}
    .frow2{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
    .frow2 label,.mbody>label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700;color:var(--mut)}
    textarea.inp{resize:vertical}
    .divider{display:flex;align-items:center;gap:10px;color:var(--mut);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-top:4px}
    .divider::before,.divider::after{content:'';height:1px;background:var(--line);flex:1}
    .warnbox{background:var(--aml);color:var(--amd);border-radius:10px;padding:10px 12px;font-size:13px;margin:0}
       /* KPI strip: 6 columns -> 3 -> 2 -> 1 on very small phones. */
    @media(max-width:1100px){.cards{grid-template-columns:repeat(3,minmax(0,1fr))}}
    @media(max-width:700px){.cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:380px){.cards{grid-template-columns:1fr}}

    /* Tablet: the table still scrolls sideways, but Actions stay pinned to the right edge. */
    @media(min-width:901px) and (max-width:1150px){
      .tbl th:last-child,.tbl td:last-child{position:sticky;right:0;z-index:1;background:var(--card);box-shadow:-10px 0 14px -12px rgba(12,27,42,.35)}
      .tbl th:last-child{background:var(--bg)}
      .tbl tbody tr:hover td:last-child{background:var(--bg)}
    }

    /* Phone/tablet: every grid row becomes a card, so nothing is cut off sideways.
       The ::before labels come from the data-label attributes added in 2a. */
    @media(max-width:900px){
      .tbl{border:0;background:none;box-shadow:none;overflow:visible}
      .tbl table{min-width:0;display:block}
      .tbl thead{display:none}
      .tbl tbody{display:flex;flex-direction:column;gap:10px}
      .tbl tbody tr{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));
        grid-template-areas:"lab bal bal" "pat pat pat" "age mob booked" "ref ref ref" "total total total" "acts acts acts";
        gap:8px 10px;padding:12px 14px;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:var(--sh)}
      .tbl tbody tr:hover{background:var(--card)}
      .tbl td{display:block;padding:0;border:0;min-width:0}
      .tbl td::before{content:attr(data-label);display:block;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin-bottom:2px}
      .tbl td:nth-child(1){grid-area:lab}
      .tbl td:nth-child(2){grid-area:pat}
      .tbl td:nth-child(2)::before{display:none}
      .tbl td:nth-child(2) b{font-size:15px}
      .tbl td:nth-child(3){grid-area:age}
      .tbl td:nth-child(4){grid-area:mob}
      .tbl td:nth-child(5){grid-area:ref}
      .tbl td:nth-child(6){grid-area:total}
      .tbl td:nth-child(7){grid-area:bal;text-align:right}
      .tbl td:nth-child(7) .b{font-size:14px}
      .tbl td:nth-child(8){grid-area:booked}
      .tbl td:nth-child(9){grid-area:acts;display:flex;justify-content:flex-end;align-items:flex-end}
      .tbl td:nth-child(9)::before{display:none}
      .tbl .acts{gap:6px}
      .tbl tbody tr:has(td[colspan]){display:block;padding:0;border:0;background:none;box-shadow:none}
      .tbl tbody tr:has(td[colspan]) td{display:block;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:var(--sh)}
      .tbl tbody tr:has(td[colspan]) td::before{display:none}
      .pager{flex-wrap:wrap}
    }
    /* Very narrow phones: two columns and 32px action buttons. */
    @media(max-width:380px){
      .tbl tbody tr{grid-template-columns:repeat(2,minmax(0,1fr));
        grid-template-areas:"lab bal" "pat pat" "age mob" "ref ref" "booked booked" "total total" "acts acts"}
      .tbl .acts{gap:4px}
      .tbl .acts .btn.sm{padding:6px 9px;font-size:12px}
      .tbl .acts .ibtn{width:32px;height:32px}
    }

    /* Filters: two columns on phones; dates and buttons get full rows. */
    @media(max-width:520px){
      .filters{padding:13px}
      .searchwrap input{font-size:16px} /* 16px stops iOS from zooming into the field */
      .frow{grid-template-columns:repeat(2,minmax(0,1fr))}
      .frow label:nth-child(5){grid-column:1/-1}
      .fbtns{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .fbtns .chip{grid-column:1/-1}
      .fbtns .btn{width:100%}
    }

    /* Modals on phones: tighter frame + room for the home indicator. */
    @media(max-width:640px){
      .mscrim{padding:10px}
      .modal{border-radius:12px}
      .mhead{padding:12px 14px}
      .mbody{padding:14px}
      .mfoot{padding:10px 14px calc(10px + env(safe-area-inset-bottom))}
    }
  `]
})
export class SearchComponent implements OnInit {
  private api = inject(ApiService);
  private notify = inject(ToastService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  q = new FormControl('', { nonNullable: true });
  rows = signal<BookingRowVm[]>([]);
  stats = signal<BookingStats | null>(null);
  options = signal<FilterOptions | null>(null);
  more = signal(false);
  loading = signal(true);
  loadingMore = signal(false);
  viewId = signal<number | null>(null);
  viewTab = signal<'tests' | 'money' | 'add' | 'history' | null>(null);
  private view = viewChild(BookingViewComponent);

  // Draft filters - selects/dates/toggle reach the server only on Apply; the search box applies as you type.
  fCenter = signal<number | null>(null);
  fCorporate = signal('');
  fReferral = signal('');
  fOutstanding = signal(false);
  fFrom = signal('');
  fTo = signal('');
  private criteria = signal<BookingQuery>({ pageSize: 25 });
  private seq = 0;
  private rowsDirty = false;

  // Edit modal.
  editTarget = signal<BookingDetail | null>(null);
  editSaving = signal(false);
  editError = signal('');
  editF = this.fb.nonNullable.group({
    title: [''], firstName: ['', Validators.required], lastName: [''], gender: ['Male'],
    ageYears: [0, Validators.min(0)], ageMonths: [0, Validators.min(0)], ageDays: [0, Validators.min(0)],
    mobile: [''], email: [''], address: [''], referralDoctor: [''], corporate: [''], remark: [''],
    patientType: ['WalkIn'], deliveryMode: ['ByHand'],
  });

  // Delete modal.
  delTarget = signal<BookingRowVm | null>(null);
  delReason = signal('');
  delBusy = signal(false);

  // Same rule as the server: no filters at all means today's visits.
  noFilters = computed(() => {
    const c = this.criteria();
    return !c.search && !c.corporate && !c.referralDoctor && !c.outstandingOnly && !c.from && !c.to;
  });

  cards = computed(() => {
    const s = this.stats();
    if (!s) return [] as { key: string; label: string; value: string; note: string; tone: string }[];
    const money = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const c = this.criteria();
    const todayOnly = this.noFilters();
    const hasDates = !!c.from || !!c.to;
    const scopeNote = hasDates ? this.dateRangeNote(c) : 'matching filters';
    return [
      { key: 'pt', label: todayOnly ? 'Patients today' : 'Patients', value: s.patients.toLocaleString('en-IN'), note: todayOnly ? 'booked today' : scopeNote, tone: '' },
      { key: 'b', label: 'Bookings', value: s.bookings.toLocaleString('en-IN'), note: todayOnly ? 'booked today' : 'matching filters', tone: '' },
      { key: 'f', label: 'Fully paid', value: s.fullyPaid.toLocaleString('en-IN'), note: 'balance is ₹0', tone: 'good' },
      { key: 'p', label: 'Part paid', value: s.partPaid.toLocaleString('en-IN'), note: 'some money collected', tone: 'warn' },
      { key: 'o', label: 'Outstanding', value: s.outstanding.toLocaleString('en-IN'), note: money(s.outstandingAmount) + ' due', tone: 'bad' },
      { key: 'c', label: 'Collected', value: money(s.collected), note: 'after refunds', tone: 'good' },
    ];
  });
  // Patients card note: "24 Oct 2026", "23 Oct 2026 – 24 Oct 2026", "from …" or "up to …".
  dateRangeNote(c: BookingQuery) {
    const day = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00')
      .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const from = c.from ? day(c.from) : '';
    const to = c.to ? day(c.to) : '';
    if (from && to) return from === to ? from : from + ' – ' + to;
    return from ? 'from ' + from : 'up to ' + to;
  }
  activeCount = computed(() => {
    const c = this.criteria();
    let n = 0;
    if (c.search) n++;
    if (c.centerId) n++;
    if (c.corporate) n++;
    if (c.referralDoctor) n++;
    if (c.outstandingOnly) n++;
    if (c.from || c.to) n++;
    return n;
  });
  rowIds = computed(() => this.rows().map(r => r.id));

  ngOnInit() {
    this.loadOptions();
    this.reload();
    // Typing searches after 300ms; filters already applied stay applied.
    this.q.valueChanges.pipe(debounceTime(300), distinctUntilChanged()).subscribe(v => {
      this.criteria.update(c => ({ ...c, search: v.trim() || undefined, afterId: undefined }));
      this.rows.set([]);
      this.reload();
    });
  }

  loadOptions() {
    this.api.bookingFilters().subscribe({ next: o => this.options.set(o), error: () => {} });
  }

  reload() {
    const my = ++this.seq;
    const c = this.criteria();
    this.loading.set(true);
    this.api.searchBookings(c).subscribe({
      next: p => {
        if (my !== this.seq) return;
        this.rows.set(p.items); this.more.set(p.hasMore); this.loading.set(false);
      },
      error: e => {
        if (my !== this.seq) return;
        this.loading.set(false);
        this.notify.err(e.error?.message ?? 'Could not load visits.');
      }
    });
    this.api.bookingStats(c).subscribe({
      next: s => { if (my === this.seq) this.stats.set(s); },
      error: () => {}
    });
  }

  // Updates only the KPI strip while the drawer is open, so the grid (and prev/next ids) stays stable.
  reloadStats() {
    this.api.bookingStats(this.criteria()).subscribe({ next: s => this.stats.set(s), error: () => {} });
  }

  loadMore() {
    const last = this.rows().at(-1);
    if (!last || this.loadingMore()) return;
    const my = this.seq;
    this.loadingMore.set(true);
    this.api.searchBookings({ ...this.criteria(), afterId: last.id }).subscribe({
      next: p => {
        this.loadingMore.set(false);
        if (my !== this.seq) return;
        this.rows.update(r => [...r, ...p.items]);
        this.more.set(p.hasMore);
      },
      error: e => { this.loadingMore.set(false); if (my === this.seq) this.notify.err(e.error?.message ?? 'Could not load more visits.'); }
    });
  }

  setCenter(raw: string) { this.fCenter.set(raw ? +raw : null); }

  applyFilters() {
    this.criteria.set({
      pageSize: 25,
      search: this.q.value.trim() || undefined,
      centerId: this.fCenter() ?? undefined,
      corporate: this.fCorporate().trim() || undefined,
      referralDoctor: this.fReferral().trim() || undefined,
      outstandingOnly: this.fOutstanding() || undefined,
      // The picker gives a calendar day; send IST day boundaries so the server filters the
      // same day the lab means, whatever timezone the server or browser runs in.
      from: this.fFrom() ? this.fFrom() + 'T00:00:00+05:30' : undefined,
      to: this.fTo() ? this.fTo() + 'T23:59:59.9999999+05:30' : undefined,
    });
    this.rows.set([]);
    this.reload();
  }

  clearFilters() {
    this.q.setValue('', { emitEvent: false });
    this.fCenter.set(null); this.fCorporate.set(''); this.fReferral.set('');
    this.fOutstanding.set(false); this.fFrom.set(''); this.fTo.set('');
    this.criteria.set({ pageSize: 25 });
    this.rows.set([]);
    this.reload();
  }

  clearSearch() {
    this.q.setValue('', { emitEvent: false });
    this.criteria.update(c => ({ ...c, search: undefined, afterId: undefined }));
    this.rows.set([]);
    this.reload();
  }

  refresh() { this.loadOptions(); this.reload(); }

  openView(r: BookingRowVm) { this.viewTab.set(null); this.viewId.set(r.id); }
  closeDrawer() { this.viewId.set(null); this.viewTab.set(null); if (this.rowsDirty) { this.rowsDirty = false; this.reload(); } }
  onDrawerChanged() { this.rowsDirty = true; this.reloadStats(); }
  // Receipts icon opens the same drawer on its Receipts tab - no page navigation.
  receipts(r: BookingRowVm) { this.viewTab.set('history'); this.viewId.set(r.id); }
  rebook(r: BookingRowVm) { this.router.navigate(['/patient/registration'], { queryParams: { rebook: r.patientId } }); }

  // ---- edit ----
  openEdit(r: BookingRowVm) {
    this.editError.set('');
    this.api.bookingDetail(r.id).subscribe({
      next: d => {
        this.editTarget.set(d);
        this.editF.reset({
          title: d.title ?? '', firstName: d.firstName, lastName: d.lastName ?? '', gender: d.gender,
          ageYears: d.ageYears, ageMonths: d.ageMonths, ageDays: d.ageDays, mobile: d.mobile ?? '',
          email: d.email ?? '', address: d.address ?? '', referralDoctor: d.referral ?? '',
          corporate: d.corporate ?? '', remark: d.remark ?? '', patientType: d.patientType, deliveryMode: d.deliveryMode,
        });
      },
      error: e => this.notify.err(e.error?.message ?? 'Could not load the patient.')
    });
  }
  closeEdit() { if (!this.editSaving()) this.editTarget.set(null); }

  saveEdit() {
    const d = this.editTarget();
    if (!d || this.editF.invalid) return;
    const v = this.editF.getRawValue();
    const patient: PatientEdit = {
      title: v.title || null, firstName: v.firstName.trim(), lastName: v.lastName.trim() || null, gender: v.gender,
      ageYears: v.ageYears || 0, ageMonths: v.ageMonths || 0, ageDays: v.ageDays || 0,
      mobile: v.mobile.trim() || null, email: v.email.trim() || null, address: v.address.trim() || null,
    };
    const meta: BookingMeta = {
      referralDoctor: v.referralDoctor.trim() || null, corporate: v.corporate.trim() || null,
      remark: v.remark.trim() || null, patientType: v.patientType, deliveryMode: v.deliveryMode,
    };
    this.editSaving.set(true); this.editError.set('');
    forkJoin({ patient: this.api.updatePatient(d.patientId, patient), meta: this.api.updateBookingMeta(d.id, meta) }).subscribe({
      next: () => {
        this.editSaving.set(false); this.editTarget.set(null);
        this.notify.ok('Patient details updated.');
        this.loadOptions(); this.reload(); this.view()?.reload();
      },
      error: e => {
        this.editSaving.set(false);
        const msg = e.error?.message ?? 'Could not save patient details.';
        this.editError.set(msg); this.notify.err(msg);
      }
    });
  }

  // ---- delete ----
  askDelete(r: BookingRowVm) { this.delReason.set(''); this.delTarget.set(r); }
  closeDelete() { if (!this.delBusy()) this.delTarget.set(null); }
  confirmDelete() {
    const t = this.delTarget();
    if (!t || this.delReason().trim().length < 3 || this.delBusy()) return;
    this.delBusy.set(true);
    this.api.deleteBooking(t.id, this.delReason().trim()).subscribe({
      next: () => {
        this.delBusy.set(false); this.delTarget.set(null);
        if (this.viewId() === t.id) this.viewId.set(null);
        this.notify.ok('Booking deleted. The reason is saved for the Delete log.');
        this.loadOptions(); this.reload();
      },
      error: e => { this.delBusy.set(false); this.notify.err(e.error?.message ?? 'Could not delete the booking.'); }
    });
  }
}