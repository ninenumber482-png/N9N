import { Injectable, inject } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { AuthService } from 'src/app/core/services/auth.service';
import { Router } from '@angular/router';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private auth = inject(AuthService);
  private router = inject(Router);

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // Don't add auth headers to static assets.
    // Use a stricter matcher than `includes('/assets/')` to avoid accidentally skipping auth
    // for API routes that may contain the word "assets".
    const pathname = this.getPathname(req.url);

    const isStaticAsset =
      pathname.startsWith('/assets/') ||
      /\.(svg|woff|woff2|ttf|eot|png|jpg|jpeg|gif|webp|ico)$/i.test(pathname);

    if (isStaticAsset) return next.handle(req);

    const user = this.auth.getCurrentUser();
    const authReq =
      user?.token
        ? req.clone({
            setHeaders: { 'x-session-token': user.token },
            withCredentials: true,
          })
        : req.clone({ withCredentials: true });

    return next.handle(authReq).pipe(
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

  private getPathname(url: string): string {
    try {
      // Works for both absolute URLs and same-origin relative URLs.
      return new URL(url, window.location.origin).pathname;
    } catch {
      // Fallback: attempt to extract a pathname-like substring.
      return url;
    }
  }
}
