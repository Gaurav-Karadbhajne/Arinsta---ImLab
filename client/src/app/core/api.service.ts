import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BookingCreated, BookingForm, BookingRow, ConfigVm, Dashboard, OutsourceRow, Paged, TestPickerItem } from './models';

/** One place for every API call. Components never build URLs. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = '/api/v1';

  dashboard() { return this.http.get<Dashboard>(`${this.base}/dashboard`); }
  catalog() { return this.http.get<TestPickerItem[]>(`${this.base}/bookings/catalog`); }
  createBooking(f: BookingForm) { return this.http.post<BookingCreated>(`${this.base}/bookings`, f); }
  searchBookings(search: string, afterId?: number) {
    let p = new HttpParams().set('pageSize', 25);
    if (search) p = p.set('search', search);
    if (afterId) p = p.set('afterId', afterId);
    return this.http.get<Paged<BookingRow>>(`${this.base}/bookings`, { params: p });
  }
  receiptHtml(id: number) { return this.http.get(`${this.base}/bookings/${id}/receipt`, { responseType: 'text' }); }
  outsource(status: string, afterId?: number) {
    let p = new HttpParams().set('pageSize', 25);
    if (status) p = p.set('status', status);
    if (afterId) p = p.set('afterId', afterId);
    return this.http.get<Paged<OutsourceRow>>(`${this.base}/outsource`, { params: p });
  }
  config() { return this.http.get<ConfigVm>(`${this.base}/config`); }
}
