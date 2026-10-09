# ADR-006: Angular mobile-first PWA for the frontend

**Status:** Accepted · 2026-10-08 · supersedes the "React" choice in the original spec (§10)

## Context
The project owner chose **Angular** for the frontend and wants ChlatVei to work well **on mobile phones**. Most Cambodian citizens reach online services by phone (Phase 1, personas), so phone-first is a requirement, not a nice-to-have.

## Options considered
1. **Mobile-first Angular web app, installable as a PWA.** ← chosen
2. Ionic + Capacitor packaged as Android/iOS apps: more native feel, but needs app-store builds, signing and release reviews.
3. Both, with Ionic code that also ships as a web app: more setup than the MVP needs.

## Decision
- **Angular** (current LTS line) with standalone components, the Angular Router, `HttpClient` with interceptors, and signals for local state.
- **Mobile-first layout:** designed at phone width first (bottom navigation, large touch targets); wider screens get the two-pane admin layout from the screen designs in `docs/design/screens/`.
- **PWA:** `@angular/pwa` (web app manifest and service worker), so citizens can add ChlatVei to their home screen. Public service pages may be cached for offline reading. Admin pages and personal data are never cached.
- **Khmer first:** Khmer is the default UI language with an English switch. The name and logo are always "ChlatVei" in English.
- **Business rules stay in the backend** (spec rule 7). Angular services call the API, and components only render.

## Consequences
- ➕ One codebase and one deployment; no app-store dependency.
- ➕ Works on cheap Android phones and slow networks, and can be installed from the browser.
- ➖ iOS limits some PWA features (for example, push notifications need iOS 16.4+ and a home-screen install). The MVP needs none of them.
- Revisit Capacitor packaging if an app-store presence becomes a requirement. The Angular code can be reused.
