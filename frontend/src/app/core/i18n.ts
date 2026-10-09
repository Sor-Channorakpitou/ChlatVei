import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, Pipe, PipeTransform, signal } from '@angular/core';
import { Lang } from './models';
import { MESSAGES, MessageKey } from './messages';

const STORAGE_KEY = 'chlatvei.lang';

const KHMER_MONTHS = ['មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា', 'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ'];
const khmerDigits = (n: number) => String(n).replace(/\d/g, (c) => '០១២៣៤៥៦៧៨៩'[Number(c)]);

function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'en' || v === 'km' ? v : null;
  } catch {
    return null;
  }
}

/**
 * UI language. Khmer is the default (Khmer first); English is a switch.
 * Content from the API comes in km/en pairs; `pick` chooses the right one
 * and falls back to Khmer when English is missing.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly lang = signal<Lang>(storedLang() ?? 'km');
  /** True once this browser has a language choice (switch or earlier visit); that choice wins. */
  private chosen = storedLang() !== null;
  private readonly doc = inject(DOCUMENT);

  constructor() {
    effect(() => {
      const lang = this.lang();
      this.doc.documentElement.lang = lang;
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch {
        /* storage unavailable: language just won't be remembered */
      }
    });
  }

  set(lang: Lang): void {
    this.chosen = true;
    this.lang.set(lang);
  }

  /** Applies the account's preferred language only if this browser has no choice of its own. */
  useDefault(lang: Lang): void {
    if (!this.chosen) this.lang.set(lang);
  }

  t(key: MessageKey, params?: Record<string, string | number>): string {
    let text: string = MESSAGES[this.lang()][key] ?? MESSAGES.km[key] ?? key;
    for (const [k, v] of Object.entries(params ?? {})) text = text.replace(`{${k}}`, String(v));
    return text;
  }

  /** Picks the km or en variant of a content field, falling back to the other language. */
  pick(km: string | null | undefined, en: string | null | undefined): string {
    return (this.lang() === 'en' ? en || km : km || en) ?? '';
  }

  money(amount: string | number, currency: string): string {
    const n = Number(amount);
    return currency === 'KHR' ? `${n.toLocaleString('en-US')} ៛` : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  }

  /** "8 October 2026" in English; "៨ តុលា ២០២៦" in Khmer (browsers often lack a Khmer locale). */
  date(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (this.lang() === 'en') return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    return `${khmerDigits(d.getDate())} ${KHMER_MONTHS[d.getMonth()]} ${khmerDigits(d.getFullYear())}`;
  }

  /** Whole numbers in the current language's digits (Khmer digits in Khmer mode). */
  num(n: number): string {
    const s = String(Math.round(n));
    return this.lang() === 'km' ? s.replace(/\d/g, (c) => khmerDigits(Number(c))) : s;
  }

  /** English-only annotations (e.g. "applies to") are shown only in English mode. */
  englishOnly(text: string | null | undefined): string | null {
    return this.lang() === 'en' && text ? text : null;
  }
}

/** `{{ 'key' | t }}`: impure so it re-renders when the language signal changes. */
@Pipe({ name: 't', pure: false })
export class TPipe implements PipeTransform {
  private readonly i18n = inject(I18n);
  transform(key: MessageKey, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }
}
