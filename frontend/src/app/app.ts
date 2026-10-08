import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from './core/auth';
import { I18n, TPipe } from './core/i18n';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TPipe],
  template: `
    <header class="top">
      <a routerLink="/" class="logo" aria-label="ChlatVei">Chlat<span>Vei</span></a>
      <div class="actions">
        @if (auth.isAdmin()) {
          <a class="pill" [routerLink]="inAdmin() ? '/' : '/admin'">{{ (inAdmin() ? 'nav.backToSite' : 'nav.admin') | t }}</a>
        }
        <div class="seg" role="group" [attr.aria-label]="'lang.switch' | t">
          <button type="button" [attr.aria-pressed]="i18n.lang() === 'km'" (click)="i18n.set('km')">ខ្មែរ</button>
          <button type="button" [attr.aria-pressed]="i18n.lang() === 'en'" (click)="i18n.set('en')">EN</button>
        </div>
      </div>
    </header>

    @if (!online()) {
      <p class="offline" role="status">{{ 'offline' | t }}</p>
    }

    <main [class.wide]="inAdmin()">
      <router-outlet />
    </main>

    @if (!inAdmin()) {
      <nav class="bottom" aria-label="Main">
        <a routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">
          <span aria-hidden="true">⌂</span>{{ 'nav.home' | t }}
        </a>
        <a routerLink="/checklists" routerLinkActive="on"><span aria-hidden="true">☑</span>{{ 'nav.checklists' | t }}</a>
        <a [routerLink]="auth.isSignedIn() ? '/account' : '/signin'" routerLinkActive="on">
          <span aria-hidden="true">◉</span>{{ (auth.isSignedIn() ? 'nav.account' : 'auth.signIn') | t }}
        </a>
      </nav>
    }
  `,
  styles: `
    :host { display: block; min-height: 100vh; }
    .top {
      position: sticky; top: 0; z-index: 10; display: flex; justify-content: space-between; align-items: center; gap: 12px;
      padding: calc(10px + env(safe-area-inset-top, 0px)) 16px 10px; background: var(--card); border-bottom: 1px solid var(--line);
    }
    .logo { font-size: 22px; font-weight: 700; letter-spacing: -.01em; color: var(--accent); text-decoration: none; }
    .logo span { color: var(--gold); }
    .actions { display: flex; gap: 8px; align-items: center; }
    .pill { font-size: 13px; text-decoration: none; padding: 6px 12px; border-radius: 999px; background: var(--accent-soft); }
    .seg { display: inline-flex; background: var(--paper); border: 1px solid var(--line); border-radius: 999px; padding: 3px; }
    .seg button { border: 0; background: transparent; padding: 4px 12px; border-radius: 999px; font-size: 14px; min-height: 32px; }
    .seg button[aria-pressed='true'] { background: var(--accent); color: var(--on-accent); }
    .offline { background: var(--warn-soft); color: var(--warn); padding: 8px 16px; font-size: 13px; }
    main { max-width: 560px; margin: 0 auto; padding: 16px 16px calc(var(--nav-h) + 24px + env(safe-area-inset-bottom, 0px)); }
    main.wide { max-width: 1100px; padding-bottom: 32px; }
    .bottom {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 10; display: grid; grid-template-columns: repeat(3, 1fr);
      background: var(--card); border-top: 1px solid var(--line); padding-bottom: env(safe-area-inset-bottom, 0px);
    }
    .bottom a {
      display: flex; flex-direction: column; align-items: center; gap: 2px; min-height: var(--nav-h); justify-content: center;
      font-size: 12px; color: var(--ink-soft); text-decoration: none;
    }
    .bottom a span { font-size: 18px; line-height: 1; }
    .bottom a.on { color: var(--accent); font-weight: 600; box-shadow: inset 0 3px 0 var(--accent); }
    @media (min-width: 720px) {
      .bottom { max-width: 560px; margin: 0 auto; border: 1px solid var(--line); border-bottom: 0; border-radius: 16px 16px 0 0; }
    }
  `,
})
export class App {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map((e) => (e as NavigationEnd).urlAfterRedirects)),
    { initialValue: this.router.url },
  );
  protected readonly inAdmin = computed(() => this.url().startsWith('/admin'));

  protected readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.online.set(true));
      window.addEventListener('offline', () => this.online.set(false));
    }
  }
}
