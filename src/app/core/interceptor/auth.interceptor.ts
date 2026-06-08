import { Injectable, inject } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { AuthService } from 'src/app/core/services/auth.service';
import { Router } from '@angular/router';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private auth = inject(AuthService);
  private router = inject(Router);

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // Don't add auth headers to static assets (SVG icons, fonts, etc.)
    const isAsset = req.url.includes('/assets/') || req.url.endsWith('.svg') || req.url.endsWith('.woff');

    if (isAsset) {
      return next.handle(req);
    }

    const user = this.auth.getCurrentUser();
    if (user?.token) {
      req = req.clone({
        setHeaders: {
          'x-session-token': user.token,
        },
        withCredentials: true,
      });
    } else {
      req = req.clone({ withCredentials: true });
    }

    return next.handle(req).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status === 401) {
          this.auth.logout();
          this.router.navigate(['/auth/sign-in'], {
            queryParams: { reason: 'token-expired', message: 'Your authentication has expired.' },
          });
        }
        return throwError(() => err);
      }),
    );
  }
}
