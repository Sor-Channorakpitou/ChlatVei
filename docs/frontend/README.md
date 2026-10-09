# Frontend Guide (Phase 5)

The ChlatVei frontend is an **Angular 21 mobile-first PWA** ([ADR-006](../architecture/decisions/ADR-006-angular-pwa-frontend.md)). It is designed for phones first and can be added to the home screen. Screenshots of the real app are in [`docs/design/app-screens/`](../design/app-screens).

## 1. Run it

Prerequisites: the backend running on port 3000 (see the [backend guide](../backend/README.md#1-run-it-about-5-minutes)) and Node 20.19+ / 22.12+ / 24+.

```bash
cd frontend
npm install
npm start                 # http://localhost:4200
```

The dev server forwards `/api/*` to `http://localhost:3000` (`proxy.conf.json`), so the browser sees one origin. That is required for the `SameSite=Strict` refresh cookie.

> **Why Angular 21 and not 22?** Angular 22 needs Node 24.15+, and this machine has Node 24.12. Upgrade Node, then run `ng update`, to move to 22.

## 2. Code map

```text
frontend/
├── src/app/
│   ├── app.ts / app.config.ts / app.routes.ts   ← shell (logo, language switch, bottom nav), providers, routes
│   ├── core/
│   │   ├── models.ts        ← TypeScript types for the API responses
│   │   ├── api.ts           ← the only place that knows API URLs
│   │   ├── auth.ts          ← session, token interceptor, route guards, error messages
│   │   ├── i18n.ts          ← language signal, `t` pipe, km/en picking, Khmer dates
│   │   └── messages.ts      ← ★ every UI string in Khmer and English (send this file for Khmer review)
│   ├── citizen/             ← home + search, service detail, checklists, feedback, sign-in/register, account
│   └── admin/               ← review queue, dashboard, sources (lazy-loaded; citizens never download it)
├── e2e/                     ← Playwright browser tests + demo-data scripts
├── ngsw-config.json         ← what the service worker may cache (see §5)
└── proxy.conf.json          ← dev proxy to the backend
```

Pages are loaded only when opened, so the first download is about 83 kB compressed.

## 3. How it fits together

- **State uses signals.** The app is zoneless (Angular 21 default); every component keeps its state in `signal()` / `computed()`.
- **No business rules in the UI.** Components call `Api`, and the backend decides what is allowed. Some rules are mirrored in the UI only for convenience (for example, Approve stays disabled until Khmer text exists). If the UI and API ever disagree, the API wins and its message is shown.
- **Sign-in (ADR-004):**
  - The access token is kept **in memory only**, never in localStorage.
  - On start-up the app tries one silent refresh using the httpOnly cookie, so a reload keeps you signed in.
  - On a `401`, the interceptor refreshes once and retries the request. If that fails, you are signed out, and public pages keep working.
- **Guards:** `/checklists` and `/account` need a signed-in user, and `/admin` needs an admin. The guards only hide pages; the API enforces permissions in any case.
- **After sign-in you return to where you were,** but only to same-site paths, so the redirect can't be abused to send users elsewhere.

## 4. Language (Khmer first)

- **Khmer is the default,** with an English switch in the header. The choice is remembered in the browser. Your account's preferred language applies only if this browser has never had a language set.
- **The name and logo are always "ChlatVei"** in English.
- **Content comes from the API in km/en pairs.** `i18n.pick(km, en)` shows the current language and falls back to the other one.
- **Dates in Khmer use Khmer month names and digits** (`៨ តុលា ២០២៦`). Browsers often lack a Khmer locale, so ChlatVei formats them itself.
- **Some data is English-only.** "Applies to" notes are shown only in English mode until the data has Khmer versions. Source names and publishers are still English-only data.
- **Khmer review needed:** all interface Khmer is in `core/messages.ts`. A unit test makes sure every message exists in both languages.

## 5. PWA and offline

- **Installable:** `manifest.webmanifest` (name "ChlatVei", standalone display, Khmer language).
- **The service worker runs in production builds only** (`npm run build`). It never runs in `npm start`.
- **Only public service data is cached,** network-first with a 4-second timeout and kept up to 7 days: `/api/categories`, `/api/services`, `/api/services/**`. Someone offline can still read a service they opened before, and an "offline" banner appears.
- **Never cached:** sign-in, checklists, account, feedback and all admin pages. They aren't listed in `ngsw-config.json`, and `/api/**` is excluded from navigation handling.

## 6. Tests

```bash
npm test -- --watch=false     # unit tests (Vitest): 15 tests
npx playwright test           # browser tests: needs the demo setup below
```

**Unit tests** (`*.spec.ts`):
- language default, fallback, parameters, Khmer dates;
- every message exists in both languages;
- the token is never written to storage, and refresh-and-retry works on a 401;
- sign-out happens when the refresh fails;
- guards and redirects work;
- API errors become readable messages, but 500 errors are never shown raw.

**Browser tests** (Playwright, using your installed Chrome; spec §22):

| Test | What it proves |
|---|---|
| `citizen.spec.ts` (phone screen, Khmer) | Search in Khmer → service page (verified content, source, "not stated" for processing time) → English switch → sign-in redirect → register → create checklist → tick items → "all done" → progress survives a reload → feedback with a confusing step |
| `citizen.spec.ts` | A visitor opening `/admin` is sent to sign-in |
| `admin.spec.ts` (desktop) | Admin signs in → Approve is disabled (no Khmer, source unverified) → verifies the source → adds Khmer text → approves → item leaves the queue → Reject needs a comment → dashboard loads |

### Demo database for browser tests and screenshots

Browser tests change data (they approve items), so they run against a separate **demo** database, `chlatvei_demo`. Your development data in `chlatvei` is never touched, and stays entirely "waiting for review" until you approve it yourself.

```bash
# 1. Docker running, backend STOPPED. Pick any demo password:
export E2E_ADMIN_PASSWORD='a-demo-password-123'
bash frontend/e2e/reset-demo.sh                     # drops and rebuilds chlatvei_demo only

# 2. Start the backend against the demo DB
cd backend && DATABASE_URL=postgresql://chlatvei:chlatvei_dev@localhost:55432/chlatvei_demo npm run start

# 3. In another terminal: approve the driver's-license items through the API, then test
node frontend/e2e/prepare-demo.mjs
cd frontend && npx playwright test                  # add SCREENSHOTS=1 to refresh docs/design/app-screens
```

`prepare-demo.mjs` runs the real verification workflow through the API: verify sources, add Khmer text, approve, publish. The Khmer text for documents and steps is quoted from the Khmer MPWT page. The Khmer fee and location labels are short labels written for the demo. **Run it only against the demo database.**

## 7. Known gaps

- **Admin screens still to build:** editing services and content directly (creating new requirements, steps and so on). Today that is done through the API, and the review queue handles imported content.
- **Profile:** no "change password" or "delete my account" yet.
- **Accessibility:** basic semantics are in place (labels, roles, focus outlines, aria-pressed). A full audit is planned for Phase 9.
- **Khmer UI copy** needs review by a native speaker.
