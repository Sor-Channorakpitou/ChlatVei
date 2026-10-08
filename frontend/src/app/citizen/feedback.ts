import { Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';
import { Api, FeedbackInput } from '../core/api';
import { errorMessage } from '../core/auth';
import { I18n, TPipe } from '../core/i18n';
import { MessageKey } from '../core/messages';

type Kind = FeedbackInput['kind'];
const OUTCOMES = ['COMPLETED', 'IN_PROGRESS', 'GAVE_UP', 'NOT_STARTED'] as const;

/**
 * Citizen feedback (spec §15). Collects only what RQ1/RQ3 need: scores, the confusing
 * step, the outcome and an optional comment. No names, phone numbers or ID numbers.
 */
@Component({
  selector: 'app-feedback',
  imports: [RouterLink, TPipe],
  template: `
    <section class="stack">
      <div class="stack-sm">
        <a [routerLink]="['/services', slug()]" class="back">← {{ 'gen.back' | t }}</a>
        <h1>{{ 'fb.title' | t }}</h1>
        @if (service(); as s) { <p class="muted">{{ i18n.pick(s.nameKm, s.nameEn) }}</p> }
      </div>

      @if (sent()) {
        <p class="toast" role="status">{{ 'fb.thanks' | t }}</p>
        <a class="btn ghost" [routerLink]="['/services', slug()]">{{ 'gen.back' | t }}</a>
      } @else {
        <div class="seg" role="group">
          <button type="button" [attr.aria-pressed]="kind() === 'RATING'" (click)="kind.set('RATING')">{{ 'fb.title' | t }}</button>
          <button type="button" [attr.aria-pressed]="kind() !== 'RATING'" (click)="kind.set('REPORT_UNCLEAR')">{{ 'fb.report' | t }}</button>
        </div>

        <form class="stack" (submit)="submit($event)" novalidate>
          @if (kind() === 'RATING') {
            <fieldset class="field">
              <legend>{{ 'fb.easy' | t }}</legend>
              <div class="scale">
                @for (n of scale; track n) {
                  <button type="button" [attr.aria-pressed]="rating() === n" (click)="rating.set(n)">{{ n }}</button>
                }
              </div>
            </fieldset>
            <fieldset class="field">
              <legend>{{ 'fb.hard' | t }}</legend>
              <div class="scale">
                @for (n of scale; track n) {
                  <button type="button" [attr.aria-pressed]="difficulty() === n" (click)="difficulty.set(n)">{{ n }}</button>
                }
              </div>
            </fieldset>
            <div class="field">
              <label for="fb-outcome">{{ 'fb.outcome' | t }}</label>
              <select id="fb-outcome" (change)="outcome.set($any($event.target).value)">
                <option value="">—</option>
                @for (o of outcomes; track o) { <option [value]="o">{{ outcomeLabel(o) | t }}</option> }
              </select>
            </div>
          } @else {
            <div class="field">
              <label for="fb-kind">{{ 'fb.report' | t }}</label>
              <select id="fb-kind" (change)="kind.set($any($event.target).value)">
                <option value="REPORT_UNCLEAR">{{ 'fb.reportUnclear' | t }}</option>
                <option value="REPORT_OUTDATED">{{ 'fb.reportOutdated' | t }}</option>
              </select>
            </div>
          }

          @if (steps().length) {
            <div class="field">
              <label for="fb-step">{{ 'fb.step' | t }}</label>
              <select id="fb-step" (change)="stepId.set($any($event.target).value)">
                <option value="">{{ 'fb.noStep' | t }}</option>
                @for (st of steps(); track st.id; let i = $index) {
                  <option [value]="st.id">{{ i + 1 }}. {{ i18n.pick(st.titleKm, st.titleEn) }}</option>
                }
              </select>
            </div>
          }

          <div class="field">
            <label for="fb-comment">{{ 'fb.comment' | t }}</label>
            <textarea id="fb-comment" rows="3" maxlength="1000" (input)="comment.set($any($event.target).value)"></textarea>
          </div>

          @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
          <button class="btn block" type="submit" [disabled]="sending()">{{ 'fb.send' | t }}</button>
        </form>
      }
    </section>
  `,
  styles: `
    .back { font-size: 14px; text-decoration: none; }
    fieldset { border: 0; padding: 0; margin: 0; }
    legend { padding: 0; margin-bottom: 6px; }
    .scale { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
    .scale button { border: 1px solid var(--line); background: var(--card); border-radius: 10px; min-height: 44px; font-weight: 600; }
    .scale button[aria-pressed='true'] { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
    .seg { display: grid; grid-template-columns: 1fr 1fr; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 3px; }
    .seg button { border: 0; background: transparent; border-radius: 10px; min-height: 40px; font-size: 14px; }
    .seg button[aria-pressed='true'] { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
  `,
})
export class FeedbackPage {
  readonly slug = input.required<string>();

  private readonly api = inject(Api);
  protected readonly i18n = inject(I18n);

  protected readonly scale = [1, 2, 3, 4, 5];
  protected readonly outcomes = OUTCOMES;

  protected readonly service = toSignal(
    toObservable(this.slug).pipe(switchMap((s) => this.api.service(s).pipe(catchError(() => of(null))))),
    { initialValue: null },
  );
  protected readonly steps = computed(() => this.service()?.steps ?? []);

  protected readonly kind = signal<Kind>('RATING');
  protected readonly rating = signal<number | undefined>(undefined);
  protected readonly difficulty = signal<number | undefined>(undefined);
  protected readonly outcome = signal('');
  protected readonly stepId = signal('');
  protected readonly comment = signal('');

  protected readonly sending = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected outcomeLabel(o: (typeof OUTCOMES)[number]): MessageKey {
    return `fb.outcome.${o}` as MessageKey;
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const kind = this.kind();
    if (kind === 'RATING' && this.rating() === undefined && this.difficulty() === undefined) {
      this.error.set(this.i18n.t('fb.needScore'));
      return;
    }
    const input: FeedbackInput = {
      serviceSlug: this.slug(),
      kind,
      ...(kind === 'RATING' ? { rating: this.rating(), difficulty: this.difficulty(), outcome: this.outcome() || undefined } : {}),
      confusingStepId: this.stepId() || undefined,
      comment: this.comment().trim() || undefined,
    };
    this.sending.set(true);
    this.error.set(null);
    this.api.sendFeedback(input).subscribe({
      next: () => this.sent.set(true),
      error: (e) => {
        this.error.set(errorMessage(e, this.i18n.t('gen.error')));
        this.sending.set(false);
      },
    });
  }
}
