import { Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, map, of, startWith, switchMap } from 'rxjs';
import { Api } from '../core/api';
import { I18n, TPipe } from '../core/i18n';
import { ServiceSummary } from '../core/models';

type Load<T> = { state: 'loading' } | { state: 'error' } | { state: 'ready'; value: T };

@Component({
  selector: 'app-home',
  imports: [RouterLink, TPipe],
  template: `
    <section class="stack">
      <div class="stack-sm">
        <h1>{{ 'home.title' | t }}</h1>
        <p class="muted">{{ 'home.subtitle' | t }}</p>
      </div>

      <label class="search">
        <span aria-hidden="true">⌕</span>
        <input type="search" [value]="query()" (input)="query.set($any($event.target).value)"
               [placeholder]="'search.placeholder' | t" [attr.aria-label]="'search.placeholder' | t" autocomplete="off" />
      </label>

      @if (query().trim().length > 1) {
        <div class="stack-sm">
          <div class="label">{{ 'search.results' | t }}</div>
          @switch (results().state) {
            @case ('loading') { <p class="muted">{{ 'gen.loading' | t }}</p> }
            @case ('error') { <p class="error">{{ 'gen.error' | t }}</p> }
            @default {
              @for (s of resultList(); track s.id) {
                <a class="result" [routerLink]="['/services', s.slug]">
                  <span><span class="t">{{ name(s) }}</span><br /><span class="muted">{{ category(s) }}</span></span>
                  <span aria-hidden="true">→</span>
                </a>
              } @empty {
                <p class="muted">{{ 'search.none' | t }}</p>
              }
            }
          }
        </div>
      } @else {
        <div class="chips" role="group">
          <button type="button" class="chip" [attr.aria-pressed]="!category$()" (click)="category$.set(undefined)">{{ 'home.allCategories' | t }}</button>
          @for (c of categories(); track c.slug) {
            <button type="button" class="chip" [attr.aria-pressed]="category$() === c.slug" (click)="category$.set(c.slug)">
              {{ i18n.pick(c.nameKm, c.nameEn) }}
            </button>
          }
        </div>

        <div class="stack-sm">
          <div class="label">{{ 'home.services' | t }}</div>
          @switch (services().state) {
            @case ('loading') { <p class="muted">{{ 'gen.loading' | t }}</p> }
            @case ('error') { <p class="error">{{ 'gen.error' | t }}</p> }
            @default {
              @for (s of serviceList(); track s.id) {
                <a class="result" [routerLink]="['/services', s.slug]">
                  <span><span class="t">{{ name(s) }}</span><br /><span class="muted">{{ category(s) }}</span></span>
                  <span aria-hidden="true">→</span>
                </a>
              } @empty {
                <p class="muted">{{ 'home.empty' | t }}</p>
              }
            }
          }
        </div>
      }

      <p class="muted">{{ 'independent' | t }}</p>
    </section>
  `,
  styles: `
    .search { display: flex; align-items: center; gap: 8px; border: 1.5px solid var(--accent); border-radius: 14px; padding: 10px 12px; background: var(--card); }
    .search input { border: 0; outline: none; flex: 1; min-width: 0; background: transparent; font-size: 16px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { border: 1px solid var(--line); background: var(--card); border-radius: 999px; padding: 6px 12px; font-size: 13px; min-height: 36px; }
    .chip[aria-pressed='true'] { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
    .result {
      display: flex; justify-content: space-between; gap: 12px; align-items: center; text-decoration: none; color: inherit;
      border: 1px solid var(--line); background: var(--card); border-radius: var(--r); padding: 12px 14px;
    }
    .result .t { font-weight: 600; }
    .result > span:last-child { color: var(--accent); }
  `,
})
export class HomePage {
  private readonly api = inject(Api);
  protected readonly i18n = inject(I18n);

  protected readonly query = signal('');
  protected readonly category$ = signal<string | undefined>(undefined);

  protected readonly categories = toSignal(this.api.categories().pipe(catchError(() => of([]))), { initialValue: [] });

  protected readonly services = toSignal(
    toObservable(this.category$).pipe(
      switchMap((category) =>
        this.api.services({ category, pageSize: 50 }).pipe(
          map((p): Load<ServiceSummary[]> => ({ state: 'ready', value: p.data })),
          catchError(() => of<Load<ServiceSummary[]>>({ state: 'error' })),
          startWith<Load<ServiceSummary[]>>({ state: 'loading' }),
        ),
      ),
    ),
    { initialValue: { state: 'loading' } as Load<ServiceSummary[]> },
  );

  protected readonly results = toSignal(
    toObservable(this.query).pipe(
      map((q) => q.trim()),
      debounceTime(250),
      distinctUntilChanged(),
      switchMap((q) =>
        q.length < 2
          ? of<Load<ServiceSummary[]>>({ state: 'ready', value: [] })
          : this.api.search(q).pipe(
              map((hits): Load<ServiceSummary[]> => ({ state: 'ready', value: hits })),
              catchError(() => of<Load<ServiceSummary[]>>({ state: 'error' })),
              startWith<Load<ServiceSummary[]>>({ state: 'loading' }),
            ),
      ),
    ),
    { initialValue: { state: 'ready', value: [] } as Load<ServiceSummary[]> },
  );

  protected readonly serviceList = computed(() => { const s = this.services(); return s.state === 'ready' ? s.value : []; });
  protected readonly resultList = computed(() => { const r = this.results(); return r.state === 'ready' ? r.value : []; });

  protected name(s: ServiceSummary): string {
    return this.i18n.pick(s.nameKm, s.nameEn);
  }
  protected category(s: ServiceSummary): string {
    return this.i18n.pick(s.category.nameKm, s.category.nameEn);
  }
}
