import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/auth';
import { I18n, TPipe } from '../core/i18n';
import { Lang } from '../core/models';

@Component({
  selector: 'app-account',
  imports: [TPipe],
  template: `
    @if (auth.user(); as u) {
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
    }
  `,
})
export class AccountPage {
  protected readonly auth = inject(AuthService);
  private readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  protected readonly saved = signal(false);

  protected setLang(lang: Lang): void {
    this.i18n.set(lang);
    this.auth.updateProfile({ preferredLanguage: lang }).subscribe(() => this.saved.set(true));
  }

  protected signOut(): void {
    this.auth.logout().subscribe(() => void this.router.navigate(['/']));
  }
}
