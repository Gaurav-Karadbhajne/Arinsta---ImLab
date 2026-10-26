export interface LoginResult { token: string; expiresAt: string; fullName: string; role: string; companyName: string; landing: string; }
export interface TestPickerItem { id: number; name: string; shortName: string; price: number; department: string; }
// export interface BookingTestInput { testId: number; isOutsource?: boolean; outsourceLabId?: number | null; }
// export interface BookingForm {
//   patientId?: number | null; title?: string; firstName: string; lastName?: string; gender: string; ageYears: number;
//   mobile?: string; email?: string; referralDoctor?: string; corporate?: string; discountPercent: number; paidAmount: number;
//   paymentMode: string; tests: BookingTestInput[];
// }
// export interface BookingCreated { bookingId: number; labNo: number; billNo: string; patientUid: string; total: number; discount: number; paid: number; balance: number; }

// ---- Registration rebuild (eazylab parity) ----
// MasterOption: one dropdown choice (doctor/hospital/collector); Extra = mobile/hospital note.
export interface MasterOption { id: number; name: string; extra?: string | null; }
// RegTestItem: one test as shown in the picker tabs; sampleType tells the collector what to draw.
export interface RegTestItem { id: number; name: string; shortName: string; price: number; sampleType?: string | null; }
export interface RegDepartment { id: number; name: string; tests: RegTestItem[]; }
export interface RegPackage { id: number; name: string; price: number; tests: RegTestItem[]; }
// Everything the registration screen needs in ONE call (server caches it 10 min).
export interface RegistrationData { departments: RegDepartment[]; packages: RegPackage[]; doctors: MasterOption[]; hospitals: MasterOption[]; collectors: MasterOption[]; }
// One picked line on the bill. price set = the counter person overrode the catalog charge.
// packageId set = this line came from a package (kept so the worklist knows what to run).
export interface BookingLineInput { testId: number; packageId?: number | null; price?: number | null; sampleCollected?: boolean; }
// Full form the Register button sends — mirrors the BookingForm record in the API.
export interface BookingForm {
  patientId?: number | null; title?: string | null; firstName: string; lastName?: string | null; gender: string;
  ageYears: number; ageMonths: number; ageDays: number; mobile?: string | null; email?: string | null;
  patientType: string; referralDoctorId?: number | null; hospitalId?: number | null; address?: string | null; remark?: string | null;
  sampleCollectorId?: number | null; collectorFee: number;
  discountPercent: number; discountRemark?: string | null; paidAmount: number; paymentMode: string; deliveryMode: string;   bookingDate?: string | null; discountAmount?: number | null;
  tests: BookingLineInput[]; packageIds: number[]; printReceipt: boolean;
}
export interface BookingCreated { bookingId: number; labNo: number; billNo: string; patientUid: string; total: number; discount: number; paid: number; balance: number; tokenNo: number; }

// Rebook: a matched existing patient + recent visits, shown in the "already registered" popup.
export interface PatientVisit { bookingId: number; labNo: number; billNo: string; bookedAt: string; total: number; balance: number; }
export interface PatientMatch {
  id: number; uid: string; title: string | null; firstName: string; lastName: string | null; gender: string;
  ageYears: number; ageMonths: number; ageDays: number; mobile: string | null; email: string | null; address: string | null;
  lastVisit: string | null; visitCount: number; recentVisits: PatientVisit[];
}

