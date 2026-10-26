// Tests master screen: grid of all tests with live search + department filter,
// and an add/edit form on the same page.
// Permissions live on the server: master.view to load, master.manage to change —
// non-admin users may see this page but their change calls will be rejected (403).
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Department, TestRow } from '../../core/models';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-tests', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DecimalPipe],
  template: `
  <div class="ph">
    <div><h1>Tests</h1><p class="mut">Lab tests, prices and sort order. Inactive tests stop appearing in new bookings.</p></div>
    <button class="btn acc" (click)="startAdd()">+ New test</button>
  </div>

  @if (showForm()) {
  <div class="card rise" style="margin-bottom:18px">
    <h3 style="margin:0 0 14px">{{ editingId() ? 'Edit test' : 'New test' }}</h3>
    <form [formGroup]="form" class="grid" (ngSubmit)="save()">
      <label>Name<input class="inp" formControlName="name" placeholder="e.g. Complete blood count"></label>
      <label>Short name<input class="inp" formControlName="shortName" placeholder="CBC"></label>
      <label>Department
        <select class="inp" formControlName="departmentId">
          <option [value]="0" disabled>Select department</option>
          @for (d of departments(); track d.id) { <option [value]="d.id">{{ d.name }}</option> }
        </select>
      </label>
      <label>Price<input class="inp" type="number" min="0" formControlName="price"></label>
      <label>Sort order<input class="inp" type="number" min="0" formControlName="sortOrder"></label>
     </form>
    <div class="row" style="margin-top:14px">
      <button class="btn" [disabled]="form.invalid || busy()" (click)="save()">{{ busy() ? 'Saving…' : (editingId() ? 'Update test' : 'Save test') }}</button>
      <button class="btn ghost" (click)="cancel()">Cancel</button>
    </div>
    @if (error()) { <p class="err">{{ error() }}</p> }
  </div>
  }

  <div class="card">
    <div class="row" style="margin-bottom:14px">
      <input class="inp" style="max-width:280px" placeholder="Search name or short name…" [formControl]="q">
      <select class="inp" style="max-width:220px" [formControl]="dept">
        <option [value]="0">All departments</option>
        @for (d of departments(); track d.id) { <option [value]="d.id">{{ d.name }}</option> }
      </select>
    </div>
    <div class="tbl"><table>
      <thead><tr><th>#</th><th>Name</th><th>Short</th><th>Department</th><th class="num">Price</th><th>Status</th><th></th></tr></thead>
      <tbody>
        @for (t of rows(); track t.id) {
          <tr [class.off]="!t.isActive">
            <td class="mut">{{ t.sortOrder }}</td>
            <td><b>{{ t.name }}</b></td>
            <td>{{ t.shortName }}</td>
            <td>{{ t.department }}</td>
            <td class="num"><b>{{ t.price | number:'1.2-2' }}</b></td>
            <td><span class="b dot" [class.g]="t.isActive" [class.s]="!t.isActive">{{ t.isActive ? 'Active' : 'Inactive' }}</span></td>
            <td class="num">
              <button class="btn sm ghost" (click)="startEdit(t)">Edit</button>
              <button class="btn sm" [class.danger]="t.isActive" (click)="toggle(t)">{{ t.isActive ? 'Deactivate' : 'Activate' }}</button>
            </td>
          </tr>
        } @empty {
          <tr><td colspan="7" class="mut" style="text-align:center;padding:26px">No tests match this filter.</td></tr>
        }
      </tbody>
    </table></div>
  </div>`,
  styles: [`
    /* Form layout: 5 fields flow into as many 180px+ columns as fit, then wrap. */
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
    label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700;color:var(--mut)}
    .num{text-align:right}
    /* Inactive rows dimmed so staff can tell what is hidden from booking. */
    .tbl tr.off td{opacity:.5}
  `]
})
export class TestsComponent implements OnInit {
  private api = inject(ApiService);
   private notify = inject(ToastService);   // global notifications

  // Signals are the page state; the template reads them and OnPush re-renders on change.
  rows = signal<TestRow[]>([]);
  departments = signal<Department[]>([]);
  showForm = signal(false);
  editingId = signal<number | null>(null);
  busy = signal(false);
  error = signal('');

  // Filter controls are separate from the save-form: typing a filter must not dirty the form.
  q = new FormControl('', { nonNullable: true });
  dept = new FormControl(0, { nonNullable: true });

  // Mirrors TestForm on the server; validators match TestFormValidator in Validators.cs.
  form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(150)] }),
    shortName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(30)] }),
    departmentId: new FormControl(0, { nonNullable: true, validators: [Validators.min(1)] }),
    price: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    sortOrder: new FormControl(0, { nonNullable: true, validators: [Validators.min(0)] }),
  });

  ngOnInit() {
    // Departments load once - they feed both the filter and the form dropdown.
    this.api.masterDepartments().subscribe(d => this.departments.set(d));
    // Reload the grid 300ms after the user stops typing, or instantly on department change.
    this.q.valueChanges.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => this.load());
    this.dept.valueChanges.subscribe(() => this.load());
    this.load();
  }

  load() { this.api.masterTests(this.q.value.trim(), this.dept.value || undefined).subscribe(r => this.rows.set(r)); }

  startAdd() {
    this.editingId.set(null);
    this.form.reset({ name: '', shortName: '', departmentId: 0, price: 0, sortOrder: 0 });
    this.error.set(''); this.showForm.set(true);
  }

  startEdit(t: TestRow) {
    // Grid rows carry the department NAME; the form needs its ID, so look the ID up here.
    const d = this.departments().find(x => x.name === t.department);
    this.editingId.set(t.id);
    this.form.setValue({ name: t.name, shortName: t.shortName, departmentId: d?.id ?? 0, price: t.price, sortOrder: t.sortOrder });
    this.error.set(''); this.showForm.set(true);
  }

  cancel() { this.showForm.set(false); }

  save() {
    if (this.form.invalid) return;
    this.busy.set(true); this.error.set('');
    const body = this.form.getRawValue();
    // Editing hits PUT /tests/{id}, adding hits POST /tests - same body either way.
    const req = this.editingId() ? this.api.updateTest(this.editingId()!, body) : this.api.createTest(body);
    req.subscribe({
      next: () => { this.busy.set(false); this.showForm.set(false); this.load(); this.notify.ok(this.editingId() ? 'Test updated.' : 'Test saved.'); },
      error: e => { this.error.set(e.error?.message ?? 'Could not save.'); this.busy.set(false); this.notify.err(e.error?.message ?? 'Could not save.'); }    });
  }

  toggle(t: TestRow) { this.api.toggleTest(t.id).subscribe(() => { this.load(); this.notify.ok(t.isActive ? 'Test deactivated.' : 'Test activated.'); }); }}