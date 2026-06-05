import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { AuthService } from 'src/app/core/services/auth.service';
import { Router } from '@angular/router';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(private auth: AuthService, private router: Router) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const user = this.auth.getCurrentUser();
    if (user?.token) {
      // Use user token for request authentication (RLS verification)
      req = req.clone({
        setHeaders: {
          'x-session-token': user.token,
          // Do NOT use Authorization header for anon key - that's for API access only
          // The server validates RLS via x-session-token header
        },
      });
    }

    return next.handle(req).pipe(
      catchError((err: HttpErrorResponse) => {
        // Handle token expiry or auth failure
        if (err.status === 401) {
          this.auth.logout();
          this.router.navigate(['/auth/sign-in'], {
            queryParams: { reason: 'token-expired', message: 'Your authentication has expired.' },
          });
        }
        return throwError(() => err);
      })
    );
  }
}
