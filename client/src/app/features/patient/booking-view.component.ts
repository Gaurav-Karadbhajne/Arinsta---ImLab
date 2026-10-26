// View drawer for the Search grid. One visit at a time, with every money action in place:
// collect / discount, refund, add tests or packages, and preview every receipt as HTML/PDF.
// Up/down arrows move through the ids currently shown in the grid (keyset pages included).
import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { IstDatePipe } from '../../core/ist-date.pipe';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { BookingDetail, BookingLine, BookingPayment, RegPackage, RegTestItem, RegistrationData } from '../../core/models';

// One picked line in the Add tests wizard. key = "t<id>" for a test, "p<id>" for a package.
interface CartLine { key: string; kind: 'test' | 'package'; id: number; name: string; price: number; meta: string; }
// One row that can be soft-deleted from the drawer: a test line, a package line or a money voucher.
interface DelTarget { kind: 'test' | 'package' | 'payment'; id: number; label: string; amount: number; isRefund?: boolean; }
type DrawerTab = 'tests' | 'money' | 'add' | 'history';
const PAY_MODES = ['Cash', 'UPI', 'Card', 'Cheque', 'Credit'];

@Component({
  selector: 'app-booking-view', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, IstDatePipe],
  template: `
  <div class="scrim" (click)="closed.emit()">
    <aside class="dr" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-label="Visit details">

      @if (loading()) {
        <div class="head">
          <div class="who"><span class="av sk"></span><div class="grow"><div class="sk" style="width:180px;height:18px"></div><div class="sk" style="width:250px;height:12px;margin-top:8px"></div></div></div>
          <button class="ibtn" (click)="closed.emit()" aria-label="Close">×</button>
        </div>
        <div class="pad"><div class="sk" style="height:64px"></div><div class="sk" style="height:260px;margin-top:12px"></div></div>
      } @else if (error()) {
        <div class="head"><div class="grow"><h3>Could not open this visit</h3><p class="mut">{{error()}}</p></div><button class="ibtn" (click)="closed.emit()" aria-label="Close">×</button></div>
        <div class="pad"><button class="btn" (click)="reload()">Try again</button></div>
      } @else {
        @if (detail(); as d) {
          <header class="head">
            <div class="who">
              <span class="av">{{initials(d)}}</span>
              <div class="grow">
                <div class="nm">{{fullName(d)}} @if (d.isRebook) { <span class="b y">Rebook</span> }</div>
                <div class="sub">UID {{d.uid}} · Lab {{d.labNo}} · Bill {{d.billNo}}</div>
                <div class="sub2">{{ageText(d)}} · {{d.gender}} · {{d.mobile || 'No mobile'}}</div>
              </div>
            </div>
            <div class="hact">
              <button class="ibtn" [disabled]="!prevId()" (click)="go(-1)" title="Previous patient" aria-label="Previous patient">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
              </button>
              <button class="ibtn" [disabled]="!nextId()" (click)="go(1)" title="Next patient" aria-label="Next patient">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
              </button>
              <button class="ibtn" (click)="closed.emit()" title="Close" aria-label="Close">×</button>
            </div>
          </header>

          <div class="mline">
            <div><span>Total</span><b>₹{{d.total | number:'1.2-2'}}</b></div>
            <div><span>Discount</span><b>₹{{d.discount | number:'1.2-2'}}</b></div>
            <div><span>Collected</span><b>₹{{d.paid | number:'1.2-2'}}</b></div>
            <div><span>Refunded</span><b class="r">₹{{d.refunded | number:'1.2-2'}}</b></div>
            <div class="bal" [class.zero]="d.balance <= 0"><span>Balance</span><b>₹{{d.balance | number:'1.2-2'}}</b></div>
          </div>

          <nav class="dnav">
            <button [class.on]="tab() === 'tests'" (click)="selectTab('tests')">Investigations <i>{{d.lines.length}}</i></button>
            <button [class.on]="tab() === 'money'" (click)="selectTab('money')">Collect &amp; refund</button>
            <button [class.on]="tab() === 'add'" (click)="selectTab('add')">+ Add tests</button>
            <button [class.on]="tab() === 'history'" (click)="selectTab('history')">Receipts <i>{{d.payments.length}}</i></button>
          </nav>

          <div class="body">
            @if (tab() === 'tests') {
              <div class="sec">
                <div class="card soft">
                  <div class="secH"><h3>Investigations</h3><span class="mut">{{d.lines.length}} line(s)</span></div>
                  <div class="tbl mini">
                    <table>
                      <thead><tr><th>Test</th><th>Department</th><th class="num">Price</th><th>Status</th><th class="num"></th></tr></thead>
                      <tbody>
                        <!-- Each package is a group: the charge row, then its included tests indented underneath. -->
                        @for (g of lineGroups().packages; track g.pkg.id) {
                          <tr class="pkgrow">
                            <td><b>{{g.pkg.name}}</b> <span class="b p">Package</span></td>
                            <td class="mut">{{g.kids.length}} test(s) included</td>
                            <td class="num">₹{{g.pkg.price | number:'1.2-2'}}</td>
                            <td><span class="b s">{{g.pkg.status}}</span></td>
                            <td class="num">
                              <button class="btn danger sm" type="button" (click)="askDeleteLine(g.pkg)" title="Delete this package and its tests">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/></svg>
                                Delete package
                              </button>
                            </td>
                          </tr>
                          @for (k of g.kids; track k.id) {
                            <tr class="kidrow">
                              <td>↳ {{k.name}}</td>
                              <td class="mut">{{k.department}}</td>
                              <td class="num mut">Included</td>
                              <td><span class="b s">{{k.status}}</span> @if (k.sampleCollected) { <span class="b g">Sample</span> }</td>
                              <td></td>
                            </tr>
                          }
                        }
                        @for (l of lineGroups().standalones; track l.id) {
                          <tr>
                            <td><b>{{l.name}}</b></td>
                            <td class="mut">{{l.department}}</td>
                            <td class="num">₹{{l.price | number:'1.2-2'}}</td>
                            <td><span class="b s">{{l.status}}</span> @if (l.sampleCollected) { <span class="b g">Sample</span> }</td>
                            <td class="num">
                              <button class="ibtn del" type="button" (click)="askDeleteLine(l)" title="Delete investigation" aria-label="Delete investigation">
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/></svg>
                              </button>
                            </td>
                          </tr>
                        }
                        <!-- Safety net: a component whose package row is missing still shows, without a delete action. -->
                        @for (l of lineGroups().orphans; track l.id) {
                          <tr class="kidrow">
                            <td>↳ {{l.name}} <span class="b">Included</span></td>
                            <td class="mut">{{l.department}}</td>
                            <td class="num mut">Included</td>
                            <td><span class="b s">{{l.status}}</span></td>
                            <td class="mut small">In package</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
                <div class="card soft">
                  <div class="secH"><h3>Visit details</h3></div>
                  <div class="meta">
                    <div><span>Referred by</span><b>{{d.referral || '—'}}</b></div>
                    <div><span>Corporate</span><b>{{d.corporate || '—'}}</b></div>
                    <div><span>Patient type</span><b>{{d.patientType}}</b></div>
                    <div><span>Delivery</span><b>{{d.deliveryMode}}</b></div>
                    <div><span>Discount remark</span><b>{{d.discountRemark || '—'}}</b></div>
                    <div><span>Remark</span><b>{{d.remark || '—'}}</b></div>
                  </div>
                </div>
              </div>
            }

            @if (tab() === 'money') {
              <div class="sec">
                <div class="card soft">
                  <div class="secH"><h3>Collect now</h3><span class="b a">Balance ₹{{d.balance | number:'1.2-2'}}</span></div>
                  <div class="quick">
                    <button type="button" class="chip" (click)="setLater()">Collect later · ₹0</button>
                    <button type="button" class="chip" (click)="setFull()">Full balance · ₹{{d.balance | number:'1.2-2'}}</button>
                  </div>
                  <div class="fgrid">
                    <label><span>BAL AMT</span><input class="inp" [value]="d.balance" disabled></label>
                    <label><span>DIS %</span><input class="inp" type="number" min="0" max="100" [value]="discPct() ?? ''" (input)="setPct($any($event.target).value)" placeholder="0"></label>
                    <label><span>DISCOUNT</span><input class="inp" type="number" min="0" [attr.max]="bal()" [value]="discAmt()" (input)="setDiscount($any($event.target).value)"></label>
                    <label><span>PAYMENT</span><input class="inp" type="number" min="0" [attr.max]="bal()" [value]="pay()" (input)="setPay($any($event.target).value)"></label>
                    <label><span>NET AMT</span><input class="inp" [value]="netAfter()" disabled></label>
                    <label><span>PAYMENT MODE</span>
                      <select class="inp" [value]="mode()" (change)="mode.set($any($event.target).value)">
                        @for (m of modes; track m) { <option [value]="m">{{m}}</option> }
                      </select>
                    </label>
                    <label class="wide"><span>DISCOUNT REMARK</span><input class="inp" [value]="discRemark()" (input)="discRemark.set($any($event.target).value)" placeholder="Why is this discount given? (optional)"></label>
                  </div>
                  @if (overLimit()) { <p class="hint bad">Collected amount cannot be more than the bill total. Payment + discount crosses the balance of ₹{{bal() | number:'1.2-2'}}.</p> }
                  <div class="fbar">
                    <span class="mut small">Every payment gets its own receipt. A ₹0 payment is never recorded.</span>
                    <button class="btn" [disabled]="!canCollect() || saving()" (click)="collect()">{{saving() ? 'Saving…' : 'Save &amp; collect'}}</button>
                  </div>
                </div>

                <div class="card soft">
                  <div class="secH"><h3>Refund</h3><span class="mut">Net collected ₹{{netPaid() | number:'1.2-2'}}</span></div>
                  @if (netPaid() > 0) {
                    <div class="fgrid">
                      <label><span>REFUND AMOUNT</span><input class="inp" type="number" min="0" [value]="refundAmt()" (input)="setRefund($any($event.target).value)"></label>
                      <label><span>REASON *</span><input class="inp" [value]="refundReason()" (input)="refundReason.set($any($event.target).value)" placeholder="Why is money going back?"></label>
                      <label class="wide"><span>REMARK</span><input class="inp" [value]="refundRemark()" (input)="refundRemark.set($any($event.target).value)" placeholder="Optional note"></label>
                    </div>
                    <div class="fbar">
                      <span class="mut small">Refunds are separate negative money rows — the original receipt is never edited.</span>
                      <button class="btn danger" [disabled]="!canRefund() || refunding()" (click)="refund()">{{refunding() ? 'Refunding…' : 'Refund'}}</button>
                    </div>
                  } @else {
                    <p class="mut">Nothing left to refund on this visit.</p>
                  }
                </div>
              </div>
            }

            @if (tab() === 'add') {
              <div class="sec">
                @if (!data()) {
                  <div class="card soft"><div class="sk" style="height:40px"></div><div class="sk" style="height:220px;margin-top:12px"></div></div>
                } @else if (addStep() === 1) {
                  <div class="card soft">
                    <div class="ph2">
                      <input class="inp grow" [value]="pickQ()" (input)="pickQ.set($any($event.target).value)" placeholder="Search tests or packages">
                      <div class="seg">
                        <button [class.on]="pickKind() === 'tests'" (click)="pickKind.set('tests')">Tests</button>
                        <button [class.on]="pickKind() === 'packages'" (click)="pickKind.set('packages')">Packages</button>
                      </div>
                    </div>
                    @if (pickKind() === 'tests') {
                      <div class="chips">
                        <button type="button" class="chip" [class.on]="pickDept() === -1" (click)="pickDept.set(-1)">All</button>
                        @for (dep of data()!.departments; track dep.id) {
                          <button type="button" class="chip" [class.on]="pickDept() === dep.id" (click)="pickDept.set(dep.id)">{{dep.name}}</button>
                        }
                      </div>
                      <div class="picklist">
                        @for (t of pickerTests(); track t.id) {
                          <button type="button" class="pick" [class.on]="inCart('t' + t.id)" (click)="toggleTest(t)">
                            <span class="cb">{{inCart('t' + t.id) ? '✓' : ''}}</span>
                            <span class="pn"><b>{{t.name}}</b><small>{{t.shortName}} · {{t.sampleType || 'Sample'}}</small></span>
                            <span class="pp">₹{{t.price | number:'1.2-2'}}</span>
                          </button>
                        } @empty { <p class="mut pad">No tests match this search.</p> }
                      </div>
                    } @else {
                      <div class="picklist" style="margin-top:10px">
                        @for (p of pickerPackages(); track p.id) {
                          <button type="button" class="pick" [class.on]="inCart('p' + p.id)" (click)="togglePackage(p)">
                            <span class="cb">{{inCart('p' + p.id) ? '✓' : ''}}</span>
                            <span class="pn"><b>{{p.name}}</b><small>{{p.tests.length}} tests included · {{packageTestNames(p)}}</small></span>
                            <span class="pp">₹{{p.price | number:'1.2-2'}}</span>
                          </button>
                        } @empty { <p class="mut pad">No packages match this search.</p> }
                      </div>
                    }
                    <div class="cartbar">
                      <span><b>{{cart().length}}</b> selected · ₹{{cartTotal() | number:'1.2-2'}}</span>
                      <button class="btn" [disabled]="!cart().length" (click)="addStep.set(2)">Review →</button>
                    </div>
                  </div>
                } @else {
                  <div class="card soft">
                    <div class="secH">
                      <button class="ibtn" (click)="addStep.set(1)" title="Back" aria-label="Back">←</button>
                      <h3 class="grow">New lines</h3>
                      <span class="mut">Bill after adding ₹{{cartTotal() | number:'1.2-2'}}</span>
                    </div>
                    <div class="lines">
                      @for (c of cart(); track c.key) {
                        <div class="line">
                          <span><b>{{c.name}}</b><small>{{c.meta}}</small></span>
                          <span class="lp">₹{{c.price | number:'1.2-2'}}</span>
                          <button class="lnx" (click)="removeLine(c.key)" title="Remove" aria-label="Remove">×</button>
                        </div>
                      }
                    </div>
                    <div class="fgrid" style="margin-top:12px">
                      <label><span>NEW BILL TOTAL</span><input class="inp" [value]="d.total + cartTotal()" disabled></label>
                      <label><span>COLLECT NOW</span><input class="inp" type="number" min="0" [attr.max]="addMax()" [value]="addPay()" (input)="setAddPay($any($event.target).value)"></label>
                      <label><span>PAYMENT MODE</span>
                        <select class="inp" [value]="addMode()" (change)="addMode.set($any($event.target).value)">
                          @for (m of modes; track m) { <option [value]="m">{{m}}</option> }
                        </select>
                      </label>
                    </div>
                    @if (addOver()) { <p class="hint bad">Collected amount cannot be more than the bill total. You can collect at most ₹{{addMax() | number:'1.2-2'}} now.</p> }
                    <div class="fbar">
                      <span class="mut small">A receipt is issued when COLLECT NOW is more than ₹0.</span>
                      <button class="btn" [disabled]="adding() || !cart().length || addOver()" (click)="addTests()">{{adding() ? 'Adding…' : 'Add to bill'}}</button>
                    </div>
                  </div>
                }
              </div>
            }

            @if (tab() === 'history') {
              <div class="sec">
                <div class="card soft">
                  <div class="secH"><h3>Receipts &amp; vouchers</h3><span class="mut">{{d.payments.length}} money row(s)</span></div>
                  @for (p of paymentsNewest(); track p.id) {
                    <div class="pay">
                      <span class="pico" [class.ref]="p.kind === 'refund'">{{p.kind === 'refund' ? '−' : '₹'}}</span>
                      <div class="pinfo">
                        <b>{{p.receiptNo}}</b>
                        <small>{{p.paidAt | istDate}} · {{p.mode}}</small>
                        @if (p.reason) { <small class="rsn">{{p.reason}}</small> }
                      </div>
                      <div class="pamt" [class.ref]="p.kind === 'refund'">{{p.kind === 'refund' ? '−' : ''}}₹{{p.amount | number:'1.2-2'}}</div>
                      <div class="pact">
                        <button class="ibtn" title="View voucher" aria-label="View voucher" (click)="openReceipt(p.id, p.receiptNo, p.kind === 'refund' ? 'Refund voucher' : 'Payment receipt')">
                          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                        <button class="ibtn" title="Download PDF" aria-label="Download PDF" (click)="downloadReceipt(p.id, p.receiptNo)">
                          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>
                        </button>
                        <button class="ibtn del" title="Delete voucher" aria-label="Delete voucher" (click)="askDeletePayment(p)">
                          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/></svg>
                        </button>
                      </div>
                    </div>
                  } @empty { <p class="mut pad">No money recorded yet.</p> }
                </div>
              </div>
            }
          </div>
        }
      }
    </aside>
  </div>

  @if (receiptHtml() || receiptLoading()) {
    <div class="rscrim" (click)="closeReceipt()">
      <div class="rcp pop" (click)="$event.stopPropagation()">
        <div class="rhead">
          <div><b>{{receiptTitle()}}</b><small class="mut">{{receiptNo()}}</small></div>
          <div class="row">
            <button class="btn sm ghost" (click)="downloadOpenReceipt()">Download PDF</button>
            <button class="ibtn" (click)="closeReceipt()" aria-label="Close">×</button>
          </div>
        </div>
        @if (receiptLoading()) { <div class="rload"><div class="sk" style="height:420px"></div></div> }
        @else { <iframe [srcdoc]="safeReceipt()" title="Receipt"></iframe> }
      </div>
    </div>
  }

  @if (delTarget(); as t) {
    <div class="rscrim" (click)="closeDelete()">
      <div class="dmodal pop" (click)="$event.stopPropagation()" role="dialog" aria-modal="true">
        <header class="dhead">
          <div><b>{{delTitle(t)}}</b><small class="mut">{{t.label}}</small></div>
          <button class="ibtn" (click)="closeDelete()" aria-label="Close">×</button>
        </header>
        <div class="dbody">
          <p class="warnbox">Nothing is erased. This row leaves the bill and its totals, and can be put back any time from Reports → Delete log.</p>
          <div class="dgrid">
            <div><span>Amount</span><b>₹{{t.amount | number:'1.2-2'}}</b></div>
            @if (delPreview(); as pv) {
              <div><span>{{t.kind === 'payment' ? 'Collected after' : 'Bill total after'}}</span><b>₹{{pv.primary | number:'1.2-2'}}</b></div>
              <div><span>Balance after</span><b>₹{{pv.balance | number:'1.2-2'}}</b></div>
            }
          </div>
          <label class="lb">REASON *</label>
          <textarea class="inp" rows="3" [value]="delReason()" (input)="delReason.set($any($event.target).value)" placeholder="Why is this being deleted?"></textarea>
          @if (deleteBlock()) { <p class="hint bad">{{deleteBlock()}}</p> }
          @else if (delReason().trim().length < 3) { <p class="hint">Enter at least 3 characters.</p> }
        </div>
        <footer class="dfoot">
          <button class="btn ghost" (click)="closeDelete()">Cancel</button>
          <button class="btn danger" [disabled]="!canDeleteRow() || deleting()" (click)="confirmDeleteRow()">{{deleting() ? 'Deleting…' : 'Delete'}}</button>
        </footer>
      </div>
    </div>
  }`,
  styles: [`
    .scrim{position:fixed;inset:0;z-index:80;background:rgba(6,18,28,.46);backdrop-filter:blur(2px);display:flex;justify-content:flex-end}
        /* 100vh is the fallback, 100dvh follows the visible area on mobile browsers. */
    .dr{width:min(660px,100%);height:100vh;height:100dvh;background:var(--card);box-shadow:var(--sh-lg);display:flex;flex-direction:column;animation:sl .24s cubic-bezier(.2,.7,.2,1)}
    @keyframes sl{from{transform:translateX(48px);opacity:.5}to{transform:none;opacity:1}}
    .head{display:flex;align-items:flex-start;gap:12px;padding:16px 18px;border-bottom:1px solid var(--line);flex:none}
    .who{display:flex;gap:12px;align-items:center;flex:1;min-width:0}
    .av{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#12B3A0,#0B7A6D);color:#fff;font-weight:800;font-size:14px;flex:none}
    .nm{font-size:17px;font-weight:800;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .sub{color:var(--mut);font-size:12px;margin-top:2px}
    .sub2{color:var(--mut);font-size:12px}
    .hact{display:flex;gap:6px;flex:none}
    .ibtn:disabled{opacity:.35;cursor:default}
    .mline{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border-bottom:1px solid var(--line);background:var(--bg);flex:none}
    .mline>div{padding:9px 12px;border-right:1px solid var(--line);min-width:0}
    .mline>div:last-child{border-right:0}
    .mline span{display:block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--mut)}
    .mline b{display:block;margin-top:3px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .mline b.r{color:#C0392B}
    .mline .bal{background:var(--tl)}
    .mline .bal.zero{background:#DDF3E8}
    .mline .bal.zero b{color:#17724A}
    .dnav{display:flex;gap:2px;padding:8px 12px;border-bottom:1px solid var(--line);overflow:auto;flex:none}
    .dnav button{display:flex;align-items:center;gap:5px;border:0;background:none;padding:8px 11px;border-radius:9px;font-weight:700;font-size:13px;color:var(--mut);cursor:pointer;white-space:nowrap}
    .dnav button:hover{background:var(--bg);color:var(--ink)}
    .dnav button.on{background:var(--tl);color:var(--td)}
    .dnav i{font-style:normal;font-size:11px;background:var(--line);padding:1px 6px;border-radius:99px}
        /* Extra bottom padding keeps the last button above the phone home indicator. */
    .body{flex:1;overflow:auto;padding:14px 16px calc(26px + env(safe-area-inset-bottom));background:var(--bg)}
    .sec{display:flex;flex-direction:column;gap:12px}
    .card.soft{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px}
    .secH{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
    .secH h3{margin:0}
    .secH .mut{font-size:12px}
    .tbl.mini{box-shadow:none;border-radius:10px}
    .tbl.mini th,.tbl.mini td{padding:9px 10px;font-size:13px}
    .meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
    .meta span{display:block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--mut)}
    .meta b{display:block;font-weight:600;font-size:13px;margin-top:2px}
    .quick{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
    .fgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .fgrid label{display:flex;flex-direction:column;gap:4px;min-width:0}
    .fgrid label span{font-size:10px;font-weight:800;letter-spacing:.05em;color:var(--mut)}
    .fgrid .wide{grid-column:1/-1}
    .fgrid .inp{padding:8px 10px}
    .fgrid .inp:disabled{background:var(--bg);color:var(--mut);cursor:not-allowed}
    .fbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px;flex-wrap:wrap}
    .small{font-size:12px}
    .hint{margin:8px 0 0;font-size:12px;color:var(--mut)}
    .hint.bad{color:#C0392B;font-weight:600}
    .pad{padding:18px}
    .ph2{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
    .seg{display:flex;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:3px}
    .seg button{border:0;background:none;padding:7px 12px;border-radius:8px;font-weight:700;font-size:12px;color:var(--mut);cursor:pointer}
    .seg button.on{background:var(--card);color:var(--td);box-shadow:var(--sh)}
    .chips{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}
    .chip{padding:5px 11px;font-size:12px}
    .picklist{display:flex;flex-direction:column;gap:6px;max-height:330px;overflow:auto;padding-right:2px}
    .pick{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid var(--line);background:var(--card);border-radius:10px;padding:9px 11px;cursor:pointer;transition:all .12s}
    .pick:hover{border-color:var(--teal);background:var(--tl)}
    .pick.on{border-color:var(--teal);background:var(--tl)}
    .cb{width:20px;height:20px;border-radius:6px;border:1.5px solid var(--fld);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:var(--td);flex:none}
    .pick.on .cb{background:var(--teal);border-color:var(--teal);color:#fff}
    .pn{display:flex;flex-direction:column;flex:1;min-width:0}
    .pn b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .pn small{color:var(--mut);font-size:11px}
    .pp{font-weight:700;font-size:13px;flex:none}
    .cartbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}
    .lines{display:flex;flex-direction:column;gap:6px}
    .line{display:flex;align-items:center;gap:10px;background:var(--bg);border-radius:9px;padding:8px 10px}
    .line span:first-child{display:flex;flex-direction:column;flex:1;min-width:0}
    .line b{font-size:13px}.line small{color:var(--mut);font-size:11px}
    .lp{font-weight:700;font-size:13px}
    .lnx{border:0;background:none;color:var(--mut);font-size:18px;cursor:pointer;line-height:1}
    .lnx:hover{color:#C0392B}
    .pay{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)}
    .pay:last-child{border-bottom:0}
    .pico{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;background:var(--tl);color:var(--td);font-weight:800;flex:none}
    .pico.ref{background:#FDE2E0;color:#A12A22}
    .pinfo{display:flex;flex-direction:column;flex:1;min-width:0}
    .pinfo b{font-size:13px}.pinfo small{color:var(--mut);font-size:11px}
    .pinfo small.rsn{color:var(--ink);margin-top:2px}
    .pamt{font-weight:800;font-size:14px;white-space:nowrap}
    .pamt.ref{color:#C0392B}
    .pact{display:flex;gap:4px}
    .ibtn.del:hover{color:#C0392B;border-color:#F3B4AE;background:#FDE2E0}
    .tbl.mini td:last-child{width:44px}
        /* Package group: charge row on a tinted band, included tests indented below it. */
    .tbl.mini tr.pkgrow td{background:var(--bg)}
    .tbl.mini tr.pkgrow td:last-child{width:auto;white-space:nowrap}
    .tbl.mini tr.kidrow td{font-size:12.5px}
    .tbl.mini tr.kidrow td:first-child{padding-left:24px}
    .pkgrow .btn.danger.sm{padding:6px 10px;font-size:12px}
    .dmodal{width:min(480px,100%);max-height:92vh;max-height:92dvh;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--sh-lg);overflow:hidden}
    .dhead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 16px;border-bottom:1px solid var(--line)}
    .dhead b{display:block;font-size:14px}
    .dhead small{font-size:11px}
    .dbody{padding:14px 16px;overflow:auto;display:flex;flex-direction:column;gap:10px}
    .dgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;background:var(--bg);border-radius:10px;padding:10px}
    .dgrid span{display:block;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--mut)}
    .dgrid b{display:block;font-size:13px;margin-top:2px;white-space:nowrap}
    .lb{font-size:10px;font-weight:800;letter-spacing:.05em;color:var(--mut)}
    .dbody textarea.inp{resize:vertical;padding:8px 10px}
    .warnbox{background:var(--aml);color:var(--amd);border-radius:10px;padding:10px 12px;font-size:12px;margin:0}
    .dfoot{display:flex;justify-content:flex-end;gap:8px;padding:11px 16px;border-top:1px solid var(--line);background:var(--bg)}
    .rscrim{position:fixed;inset:0;z-index:90;background:rgba(6,18,28,.55);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(2px)}
        .rcp{width:min(760px,100%);height:min(880px,94vh);height:min(880px,94dvh);display:flex;flex-direction:column;background:var(--card);border-radius:16px;box-shadow:var(--sh-lg);overflow:hidden}
    .rhead{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line)}
    .rhead b{display:block;font-size:14px}.rhead small{font-size:11px}
    .rcp iframe{flex:1;width:100%;border:0;background:#F4F7F6}
    .rload{flex:1;padding:16px}
       /* Phones: all four tabs visible in a 2x2 grid, balance gets the whole last row. */
    @media(max-width:640px){
      .mline{grid-template-columns:repeat(3,minmax(0,1fr))}
      .mline>div:nth-child(3){border-right:0}
      .mline .bal{grid-column:span 2;border-right:0}
      .dnav{display:grid;grid-template-columns:1fr 1fr;gap:4px;overflow:visible}
      .dnav button{justify-content:center;padding:9px 6px;font-size:12px}
      .fgrid{grid-template-columns:repeat(2,minmax(0,1fr))}
      .head{padding:14px}
      .body{padding:12px 14px calc(20px + env(safe-area-inset-bottom))}
      .dr{width:100%}
      .rscrim{padding:10px}
      .rcp{height:min(880px,94dvh);border-radius:12px}
    }
    /* Narrow phones: one field per row, compact buttons, no hidden table column. */
    @media(max-width:460px){
      .fgrid{grid-template-columns:1fr}
      .hact .ibtn{width:34px;height:34px}
      .tbl.mini table{min-width:0}
      .tbl.mini th:nth-child(2),.tbl.mini td:nth-child(2){display:none}
      .ph2 .inp.grow{flex:1 1 100%}
      .seg{width:100%}
      .seg button{flex:1}
      .secH{flex-wrap:wrap}
      .pact .ibtn{width:34px;height:34px}
      .rhead{flex-wrap:wrap}
      .rhead .row{width:100%;justify-content:flex-end}
      .dgrid{grid-template-columns:1fr}
    }
  `]
})
export class BookingViewComponent {
  private api = inject(ApiService);
  private notify = inject(ToastService);
  private san = inject(DomSanitizer);

