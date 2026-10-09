import { Component, inject, signal } from '@angular/core';
import { Api } from '../core/api';
import { errorMessage } from '../core/auth';
import { I18n, TPipe } from '../core/i18n';
import { Source } from '../core/models';

/** Sources must be VERIFIED before any content citing them can be approved. */
@Component({
  selector: 'app-sources',
  imports: [TPipe],
  template: `
    <section class="stack">
      <h1>{{ 'adm.sources' | t }}</h1>
      @if (message()) { <p class="error" role="alert">{{ message() }}</p> }
      @if (sources() === null) { <p class="muted">{{ 'gen.loading' | t }}</p> }
      <div class="list">
        @for (s of sources(); track s.id) {
          <article class="card src">
            <div class="head">
              <strong>{{ s.code }}</strong>
              <span class="badge b-info">{{ s.tier }}</span>
              <span class="badge" [class]="badge(s.status)">{{ s.status }}</span>
              <span class="muted">{{ s.language }}</span>
            </div>
            <a [href]="s.url" target="_blank" rel="noopener" class="name">{{ s.name }}</a>
            <span class="muted">{{ s.publisher }}@if (s.lastCheckedAt) { · {{ i18n.date(s.lastCheckedAt) }} }</span>
            @if (s.notes) { <span class="muted note">{{ s.notes }}</span> }
            <div class="row">
              @if (s.status !== 'VERIFIED') {
                <button type="button" class="btn ok" [disabled]="busy() === s.id" (click)="decide(s, 'VERIFIED')">{{ 'adm.verify' | t }}</button>
              }
              @if (s.status === 'VERIFIED') {
                <button type="button" class="btn ghost" [disabled]="busy() === s.id" (click)="decide(s, 'OUTDATED')">{{ 'adm.markOutdated' | t }}</button>
              }
              @if (s.status === 'PENDING' || s.status === 'UNDER_REVIEW') {
                <button type="button" class="btn bad" [disabled]="busy() === s.id" (click)="decide(s, 'REJECTED')">{{ 'adm.rejectSource' | t }}</button>
              }
            </div>
          </article>
        }
      </div>
    </section>
  `,
  styles: `
    .list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
    @media (min-width: 860px) { .list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .src { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .name { overflow-wrap: anywhere; }
    .note { font-style: italic; }
  `,
})
export class SourcesPage {
  private readonly api = inject(Api);
  protected readonly i18n = inject(I18n);

  protected readonly sources = signal<Source[] | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);

  constructor() {
    this.api.sources().subscribe({ next: (p) => this.sources.set(p.data), error: () => this.message.set(this.i18n.t('gen.error')) });
  }

  protected badge(status: string): string {
    return status === 'VERIFIED' ? 'badge b-ok' : status === 'REJECTED' || status === 'OUTDATED' ? 'badge b-bad' : 'badge b-warn';
  }

  protected decide(source: Source, status: 'VERIFIED' | 'REJECTED' | 'OUTDATED'): void {
    this.busy.set(source.id);
    this.message.set(null);
    this.api.decideSource(source.id, status).subscribe({
      next: (updated) => {
        this.sources.update((list) => list?.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)) ?? null);
        this.busy.set(null);
      },
      error: (e) => {
        this.message.set(errorMessage(e, this.i18n.t('gen.error')));
        this.busy.set(null);
      },
    });
  }
}
