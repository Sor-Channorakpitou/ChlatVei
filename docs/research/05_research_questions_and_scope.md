# 05: Research Questions, Scope, and Risks

## Research questions

### RQ1: Which factors contribute most to the perceived complexity of Cambodian public services?

- **Unit:** service (n ≈ 15 at MVP, so this is exploratory, not a confirmatory study).
- **Features (structural, from verified data):** documents, steps, agencies, locations, processing time, fee amount and number of fee tiers, conditions, missing-field count.
- **Target (perceived):** mean citizen difficulty rating (1–5) from ChlatVei feedback.
- **Method:**
  1. Baseline: equal-weight, min-max-normalized index of the structural features (transparent, no fitted weights).
  2. Correlate each feature with perceived difficulty (Spearman, because n is small).
  3. If enough feedback is collected, fit a regularized linear model on the feedback rows, not the service rows, and report coefficients with bootstrap confidence intervals.
- **Metrics:** Spearman ρ between the baseline index and perceived difficulty; MAE/RMSE/R² for any fitted model versus the baseline.
- **Honest limitation:** with about 15 services, feature weights cannot be estimated reliably at the service level. Results will be reported as exploratory.

### RQ2: Can public-service requirements be extracted automatically from unstructured government information?

- **Data:** raw official pages and PDFs from Phase 2, hand-labeled as gold fields (documents, steps, fee, processing time, locations).
- **Baseline:** rule- and structure-based extractor.
- **Comparison:** an ML or LLM-assisted extractor.
- **Metrics:** field-level precision, recall, and F1, reported per field and per language (Khmer vs. English).
- **Success criterion (to confirm):** extraction counts as useful if it reduces admin effort, meaning reviewers mostly confirm rather than retype. A secondary measure is the share of extracted fields an admin approves unchanged.

### RQ3: Can citizen feedback identify problematic steps in public-service processes?

- **Data:** feedback with `confusing_step` (a structured pick from the service's steps) plus a free-text comment.
- **Method:** rank steps by confusion rate with Wilson confidence intervals, then group free-text comments with simple topic or keyword clustering.
- **Validation:** check whether the flagged steps match structural signals, such as steps with the most conditions or missing information.
- **Risk:** feedback volume may be low in the MVP. Mitigate with a small structured pilot (for example, about 20 participants doing guided tasks) and document the sample.

### RQ4: Do users find the correct public service more effectively with intelligent search than with keyword-only search?

- **Data:** a labeled set of about 100–150 queries (Khmer, English, and mixed; paraphrased and misspelled), each mapped to its correct service.
- **Systems:** keyword match (baseline) → TF-IDF (word and character n-grams) → BM25 → multilingual embeddings (optional).
- **Metrics:** Recall@1, Recall@3, and MRR, reported separately for Khmer and English queries.
- **Hypothesis:** character-n-gram TF-IDF beats keyword match on Khmer queries because of the lack of word spacing, and embeddings help most on paraphrases.

## MVP scope

**In scope**
- 10–20 services (15 candidates in [03_data_sources.md](03_data_sources.md)).
- Khmer and English content for each service where official sources exist.
- Citizen features: search, service detail, sources and verification date, checklist, feedback.
- Admin features: manage services and sources, review queue, approve or reject, basic analytics.
- Data science: complexity baseline, search comparison, extraction experiment, all with evaluation.

**Out of scope (deferred)**
- Automatic change detection (Phase 2 of the product, spec §24).
- A research/data analyst role.
- Submitting applications or making payments.
- Chatbot or free-form question answering.
- Full coverage of every government service or every province's local variations.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Official information is incomplete, PDF-only, or missing online | Gaps in service records | Store "not stated by source" explicitly; prioritize services with T1 sources |
| Sources contradict each other | Wrong guidance | Provenance per field; admin resolves conflicts; never publish T3-only facts |
| Information goes out of date | Citizens are misled | Show the last-verified date; flag services when that date is older than N days (OUTDATED) |
| Local (commune-level) variation | One record may not fit everywhere | State that local offices may differ; record the source's jurisdiction |
| Too little feedback for RQ1/RQ3 | Weak statistical findings | Structured pilot; report as exploratory; use confidence intervals |
| Limited Khmer NLP tooling | Poor search and extraction | Character-level methods first; evaluate Khmer and English separately |
| ChlatVei mistaken for an official government site | Trust and legal risk | Clear "independent guide" labeling; always link to the official source |
| Collecting personal data through feedback | Privacy | Anonymized IDs; no national ID numbers or documents; minimal fields |

## Phase 1 → Phase 2 handoff

Phase 2 will:
1. Confirm a T1 source for each ❓ service in `03_data_sources.md`, or replace the service.
2. Collect raw snapshots and fill in `data/metadata/sources.csv`.
3. Write the data dictionary (`data/metadata/data_dictionary.md`).
4. Build the raw-to-clean dataset and run initial EDA.