  // Parent binds the visit id plus every id currently in the grid.
  id = input.required<number>();
  ids = input<number[]>([]);
  // Which tab the drawer opens on: Search's Receipts icon passes 'history', View leaves it null.
  startTab = input<DrawerTab | null>(null);
  closed = output<void>();
  changed = output<void>();
  navigate = output<number>();

  detail = signal<BookingDetail | null>(null);
  loading = signal(true);
  error = signal('');
  tab = signal<DrawerTab>('tests');
  readonly modes = PAY_MODES;

  // Collect form.
  pay = signal(0); discAmt = signal(0); discPct = signal<number | null>(null); discRemark = signal('');
  mode = signal('Cash'); saving = signal(false);
  // Refund form.
  refundAmt = signal(0); refundReason = signal(''); refundRemark = signal(''); refunding = signal(false);
  // Receipt modal.
  receiptHtml = signal(''); receiptTitle = signal(''); receiptNo = signal('');
  receiptPaymentId = signal<number | null>(null); receiptLoading = signal(false);
  safeReceipt = computed(() => this.san.bypassSecurityTrustHtml(this.receiptHtml()));
  // Add tests wizard.
  data = signal<RegistrationData | null>(null); dataLoading = signal(false);
  pickKind = signal<'tests' | 'packages'>('tests'); pickQ = signal(''); pickDept = signal(-1);
  cart = signal<CartLine[]>([]); addStep = signal<1 | 2>(1); addPay = signal(0); addMode = signal('Cash'); adding = signal(false);
  // Soft-delete modal: one reason box serves test lines, package lines and money rows.
  delTarget = signal<DelTarget | null>(null); delReason = signal(''); deleting = signal(false);

