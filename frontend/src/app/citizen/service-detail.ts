import { Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { Api } from '../core/api';
import { AuthService, errorMessage } from '../core/auth';
import { I18n, TPipe } from '../core/i18n';
import { GapField, ServiceDetail } from '../core/models';

type Load = { state: 'loading' } | { state: 'missing' } | { state: 'error' } | { state: 'ready'; svc: ServiceDetail };

@Component({
  selector: 'app-service-detail',
  imports: [RouterLink, TPipe],
  templateUrl: './service-detail.html',
  styleUrl: './service-detail.css',
})
export class ServiceDetailPage {
  /** Bound from the route (:slug) via withComponentInputBinding. */
  readonly slug = input.required<string>();

  private readonly api = inject(Api);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18n);

  protected readonly load = toSignal(
    toObservable(this.slug).pipe(
      switchMap((slug) =>
        this.api.service(slug).pipe(
          map((svc): Load => ({ state: 'ready', svc })),
          catchError((e) => of<Load>(e?.status === 404 ? { state: 'missing' } : { state: 'error' })),
          startWith<Load>({ state: 'loading' }),
        ),
      ),
    ),
    { initialValue: { state: 'loading' } as Load },
  );

  protected readonly svc = computed(() => { const l = this.load(); return l.state === 'ready' ? l.svc : null; });
  protected readonly eligibility = computed(() => this.svc()?.requirements.filter((r) => r.kind === 'ELIGIBILITY') ?? []);
  protected readonly documents = computed(() => this.svc()?.requirements.filter((r) => r.kind === 'DOCUMENT') ?? []);
  protected readonly conditions = computed(() => this.svc()?.requirements.filter((r) => r.kind === 'CONDITION') ?? []);

  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  /** True when an official source was checked and does not state this field (unknown ≠ none). */
  protected notStated(field: GapField): boolean {
    return this.svc()?.notStated.some((g) => g.field === field) ?? false;
  }

  /** Opens the user's existing checklist for this service, or creates one. */
  protected openChecklist(): void {
    if (!this.auth.isSignedIn()) {
      void this.router.navigate(['/signin'], { queryParams: { next: this.router.url } });
      return;
    }
    const slug = this.slug();
    this.busy.set(true);
    this.actionError.set(null);
    this.api.checklists().pipe(
      switchMap((lists) => {
        const existing = lists.find((l) => l.service.slug === slug);
        return existing ? of(existing) : this.api.createChecklist(slug);
      }),
    ).subscribe({
      next: (list) => void this.router.navigate(['/checklists', list.id]),
      error: (e) => {
        this.actionError.set(errorMessage(e, this.i18n.t('gen.error')));
        this.busy.set(false);
      },
    });
  }
}
