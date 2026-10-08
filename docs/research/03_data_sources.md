# 03: Candidate Services and Data Sources

This document is the **collection plan for Phase 2**. It lists candidate services and where their official information is expected to be found. **No service facts are recorded here as true.** Phase 2 collects each source into `data/raw/`, records its provenance, and only then extracts fields.

## Source reliability tiers

| Tier | Type | Use in ChlatVei |
|---|---|---|
| **T1: Official, primary** | Ministry, OWSO, or official system pages; signed laws, prakas, sub-decrees | Can be the source of a published fact after admin verification |
| **T2: Official, archived** | Government documents mirrored by Open Development Cambodia | Legal provenance; check against T1 for currency |
| **T3: Secondary** | Law-firm, expat, or news guides; Wikipedia | Leads only. **Never** the sole source of a published fact |
| **Excluded** | Unofficial lookalike portals, unattributed content | Not collected |

## Candidate MVP services (15)

Status key: 🔎 = official source identified, still to be collected · ❓ = official source still to be found

| # | Service | Category | Responsible body (expected) | Primary source(s) | Tier | Status |
|---|---|---|---|---|---|---|
| 1 | Ordinary passport (new) | Identity & travel | General Department of Identification, Ministry of Interior | interior.gov.kh; Prakas No. 1461 on issuing regular passports, 28 Apr 2014 ([ODC](https://data.opendevelopmentcambodia.net/en/laws_record/prakas-no-1461-on-formality-of-issuing-regular-passports-dated-on-28-april-2014)) | T1/T2 | ❓ No official service page found yet |
| 2 | Passport renewal | Identity & travel | Same as #1 | Same as #1 | T1/T2 | ❓ |
| 3 | Khmer National ID card | Identity | General Department of Identification, Ministry of Interior | interior.gov.kh | T1 | ❓ |
| 4 | Birth registration and certificate | Civil status | Commune/sangkat registrar (under the Ministry of Interior's General Department of Identification) | Civil registration guidance on birth registration ([ODC](https://data.opendevelopmentcambodia.net/en/library_record/documentation-on-how-to-record-civil-registration-chapter-ii-birth-registration)); [UNESCAP CRVS profile](https://crvs.unescap.org/sites/default/files/resources/Cambodia%20CRVS%20Country%20Profile.pdf) | T2 | 🔎 |
| 5 | Late birth registration | Civil status | Commune/sangkat | As #4 | T2 | 🔎 |
| 6 | Marriage registration | Civil status | Commune/sangkat | [ODC civil status](https://opendevelopmentcambodia.net/profiles/access-to-public-service/civil-status/) | T2 | 🔎 |
| 7 | Death registration | Civil status | Commune/sangkat | As #6 | T2 | 🔎 |
| 8 | Correction of civil status record | Civil status | Commune/sangkat | As #6 | T2 | 🔎 |
| 9 | Driver's license, Types A/B (new) | Transport | Ministry of Public Works and Transport | [mpwt.gov.kh driver's license page](https://mpwt.gov.kh/en/public-services/driver-s-license) (Khmer version at `/kh/`); online system driverlicense.mpwt.gov.kh | T1 | 🔎 |
| 10 | Foreign driver's license exchange | Transport | Ministry of Public Works and Transport | As #9 | T1 | 🔎 |
| 11 | Vehicle / motorbike registration | Transport | Ministry of Public Works and Transport; OWSO | mpwt.gov.kh; [owso.gov.kh](https://owso.gov.kh) | T1 | ❓ |
| 12 | Company registration | Business | Ministry of Commerce via CamDX Single Portal | Sub-Decree No. 84 on business registration through IT systems ([PDF](https://data.vietnam.opendevelopmentmekong.net/en/dataset/17a91da8-1786-4bdc-92fd-b183003b2811/resource/46ff58b5-e746-418b-a6bb-d47cb4a36f7b/download/sub-decree-84_business-registration-through-it-system_en.pdf)); Ministry of Commerce registration site | T1/T2 | ❓ Official portal URL needs confirming |
| 13 | Sole proprietorship registration | Business | Ministry of Commerce | As #12 | T1 | ❓ |
| 14 | Tourist e-Visa | Visa | E-Visa Office, Ministry of Foreign Affairs and International Cooperation | evisa.gov.kh | T1 | 🔎 |
| 15 | OWSO administrative service (e.g. a construction permit at district level) | Local administration | District/khan OWSO | [owso.gov.kh](https://owso.gov.kh) service-list PDFs | T1 | 🔎 |

**Why these 15:** they cover five categories, three levels of government (national, provincial/district, commune), and a range of expected complexity (from a free commune-level birth registration to multi-agency business registration). That range is what the complexity analysis (RQ1) needs.

## Observed source structure (input for RQ2)

From one official page reviewed in Phase 1 (MPWT driver's license, read 2026-10-08):

| Field | Present? |
|---|---|
| Required documents | ✅ separate lists for citizens and foreigners |
| Steps | ⚠️ partly; described in prose, not numbered |
| Fees | ✅ a table in riels |
| Processing time | ❌ not stated |
| Locations | ✅ named service centres and provincial offices |
| Contact | ✅ hotline, email, hours |
| FAQ | ✅ Khmer only |

**Implication:** missing fields are expected and normal. The data model must distinguish **"unknown / not stated by source"** from **"none"** (for example, fee unknown versus fee free).

## Phase 2 collection protocol (summary)

For each source:
1. Save a raw snapshot (HTML or PDF) to `data/raw/<service_slug>/<YYYY-MM-DD>_<source_slug>.<ext>`. Raw files are never edited.
2. Add a row to `data/metadata/sources.csv`: `source_id, service_slug, url, source_name, publisher, tier, language, collected_at, sha256, notes`.
3. Collect **both Khmer and English** versions where they exist.
4. Note conflicts between sources in `notes` rather than resolving them silently.

## Known access issues

- `service.gov.kh` returned an access-rejected page on 2026-10-08. It may block requests from outside Cambodia or from automated tools. Retry from a Cambodian network, or collect it manually.
- Some official content exists only on Facebook pages or in apps. That content is out of scope for automated collection in the MVP and will be recorded manually with a screenshot as the raw artifact if needed.
