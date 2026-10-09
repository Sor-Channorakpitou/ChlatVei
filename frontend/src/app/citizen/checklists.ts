import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { I18n, TPipe } from '../core/i18n';
import { Checklist } from '../core/models';

@Component({
  selector: 'app-checklists',
  imports: [RouterLink, TPipe],
  template: `
    <section class="stack">
      <h1>{{ 'cl.title' | t }}</h1>
      @if (error()) {
        <p class="error">{{ 'gen.error' | t }}</p>
      } @else if (lists() === null) {
        <p class="muted">{{ 'gen.loading' | t }}</p>
      } @else {
        @for (l of lists(); track l.id) {
          <a class="card list" [routerLink]="['/checklists', l.id]">
            <strong>{{ i18n.pick(l.service.nameKm, l.service.nameEn) }}</strong>
            <span class="muted">{{ 'cl.progress' | t: { done: l.progress.done, total: l.progress.total } }}</span>
            <span class="bar"><i [style.width.%]="l.progress.total ? (l.progress.done / l.progress.total) * 100 : 0"></i></span>
          </a>
        } @empty {
          <p class="muted">{{ 'cl.none' | t }}</p>
        }
      }
    </section>
  `,
  styles: `
    .list { display: flex; flex-direction: column; gap: 6px; text-decoration: none; color: inherit; }
    .bar { height: 8px; background: var(--paper); border-radius: 999px; overflow: hidden; border: 1px solid var(--line); }
    .bar i { display: block; height: 100%; background: var(--ok); }
  `,
})
export class ChecklistsPage {
  private readonly api = inject(Api);
  protected readonly i18n = inject(I18n);
  protected readonly lists = signal<Checklist[] | null>(null);
  protected readonly error = signal(false);

  constructor() {
    this.api.checklists().subscribe({ next: (l) => this.lists.set(l), error: () => this.error.set(true) });
  }
}
