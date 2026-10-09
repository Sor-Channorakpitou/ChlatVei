# 02: Existing Solutions

## Cambodian government channels

| Channel | Operator | What it offers | Gap ChlatVei addresses |
|---|---|---|---|
| **One Window Service Office portal** ([owso.gov.kh](https://owso.gov.kh)) | Ministry of Interior (General Secretariat) | News, legal documents, PDF lists of administrative services at the provincial, district/khan, and commune/sangkat levels; Khmer and English | Services are published as PDF lists rather than searchable, structured records |
| **OWSM Cambodia mobile app** ([listing](https://mwm.ai/apps/owsm-cambodia/1595059297)) | General Department of Administration, Ministry of Interior (per a third-party listing; unverified) | Service catalog, document checklists, office locator | Limited to OWSO-delivered services; the app was not reviewed directly |
| **service.gov.kh** public-service gateway | Named in a 2022 national digital government presentation ([PDF](https://data.vietnam.opendevelopmentmekong.net/dataset/c405582e-f126-4a83-9938-0ddbee6c5648/resource/bf46e582-caeb-4a91-a37c-935db4d4000b/download/1.-20220905-camboida-national-web-portal.pdf?preview=1)) | Guidance on public services | **Unreachable from our test environment on 2026-10-08** (request rejected); needs to be checked from Cambodia |
| **MPWT driver's-license page** ([mpwt.gov.kh](https://mpwt.gov.kh/en/public-services/driver-s-license)) | Ministry of Public Works and Transport | Fees, documents, locations, hotline 1275, FAQ, online system | Good model, but covers one ministry only, has no processing time, and its FAQ is Khmer-only on the English page |
| **CamDX Single Portal** for business registration ([overview](https://b2b-cambodia.com/articles/how-to-use-the-cambodia-online-business-registration-system)) | Ministry of Economy and Finance and Ministry of Commerce (sources differ) | Online incorporation across Commerce, Tax, Labour, and others | A transaction system, not an explainer; several names (CamDX, One Portal, Single Portal) confuse users |
| **e-Visa** (evisa.gov.kh) | E-Visa Office, Ministry of Foreign Affairs and International Cooperation | Online visa application | Aimed at foreigners; useful in the MVP as a well-structured reference service |
| **Phnom Penh Capital Hall online services** ([report](https://kh.andersen.com/?p=1149)) | Phnom Penh Capital Hall | Online submission for nine categories of administrative services (announced May 2026) | Phnom Penh only |

## Non-government aggregators

| Source | Notes |
|---|---|
| **Open Development Cambodia** ([civil status profile](https://opendevelopmentcambodia.net/profiles/access-to-public-service/civil-status/)) | Archives laws, prakas, and OWSO office lists. Valuable **legal provenance**, but not citizen-friendly guidance |
| **Expat and legal guides** (e.g. [jarniascyril.com](https://www.jarniascyril.com/expatriation/install-cambodia-expat-complete-guide/guide-get-cambodian-passport/), [emerhub.com](https://emerhub.com/cambodia/how-to-register-a-business-in-cambodia/), [bnglegal.com](https://bnglegal.com/?p=7593)) | Readable, but secondary, sometimes dated, and often aimed at foreigners. **Never used as a source of truth**, only as leads to official sources |
| **Wikipedia** ([Cambodian passport](https://en.wikipedia.org/wiki/Cambodian_passport)) | Gives fees and validity without a verification date. Lead only |
| Lookalike "gov services" sites | One search result ([govservicesportal.onrender.com](https://govservicesportal.onrender.com/services/5)) presents passport requirements in a government style without being official. This is exactly the risk ChlatVei's provenance model is designed to counter. **Excluded** |

## Takeaways for ChlatVei

1. **No single structured, cross-ministry, searchable source exists.** The OWSO publishes PDF lists, and each ministry covers its own services. This confirms the core problem.
2. **Official pages already contain extractable structure** (fee tables, document lists, FAQs). This supports RQ2 (information extraction).
3. **Sources often contradict each other** (for example, which ministry runs CamDX, or the e-Visa processing time). This shows why provenance and a verification workflow matter more than collecting data.
4. **Fake or unofficial lookalike portals exist.** ChlatVei must clearly label itself as an independent guide, never imply official status, and always link to the official source.
5. **Khmer content is often the more complete version.** Collection must include the Khmer pages, not just the English ones.
