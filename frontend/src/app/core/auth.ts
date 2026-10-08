import { HttpClient, HttpErrorResponse, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, finalize, firstValueFrom, map, Observable, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { I18n } from './i18n';
import { One, User } from './models';

interface TokenResponse {
  accessToken: string;
  user?: User;
}

/**
 * Session state (ADR-004).
 * - The access token lives only in memory (never localStorage), so XSS cannot read a stored token.
 * - The refresh token is an httpOnly cookie the browser sends to /api/auth only.
 * - On start-up we try one silent refresh to restore the session.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18n);

  readonly user = signal<User | null>(null);
  readonly isSignedIn = computed(() => this.user() !== null);
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');

  private accessToken: string | null = null;
  private refreshing$: Observable<string | null> | null = null;

  token(): string | null {
    return this.accessToken;
  }

  login(email: string, password: string): Observable<User> {
    return this.http.post<One<TokenResponse>>('/api/auth/login', { email, password }).pipe(map((r) => this.accept(r.data)));
  }

  register(input: { email: string; password: string; displayName: string }): Observable<User> {
    return this.http
      .post<One<TokenResponse>>('/api/auth/register', { ...input, preferredLanguage: this.i18n.lang() })
      .pipe(map((r) => this.accept(r.data)));
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', {}).pipe(
      catchError(() => of(undefined)),
      finalize(() => this.clear()),
    );
  }

  /** Exchanges the refresh cookie for a new access token. Concurrent callers share one request. */
  refresh(): Observable<string | null> {
    this.refreshing$ ??= this.http.post<One<TokenResponse>>('/api/auth/refresh', {}).pipe(
      map((r) => r.data.accessToken),
      tap((token) => (this.accessToken = token)),
      catchError(() => {
        this.clear();
        return of(null);
      }),
      finalize(() => (this.refreshing$ = null)),
      shareReplay(1),
    );
    return this.refreshing$;
  }

  /** Called once at start-up: restores the session if a refresh cookie exists. */
  async restore(): Promise<void> {
    const token = await firstValueFrom(this.refresh());
    if (!token) return;
    try {
      const me = await firstValueFrom(this.http.get<One<User>>('/api/users/me'));
      this.user.set(me.data);
      this.i18n.useDefault(me.data.preferredLanguage);
    } catch {
      this.clear();
    }
  }

  updateProfile(patch: Partial<Pick<User, 'displayName' | 'preferredLanguage'>>): Observable<User> {
    return this.http.patch<One<User>>('/api/users/me', patch).pipe(map((r) => {
      this.user.set(r.data);
      return r.data;
    }));
  }

  private accept(data: TokenResponse): User {
    this.accessToken = data.accessToken;
    this.user.set(data.user!);
    return data.user!;
  }

  private clear(): void {
    this.accessToken = null;
    this.user.set(null);
  }
}

const isAuthCall = (url: string) => url.startsWith('/api/auth/');

/**
 * Adds the Bearer token to API calls. On a 401 it refreshes once and retries;
 * if that fails the user is simply signed out (public pages keep working).
 */
export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const auth = inject(AuthService);
  if (!req.url.startsWith('/api/')) return next(req);

  const withToken = (token: string | null) =>
    token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(withToken(auth.token())).pipe(
    catchError((err: unknown) => {
      const retryable = err instanceof HttpErrorResponse && err.status === 401 && !isAuthCall(req.url) && auth.token() !== null;
      if (!retryable) return throwError(() => err);
      return auth.refresh().pipe(
        switchMap((token) => (token ? next(withToken(token)) : throwError(() => err))),
      );
    }),
  );
};

/** Requires a signed-in user; otherwise sends them to sign in and back afterwards. */
export const signedInGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.isSignedIn() || inject(Router).createUrlTree(['/signin'], { queryParams: { next: state.url } });
};

/** Admin area. The API enforces this too; the guard only avoids showing pages that would fail. */
export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isAdmin()) return true;
  return inject(Router).createUrlTree(auth.isSignedIn() ? ['/'] : ['/signin'], { queryParams: auth.isSignedIn() ? {} : { next: state.url } });
};

/** Turns an API error into a readable message (the API returns { error: { message } }). */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    const apiMessage = err.error?.error?.message as string | undefined;
    const details = err.error?.error?.details as { issue: string }[] | undefined;
    if (details?.length) return details.map((d) => d.issue).join('. ');
    if (apiMessage && err.status < 500) return apiMessage;
  }
  return fallback;
}
