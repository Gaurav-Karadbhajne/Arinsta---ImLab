import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { AddTestsResult, BookingCreated, BookingDetail, BookingForm, BookingLineInput, BookingMeta, BookingQuery, BookingRowVm, BookingStats, Captcha, CollectResult, ConfigVm, Dashboard, DeletedRow, DeleteLogQuery, Department, FilterOptions, MasterOption, OutsourceRow, Paged, PatientEdit, PatientMatch, ReceiptList, RefundResult, RegistrationData, TestForm, TestPickerItem, TestRow } from './models';

/** One place for every API call. Components never build URLs. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = '/api/v1';

  dashboard() { return this.http.get<Dashboard>(`${this.base}/dashboard`); }
  catalog() { return this.http.get<TestPickerItem[]>(`${this.base}/bookings/catalog`); }
  createBooking(f: BookingForm) { return this.http.post<BookingCreated>(`${this.base}/bookings`, f); }
  // ---- Search page: one method per endpoint ----
  // Grid rows. Keyset paging via afterId - no OFFSET, so page 5000 costs the same as page 1.
  searchBookings(q: BookingQuery) {
    return this.http.get<Paged<BookingRowVm>>(`${this.base}/bookings`, { params: this.bookingParams(q) });
  }
  // Five KPI cards; same filters as the grid (afterId is ignored by the server).
  bookingStats(q: BookingQuery) {
    return this.http.get<BookingStats>(`${this.base}/bookings/stats`, { params: this.bookingParams(q) });
  }
  // Dropdown values for Location / Corporate / Referral doctor.
  bookingFilters() { return this.http.get<FilterOptions>(`${this.base}/bookings/filters`); }
  // View drawer: patient + lines + money rows + totals in one round-trip.
  bookingDetail(id: number) { return this.http.get<BookingDetail>(`${this.base}/bookings/${id}/detail`); }
  // Receipts page: every payment and refund of one visit.
  bookingReceipts(id: number) { return this.http.get<ReceiptList>(`${this.base}/bookings/${id}/receipts`); }
  // Collect money and/or an extra discount. Receipt is issued only when amount > 0.
  collect(id: number, f: { amount: number; paymentMode: string; discountAmount: number; discountRemark: string | null }) {
    return this.http.post<CollectResult>(`${this.base}/bookings/${id}/collect`, f);
  }
  // Refund a part of what was collected; reason is mandatory on the server too.
  refund(id: number, f: { amount: number; reason: string; remark: string | null }) {
    return this.http.post<RefundResult>(`${this.base}/bookings/${id}/refund`, f);
  }
  // Add tests/packages to an existing visit, optionally collecting money at the same time.
  addBookingTests(id: number, f: { tests: BookingLineInput[]; packageIds: number[]; paidAmount: number; paymentMode: string }) {
    return this.http.post<AddTestsResult>(`${this.base}/bookings/${id}/tests`, f);
  }
  // Soft delete: server keeps the row + reason for Reports > Delete log.
  deleteBooking(id: number, reason: string) { return this.http.post(`${this.base}/bookings/${id}/delete`, { reason }); }
  // Soft delete / restore one test line, package line or money row (refund vouchers included).
  deleteBookingTest(testId: number, reason: string) { return this.http.post(`${this.base}/bookings/tests/${testId}/delete`, { reason }); }
  restoreBookingTest(testId: number) { return this.http.post(`${this.base}/bookings/tests/${testId}/restore`, null); }
  deleteBookingPackage(packageId: number, reason: string) { return this.http.post(`${this.base}/bookings/packages/${packageId}/delete`, { reason }); }
  restoreBookingPackage(packageId: number) { return this.http.post(`${this.base}/bookings/packages/${packageId}/restore`, null); }
  deleteBookingPayment(paymentId: number, reason: string) { return this.http.post(`${this.base}/bookings/payments/${paymentId}/delete`, { reason }); }
  restoreBookingPayment(paymentId: number) { return this.http.post(`${this.base}/bookings/payments/${paymentId}/restore`, null); }
  restoreBooking(id: number) { return this.http.post(`${this.base}/bookings/${id}/restore`, null); }
  // Delete log grid (Reports). Offset paging is fine here - deleted rows are few.
  deletedLog(q: DeleteLogQuery) {
    let p = new HttpParams().set('size', q.size ?? 20).set('offset', q.offset ?? 0);
    if (q.type && q.type !== 'all') p = p.set('type', q.type);
    if (q.q) p = p.set('q', q.q);
    if (q.from) p = p.set('from', q.from);
    if (q.to) p = p.set('to', q.to);
    return this.http.get<Paged<DeletedRow>>(`${this.base}/bookings/deleted`, { params: p });
  }
  updatePatient(patientId: number, f: PatientEdit) { return this.http.put(`${this.base}/bookings/patients/${patientId}`, f); }
  updateBookingMeta(id: number, f: BookingMeta) { return this.http.put(`${this.base}/bookings/${id}/meta`, f); }
  // One payment/refund voucher: HTML for the on-screen modal, PDF for direct download.
  paymentReceiptHtml(paymentId: number) { return this.http.get(`${this.base}/bookings/payments/${paymentId}/receipt`, { responseType: 'text' }); }
  paymentReceiptPdf(paymentId: number) { return this.http.get(`${this.base}/bookings/payments/${paymentId}/receipt.pdf`, { responseType: 'blob' }); }
  // Rebook handoff: the drawer/registration needs this patient with recent visits.
  patientForRebook(patientId: number) { return this.http.get<PatientMatch>(`${this.base}/bookings/patients/${patientId}`); }

  // Visit bill receipt (registration receipt, still used by the registration screen).
  receiptHtml(id: number) { return this.http.get(`${this.base}/bookings/${id}/receipt`, { responseType: 'text' }); }
  receiptPdf(id: number) { return this.http.get(`${this.base}/bookings/${id}/receipt.pdf`, { responseType: 'blob' }); }
  outsource(status: string, afterId?: number) {
    let p = new HttpParams().set('pageSize', 25);
    if (status) p = p.set('status', status);
    if (afterId) p = p.set('afterId', afterId);
    return this.http.get<Paged<OutsourceRow>>(`${this.base}/outsource`, { params: p });
  }
  config() { return this.http.get<ConfigVm>(`${this.base}/config`); }

    // Masters: the Tests screen talks to these five endpoints.
  // masterTests returns a plain array (no paging) - the server caps it at 200 rows.
  masterTests(search: string, departmentId?: number) {
    let p = new HttpParams();
    if (search) p = p.set('search', search);
    if (departmentId) p = p.set('departmentId', departmentId);
    return this.http.get<TestRow[]>(`${this.base}/master/tests`, { params: p });
  }
  // Departments feed the form dropdown and the filter; they rarely change so no search needed.
  masterDepartments() { return this.http.get<Department[]>(`${this.base}/master/departments`); }
  // Create/update/toggle all return 204 No Content (empty body) - components just reload the grid.
  createTest(f: TestForm) { return this.http.post(`${this.base}/master/tests`, f); }
  updateTest(id: number, f: TestForm) { return this.http.put(`${this.base}/master/tests/${id}`, f); }
  toggleTest(id: number) { return this.http.post(`${this.base}/master/tests/${id}/toggle-active`, null); }

    // Registration screen bootstrap: departments + packages + doctors/hospitals/collectors in one call.
  registrationData() { return this.http.get<RegistrationData>(`${this.base}/bookings/registration-data`); }

    // Rebook lookup on the registration screen: exact mobile match or name prefix; empty params are skipped by the server.
  patientLookup(mobile: string, name: string) {
    let p = new HttpParams();
    if (mobile) p = p.set('mobile', mobile);
    if (name) p = p.set('name', name);
    return this.http.get<PatientMatch[]>(`${this.base}/bookings/patient-lookup`, { params: p });
  }

  
  // Quick-add (+) buttons on the registration screen. Returns the new option so the dropdown selects it at once.
  quickAddDoctor(q: { name: string; mobile?: string; extra?: string; degree?: string }) { return this.http.post<MasterOption>(`${this.base}/bookings/masters/doctors`, q); }  quickAddHospital(q: { name: string; mobile?: string }) { return this.http.post<MasterOption>(`${this.base}/bookings/masters/hospitals`, q); }
  quickAddCollector(q: { name: string; mobile?: string }) { return this.http.post<MasterOption>(`${this.base}/bookings/masters/collectors`, q); }
  
    // Builds the search query string once - grid and cards always send identical filters.
  private bookingParams(q: BookingQuery): HttpParams {
    let p = new HttpParams().set('pageSize', q.pageSize ?? 25);
    if (q.search) p = p.set('search', q.search);
    if (q.mobile) p = p.set('mobile', q.mobile);
    if (q.centerId) p = p.set('centerId', q.centerId);
    if (q.corporate) p = p.set('corporate', q.corporate);
    if (q.referralDoctor) p = p.set('referralDoctor', q.referralDoctor);
    if (q.outstandingOnly) p = p.set('outstandingOnly', true);
    if (q.from) p = p.set('from', q.from);
    if (q.to) p = p.set('to', q.to);
    if (q.afterId) p = p.set('afterId', q.afterId);
    return p;
  }
  
  
  // Anonymous: fetch a fresh math captcha when the server answers 428 after 3 failed logins.
  captcha() { return this.http.get<Captcha>(`${this.base}/auth/captcha`); }
}
