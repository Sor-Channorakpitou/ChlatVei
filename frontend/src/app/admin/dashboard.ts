import { Component, computed, inject, signal } from '@angular/core';
import { catchError, forkJoin, of } from 'rxjs';
import { Api } from '../core/api';
import { I18n, TPipe } from '../core/i18n';
import { FeedbackAnalytics, Overview } from '../core/models';

/**
 * Admin dashboard (spec §23). Each block answers one question:
 * - tiles: what needs attention now?
 * - services by category: where is coverage thin?
 * - hardest services and confusing steps: where do citizens struggle? (RQ1, RQ3)
 * - recent changes: what changed in public information?
 */
@Component({
  selector: 'app-dashboard',
  imports: [TPipe],
  template: `
    @if (error()) { <p class="error">{{ 'gen.error' | t }}</p> }
    @if (overview(); as o) {
      <div class="stack">
        <div class="tiles">
          <div class="card tile"><div class="label">{{ 'adm.pendingReview' | t }}</div><div class="v">{{ o.content.pendingReview }}</div></div>
          <div class="card tile"><div class="label">{{ 'adm.services' | t }}</div><div class="v">{{ o.services.byStatus['PUBLISHED'] ?? 0 }} / {{ totalServices() }}</div><span class="muted">PUBLISHED</span></div>
          <div class="card tile"><div class="label">{{ 'adm.sources' | t }}</div><div class="v">{{ o.sources['VERIFIED'] ?? 0 }} / {{ totalSources() }}</div><span class="muted">VERIFIED</span></div>
          <div class="card tile"><div class="label">{{ 'adm.openFeedback' | t }}</div><div class="v">{{ o.feedback.open }}</div></div>
          <div class="card tile"><div class="label">{{ 'adm.outdated' | t }}</div><div class="v">{{ o.content.outdated }}</div></div>
          <div class="card tile"><div class="label">{{ 'adm.stale' | t }}</div><div class="v">{{ o.services.notVerifiedIn180Days }}</div></div>
        </div>

        <div class="grid2">
          <section class="card stack-sm">
            <h2>{{ 'adm.byCategory' | t }}</h2>
            @for (c of o.services.byCategory; track c.slug) {
              <div class="bar">
                <span>{{ i18n.pick(c.nameKm, c.nameEn) }}</span>
                <span class="track"><i [style.width.%]="maxCategory() ? (c.count / maxCategory()) * 100 : 0"></i></span>
                <span class="n">{{ c.count }}</span>
              </div>
            }
          </section>

          <section class="card stack-sm">
            <h2>{{ 'adm.difficulty' | t }}</h2>
            @for (s of feedback()?.byService ?? []; track $index) {
              <div class="bar">
                <span>{{ i18n.pick(s.service?.nameKm, s.service?.nameEn) }} <span class="muted">({{ s.responses }})</span></span>
                <span class="track"><i class="warn" [style.width.%]="((s.avgDifficulty ?? 0) / 5) * 100"></i></span>
                <span class="n">{{ s.avgDifficulty ?? '–' }}</span>
              </div>
            } @empty { <p class="muted">{{ 'adm.noFeedback' | t }}</p> }
          </section>

          <section class="card stack-sm">
            <h2>{{ 'adm.confusing' | t }}</h2>
            @for (c of feedback()?.confusingSteps ?? []; track c.step.id) {
              <div class="bar">
                <span>{{ i18n.pick(c.step.titleKm, c.step.titleEn) }} <span class="muted">({{ c.reports }}/{{ c.responses }})</span></span>
                <span class="ci" [attr.aria-label]="(c.confusionRate.low * 100).toFixed(0) + '–' + (c.confusionRate.high * 100).toFixed(0) + '%'">
                  <span class="rng" [style.left.%]="c.confusionRate.low * 100" [style.width.%]="(c.confusionRate.high - c.confusionRate.low) * 100"></span>
                  <span class="pt" [style.left.%]="c.confusionRate.rate * 100"></span>
                </span>
                <span class="n">{{ (c.confusionRate.rate * 100).toFixed(0) }}%</span>
              </div>
            } @empty { <p class="muted">{{ 'adm.noFeedback' | t }}</p> }
          </section>

          <section class="card stack-sm">
            <h2>{{ 'adm.recent' | t }}</h2>
            @for (r of o.recentChanges; track r.id) {
              <p class="change">
                <span class="badge" [class]="r.changeType === 'REMOVED' ? 'badge b-bad' : r.changeType === 'CHANGED' ? 'badge b-warn' : 'badge b-ok'">{{ r.changeType }}</span>
                {{ i18n.pick(r.summaryKm, r.summaryEn) }}
                <span class="muted">· {{ r.service.nameKm }} · {{ i18n.date(r.createdAt) }}</span>
              </p>
            } @empty { <p class="muted">–</p> }
          </section>
        </div>
      </div>
    } @else if (!error()) {
      <p class="muted">{{ 'gen.loading' | t }}</p>
    }
  `,
  styles: `
    .tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    @media (min-width: 720px) { .tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (min-width: 1000px) { .tiles { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
    .tile .v { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .grid2 { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
    @media (min-width: 860px) { .grid2 { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
    .bar { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) 44px; gap: 10px; align-items: center; font-size: 13px; }
    .track, .ci { position: relative; height: 12px; background: var(--paper); border-radius: 999px; border: 1px solid var(--line); overflow: hidden; display: block; }
    .track i { display: block; height: 100%; background: var(--accent); }
    .track i.warn { background: var(--warn); }
    .ci .rng { position: absolute; top: 3px; height: 4px; background: var(--warn); opacity: .5; border-radius: 999px; }
    .ci .pt { position: absolute; top: 1px; width: 8px; height: 8px; border-radius: 50%; background: var(--warn); transform: translateX(-4px); }
    .n { text-align: right; font-variant-numeric: tabular-nums; }
    .change { font-size: 14px; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
  `,
})
export class DashboardPage {
  private readonly api = inject(Api);
  protected readonly i18n = inject(I18n);

  protected readonly overview = signal<Overview | null>(null);
  protected readonly feedback = signal<FeedbackAnalytics | null>(null);
  protected readonly error = signal(false);

  protected readonly totalServices = computed(() => Object.values(this.overview()?.services.byStatus ?? {}).reduce((a: number, b) => a + (b ?? 0), 0));
  protected readonly totalSources = computed(() => Object.values(this.overview()?.sources ?? {}).reduce((a: number, b) => a + (b ?? 0), 0));
  protected readonly maxCategory = computed(() => Math.max(0, ...(this.overview()?.services.byCategory.map((c) => c.count) ?? [])));

  constructor() {
    forkJoin({
      overview: this.api.overview(),
      feedback: this.api.feedbackAnalytics().pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ overview, feedback }) => {
        this.overview.set(overview);
        this.feedback.set(feedback);
      },
      error: () => this.error.set(true),
    });
  }
}
