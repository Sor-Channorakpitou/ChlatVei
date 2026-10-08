import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { I18n, TPipe } from '../core/i18n';
import { Checklist, ChecklistItem } from '../core/models';

@Component({
  selector: 'app-checklist',
  imports: [RouterLink, TPipe],
  template: `
    @if (error()) { <p class="error" role="alert">{{ 'gen.error' | t }}</p> }
    @if (list(); as l) {
      <section class="stack">
        <div class="stack-sm">
          <a routerLink="/checklists" class="back">← {{ 'cl.title' | t }}</a>
          <h1>{{ i18n.pick(l.service.nameKm, l.service.nameEn) }}</h1>
          <a [routerLink]="['/services', l.service.slug]" class="muted">{{ 'svc.sources' | t }} →</a>
        </div>

        <div class="stack-sm">
          <span class="muted">{{ 'cl.progress' | t: { done: done(), total: items().length } }}</span>
          <span class="bar" role="progressbar" [attr.aria-valuenow]="done()" aria-valuemin="0" [attr.aria-valuemax]="items().length">
            <i [style.width.%]="items().length ? (done() / items().length) * 100 : 0"></i>
          </span>
          @if (items().length && done() === items().length) { <p class="toast">{{ 'cl.complete' | t }}</p> }
        </div>

        <div class="stack-sm">
          @for (item of items(); track item.id) {
            <label class="check" [class.done]="item.isDone">
              <input type="checkbox" [id]="'item-' + item.id" [checked]="item.isDone" (change)="toggle(item, $any($event.target).checked)" />
              <span class="stack-sm">
                <span class="kind">{{ (item.kind === 'DOCUMENT' ? 'cl.document' : 'cl.step') | t }}</span>
                <span class="text">{{ i18n.pick(item.labelKm, item.labelEn) }}</span>
                @if (item.contentChanged) { <span class="badge b-warn">{{ 'cl.changed' | t }}</span> }
              </span>
            </label>
          }
        </div>

        <button type="button" class="btn bad" (click)="remove()">{{ 'cl.delete' | t }}</button>
      </section>
    } @else if (!error()) {
      <p class="muted">{{ 'gen.loading' | t }}</p>
    }
  `,
  styles: `
    .back { font-size: 14px; text-decoration: none; }
    .bar { height: 10px; background: var(--card); border-radius: 999px; overflow: hidden; border: 1px solid var(--line); display: block; }
    .bar i { display: block; height: 100%; background: var(--ok); transition: width .3s; }
    .check { display: flex; gap: 12px; align-items: flex-start; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--card); }
    .check input { width: 22px; height: 22px; margin-top: 3px; accent-color: var(--ok); flex: none; }
    .check.done .text { text-decoration: line-through; color: var(--ink-soft); }
    .kind { font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--gold); }
  `,
})
export class ChecklistPage implements OnInit {
  readonly id = input.required<string>();

  private readonly api = inject(Api);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18n);

  protected readonly list = signal<Checklist | null>(null);
  protected readonly error = signal(false);
  protected readonly items = computed(() => this.list()?.items ?? []);
  protected readonly done = computed(() => this.items().filter((i) => i.isDone).length);

  ngOnInit(): void {
    this.api.checklist(this.id()).subscribe({ next: (l) => this.list.set(l), error: () => this.error.set(true) });
  }

  /** Optimistic update: tick immediately, roll back if the server refuses. */
  protected toggle(item: ChecklistItem, isDone: boolean): void {
    this.patchItem(item.id, isDone);
    this.error.set(false);
    this.api.setChecklistItem(this.id(), item.id, isDone).subscribe({
      next: (l) => this.list.set(l),
      error: () => {
        this.patchItem(item.id, !isDone);
        this.error.set(true);
      },
    });
  }

  protected remove(): void {
    this.api.deleteChecklist(this.id()).subscribe({
      next: () => void this.router.navigate(['/checklists']),
      error: () => this.error.set(true),
    });
  }

  private patchItem(itemId: string, isDone: boolean): void {
    this.list.update((l) => (l ? { ...l, items: l.items?.map((i) => (i.id === itemId ? { ...i, isDone } : i)) } : l));
  }
}
