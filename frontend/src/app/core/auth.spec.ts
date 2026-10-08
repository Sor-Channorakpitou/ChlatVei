import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { adminGuard, AuthService, authInterceptor, errorMessage, signedInGuard } from './auth';

const citizen = { id: 'u1', email: 'a@b.c', displayName: 'Dara', role: 'CITIZEN' as const, preferredLanguage: 'km' as const };

describe('Auth', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });
  afterEach(() => ctrl.verify());

  async function signIn() {
    const p = firstValueFrom(auth.login('a@b.c', 'pw'));
    ctrl.expectOne('/api/auth/login').flush({ data: { accessToken: 'token-1', user: citizen } });
    await p;
  }

  it('keeps the access token in memory and sends it as a Bearer header', async () => {
    await signIn();
    expect(auth.isSignedIn()).toBe(true);
    http.get('/api/checklists').subscribe();
    expect(ctrl.expectOne('/api/checklists').request.headers.get('Authorization')).toBe('Bearer token-1');
    expect(JSON.stringify(localStorage)).not.toContain('token-1');
  });

  it('refreshes once on 401 and retries the request with the new token', async () => {
    await signIn();
    const result = firstValueFrom(http.get<{ ok: boolean }>('/api/checklists'));
    ctrl.expectOne('/api/checklists').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/auth/refresh').flush({ data: { accessToken: 'token-2' } });
    const retry = ctrl.expectOne('/api/checklists');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer token-2');
    retry.flush({ ok: true });
    expect(await result).toEqual({ ok: true });
  });

  it('signs out when the refresh fails', async () => {
    await signIn();
    const result = firstValueFrom(http.get('/api/checklists')).catch((e) => e);
    ctrl.expectOne('/api/checklists').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(await result).toBeInstanceOf(HttpErrorResponse);
    expect(auth.isSignedIn()).toBe(false);
  });

  it('does not attach a token or retry for anonymous requests', () => {
    http.get('/api/services').subscribe({ error: () => undefined });
    const req = ctrl.expectOne('/api/services');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectNone('/api/auth/refresh');
  });

  it('guards: anonymous users are sent to sign-in with a return path; citizens cannot enter admin', async () => {
    const run = (guard: typeof adminGuard, url: string) =>
      TestBed.runInInjectionContext(() => guard({} as never, { url } as never)) as boolean | UrlTree;
    const router = TestBed.inject(Router);

    const anon = run(signedInGuard, '/checklists') as UrlTree;
    expect(router.serializeUrl(anon)).toBe('/signin?next=%2Fchecklists');

    await signIn();
    expect(run(signedInGuard, '/checklists')).toBe(true);
    expect(router.serializeUrl(run(adminGuard, '/admin') as UrlTree)).toBe('/');
  });

  it('turns API errors into readable messages without leaking server errors', () => {
    const validation = new HttpErrorResponse({ status: 400, error: { error: { message: 'Request validation failed', details: [{ issue: 'email must be an email' }] } } });
    expect(errorMessage(validation, 'fallback')).toBe('email must be an email');
    const rule = new HttpErrorResponse({ status: 422, error: { error: { message: 'Add the Khmer text before approving' } } });
    expect(errorMessage(rule, 'fallback')).toBe('Add the Khmer text before approving');
    const server = new HttpErrorResponse({ status: 500, error: { error: { message: 'internal detail' } } });
    expect(errorMessage(server, 'fallback')).toBe('fallback');
  });
});
