# Phase 2: Data Report (first collection run, 2026-10-08)

## Summary

| Item | Result |
|---|---|
| Candidate services | 15 (5 civil status, 3 transport, 3 identity/travel, 2 business, 1 visa, 1 local administration) |
| Registered sources | 22 (18 T1, 3 T2, 1 T3; 14 Khmer, 8 English) |
| Collected automatically | **21 / 22** |
| Not collected | S022 e-Visa: the site serves a bot-authentication challenge. **Needs manual collection** |
| Raw snapshot size | ~18 MB (three scanned OWSO PDFs make up 15.5 MB) |
| Facts annotated | 43 facts for 3 services, each quoting its source verbatim, all `PENDING` |
| Tests | 28 passing (collector, text extraction, coverage, dataset integrity and provenance) |

## Findings

### F1: Detailed requirements are published unevenly across ministries

| Ministry / channel | Requirements on the official website? |
|---|---|
| Public Works and Transport (driver's license, vehicle registration, inspection) | **Yes**: fees, documents, locations, contacts, and a detailed Khmer FAQ |
| Identification department, Ministry of Interior (passport, ID card, civil status) | **No.** Department pages describe duties and contacts; announcement pages are mostly news and activity posts. Requirements appear to be published through other channels (the *GDI eServices* / *GDI Info* apps, leaflets, Facebook) |
| One Window Service Office | Service **catalogues** only (lists of service names by level of government); no fees, documents, or times. Scanned PDFs from 2019 |
| Online Business Registration (Ministry of Economy and Finance) | Portal with guidebooks and FAQ; detailed documents still to be collected |

**Implication:** 7 of 15 services currently have a T1 *primary* source. The 8 identity, civil-status, and business services need extra sources (see Next steps) or will be replaced. This is itself evidence for the problem ChlatVei addresses: citizens cannot find structured requirements for some of the most common services on the responsible body's website.

### F2: No official page states processing time for driver's licenses or car registration

Every annotated service has `processing_time = not_stated` for at least one variant. The only stated timing is "number plate issued immediately" for motorcycles. Processing time was meant to be a complexity feature (spec §13), so it may need to come from citizen feedback rather than official sources.

### F3: Pages labelled "English" are often mostly Khmer

Declared-English pages have a mean Khmer character ratio of **0.33** (max 0.81), because FAQs are Khmer-only. Of the 40 stated facts with evidence, **12 (30%) could only be quoted from Khmer text**, including age limits, license validity, the two-stage test, and foreigner eligibility. An English-only pipeline would miss these. This supports Khmer-first extraction (RQ2) and search (RQ4).

### F4: Scanned PDFs need OCR, and OCR quality on tables is poor

The three OWSO PDFs have no text layer. Tesseract 5.5 (`khm+eng`) reads headings reasonably but garbles table rows. Character error rate will be measured against a hand transcription in Phase 6 (RQ2). For now, OCR output is treated as unreliable and is not used for facts.

### F5: Sources contain ambiguity and internal inconsistency

- The English list for foreign license exchange says "Valid visa". The Khmer FAQ says passport and visa valid **at least 30 days**, with an exception about tourist visas that can be read two ways (fact F0026, flagged).
- The driver's-license FAQ tells applicants to register at `vehicle.mpwt.gov.kh` (the vehicle system) before giving the correct `driverlicense.mpwt.gov.kh` link.
- The English page spells "Aeon Mall Sek Sok City" (should be Sen Sok).

These are the clarity problems the complexity score's *information clarity* variable is meant to capture.

## Initial EDA

**Sources by tier and language**

| Tier | en | km | Total |
|---|---|---|---|
| T1 | 4 | 14 | 18 |
| T2 | 3 | 0 | 3 |
| T3 | 1 | 0 | 1 |

**Extraction**

| Method | Documents | Median characters | Mean Khmer ratio |
|---|---|---|---|
| html | 17 | 5,424 | 0.76 |
| ocr | 3 | 2,376 | 0.67 |
| pdf_text | 1 | 15,422 | 0.00 |

**Field coverage for annotated services** (✅ stated · ❌ not stated by source)

| Service | Eligibility | Documents | Steps | Fee | Time | Location | Contact | Completeness |
|---|---|---|---|---|---|---|---|---|
| Driver's license A/B | ✅ | ✅ (3) | ✅ (3) | ✅ | ❌ | ✅ | ✅ | 0.86 |
| Foreign license exchange | ✅ | ✅ (6) | ❌ | ✅ | ❌ | ✅ | ✅ | 0.71 |
| Vehicle registration | ❌ | ✅ (4) | ✅ (3) | ✅ | ✅ (motorbikes only) | ✅ | ✅ | 0.86 |

Even the best-documented ministry leaves out one or two core fields per service.

## Limitations

- Only 3 of 15 services are annotated so far, so the coverage numbers describe one ministry and should not be generalized.
- Annotations are drafts by a single annotator. Inter-annotator agreement has not been measured yet.
- A snapshot shows the page on one date. Re-running the collector will reveal changes (via `sha256`) but not when they happened.
- `robots.txt` handling follows RFC 9309. Sites with bot challenges are deliberately not scraped.

## Next steps

1. **Manual collection:** save the e-Visa pages from a browser (S022).
2. **Identity and civil-status sources:** collect the identification department's leaflet (archived by Open Development Cambodia), the GDI apps' service pages (manual screenshots), and the business registration guidebooks from `registrationservices.gov.kh`.
3. **Decide** whether to keep or replace services that still lack a T1 primary source after step 2.
4. Annotate the remaining services, then ask a second annotator to label a sample to measure agreement.
5. Hand-transcribe one OWSO page to create an OCR evaluation reference (RQ2).