  private loadSeq = 0;
  private opened = false;

  // Live maths. The server re-checks every number before saving.
  bal = computed(() => this.detail()?.balance ?? 0);
  netPaid = computed(() => { const d = this.detail(); return d ? d.paid - d.refunded : 0; });
  netAfter = computed(() => Math.max(0, Math.round((this.bal() - this.discAmt() - this.pay()) * 100) / 100));
  overLimit = computed(() => this.pay() + this.discAmt() > this.bal() + 0.005);
  canCollect = computed(() => {
    const amount = this.pay(), discount = this.discAmt();
    return (amount > 0 || discount > 0) && !this.overLimit() && (amount === 0 || this.mode().length > 0);
  });
  canRefund = computed(() => {
    const amount = this.refundAmt();
    return amount > 0 && amount <= this.netPaid() + 0.005 && this.refundReason().trim().length >= 3;
  });
  idx = computed(() => this.ids().indexOf(this.id()));
  prevId = computed(() => { const i = this.idx(); return i > 0 ? this.ids()[i - 1] : null; });
  nextId = computed(() => { const i = this.idx(); return i >= 0 && i < this.ids().length - 1 ? this.ids()[i + 1] : null; });
  pickerTests = computed(() => {
    const all = this.data()?.departments ?? [];
    const dept = this.pickDept();
    const needle = this.pickQ().trim().toLowerCase();
    const src = dept === -1 ? all.flatMap(d => d.tests) : (all.find(d => d.id === dept)?.tests ?? []);
    return needle ? src.filter(t => (t.name + ' ' + t.shortName).toLowerCase().includes(needle)) : src;
  });
  pickerPackages = computed(() => {
    const needle = this.pickQ().trim().toLowerCase();
    const all = this.data()?.packages ?? [];
    return needle ? all.filter(p => p.name.toLowerCase().includes(needle)) : all;
  });
  cartTotal = computed(() => this.cart().reduce((sum, c) => sum + c.price, 0));
  paymentsNewest = computed(() => [...(this.detail()?.payments ?? [])].reverse());
  // Investigations tab: a package row owns the component tests that share its catalog package id.
  lineGroups = computed(() => {
    const lines = this.detail()?.lines ?? [];
    const components = lines.filter(l => !l.isPackage && l.packageId != null);
    const used = new Set<number>();
    const packages = lines.filter(l => l.isPackage).map(pkg => {
      const kids = pkg.packageId == null ? []
        : components.filter(c => c.packageId === pkg.packageId && !used.has(c.id));
      kids.forEach(k => used.add(k.id));
      return { pkg, kids };
    });
    return {
      packages,
      standalones: lines.filter(l => !l.isPackage && l.packageId == null),
      orphans: components.filter(c => !used.has(c.id))
    };
  });
  // Add-tests wizard: the server rejects any collection above the bill after adding.
  addMax = computed(() => {
    const d = this.detail();
    return d ? Math.max(0, Math.round((d.total + this.cartTotal() - d.discount - d.paid) * 100) / 100) : 0;
  });
  addOver = computed(() => this.addPay() > this.addMax() + 0.005);

