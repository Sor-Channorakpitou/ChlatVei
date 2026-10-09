import { TestBed } from '@angular/core/testing';
import { I18n } from './i18n';
import { MESSAGES } from './messages';

describe('I18n', () => {
  let i18n: I18n;

  beforeEach(() => {
    try { localStorage.clear(); } catch { /* ignore */ }
    TestBed.configureTestingModule({});
    i18n = TestBed.inject(I18n);
  });

  it('defaults to Khmer', () => {
    expect(i18n.lang()).toBe('km');
    expect(i18n.t('nav.home')).toBe('ទំព័រដើម');
  });

  it('has a Khmer and an English text for every message', () => {
    expect(Object.keys(MESSAGES.km).sort()).toEqual(Object.keys(MESSAGES.en).sort());
    for (const value of Object.values(MESSAGES.km)) expect(value.trim()).not.toBe('');
  });

  it('fills parameters', () => {
    i18n.set('en');
    expect(i18n.t('cl.progress', { done: 2, total: 5 })).toBe('2 of 5 done');
  });

  it('picks content in the current language and falls back to the other one', () => {
    expect(i18n.pick('អត្តសញ្ញាណបណ្ណ', 'National identity card')).toBe('អត្តសញ្ញាណបណ្ណ');
    i18n.set('en');
    expect(i18n.pick('អត្តសញ្ញាណបណ្ណ', 'National identity card')).toBe('National identity card');
    expect(i18n.pick('អត្តសញ្ញាណបណ្ណ', null)).toBe('អត្តសញ្ញាណបណ្ណ'); // English missing → Khmer
  });

  it('formats riel and dollar amounts', () => {
    expect(i18n.money('30000', 'KHR')).toBe('30,000 ៛');
    expect(i18n.money(25, 'USD')).toBe('$25.00');
  });

  it("an explicit choice wins over the account's preferred language", () => {
    i18n.set('en');
    i18n.useDefault('km');
    expect(i18n.lang()).toBe('en');
  });
});

describe('I18n dates', () => {
  it('formats dates with Khmer month names and digits in Khmer, and in English otherwise', () => {
    try { localStorage.clear(); } catch { /* ignore */ }
    TestBed.configureTestingModule({});
    const i18n = TestBed.inject(I18n);
    expect(i18n.date('2026-10-08T12:00:00Z')).toBe('៨ តុលា ២០២៦');
    i18n.set('en');
    expect(i18n.date('2026-10-08T12:00:00Z')).toBe('8 October 2026');
    expect(i18n.num(37.6)).toBe('38');
    i18n.set('km');
    expect(i18n.num(37.6)).toBe('៣៨');
  });
});
