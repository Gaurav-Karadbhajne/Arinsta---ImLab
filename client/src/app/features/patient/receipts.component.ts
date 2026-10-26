// Receipts page: the print icon on the Search grid lands here. Lists every payment and refund
// of one visit; each row opens the server-rendered voucher and can download a real PDF.
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IstDatePipe } from '../../core/ist-date.pipe';
import { DomSanitizer } from '@angular/platform-browser';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { BookingPayment, ReceiptList } from '../../core/models';

@Component({
  selector: 'app-receipts', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DecimalPipe, IstDatePipe],
  template: `
  <div class="ph">
    <div>
      <a class="back" routerLink="/patient/search">← Back to search</a>
      <h1>Receipts</h1>
      <p class="mut">Every payment and refund recorded for this visit.</p>
    </div>
    <button class="btn ghost" type="button" (click)="reload()" [disabled]="loading()">Refresh</button>
  </div>

  @if (loading()) {
    <div class="card"><div class="sk" style="height:90px"></div><div class="sk" style="height:220px;margin-top:14px"></div></div>
  } @else if (error()) {
    <div class="card"><p class="err">{{error()}}</p><button class="btn" (click)="reload()">Try again</button></div>
   } @else {
    @if (data(); as d) {
    <div class="card visit">
      <div class="vwho">
        <span class="av">{{d.patientName.charAt(0)}}</span>
        <div><h3>{{d.patientName}}</h3><small class="mut">UID {{d.uid}} · Lab {{d.labNo}} · Bill {{d.billNo}}</small></div>
      </div>
      <div class="sum">
        <div><span>Total</span><b>₹{{d.total | number:'1.2-2'}}</b></div>
        <div><span>Discount</span><b>₹{{d.discount | number:'1.2-2'}}</b></div>
        <div><span>Collected</span><b>₹{{d.paid | number:'1.2-2'}}</b></div>
        <div><span>Refunded</span><b class="r">₹{{d.refunded | number:'1.2-2'}}</b></div>
        <div class="bal"><span>Balance</span><b>₹{{d.balance | number:'1.2-2'}}</b></div>
      </div>
    </div>

    <div class="tbl">
      <table>
        <thead><tr><th>Receipt</th><th>Type</th><th class="num">Amount</th><th>Mode</th><th>Date</th><th>Reason / remark</th><th class="num">Actions</th></tr></thead>
        <tbody>
          @for (r of d.receipts; track r.id) {
                       <tr>
              <td data-label="Receipt"><b>{{r.receiptNo}}</b></td>
              <td data-label="Type">@if (r.kind === 'refund') { <span class="b r">Refund</span> } @else { <span class="b g">Payment</span> }</td>
              <td class="num" data-label="Amount" [class.ref]="r.kind === 'refund'">{{r.kind === 'refund' ? '−' : ''}}₹{{r.amount | number:'1.2-2'}}</td>
              <td data-label="Mode">{{r.mode}}</td>
              <td data-label="Date">{{r.paidAt | istDate}}</td>
              <td class="rsn" data-label="Reason">@if (r.reason || r.remark) { <span class="mut">{{r.reason || r.remark}}</span> }</td>
              <td class="num" data-label="Actions">
                <div class="acts">
                  <button class="btn sm ghost" type="button" (click)="view(r)">View</button>
                  <button class="btn sm ghost" type="button" (click)="download(r)">PDF</button>
                </div>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="7"><div class="pad mut">No money has been recorded for this visit.</div></td></tr>
          }
        </tbody>
      </table>
    </div>
  }
   }
  @if (selected()) {
    <div class="rscrim" (click)="closeReceipt()">
      <div class="rcp pop" (click)="$event.stopPropagation()">
        <div class="rhead">
          <div><b>{{selected()!.kind === 'refund' ? 'Refund voucher' : 'Payment receipt'}}</b><small class="mut">{{selected()!.receiptNo}}</small></div>
          <div class="row">
            <button class="btn sm ghost" (click)="download(selected()!)">Download PDF</button>
            <button class="ibtn" (click)="closeReceipt()" aria-label="Close">×</button>
          </div>
        </div>
        @if (receiptLoading()) { <div class="rload"><div class="sk" style="height:420px"></div></div> }
        @else { <iframe [srcdoc]="safeReceipt()" title="Receipt"></iframe> }
      </div>
    </div>
  }`,
  styles: [`
    .back{display:inline-block;font-weight:700;color:var(--td);text-decoration:none;margin-bottom:8px;font-size:12px}
    .visit{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px}
    .vwho{display:flex;align-items:center;gap:12px}
    .av{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#12B3A0,#0B7A6D);color:#fff;font-weight:800;font-size:16px;flex:none}
    .vwho h3{margin:0 0 2px}
    .sum{display:flex;gap:18px;flex-wrap:wrap}
    .sum span{display:block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--mut)}
    .sum b{display:block;font-size:14px;margin-top:2px}
    .sum b.r{color:#C0392B}
    .sum .bal b{color:var(--td)}
    .acts{display:flex;gap:6px;justify-content:flex-end}
    .tbl table{min-width:860px}
    .tbl td.ref{color:#C0392B;font-weight:700}
    .pad{padding:26px;text-align:center}
    .rscrim{position:fixed;inset:0;z-index:90;background:rgba(6,18,28,.55);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(2px)}
        .rcp{width:min(760px,100%);height:min(880px,94vh);height:min(880px,94dvh);display:flex;flex-direction:column;background:var(--card);border-radius:16px;box-shadow:var(--sh-lg);overflow:hidden}
    .rhead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line)}
    .rhead b{display:block;font-size:14px}.rhead small{font-size:11px}
    .rcp iframe{flex:1;width:100%;border:0;background:#F4F7F6}
    .rload{flex:1;padding:16px}

        /* Phone/tablet: one receipt becomes one card. The reason row vanishes when empty,
       and the actions always stay on their own full-width row. */
    @media(max-width:900px){
      .tbl{border:0;background:none;box-shadow:none;overflow:visible}
      .tbl table{min-width:0;display:block}
      .tbl thead{display:none}
      .tbl tbody{display:flex;flex-direction:column;gap:10px}
      .tbl tbody tr{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));
        grid-template-areas:"no no amt" "type mode date";
        gap:8px 10px;padding:12px 14px;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:var(--sh)}
      .tbl tbody tr:hover{background:var(--card)}
      .tbl td{display:block;padding:0;border:0;min-width:0}
      .tbl td::before{content:attr(data-label);display:block;font-size:9px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin-bottom:2px}
      .tbl td:nth-child(1){grid-area:no}
      .tbl td:nth-child(2){grid-area:type}
      .tbl td:nth-child(3){grid-area:amt;text-align:right;font-size:16px;font-weight:800}
      .tbl td:nth-child(4){grid-area:mode}
      .tbl td:nth-child(5){grid-area:date;font-size:12px}
      .tbl td:nth-child(6){grid-column:1/-1}
      .tbl td.rsn:empty{display:none}
      .tbl td:nth-child(7){grid-column:1/-1;padding-top:2px}
      .tbl td:nth-child(7)::before{display:none}
      .tbl .acts{justify-content:flex-end}
      .tbl tbody tr:has(td[colspan]){display:block;padding:0;border:0;background:none;box-shadow:none}
      .tbl tbody tr:has(td[colspan]) td{display:block;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:var(--sh)}
      .tbl tbody tr:has(td[colspan]) td::before{display:none}
    }
    /* Narrow phones: two columns, date on its own row. */
    @media(max-width:430px){
      .tbl tbody tr{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"no amt" "type mode" "date date"}
      .sum{gap:10px 16px}
      .visit{padding:16px}
    }
    /* Receipt preview on phones. */
    @media(max-width:640px){
      .rscrim{padding:10px}
      .rcp{border-radius:12px}
      .rhead{flex-wrap:wrap}
      .rhead .row{width:100%;justify-content:flex-end}
    }
  `]
})
export class ReceiptsComponent implements OnInit {
  private api = inject(ApiService);
  private notify = inject(ToastService);
  private route = inject(ActivatedRoute);
  private san = inject(DomSanitizer);