// ---- Search page ----
// One query object drives the grid and the five KPI cards, so they can never disagree.
export interface BookingQuery {
  search?: string; mobile?: string; centerId?: number; corporate?: string; referralDoctor?: string;
  outstandingOnly?: boolean; from?: string; to?: string; afterId?: number; pageSize?: number;
}
// Row shape sent by GET /bookings (matches BookingRowVm on the server).
export interface BookingRowVm {
  id: number; labNo: number; patientName: string; uid: string; ageYears: number; gender: string;
  referral: string | null; total: number; balance: number; bookedAt: string; mobile: string | null;
  corporate: string | null; paid: number; patientId: number; isRebook: boolean;
}
// KPI cards from GET /bookings/stats. Patients = picked dates, or today when no dates are set.
export interface BookingStats { bookings: number; fullyPaid: number; partPaid: number; outstanding: number; outstandingAmount: number; collected: number; patients: number; }
// Filter dropdown values from GET /bookings/filters.
export interface FilterOptions { centers: MasterOption[]; corporates: string[]; doctors: string[]; }
// One investigation line / one money row inside the View drawer.
export interface BookingLine { id: number; name: string; department: string; price: number; status: string; bookedAt: string; isPackage: boolean; sampleCollected: boolean; packageId: number | null; }
export interface BookingPayment { id: number; receiptNo: string; kind: string; amount: number; mode: string; paidAt: string; reason: string | null; remark: string | null; }
// Everything the drawer needs in one call.
export interface BookingDetail {
  id: number; labNo: number; billNo: string; bookedAt: string; isRebook: boolean; patientId: number;
  uid: string; title: string | null; firstName: string; lastName: string | null; gender: string;
  ageYears: number; ageMonths: number; ageDays: number; mobile: string | null; email: string | null; address: string | null;
  referral: string | null; corporate: string | null; remark: string | null; patientType: string; deliveryMode: string;
  total: number; discount: number; paid: number; refunded: number; balance: number; discountRemark: string | null;
  lines: BookingLine[]; payments: BookingPayment[];
}
// Receipts page header + every money row of one visit.
export interface ReceiptList {
  bookingId: number; labNo: number; billNo: string; patientName: string; uid: string;
  total: number; discount: number; paid: number; refunded: number; balance: number; receipts: BookingPayment[];
}
// ---- Reports > Delete log ----
// One row per soft-deleted booking / test / package / receipt. Amount is the money that left the bill.
export interface DeletedRow {
  kind: string; entityId: number; bookingId: number; labNo: number; billNo: string; patientName: string;
  title: string; detail: string; amount: number | null; deletedAt: string; deletedBy: string; reason: string;
}
export interface DeleteLogQuery { type?: string; q?: string; from?: string; to?: string; offset?: number; size?: number; }
// Responses from collect / refund / add tests.
export interface CollectResult { paymentId: number | null; receiptNo: string | null; paid: number; refunded: number; balance: number; }
export interface RefundResult { receiptNo: string; refunded: number; balance: number; }
export interface AddTestsResult { bookingId: number; total: number; discount: number; paid: number; balance: number; paymentId: number | null; receiptNo: string | null; }
// Edit modal payloads (two PUT calls: patient + visit meta).
export interface PatientEdit {
  title: string | null; firstName: string; lastName: string | null; gender: string;
  ageYears: number; ageMonths: number; ageDays: number; mobile: string | null; email: string | null; address: string | null;
}
export interface BookingMeta { referralDoctor: string | null; corporate: string | null; remark: string | null; patientType: string; deliveryMode: string; }
export interface OutsourceRow { id: number; labNo: number; patientName: string; testName: string; labName: string; status: string; bookedAt: string; }
export interface Paged<T> { items: T[]; hasMore: boolean; }
export interface ChartPoint { label: string; value: number; }
export interface Dashboard {
  todayBookings: number; todayDelivered: number; pending: number; revenueToday: number; outstandingToday: number; outsourced: number;
  yesterdayBookings: number; revenue7Days: ChartPoint[]; departments: ChartPoint[]; statusSplit: ChartPoint[];
}
export interface ConfigVm { version: string; values: Record<string, string>; }

// Masters module shapes: TestRow = one line of the Tests grid (matches TestRowVm in the API).
// TestForm = what the add/edit form sends (matches TestForm / TestFormValidator in the API).
// Department = dropdown option for the form and the department filter (matches DepartmentVm).
export interface TestRow { id: number; name: string; shortName: string; department: string; price: number; sortOrder: number; isActive: boolean; }
export interface TestForm { name: string; shortName: string; departmentId: number; price: number; sortOrder: number; }
export interface Department { id: number; name: string; code: string; isActive: boolean; }
// Math captcha from GET /auth/captcha: show Question to the user, send CaptchaId back with the answer.
export interface Captcha { captchaId: string; question: string; }
