// Reports > Delete log. Every soft-deleted booking, investigation, package and money row in
// one newest-first list. Restore puts a row back on its bill - nothing is ever erased.
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { IstDatePipe } from '../../core/ist-date.pipe';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { DeletedRow, DeleteLogQuery } from '../../core/models';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-delete-log', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DecimalPipe, IstDatePipe],
  template: `
  <div class="ph">
    <div>
      <h1>Delete log</h1>
      <p class="mut">Every removed booking, investigation, package and voucher. Restore puts it back exactly as it was.</p>
    </div>
    <div class="row">
      <button class="btn ghost" type="button" [disabled]="loading()" (click)="reload()">Refresh</button>
    </div>
  </div>

  <div class="card filters">
    <div class="searchwrap">
      <span class="sic">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      </span>
      <input [formControl]="q" aria-label="Search deleted rows" placeholder="Search patient, bill number, test, receipt or reason">
    </div>
    <div class="frow">
      <label>Type
        <select class="inp" [value]="fType()" (change)="fType.set($any($event.target).value)">
          <option value="all">All types</option>
          <option value="Booking">Bookings</option>
          <option value="Test">Investigations</option>
          <option value="Package">Packages</option>
          <option value="Receipt">Receipts &amp; vouchers</option>
        </select>
      </label>
      <label>From
        <input class="inp" type="date" [value]="fFrom()" (change)="fFrom.set($any($event.target).value)">
      </label>
      <label>To
        <input class="inp" type="date" [value]="fTo()" (change)="fTo.set($any($event.target).value)">
      </label>
      <div class="fbtns">
        <button class="btn" type="button" (click)="apply()">Apply</button>
        <button class="btn ghost" type="button" (click)="clear()">Clear</button>
      </div>
    </div>
  </div>

  <div class="listwrap">
    @if (loading()) { <div class="progress"><i></i></div> }
    <div class="tbl">
      <table>
        <thead>
          <tr><th>Type</th><th>What</th><th>Patient / bill</th><th class="num">Amount</th><th>Deleted</th><th>Reason</th><th class="num">Action</th></tr>
        </thead>
        <tbody>
          @for (r of rows(); track keyOf(r)) {
            <tr>
              <td data-label="Type">
                <span class="b" [class.r]="r.kind === 'Booking'" [class.p]="r.kind === 'Package'" [class.y]="r.kind === 'Receipt'">{{r.kind}}</span>
              </td>
              <td data-label="What"><b>{{r.title}}</b><br><small class="mut">{{r.detail}}</small></td>
              <td data-label="Patient / bill"><b>{{r.patientName}}</b><br><small class="mut">Lab {{r.labNo}} · {{r.billNo}}</small></td>
              <td class="num" data-label="Amount">
                @if (r.amount != null) { ₹{{r.amount | number:'1.2-2'}} } @else { <span class="mut">—</span> }
              </td>
              <td data-label="Deleted">{{r.deletedAt | istDate}}<br><small class="mut">by {{r.deletedBy}}</small></td>
              <td class="reason" data-label="Reason">{{r.reason || '—'}}</td>
              <td class="num" data-label="Action">
                <button class="btn sm ghost" type="button" [disabled]="!!busyKey()" (click)="restore(r)">{{busyKey() === keyOf(r) ? 'Restoring…' : 'Restore'}}</button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="7">
              <div class="empty">
                <span class="eic">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/></svg>
                </span>
                @if (loading()) { <b>Loading the delete log…</b> }
                @else {
                  <b>Nothing has been deleted</b>
                  <p class="mut">Deleted bookings, investigations, packages and receipts will appear here, ready to restore.</p>
                }
              </div>
            </td></tr>
          }
        </tbody>
      </table>
    </div>
    <div class="pager">
      <span class="mut">{{rows().length}} row(s)</span>
      @if (hasMore()) {
        <button class="btn ghost" type="button" [disabled]="loadingMore()" (click)="loadMore()">{{loadingMore() ? 'Loading…' : 'Load more'}}</button>
      }
    </div>
  </div>`,
  styles: [`
    .filters{margin-bottom:14px;padding:16px}
    .searchwrap{display:flex;align-items:center;gap:10px;border:1.5px solid var(--fld);border-radius:12px;padding:4px 10px 4px 13px;background:var(--card);transition:border-color .15s,box-shadow .15s}
    .searchwrap:focus-within{border-color:var(--teal);box-shadow:0 0 0 4px var(--tl)}
    .sic{display:flex;color:var(--mut);flex:none}
    .searchwrap input{border:0;outline:0;background:none;box-shadow:none;padding:8px 0;font-size:15px;width:100%;min-width:0}
    .frow{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:12px;align-items:end}
    .frow label{display:flex;flex-direction:column;gap:5px;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--mut);min-width:0}
    .frow .inp{padding:8px 10px}
    .fbtns{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .listwrap{position:relative}
    .progress{height:3px;background:var(--line);border-radius:99px;overflow:hidden;margin-bottom:8px}
    .progress i{display:block;height:100%;width:35%;background:linear-gradient(90deg,var(--teal),#12B3A0);animation:run 1s infinite ease-in-out;border-radius:99px}
    @keyframes run{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
    .tbl table{min-width:980px}
    .reason{max-width:260px;white-space:normal}
    .empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:34px 18px;text-align:center}
    .empty .eic{display:flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:50%;background:var(--tl);color:var(--td);margin-bottom:4px}
    .empty p{margin:0}
    .pager{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}
    /* Phones: each row becomes a card; the action button spans the full width. */
    @media(max-width:820px){
      .tbl{border:0;background:none;box-shadow:none;overflow:visible}
      .tbl table{min-width:0;display:block}
      .tbl thead{display:none}
      .tbl tbody{display:flex;flex-direction:column;gap:10px}
      .tbl tbody tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 10px;padding:12px 14px;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:var(--sh)}
      .tbl td{display:block;padding:0;border:0;min-width:0}
      .tbl td::before{content:attr(data-label);display:block;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin-bottom:2px}
      .tbl td:nth-child(2),.tbl td:nth-child(3),.tbl td:nth-child(5),.tbl td:nth-child(6),.tbl td:nth-child(7){grid-column:1/-1}
      .tbl td:nth-child(7){display:flex;justify-content:flex-end}
      .tbl td:nth-child(7)::before{display:none}
      .tbl tbody tr:has(td[colspan]){display:block;padding:0;border:0;background:none;box-shadow:none}
      .tbl tbody tr:has(td[colspan]) td{display:block;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:var(--sh)}
      .tbl tbody tr:has(td[colspan]) td::before{display:none}
      .pager{flex-wrap:wrap}
    }
    @media(max-width:520px){
      .filters{padding:13px}
      .searchwrap input{font-size:16px}
      .frow{grid-template-columns:1fr 1fr}
      .fbtns{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .fbtns .btn{width:100%}
    }
  `]
})
export class DeleteLogComponent implements OnInit {
  private api = inject(ApiService);
  private notify = inject(ToastService);

