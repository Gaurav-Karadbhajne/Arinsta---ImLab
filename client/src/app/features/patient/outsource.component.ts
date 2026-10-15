import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService } from '../../core/api.service';
import { OutsourceRow } from '../../core/models';

@Component({
  selector: 'app-outsource', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, imports: [DatePipe],
  template: `
  <div class="ph">
    <div><h1>Outsource tests</h1><p class="mut">Tests sent to external laboratories and their status.</p></div>
  </div>
  <div class="card">
    <div class="row" style="margin-bottom:14px">
      @for (s of statuses; track s) { <button class="chip" [class.on]="status() === s" (click)="load(s)">{{ s || 'All' }}</button> }
    </div>
    <div class="tbl"><table>
      <thead><tr><th>Date</th><th>Lab no</th><th>Patient</th><th>Test</th><th>Outsource lab</th><th>Status</th></tr></thead>
      <tbody>
        @for (r of rows(); track r.id) {
          <tr><td>{{ r.bookedAt | date:'dd MMM yyyy' }}</td><td><b>{{ r.labNo }}</b></td><td>{{ r.patientName }}</td><td>{{ r.testName }}</td><td>{{ r.labName }}</td>
            <td><span class="b dot" [class.y]="r.status === 'Pending'" [class.p]="r.status === 'SampleSent'" [class.g]="r.status === 'Received'">{{ r.status }}</span></td></tr>
        } @empty {
          <tr><td colspan="6" class="mut" style="text-align:center;padding:26px">No outsourced tests in this view.</td></tr>
        }
      </tbody>
    </table></div>
  </div>`
})
export class OutsourceComponent implements OnInit {
  private api = inject(ApiService);
  statuses = ['', 'Pending', 'SampleSent', 'Received'];
  status = signal(''); rows = signal<OutsourceRow[]>([]);
  ngOnInit() { this.load(''); }
  load(s: string) { this.status.set(s); this.api.outsource(s).subscribe(p => this.rows.set(p.items)); }
}
