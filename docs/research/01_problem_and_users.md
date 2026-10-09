# 01: Problem Definition and Target Users

## Problem statement

Cambodian citizens who need a public service (a passport, a birth certificate, a driver's license, a business registration) struggle to find out **what they need, what it costs, how long it takes, and where to go**. The information exists, but it is:

1. **Scattered.** It is split across ministry websites (Interior, Public Works and Transport, Commerce, Foreign Affairs), the One Window Service Office portal, mobile apps, Facebook pages, PDFs of prakas and sub-decrees, and word of mouth.
2. **Inconsistently structured.** Each source covers different fields. For example, the MPWT driver's-license page lists fees, documents, and locations but gives no processing time (see [03_data_sources.md](03_data_sources.md)).
3. **Hard to read.** Much of the authoritative content is legal text, such as prakas and sub-decrees, rather than plain-language guidance.
4. **Mixed-language.** Some pages are partly English and partly Khmer. The MPWT English page, for instance, has its FAQ only in Khmer.
5. **Possibly outdated, with no visible verification date.** Third-party guides repeat fees and processing times that may have changed, and readers cannot tell when they were last checked.

**Consequence:** citizens make unnecessary trips, bring incomplete documents, pay intermediaries, or give up. In the administrative-burden framework ([04_literature.md](04_literature.md)), these are **learning costs** and **compliance costs** that fall hardest on people with the least time, money, or digital literacy.

## What ChlatVei changes

| Today | With ChlatVei |
|---|---|
| Search across several ministry sites | One search, including plain-language queries ("I need a new passport") |
| Unstructured pages and legal PDFs | A structured record per service: eligibility, documents, steps, fees, time, locations |
| No indication of freshness | Every fact shows its source and last verification date |
| Official and unofficial content mixed | Official information is clearly separated from ChlatVei-generated content |
| No feedback loop | Citizen feedback identifies confusing steps (RQ3) |

## Target users

### Primary: Citizens

| Persona | Need | Constraints |
|---|---|---|
| **New parent** in a province | Register a birth and get a birth certificate | Mostly mobile, Khmer-only, limited time |
| **First-time traveller** | Apply for an ordinary passport | Unsure about documents and fees, may be using an intermediary |
| **Young adult** | Get a motorbike (Type A) driver's license | Comfortable online, wants to know online vs. in-person |
| **Small business owner** | Register a sole proprietorship or company | Several agencies are involved (Commerce, Tax, Labour) |
| **Couple** | Register a marriage | Process runs at the commune/sangkat office, so requirements vary locally |

**Design implications:**
- **Khmer first** and mobile-first.
- Use **plain language**, with official terminology preserved next to it.
- Show **"last verified"** dates prominently.
- **Checklists** that work like the physical document folder people bring to an office.

### Secondary: Administrators

ChlatVei content curators who collect sources, review machine-extracted information, approve or reject it, and monitor for outdated data. They need:
- A review queue with the source and the extracted fields shown side by side.
- Field-level approve and reject actions with a mandatory reviewer and timestamp.
- Visibility into which services are stale, confusing, or drawing complaints.

### Out of scope for the MVP

- A research/data analyst role (deferred, as the spec says).
- Government officials as direct users. ChlatVei is an independent information layer, not an official channel, and it must not present itself as a government service.

## Non-goals

- ChlatVei does **not** submit applications on a citizen's behalf.
- ChlatVei is **not** a general chatbot. Answers come from structured, verified service records.
- ChlatVei does **not** replace official sources. It always links back to them.
