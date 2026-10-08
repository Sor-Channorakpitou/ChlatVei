import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TPipe } from '../core/i18n';

@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TPipe],
  template: `
    <nav class="tabs" aria-label="Admin">
      <a routerLink="review" routerLinkActive="on">{{ 'nav.review' | t }}</a>
      <a routerLink="dashboard" routerLinkActive="on">{{ 'nav.dashboard' | t }}</a>
      <a routerLink="sources" routerLinkActive="on">{{ 'nav.sources' | t }}</a>
      <a routerLink="feedback" routerLinkActive="on">{{ 'nav.feedback' | t }}</a>
      <a routerLink="users" routerLinkActive="on">{{ 'nav.users' | t }}</a>
    </nav>
    <router-outlet />
  `,
  styles: `
    .tabs { display: flex; flex-wrap: wrap; max-width: 100%; gap: 4px; background: var(--card); border: 1px solid var(--line); border-radius: 999px; padding: 3px; margin-bottom: 16px; }
    .tabs a { padding: 6px 14px; border-radius: 999px; text-decoration: none; color: var(--ink-soft); font-size: 14px; }
    .tabs a.on { background: var(--accent); color: var(--on-accent); }
  `,
})
export class AdminShell {}
