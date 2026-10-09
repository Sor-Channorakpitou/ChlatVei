import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { I18n } from './core/i18n';

describe('App shell', () => {
  beforeEach(async () => {
    try { localStorage.clear(); } catch { /* ignore */ }
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('shows the English-only logo and Khmer navigation by default', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.logo')?.textContent?.trim()).toBe('ChlatVei');
    expect(el.querySelector('.logo img')?.getAttribute('src')).toBe('logo-mark.svg');
    expect(el.querySelector('nav.bottom')?.textContent).toContain('ទំព័រដើម');
  });

  it('switches the interface to English', async () => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(I18n).set('en');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('nav.bottom')?.textContent).toContain('Home');
  });
});
