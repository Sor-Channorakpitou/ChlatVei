import { Component, computed, inject, signal } from '@angular/core';
import { Api } from '../core/api';
import { errorMessage } from '../core/auth';
import { I18n, TPipe } from '../core/i18n';
import { ContentType, ReviewItem } from '../core/models';

/** Column that holds the Khmer text for each content type (mirrors the backend registry). */
export const KHMER_FIELD: Record<ContentType, string> = {
  requirements: 'textKm',
  steps: 'titleKm',
  fees: 'labelKm',
  'processing-times': 'textKm',
  locations: 'nameKm',
};

/**
 * The review queue: the only place content becomes public.
 * The UI mirrors the backend rules (Khmer text, verified source, reject needs a comment),
 * but the backend is what enforces them; its error messages are shown as-is.
 */
@Component({
  selector: 'app-review',
  imports: [TPipe],
  templateUrl: './review.html',
  styleUrl: './review.css',
})
export class ReviewPage {
  private readonly api = inject(Api);
  protected readonly i18n = inject(I18n);

  protected readonly queue = signal<ReviewItem[] | null>(null);
  protected readonly loadError = signal(false);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() => this.queue()?.find((q) => q.id === this.selectedId()) ?? null);

  protected readonly khmer = signal('');
  protected readonly comment = signal('');
  protected readonly busy = signal(false);
  protected readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);

  protected readonly savedKhmer = computed(() => {
    const item = this.selected();
    return item ? ((item.values[KHMER_FIELD[item.contentType]] as string | null) ?? '') : '';
  });
  protected readonly canApprove = computed(() => this.savedKhmer().trim().length > 0 && this.selected()?.source?.status === 'VERIFIED');

  constructor() {
    this.reload();
  }

  protected reload(selectFirst = true): void {
    this.api.reviewQueue().subscribe({
      next: (page) => {
        this.queue.set(page.data);
        if (selectFirst && !page.data.some((q) => q.id === this.selectedId())) this.select(page.data[0] ?? null);
      },
      error: () => this.loadError.set(true),
    });
  }

  protected select(item: ReviewItem | null): void {
    this.selectedId.set(item?.id ?? null);
    this.khmer.set(item ? ((item.values[KHMER_FIELD[item.contentType]] as string | null) ?? '') : '');
    this.comment.set('');
    this.message.set(null);
  }

  protected entries(values: Record<string, unknown>): [string, string][] {
    return Object.entries(values)
      .filter(([, v]) => v !== null && v !== '')
      .map(([k, v]) => [k, String(v)]);
  }

  protected saveKhmer(): void {
    const item = this.selected();
    if (!item) return;
    this.run(this.api.updateContent(item.contentType, item.id, { [KHMER_FIELD[item.contentType]]: this.khmer().trim() }), () => {
      this.queue.update((q) => q?.map((x) => (x.id === item.id ? { ...x, values: { ...x.values, [KHMER_FIELD[item.contentType]]: this.khmer().trim() } } : x)) ?? null);
      this.message.set({ kind: 'ok', text: this.i18n.t('auth.saved') });
    });
  }

  protected approve(): void {
    const item = this.selected();
    if (!item) return;
    this.run(this.api.approve(item.contentType, item.id, this.comment().trim() || undefined), () => this.afterDecision(item, 'adm.approved'));
  }

  protected reject(): void {
    const item = this.selected();
    if (!item || !this.comment().trim()) return;
    this.run(this.api.reject(item.contentType, item.id, this.comment().trim()), () => this.afterDecision(item, 'adm.rejected'));
  }

  private afterDecision(item: ReviewItem, key: 'adm.approved' | 'adm.rejected'): void {
    const remaining = this.queue()?.filter((q) => q.id !== item.id) ?? [];
    this.queue.set(remaining);
    this.select(remaining[0] ?? null);
    this.message.set({ kind: 'ok', text: this.i18n.t(key) });
  }

  private run(obs: ReturnType<Api['approve']>, done: () => void): void {
    this.busy.set(true);
    this.message.set(null);
    obs.subscribe({
      next: () => {
        this.busy.set(false);
        done();
      },
      error: (e) => {
        this.busy.set(false);
        this.message.set({ kind: 'error', text: errorMessage(e, this.i18n.t('gen.error')) });
      },
    });
  }
}