  // Live "after" numbers shown in the delete modal. detail.paid is GROSS; net = paid - refunded.
  delPreview = computed(() => {
    const t = this.delTarget(), d = this.detail();
    if (!t || !d) return null;
    if (t.kind === 'payment') {
      const net = Math.round((d.paid - d.refunded) * 100) / 100;
      const netAfter = Math.round((t.isRefund ? net + t.amount : net - t.amount) * 100) / 100;
      return { primary: netAfter, balance: Math.round((d.total - d.discount - netAfter) * 100) / 100 };
    }
    const totalAfter = Math.round((d.total - t.amount) * 100) / 100;
    return { primary: totalAfter, balance: Math.round((totalAfter - d.discount - (d.paid - d.refunded)) * 100) / 100 };
  });
  deleteBlock = computed(() => {
    const t = this.delTarget(), d = this.detail();
    if (!t || !d) return '';
    const pv = this.delPreview();
    if (t.kind === 'payment') {
      if (pv && pv.primary < -0.005) return 'Deleting this receipt would make the collected money negative.';
      if (pv && pv.balance < -0.005) return `Deleting this receipt would make the bill overpaid by ₹${(-pv.balance).toFixed(2)}. Refund the difference first.`;
      return '';
    }
    const netPaid = Math.round((d.paid - d.refunded) * 100) / 100;
    const netBill = Math.round((d.total - t.amount - d.discount) * 100) / 100;
    if (netPaid > netBill + 0.005)
      return `Collected ₹${netPaid.toFixed(2)} is more than the new bill ₹${netBill.toFixed(2)}. Refund ₹${(netPaid - netBill).toFixed(2)} first, then delete this ${t.kind}.`;
    return '';
  });
  canDeleteRow = computed(() => !!this.delTarget() && this.delReason().trim().length >= 3 && !this.deleteBlock());

