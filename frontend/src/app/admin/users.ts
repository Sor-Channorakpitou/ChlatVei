import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, map, of, startWith, switchMap } from 'rxjs';
import { Api } from '../core/api';
import { AuthService, errorMessage } from '../core/auth';
import { I18n, TPipe } from '../core/i18n';
import { AdminUser } from '../core/models';

/**
 * User management. Sensitive actions (role change, deactivation) need a second
 * tap to confirm; the backend ends the user's sessions and writes an audit log.
 * Admins cannot change their own role or deactivate themselves (backend rule).
 */
@Component({
  selector: 'app-admin-users',
  imports: [TPipe],
  template: `
    <section class="stack">
      <h1>{{ 'adm.users' | t }}</h1>
      <div class="field">
        <input type="search" [placeholder]="'adm.usersSearch' | t" [attr.aria-label]="'adm.usersSearch' | t" (input)="query.set($any($event.target).value)" />
      </div>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      <div class="stack-sm">
        @for (u of users(); track u.id) {
          <article class="card user">
            <div class="row">
              <strong>{{ u.displayName }}</strong>
              <span [class]="u.role === 'ADMIN' ? 'badge b-info' : 'badge'">{{ u.role }}</span>
              @if (!u.isActive) { <span class="badge b-bad">{{ 'adm.inactive' | t }}</span> }
              @if (u.id === me()) { <span class="badge b-ok">{{ 'adm.you' | t }}</span> }
            </div>
            <span class="muted">{{ u.email }}@if (u.lastLoginAt) { · {{ 'adm.lastLogin' | t: { date: i18n.date(u.lastLoginAt) } }} }</span>
            @if (u.id !== me()) {
              <div class="row">
                <button type="button" class="btn ghost small" (click)="act(u, 'role')">
                  {{ (pending() === u.id + 'role' ? 'adm.confirm' : u.role === 'ADMIN' ? 'adm.makeCitizen' : 'adm.makeAdmin') | t }}
                </button>
                <button type="button" [class]="u.isActive ? 'btn bad small' : 'btn ok small'" (click)="act(u, 'active')">
                  {{ (pending() === u.id + 'active' ? 'adm.confirm' : u.isActive ? 'adm.deactivate' : 'adm.activate') | t }}
                </button>
              </div>
            }
          </article>
        }
      </div>
    </section>
  `,
  styles: `
    .user { display: flex; flex-direction: column; gap: 6px; }
    .small { min-height: 36px; padding: 6px 12px; font-size: 13px; }
  `,
})
export class UsersPage {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);

  protected readonly query = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly pending = signal<string | null>(null);
  protected readonly me = () => this.auth.user()?.id;

  protected readonly users = signal<AdminUser[]>([]);

  constructor() {
    toObservable(this.query)
      .pipe(
        debounceTime(250),
        startWith(''),
        switchMap((q) => this.api.users({ q: q.trim() || undefined }).pipe(map((p) => p.data), catchError(() => of([] as AdminUser[])))),
        takeUntilDestroyed(),
      )
      .subscribe((list) => this.users.set(list));
  }

  /** First tap arms the action, second tap within the same item performs it. */
  protected act(user: AdminUser, action: 'role' | 'active'): void {
    const key = user.id + action;
    if (this.pending() !== key) {
      this.pending.set(key);
      return;
    }
    this.pending.set(null);
    this.error.set(null);
    const patch = action === 'role' ? { role: user.role === 'ADMIN' ? ('CITIZEN' as const) : ('ADMIN' as const) } : { isActive: !user.isActive };
    this.api.updateUser(user.id, patch).subscribe({
      next: (updated) => this.users.update((list) => list.map((u) => (u.id === updated.id ? { ...u, ...updated } : u))),
      error: (e) => this.error.set(errorMessage(e, this.i18n.t('gen.error'))),
    });
  }
}
