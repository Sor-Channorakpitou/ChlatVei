import { Component, inject, signal } from '@angular/core';
import { Api } from '../core/api';
import { errorMessage } from '../core/auth';
import { I18n, TPipe } from '../core/i18n';
import { ServiceSummary } from '../core/models';

type Status = NonNullable<ServiceSummary['publishStatus']>;

/**
 * Service management: Khmer name and publish status. The backend enforces the rules
 * (a Khmer name and at least one verified requirement or step before publishing);
 * its message is shown when it refuses.
 */
@Component({
  selector: 'app-admin-services',
  imports: [TPipe],
  template: `
    <section class="stack">
      <h1>{{ 'adm.services' | t }}</h1>
      <p class="muted">{{ 'adm.svc.help' | t }}</p>
      @if (services() === null) { <p class="muted">{{ 'gen.loading' | t }}</p> }
      <div class="list">
        @for (s of services(); track s.id) {
          <article class="card svc">
            <div class="row">
              <strong>{{ s.nameEn }}</strong>
              <span [class]="badge(s.publishStatus!)">{{ s.publishStatus }}</span>
            </div>
            <span class="muted">{{ s.slug }} · {{ i18n.pick(s.category.nameKm, s.category.nameEn) }}</span>
            <div class="field">
              <label [for]="'km-' + s.id">{{ 'adm.svc.nameKm' | t }}</label>
              <div class="row nowrap">
                <input [id]="'km-' + s.id" lang="km" [value]="s.nameKm ?? ''" (input)="draft[s.id] = $any($event.target).value" />
                <button type="button" class="btn ghost small" (click)="save(s, { nameKm: (draft[s.id] ?? '').trim() })">{{ 'gen.save' | t }}</button>
              </div>
            </div>
            <div class="row">
              @if (s.publishStatus !== 'PUBLISHED') {
                <button type="button" class="btn ok small" (click)="save(s, { publishStatus: 'PUBLISHED' })">{{ 'adm.svc.publish' | t }}</button>
              } @else {
                <button type="button" class="btn ghost small" (click)="save(s, { publishStatus: 'DRAFT' })">{{ 'adm.svc.unpublish' | t }}</button>
              }
            </div>
            @if (messages()[s.id]; as m) { <p [class]="m.ok ? 'toast' : 'error'" role="status">{{ m.text }}</p> }
          </article>
        }
      </div>
    </section>
  `,
  styles: `
    .list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
    @media (min-width: 860px) { .list { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; } }
    .svc { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .nowrap { flex-wrap: nowrap; }
    .nowrap input { flex: 1; min-width: 0; }
    .small { min-height: 36px; padding: 6px 12px; font-size: 13px; flex: none; }
  `,
})
export class ServicesAdminPage {
  private readonly api = inject(Api);
  protected readonly i18n = inject(I18n);
  protected readonly services = signal<ServiceSummary[] | null>(null);
  protected readonly messages = signal<Record<string, { ok: boolean; text: string }>>({});
  protected readonly draft: Record<string, string | undefined> = {};

  constructor() {
    this.api.adminServices().subscribe({ next: (p) => this.services.set(p.data), error: () => this.services.set([]) });
  }

  protected badge(status: Status): string {
    return status === 'PUBLISHED' ? 'badge b-ok' : status === 'ARCHIVED' ? 'badge b-bad' : 'badge b-warn';
  }

  protected save(service: ServiceSummary, patch: { nameKm?: string; publishStatus?: Status }): void {
    if (patch.nameKm === '') return;
    this.api.updateService(service.id, patch).subscribe({
      next: (updated) => {
        this.services.update((list) => list?.map((s) => (s.id === service.id ? { ...s, ...updated } : s)) ?? null);
        this.messages.update((m) => ({ ...m, [service.id]: { ok: true, text: this.i18n.t('auth.saved') } }));
      },
      error: (e) => this.messages.update((m) => ({ ...m, [service.id]: { ok: false, text: errorMessage(e, this.i18n.t('gen.error')) } })),
    });
  }
}
