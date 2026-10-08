import { Component, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService, errorMessage } from '../core/auth';
import { I18n, TPipe } from '../core/i18n';

/** Only same-site paths are allowed as a post-login destination (no open redirects). */
function safeNext(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

@Component({
  selector: 'app-signin',
  imports: [RouterLink, TPipe],
  template: `
    <form class="card stack" (submit)="submit($event)" novalidate>
      <h1>{{ 'auth.signIn' | t }}</h1>
      <div class="field">
        <label for="email">{{ 'auth.email' | t }}</label>
        <input id="email" type="email" autocomplete="email" required (input)="email.set($any($event.target).value)" />
      </div>
      <div class="field">
        <label for="password">{{ 'auth.password' | t }}</label>
        <input id="password" type="password" autocomplete="current-password" required (input)="password.set($any($event.target).value)" />
      </div>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      <button class="btn block" type="submit" [disabled]="busy()">{{ 'auth.signIn' | t }}</button>
      <p class="muted">{{ 'auth.noAccount' | t }} <a routerLink="/register" [queryParams]="{ next: next() }">{{ 'auth.register' | t }}</a></p>
    </form>
  `,
})
export class SignInPage {
  readonly next = input<string>();
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected submit(e: Event): void {
    e.preventDefault();
    this.busy.set(true);
    this.error.set(null);
    this.auth.login(this.email().trim(), this.password()).subscribe({
      next: (user) => {
        this.i18n.useDefault(user.preferredLanguage);
        void this.router.navigateByUrl(safeNext(this.next()));
      },
      error: (err) => {
        this.error.set(errorMessage(err, this.i18n.t('gen.error')));
        this.busy.set(false);
      },
    });
  }
}

@Component({
  selector: 'app-register',
  imports: [RouterLink, TPipe],
  template: `
    <form class="card stack" (submit)="submit($event)" novalidate>
      <h1>{{ 'auth.register' | t }}</h1>
      <div class="field">
        <label for="name">{{ 'auth.name' | t }}</label>
        <input id="name" autocomplete="name" maxlength="80" required (input)="displayName.set($any($event.target).value)" />
      </div>
      <div class="field">
        <label for="email">{{ 'auth.email' | t }}</label>
        <input id="email" type="email" autocomplete="email" required (input)="email.set($any($event.target).value)" />
      </div>
      <div class="field">
        <label for="password">{{ 'auth.password' | t }}</label>
        <input id="password" type="password" autocomplete="new-password" minlength="8" required (input)="password.set($any($event.target).value)" />
        <span class="muted">{{ 'auth.passwordHint' | t }}</span>
      </div>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      <button class="btn block" type="submit" [disabled]="busy()">{{ 'auth.register' | t }}</button>
      <p class="muted">{{ 'auth.haveAccount' | t }} <a routerLink="/signin" [queryParams]="{ next: next() }">{{ 'auth.signIn' | t }}</a></p>
    </form>
  `,
})
export class RegisterPage {
  readonly next = input<string>();
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);

  protected readonly displayName = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected submit(e: Event): void {
    e.preventDefault();
    this.busy.set(true);
    this.error.set(null);
    this.auth.register({ email: this.email().trim(), password: this.password(), displayName: this.displayName().trim() }).subscribe({
      next: () => void this.router.navigateByUrl(safeNext(this.next())),
      error: (err) => {
        this.error.set(errorMessage(err, this.i18n.t('gen.error')));
        this.busy.set(false);
      },
    });
  }
}
