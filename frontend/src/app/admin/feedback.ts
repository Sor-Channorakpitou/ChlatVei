import { Component, inject, signal } from '@angular/core';
import { Api } from '../core/api';
import { errorMessage } from '../core/auth';
import { I18n, TPipe } from '../core/i18n';
import { MessageKey } from '../core/messages';
import { FeedbackItem, FeedbackStatus } from '../core/models';

const STATUSES: FeedbackStatus[] = ['OPEN', 'RESOLVED', 'DISMISSED'];

/** Citizen feedback for admins. Who sent it is never shown (privacy, spec §15). */
@Component({
  selector: 'app-admin-feedback',
  imports: [TPipe],
  template: `
    <section class="stack">
      <h1>{{ 'adm.feedback' | t }}</h1>
      <div class="seg" role="group">
        @for (s of statuses; track s) {
          <button type="button" [attr.aria-pressed]="status() === s" (click)="load(s)">{{ statusKey(s) | t }}</button>
        }
      </div>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      @if (items() === null) { <p class="muted">{{ 'gen.loading' | t }}</p> }
      <div class="stack-sm">
        @for (f of items(); track f.id) {
          <article class="card item">
            <div class="row">
              <span [class]="f.kind === 'RATING' ? 'badge b-info' : 'badge b-warn'">{{ kindKey(f) | t }}</span>
              <strong>{{ i18n.pick(f.service.nameKm, f.service.nameEn) }}</strong>
              <span class="muted">{{ i18n.date(f.createdAt) }}</span>
            </div>
            <div class="row muted">
              @if (f.rating !== null) { <span>{{ 'adm.fb.rating' | t: { n: f.rating } }}</span> }
              @if (f.difficulty !== null) { <span>{{ 'adm.fb.difficulty' | t: { n: f.difficulty } }}</span> }
              @if (f.outcome) { <span>{{ outcomeKey(f.outcome) | t }}</span> }
            </div>
            @if (f.confusingStep; as st) {
              <p>{{ 'adm.fb.step' | t: { step: st.position + '. ' + i18n.pick(st.titleKm, st.titleEn) } }}</p>
            }
            @if (f.comment) { <blockquote>{{ f.comment }}</blockquote> }
            <div class="row">
              @if (f.status === 'OPEN') {
                <button type="button" class="btn ok small" (click)="set(f, 'RESOLVED')">{{ 'adm.fb.resolve' | t }}</button>
                <button type="button" class="btn ghost small" (click)="set(f, 'DISMISSED')">{{ 'adm.fb.dismiss' | t }}</button>
              } @else {
                <button type="button" class="btn ghost small" (click)="set(f, 'OPEN')">{{ 'adm.fb.reopen' | t }}</button>
              }
            </div>
          </article>
        } @empty {
          @if (items() !== null) { <p class="muted">{{ 'adm.fb.none' | t }}</p> }
        }
      </div>
    </section>
  `,
  styles: `
    .seg { display: inline-flex; background: var(--card); border: 1px solid var(--line); border-radius: 999px; padding: 3px; align-self: flex-start; }
    .seg button { border: 0; background: transparent; padding: 6px 14px; border-radius: 999px; font-size: 14px; }
    .seg button[aria-pressed='true'] { background: var(--accent); color: var(--on-accent); }
    .item { display: flex; flex-direction: column; gap: 8px; }
    blockquote { margin: 0; background: var(--paper); border-left: 3px solid var(--gold); padding: 8px 10px; border-radius: 0 8px 8px 0; overflow-wrap: anywhere; }
    .small { min-height: 36px; padding: 6px 12px; font-size: 13px; }
  `,
})
export class FeedbackAdminPage {
  private readonly api = inject(Api);
  protected readonly i18n = inject(I18n);
  protected readonly statuses = STATUSES;

  protected readonly status = signal<FeedbackStatus>('OPEN');
  protected readonly items = signal<FeedbackItem[] | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.load('OPEN');
  }

  protected statusKey(s: FeedbackStatus): MessageKey {
    return `adm.fb.status.${s}` as MessageKey;
  }
  protected kindKey(f: FeedbackItem): MessageKey {
    return `adm.fb.kind.${f.kind}` as MessageKey;
  }
  protected outcomeKey(o: string): MessageKey {
    return `fb.outcome.${o}` as MessageKey;
  }

  protected load(status: FeedbackStatus): void {
    this.status.set(status);
    this.items.set(null);
    this.api.feedbackList({ status }).subscribe({
      next: (p) => this.items.set(p.data),
      error: (e) => this.error.set(errorMessage(e, this.i18n.t('gen.error'))),
    });
  }

  /** Moves an item to another status; it leaves the current list. */
  protected set(item: FeedbackItem, status: FeedbackStatus): void {
    this.api.setFeedbackStatus(item.id, status).subscribe({
      next: () => this.items.update((list) => list?.filter((f) => f.id !== item.id) ?? null),
      error: (e) => this.error.set(errorMessage(e, this.i18n.t('gen.error'))),
    });
  }
}