  q = new FormControl('', { nonNullable: true });
  fType = signal('all');
  fFrom = signal('');
  fTo = signal('');

  rows = signal<DeletedRow[]>([]);
  hasMore = signal(false);
  loading = signal(true);
  loadingMore = signal(false);
  busyKey = signal<string | null>(null);

  private criteria = signal<DeleteLogQuery>({ type: 'all', size: PAGE_SIZE });
  private seq = 0;

  activeCount = computed(() =>
    (this.fType() !== 'all' ? 1 : 0) + (this.fFrom() ? 1 : 0) + (this.fTo() ? 1 : 0) + (this.q.value.trim() ? 1 : 0));

  ngOnInit() {
    this.reload();
    this.q.valueChanges.pipe(debounceTime(300), distinctUntilChanged()).subscribe(v => {
      this.criteria.update(c => ({ ...c, q: v.trim() || undefined }));
      this.reload();
    });
  }

  reload() {
    const my = ++this.seq;
    this.loading.set(true);
    this.api.deletedLog({ ...this.criteria(), offset: 0 }).subscribe({
      next: p => {
        if (my !== this.seq) return;
        this.rows.set(p.items); this.hasMore.set(p.hasMore); this.loading.set(false);
      },
      error: e => {
        if (my !== this.seq) return;
        this.loading.set(false);
        this.notify.err(e.error?.message ?? 'Could not load the delete log.');
      }
    });
  }

  loadMore() {
    if (this.loadingMore() || !this.hasMore()) return;
    const my = this.seq;
    this.loadingMore.set(true);
    this.api.deletedLog({ ...this.criteria(), offset: this.rows().length }).subscribe({
      next: p => {
        this.loadingMore.set(false);
        if (my !== this.seq) return;
        this.rows.update(r => [...r, ...p.items]); this.hasMore.set(p.hasMore);
      },
      error: e => {
        this.loadingMore.set(false);
        if (my === this.seq) this.notify.err(e.error?.message ?? 'Could not load more rows.');
      }
    });
  }

  apply() {
    this.criteria.set({
      type: this.fType(),
      q: this.q.value.trim() || undefined,
      from: this.fFrom() || undefined,
      to: this.fTo() || undefined,
      size: PAGE_SIZE
    });
    this.reload();
  }

  clear() {
    this.q.setValue('', { emitEvent: false });
    this.fType.set('all'); this.fFrom.set(''); this.fTo.set('');
    this.criteria.set({ type: 'all', size: PAGE_SIZE });
    this.reload();
  }

  keyOf(r: DeletedRow) { return r.kind + ':' + r.entityId; }

  restore(r: DeletedRow) {
    if (this.busyKey()) return;
    this.busyKey.set(this.keyOf(r));
    const call = r.kind === 'Booking' ? this.api.restoreBooking(r.entityId)
      : r.kind === 'Test' ? this.api.restoreBookingTest(r.entityId)
      : r.kind === 'Package' ? this.api.restoreBookingPackage(r.entityId)
      : this.api.restoreBookingPayment(r.entityId);
    call.subscribe({
      next: () => {
        this.busyKey.set(null);
        this.notify.ok(r.kind === 'Booking' ? 'Booking restored.' : `${r.kind} restored — ${r.title}.`);
        this.reload();
      },
      error: e => {
        this.busyKey.set(null);
        this.notify.err(e.error?.message ?? 'Could not restore this row.');
      }
    });
  }
}
