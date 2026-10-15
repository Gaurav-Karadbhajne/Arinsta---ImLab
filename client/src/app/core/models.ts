export interface LoginResult { token: string; expiresAt: string; fullName: string; role: string; companyName: string; landing: string; }
export interface TestPickerItem { id: number; name: string; shortName: string; price: number; department: string; }
export interface BookingTestInput { testId: number; isOutsource?: boolean; outsourceLabId?: number | null; }
export interface BookingForm {
  patientId?: number | null; title?: string; firstName: string; lastName?: string; gender: string; ageYears: number;
  mobile?: string; email?: string; referralDoctor?: string; corporate?: string; discountPercent: number; paidAmount: number;
  paymentMode: string; tests: BookingTestInput[];
}
export interface BookingCreated { bookingId: number; labNo: number; billNo: string; patientUid: string; total: number; discount: number; paid: number; balance: number; }
export interface BookingRow { id: number; labNo: number; patientName: string; uid: string; ageYears: number; gender: string; referral?: string; total: number; balance: number; bookedAt: string; }
export interface OutsourceRow { id: number; labNo: number; patientName: string; testName: string; labName: string; status: string; bookedAt: string; }
export interface Paged<T> { items: T[]; hasMore: boolean; }
export interface ChartPoint { label: string; value: number; }
export interface Dashboard {
  todayBookings: number; todayDelivered: number; pending: number; revenueToday: number; outstandingToday: number; outsourced: number;
  yesterdayBookings: number; revenue7Days: ChartPoint[]; departments: ChartPoint[]; statusSplit: ChartPoint[];
}
export interface ConfigVm { version: string; values: Record<string, string>; }