  constructor() {
    // First open + every prev/next move. startTab is read once so moving between patients
    // never re-forces the tab the drawer was opened on.
    effect(() => {
      const bookingId = this.id();
      const first = !this.opened;
      this.opened = true;
      const start = first ? untracked(() => this.startTab()) : null;
      this.resetForPatient();
      if (start) this.selectTab(start);
      this.load(bookingId);
    });
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.delTarget()) this.closeDelete();
    else if (this.receiptHtml() || this.receiptLoading()) this.closeReceipt();
    else this.closed.emit();
  }

  load(bookingId = this.id()) {
    const my = ++this.loadSeq;
    this.loading.set(true); this.error.set('');
    this.api.bookingDetail(bookingId).subscribe({
      next: d => { if (my !== this.loadSeq) return; this.detail.set(d); this.loading.set(false); },
      error: e => { if (my !== this.loadSeq) return; this.loading.set(false); this.error.set(e.error?.message ?? 'Could not load this visit.'); }
    });
  }
  reload() { this.load(this.id()); }

  private resetForPatient() {
    this.tab.set('tests');
    this.closeReceipt();
    this.pay.set(0); this.discAmt.set(0); this.discPct.set(null); this.discRemark.set(''); this.mode.set('Cash');
    this.refundAmt.set(0); this.refundReason.set(''); this.refundRemark.set('');
    this.cart.set([]); this.addStep.set(1); this.addPay.set(0); this.pickQ.set(''); this.pickDept.set(-1);
    this.delTarget.set(null); this.delReason.set(''); this.deleting.set(false);
  }

  fullName(d: BookingDetail) { return [d.title, d.firstName, d.lastName].filter(Boolean).join(' '); }
  initials(d: BookingDetail) { return ((d.firstName[0] ?? '') + (d.lastName?.[0] ?? '')).toUpperCase() || 'P'; }
  ageText(d: BookingDetail) {
    if (d.ageYears > 0) return d.ageYears + 'Y';
    if (d.ageMonths > 0) return d.ageMonths + 'M';
    return d.ageDays + 'D';
  }

  // ---- collect ----
  setPay(raw: string) { this.pay.set(this.num(raw)); }
  setDiscount(raw: string) { this.discAmt.set(this.num(raw)); this.discPct.set(null); }
  setPct(raw: string) {
    const pct = Math.max(0, Math.min(100, Number(raw) || 0));
    this.discPct.set(pct);
    this.discAmt.set(Math.round(this.bal() * pct) / 100);
  }
  setLater() { this.pay.set(0); this.discAmt.set(0); this.discPct.set(null); }
  setFull() { this.discPct.set(null); this.pay.set(Math.max(0, Math.round((this.bal() - this.discAmt()) * 100) / 100)); }

  collect() {
    const d = this.detail();
    if (!d || !this.canCollect() || this.saving()) return;
    this.saving.set(true);
    this.api.collect(d.id, { amount: this.pay(), paymentMode: this.mode(), discountAmount: this.discAmt(), discountRemark: this.discRemark().trim() || null }).subscribe({
      next: r => {
        this.saving.set(false);
        this.notify.ok(r.receiptNo ? 'Payment collected · Receipt ' + r.receiptNo : 'Discount updated.');
        // Reset the collect form before refreshing: the balance has just changed, so the old
        // amount is stale. If left in place, a small partial payment would keep Save & collect
        // enabled and a second click would collect the same amount again.
        this.pay.set(0); this.discAmt.set(0); this.discPct.set(null); this.discRemark.set('');
        this.load(d.id); this.changed.emit();
        if (r.paymentId) this.openReceipt(r.paymentId, r.receiptNo ?? '', 'Payment receipt');
      },
      error: e => { this.saving.set(false); this.notify.err(e.error?.message ?? 'Could not collect payment.'); }
    });
  }

  // ---- refund ----
  setRefund(raw: string) { this.refundAmt.set(this.num(raw)); }
  refund() {
    const d = this.detail();
    if (!d || !this.canRefund() || this.refunding()) return;
    this.refunding.set(true);
    this.api.refund(d.id, { amount: this.refundAmt(), reason: this.refundReason().trim(), remark: this.refundRemark().trim() || null }).subscribe({
      next: r => {
        this.refunding.set(false);
        this.notify.ok('Refund ' + r.receiptNo + ' recorded · ₹' + r.refunded.toFixed(2));
        this.refundAmt.set(0); this.refundReason.set(''); this.refundRemark.set('');
        this.load(d.id); this.changed.emit();
        // RefundResult carries no payment id, so find the new row in the receipt list.
        this.api.bookingReceipts(d.id).subscribe(list => {
          const row = list.receipts.find(x => x.receiptNo === r.receiptNo);
          if (row) this.openReceipt(row.id, row.receiptNo, 'Refund voucher');
        });
      },
      error: e => { this.refunding.set(false); this.notify.err(e.error?.message ?? 'Could not record the refund.'); }
    });
  }

  // ---- receipt preview ----
  openReceipt(paymentId: number, receiptNo: string, title: string) {
    this.receiptPaymentId.set(paymentId); this.receiptNo.set(receiptNo); this.receiptTitle.set(title);
    this.receiptHtml.set(''); this.receiptLoading.set(true);
    this.api.paymentReceiptHtml(paymentId).subscribe({
      next: html => { this.receiptHtml.set(html); this.receiptLoading.set(false); },
      error: e => { this.receiptLoading.set(false); this.notify.err(e.error?.message ?? 'Could not load the receipt.'); }
    });
  }
  closeReceipt() { this.receiptHtml.set(''); this.receiptLoading.set(false); this.receiptPaymentId.set(null); }
  downloadReceipt(paymentId: number, name: string) {
    this.api.paymentReceiptPdf(paymentId).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = (name || 'Receipt') + '.pdf'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: e => this.notify.err(e.error?.message ?? 'Could not download the PDF.')
    });
  }
  downloadOpenReceipt() { const id = this.receiptPaymentId(); if (id) this.downloadReceipt(id, this.receiptNo()); }

  // ---- soft delete a test / package / voucher ----
  // Package component tests are not deletable on their own; delete the package line instead.
  askDeleteLine(l: BookingLine) {
    if (l.isPackage) this.askDeleteRow({ kind: 'package', id: l.id, label: l.name, amount: l.price });
    else if (l.packageId == null) this.askDeleteRow({ kind: 'test', id: l.id, label: l.name, amount: l.price });
  }
  askDeletePayment(p: BookingPayment) {
    this.askDeleteRow({
      kind: 'payment', id: p.id, amount: p.amount, isRefund: p.kind === 'refund',
      label: p.receiptNo + ' · ' + (p.kind === 'refund' ? 'Refund' : 'Payment')
    });
  }
  delTitle(t: DelTarget) { return t.kind === 'payment' ? 'Delete money row' : t.kind === 'package' ? 'Delete package' : 'Delete investigation'; }
  private askDeleteRow(t: DelTarget) { this.delReason.set(''); this.delTarget.set(t); }
  closeDelete() { if (!this.deleting()) { this.delTarget.set(null); this.delReason.set(''); } }
  confirmDeleteRow() {
    const t = this.delTarget(), d = this.detail();
    if (!t || !d || !this.canDeleteRow() || this.deleting()) return;
    this.deleting.set(true);
    const reason = this.delReason().trim();
    const call = t.kind === 'test' ? this.api.deleteBookingTest(t.id, reason)
      : t.kind === 'package' ? this.api.deleteBookingPackage(t.id, reason)
      : this.api.deleteBookingPayment(t.id, reason);
    call.subscribe({
      next: () => {
        this.deleting.set(false);
        this.delTarget.set(null); this.delReason.set('');
        this.notify.ok('Deleted. Restore it any time from Reports → Delete log.');
        this.load(d.id); this.changed.emit();
      },
      error: e => { this.deleting.set(false); this.notify.err(e.error?.message ?? 'Could not delete this row.'); }
    });
  }

  // ---- add tests ----
  selectTab(t: DrawerTab) {
    this.tab.set(t);
    if (t === 'add' && !this.data() && !this.dataLoading()) this.loadCatalog();
  }
  loadCatalog() {
    this.dataLoading.set(true);
    this.api.registrationData().subscribe({
      next: d => { this.data.set(d); this.dataLoading.set(false); },
      error: e => { this.dataLoading.set(false); this.notify.err(e.error?.message ?? 'Could not load the test catalog.'); }
    });
  }
  inCart(key: string) { return this.cart().some(c => c.key === key); }
  toggleTest(t: RegTestItem) {
    const key = 't' + t.id;
    this.cart.update(list => list.some(c => c.key === key) ? list.filter(c => c.key !== key)
      : [...list, { key, kind: 'test' as const, id: t.id, name: t.name, price: t.price, meta: t.sampleType || 'Test' }]);
  }
  packageTestNames(p: RegPackage) { return p.tests.map(t => t.name).join(', '); }
  togglePackage(p: RegPackage) {
    const key = 'p' + p.id;
    this.cart.update(list => list.some(c => c.key === key) ? list.filter(c => c.key !== key)
      : [...list, { key, kind: 'package' as const, id: p.id, name: p.name, price: p.price, meta: p.tests.length + ' tests · ' + this.packageTestNames(p) }]);
  }
  removeLine(key: string) { this.cart.update(list => list.filter(c => c.key !== key)); }
  setAddPay(raw: string) { this.addPay.set(this.num(raw)); }
  addTests() {
    const d = this.detail();
    if (!d || !this.cart().length || this.adding() || this.addOver()) return;
    this.adding.set(true);
    const form = {
      tests: this.cart().filter(c => c.kind === 'test').map(c => ({ testId: c.id })),
      packageIds: this.cart().filter(c => c.kind === 'package').map(c => c.id),
      paidAmount: this.addPay(), paymentMode: this.addMode()
    };
    this.api.addBookingTests(d.id, form).subscribe({
      next: r => {
        this.adding.set(false);
        this.notify.ok('Tests added · new balance ₹' + r.balance.toFixed(2));
        this.cart.set([]); this.addStep.set(1); this.addPay.set(0); this.pickQ.set(''); this.pickDept.set(-1);
        this.load(d.id); this.changed.emit();
        if (r.paymentId) this.openReceipt(r.paymentId, r.receiptNo ?? '', 'Payment receipt');
      },
      error: e => { this.adding.set(false); this.notify.err(e.error?.message ?? 'Could not add the tests.'); }
    });
  }

  go(delta: number) {
    const target = delta < 0 ? this.prevId() : this.nextId();
    if (target) this.navigate.emit(target);
  }

  private num(raw: string) {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
  }
}