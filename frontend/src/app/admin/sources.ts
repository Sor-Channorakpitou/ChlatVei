import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { errorMessage } from '../core/auth';
import { I18n, TPipe } from '../core/i18n';
import { Source, SourceDetail } from '../core/models';

type ExtractMessage = { kind: 'ok' | 'error'; text: string };

/**
 * Sources must be VERIFIED before any content citing them can be approved.
 * From here an admin can also run the extractor on a source's latest collected
 * copy; findings go to the review queue as PENDING (Phase 7/8).
 */
@Component({
  selector: 'app-sources',
  imports: [TPipe, RouterLink],
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
              <span [class]="badge(s.status)">{{ s.status }}</span>
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
              <button type="button" class="btn ghost" [attr.aria-expanded]="open()[s.id] !== undefined" (click)="toggle(s)">{{ 'adm.details' | t }}</button>
            </div>

            @if (open()[s.id]; as d) {
              <div class="details stack-sm">
                <div class="label">{{ 'adm.snapshots' | t }}</div>
                @for (snap of d.snapshots; track snap.id) {
                  <p class="muted mono">{{ i18n.date(snap.collectedAt) }} · {{ snap.contentType ?? '' }} · sha256 {{ snap.sha256.slice(0, 12) }}…</p>
                } @empty { <p class="muted">–</p> }

                <div class="label">{{ 'adm.linkedServices' | t }}</div>
                @for (link of d.services; track link.service.id) {
                  <div class="row between">
                    <span>{{ i18n.pick(link.service.nameKm, link.service.nameEn) }} <span class="muted">· {{ link.relevance }}</span></span>
                    <button type="button" class="btn ghost small" [disabled]="busy() === s.id + link.service.id || !d.snapshots.length"
                            (click)="extract(s, link.service.id)">{{ 'adm.extract' | t }}</button>
                  </div>
                }
                @if (extractMessage()[s.id]; as m) {
                  <p [class]="m.kind === 'ok' ? 'toast' : 'error'" role="status">{{ m.text }}</p>
                  @if (m.kind === 'ok') { <a routerLink="/admin/review" [queryParams]="{ origin: 'EXTRACTED' }">{{ 'adm.openQueue' | t }} →</a> }
                }
              </div>
            }
          </article>
        }
      </div>
    </section>
  `,
  styles: `
    .list { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
    @media (min-width: 860px) { .list { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; } }
    .src { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .name { overflow-wrap: anywhere; }
    .note { font-style: italic; }
    .details { border-top: 1px dashed var(--line); padding-top: 10px; margin-top: 4px; }
    .between { justify-content: space-between; flex-wrap: nowrap; }
    .small { min-height: 36px; padding: 6px 10px; font-size: 13px; flex: none; }
    .mono { font-variant-numeric: tabular-nums; }
  `,
})
export class SourcesPage {
  private readonly api = inject(Api);
  protected readonly i18n = inject(I18n);

  protected readonly sources = signal<Source[] | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly open = signal<Record<string, SourceDetail>>({});
  protected readonly extractMessage = signal<Record<string, ExtractMessage>>({});

  constructor() {
    this.api.sources().subscribe({ next: (p) => this.sources.set(p.data), error: () => this.message.set(this.i18n.t('gen.error')) });
  }

  protected badge(status: string): string {
    return status === 'VERIFIED' ? 'badge b-ok' : status === 'REJECTED' || status === 'OUTDATED' ? 'badge b-bad' : 'badge b-warn';
  }

  protected toggle(source: Source): void {
    if (this.open()[source.id]) {
      this.open.update(({ [source.id]: _, ...rest }) => rest);
      return;
    }
    this.api.source(source.id).subscribe({
      next: (d) => this.open.update((o) => ({ ...o, [source.id]: d })),
      error: (e) => this.message.set(errorMessage(e, this.i18n.t('gen.error'))),
    });
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

  protected extract(source: Source, serviceId: string): void {
    this.busy.set(source.id + serviceId);
    this.api.runExtraction(source.id, serviceId).subscribe({
      next: (job) => {
        const text =
          job.status === 'FAILED'
            ? this.i18n.t('adm.extractFailed', { error: job.error ?? '' })
            : job.itemsProposed > 0
              ? this.i18n.t('adm.extractDone', { n: job.itemsProposed })
              : this.i18n.t('adm.extractNone');
        this.setExtractMessage(source.id, { kind: job.status === 'FAILED' ? 'error' : 'ok', text });
      },
      error: (e) => this.setExtractMessage(source.id, { kind: 'error', text: errorMessage(e, this.i18n.t('gen.error')) }),
    });
  }

  private setExtractMessage(sourceId: string, m: ExtractMessage): void {
    this.extractMessage.update((all) => ({ ...all, [sourceId]: m }));
    this.busy.set(null);
  }
}
