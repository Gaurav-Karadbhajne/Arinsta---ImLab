import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { BookingRow } from '../../core/models';

@Component({
  selector: 'app-search', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, imports: [ReactiveFormsModule, DecimalPipe, DatePipe],
  template: `
  <div class="ph">
    <div><h1>Search patients</h1><p class="mut">Find bookings by patient name, UID, mobile or lab number.</p></div>
  </div>
  <div class="card">
    <div class="row">
      <span class="sic"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></span>
      <input class="inp grow" [formControl]="q" placeholder="Type to search — name, UID, mobile or lab number">
      <span class="mut" style="font-size:13px">{{ rows().length }} booking{{ rows().length === 1 ? '' : 's' }}</span>
    </div>
    <div class="tbl" style="margin-top:14px"><table>
      <thead><tr><th>Lab no</th><th>Patient</th><th>Age / Sex</th><th>Referral</th><th class="num">Total</th><th class="num">Balance</th><th>Booked</th></tr></thead>
      <tbody>
        @for (r of rows(); track r.id) {
          <tr><td><b>{{ r.labNo }}</b></td><td><b>{{ r.patientName }}</b><br><small class="mut">{{ r.uid }}</small></td><td>{{ r.ageYears }}Y / {{ r.gender }}</td><td>{{ r.referral }}</td>
            <td class="num">{{ r.total | number:'1.2-2' }}</td><td class="num"><span class="b dot" [class.g]="r.balance === 0" [class.r]="r.balance > 0">{{ r.balance === 0 ? 'Paid' : (r.balance | number:'1.2-2') }}</span></td>
            <td>{{ r.bookedAt | date:'dd MMM, HH:mm' }}</td></tr>
        } @empty {
          <tr><td colspan="7" class="mut" style="text-align:center;padding:26px">No bookings found.</td></tr>
        }
      </tbody>
    </table></div>
    @if (more()) { <button class="btn ghost" style="margin-top:12px" (click)="next()">Load more</button> }
  </div>`,
  styles: [`
    .sic{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:10px;background:var(--tl);color:var(--td);flex:none}
  `]
})
export class SearchComponent implements OnInit {
  private api = inject(ApiService);
  q = new FormControl('', { nonNullable: true });
  rows = signal<BookingRow[]>([]); more = signal(false);

  ngOnInit() {
    this.q.valueChanges.pipe(debounceTime(300), distinctUntilChanged(), switchMap(v => this.api.searchBookings(v.trim())))
      .subscribe(p => { this.rows.set(p.items); this.more.set(p.hasMore); });
    this.api.searchBookings('').subscribe(p => { this.rows.set(p.items); this.more.set(p.hasMore); });
  }

  next() {
    const last = this.rows().at(-1);
    this.api.searchBookings(this.q.value.trim(), last?.id).subscribe(p => { this.rows.update(r => [...r, ...p.items]); this.more.set(p.hasMore); });
  }
}
