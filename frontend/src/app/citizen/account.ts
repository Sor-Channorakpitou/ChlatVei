import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, errorMessage } from '../core/auth';
import { I18n, TPipe } from '../core/i18n';
import { Lang } from '../core/models';

@Component({
  selector: 'app-account',
  imports: [TPipe],
  template: `
    @if (auth.user(); as u) {
      <div class="stack">
      <section class="card stack">
        <h1>{{ 'nav.account' | t }}</h1>
        <p>{{ 'auth.signedInAs' | t: { name: u.displayName } }}<br /><span class="muted">{{ u.email }}</span></p>
        <div class="field">
          <label for="pref-lang">{{ 'auth.preferredLang' | t }}</label>
          <select id="pref-lang" [value]="u.preferredLanguage" (change)="setLang($any($event.target).value)">
            <option value="km">ខ្មែរ</option>
            <option value="en">English</option>
          </select>
        </div>
        @if (saved()) { <p class="toast" role="status">{{ 'auth.saved' | t }}</p> }
        <button type="button" class="btn ghost" (click)="signOut()">{{ 'auth.signOut' | t }}</button>
      </section>

      <form class="card stack" (submit)="changePassword($event)" novalidate>
        <h2>{{ 'auth.changePassword' | t }}</h2>
        <div class="field">
          <label for="current-password">{{ 'auth.currentPassword' | t }}</label>
          <input id="current-password" type="password" autocomplete="current-password" required
            [value]="current()" (input)="current.set($any($event.target).value)" />
        </div>
        <div class="field">
          <label for="new-password">{{ 'auth.newPassword' | t }}</label>
          <input id="new-password" type="password" autocomplete="new-password" minlength="8" required aria-describedby="new-password-hint"
            [value]="next()" (input)="next.set($any($event.target).value)" />
          <small id="new-password-hint" class="muted">{{ 'auth.passwordHint' | t }}</small>
        </div>
        @if (pwError()) { <p class="error" role="alert">{{ pwError() }}</p> }
        @if (pwChanged()) { <p class="toast" role="status">{{ 'auth.passwordChanged' | t }}</p> }
        <button class="btn block" type="submit" [disabled]="pwBusy() || !current() || next().length < 8">{{ 'auth.changePassword' | t }}</button>
      </form>
      </div>
    }
  `,
})
export class AccountPage {
  protected readonly auth = inject(AuthService);
  private readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  protected readonly saved = signal(false);
  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly pwBusy = signal(false);
  protected readonly pwError = signal<string | null>(null);
  protected readonly pwChanged = signal(false);

  protected setLang(lang: Lang): void {
    this.i18n.set(lang);
    this.auth.updateProfile({ preferredLanguage: lang }).subscribe(() => this.saved.set(true));
  }

  protected changePassword(e: Event): void {
    e.preventDefault();
    this.pwBusy.set(true);
    this.pwError.set(null);
    this.pwChanged.set(false);
    this.auth.changePassword(this.current(), this.next()).subscribe({
      next: () => {
        this.current.set('');
        this.next.set('');
        this.pwChanged.set(true);
        this.pwBusy.set(false);
      },
      error: (err) => {
        this.pwError.set(errorMessage(err, this.i18n.t('gen.error')));
        this.pwBusy.set(false);
      },
    });
  }

  protected signOut(): void {
    this.auth.logout().subscribe(() => void this.router.navigate(['/']));
  }
}
