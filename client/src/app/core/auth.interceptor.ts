import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService); const router = inject(Router);
  const t = auth.token();
  const r = t && req.url.startsWith('/api/') ? req.clone({ setHeaders: { Authorization: `Bearer ${t}` } }) : req;
  return next(r).pipe(catchError(e => {
    if (e.status === 401 && !req.url.endsWith('/auth/login')) { auth.logout(); router.navigateByUrl('/login'); }
    return throwError(() => e);
  }));
};