  data = signal<ReceiptList | null>(null);
  loading = signal(true);
  error = signal('');
  selected = signal<BookingPayment | null>(null);
  receiptHtml = signal('');
  receiptLoading = signal(false);
  safeReceipt = computed(() => this.san.bypassSecurityTrustHtml(this.receiptHtml()));

  private bookingId = 0;

  ngOnInit() {
    this.bookingId = Number(this.route.snapshot.paramMap.get('id'));
    this.reload();
  }

  reload() {
    if (!this.bookingId) { this.loading.set(false); this.error.set('Invalid booking.'); return; }
    this.loading.set(true); this.error.set('');
    this.api.bookingReceipts(this.bookingId).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: e => { this.loading.set(false); this.error.set(e.error?.message ?? 'Could not load the receipts.'); }
    });
  }

  view(r: BookingPayment) {
    this.selected.set(r);
    this.receiptHtml.set(''); this.receiptLoading.set(true);
    this.api.paymentReceiptHtml(r.id).subscribe({
      next: h => { this.receiptHtml.set(h); this.receiptLoading.set(false); },
      error: e => { this.receiptLoading.set(false); this.notify.err(e.error?.message ?? 'Could not load the receipt.'); }
    });
  }
  closeReceipt() { this.selected.set(null); this.receiptHtml.set(''); this.receiptLoading.set(false); }

  download(r: BookingPayment) {
    this.api.paymentReceiptPdf(r.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = r.receiptNo + '.pdf'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: e => this.notify.err(e.error?.message ?? 'Could not download the PDF.')
    });
  }
}