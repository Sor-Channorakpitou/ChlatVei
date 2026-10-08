# Phase 6: Data Science Report

Results from `ml-service/run_experiments.py`, saved in `data/evaluation/results/`, run on 2026-10-09. Each research question uses a simple baseline and a measurable evaluation (spec §16). "The output looks good" is not used as evidence anywhere.

| | Question | Status |
|---|---|---|
| **RQ4** | Does smarter search find the right service more often than keyword search? | **Yes, with statistically clear gains, especially in Khmer** |
| **RQ2** | Can requirements be extracted automatically from official pages? | **Partly.** Rules work on English lists, fail on prose and Khmer |
| **RQ1** | What makes a service complex? | **Baseline built; not yet validated.** Needs citizen feedback |
| **RQ3** | Can feedback find confusing steps? | **Method ready** (Wilson-interval ranking in the admin dashboard); waiting for real feedback |

---

## RQ4: Intelligent search

**Set-up**
- **Same inputs for every system:** five rankers search the same 15 service documents with the same **62 labelled queries** (37 English, 23 Khmer, 2 mixed), stored in `data/evaluation/search_queries.csv`.
- **What a service document contains:** only what ChlatVei holds: service names, the annotated facts, and the text of the official pages linked to the service. There are no hand-written synonyms.
- **Fixed in advance:** the combined system's 50/50 weights were set before seeing its results and were not tuned on these queries.

**Results** (MRR, higher is better; Recall@1 and Recall@3 in `search_summary.csv`)

| Ranker | All | Khmer | English |
|---|---|---|---|
| Keyword match (**baseline**, works like the current database `ILIKE`) | 0.45 | 0.23 | 0.56 |
| TF-IDF, words | 0.64 | 0.53 | 0.69 |
| TF-IDF, character 2–4-grams | 0.57 | **0.60** | 0.52 |
| TF-IDF, character n-grams, names only | 0.60 | 0.22 | 0.81 |
| **TF-IDF, character n-grams, 50% names + 50% content** | **0.73** | 0.54 | **0.83** |

**Is the improvement real?** A paired bootstrap was run over the same queries: 2,000 resamples, 95% intervals.
- **Combined system vs baseline:** +0.27 MRR overall (interval 0.17 to 0.38), +0.31 in Khmer (0.19 to 0.44) and +0.27 in English (0.11 to 0.41). All three intervals exclude 0.
- **Character n-grams vs baseline, Khmer only:** +0.37 (0.21 to 0.54).

**Findings**
1. **Character n-grams are the right tool for Khmer.** Written Khmer has no spaces between words, so a keyword search only matches a query typed exactly as it appears. Character n-grams match parts of words and more than double Khmer MRR (0.23 → 0.60). A unit test shows a case keyword search misses entirely: `ប្រឡងបណ្ណបើកបរម៉ូតូ`.
2. **Names are precise, page text is noisy.** Names alone give the best English results but fail in Khmer, because 13 of 15 services have no official Khmer name yet. Combining names and content gives the best result overall.
3. **Most remaining failures are data problems, not model problems:**
   - **Shared sources:** the five civil-status services link to the same identification-department pages, so their documents are nearly identical. Birth, late-birth and marriage queries land on the wrong one of the five.
   - **A generic word:** ចុះបញ្ជី ("register") is frequent on the long vehicle-registration page, which therefore attracts many Khmer "register …" queries.
   - **No content:** e-Visa has no collected page, so ទិដ្ឋាការ ("visa") finds nothing.
   - **Noisy text:** the One Window Service Office text is OCR of scanned PDFs.

**Recommendation for Phase 7:** use **character n-gram TF-IDF with 50% names and 50% content** as the ML search behind `GET /api/search`, keeping the database search as a fallback. The biggest further gain will come from **data**, not models: official Khmer names for every service, and distinct sources for each civil-status service.

**Limitations**
- **I wrote the queries myself,** so they reflect my own wording. They should be replaced by real queries from the search log once citizens use ChlatVei.
- **Small numbers:** the evaluation has 23 Khmer queries and 15 services, which is why every comparison comes with a confidence interval.
- **Embeddings were not tested.** A multilingual sentence-embedding model would need a model download. It is the next experiment, and must beat 0.73 MRR on this same query set.

---

## RQ2: Information extraction

**Set-up**
- **Extractor:** rule-based. A pattern finds fee amounts in riel, dollars, Khmer digits, and both `30,000` and `180.000` formats. A list reader picks up the short lines that follow a "documents …:" heading.
- **Scoring:** field-level precision, recall and F1 against the hand-labelled Phase 2 facts. Fees are compared as sets of amounts. Documents use token overlap (Jaccard ≥ 0.5), or containment for Khmer.
- **Development vs held-out:** I wrote the rules while looking at **S001** (driver's license), so its scores are optimistic. **S003** (vehicle registration) was not looked at, so it is the honest held-out estimate.

| Source | Split | Field | Precision | Recall | F1 |
|---|---|---|---|---|---|
| S001 | development | fees | 0.56 | 1.00 | 0.71 |
| S001 | development | documents | 0.67 | 0.89 | 0.76 |
| S003 | **held-out** | fees | 0.14 | 1.00 | 0.25 |
| S003 | **held-out** | documents | **0.00** | **0.00** | **0.00** |

**Findings**
1. **Fees: every annotated fee is found (recall 1.0), but precision is low.** The pattern also picks up fines (500 ៛ per day), fees outside the annotation scope (license types C–E, plate prices) and amounts in the FAQ. Part of the "error" is that the gold data only covers the main fees, so the precision figures are lower bounds.
2. **Documents: rules do not transfer.** S003 states its documents inside a sentence ("…attachments of your vehicle's receipt of import tax, letter from the dealer…"), not as a list, and the S001-shaped rules find none of them.
3. **Khmer FAQs are not extracted at all.** They hold 30% of the annotated facts (Phase 2, finding F3), including age limits, validity and test stages.
4. **Bug found and fixed during evaluation:** a long heading ("Required documents for foreigners … include:") was counted as a document.

**Answer to RQ2 (so far):** layout rules are a usable baseline only for English pages that present requirements as lists. Prose and Khmer content need a learned or LLM-assisted extractor, evaluated on the same gold data. Whatever extracts the data, results still go to admin review as `EXTRACTED` with a confidence score. The verification workflow from Phase 4 already supports this.

**Next:** annotate two or three more sources so there is a larger held-out set, then test an LLM-assisted extractor against these baseline numbers.

---

## RQ1: Service Complexity Score (baseline)

**Method** (`chlatvei_ml/complexity.py`):
- **Features**, grouped by administrative-burden cost type (Moynihan, Herd & Harvey 2015):

| Cost type | Features |
|---|---|
| Compliance | documents, steps, number of fee tiers, highest fee |
| Learning | conditions/eligibility rules, information gaps (core fields the official source does not state) |

- **Scaling:** each feature is scaled against a **fixed reference cap** (10 documents, 10 steps, 6 fee tiers, 1,000,000 riel, 6 conditions, 7 fields), not against the other services, so a score doesn't change when unrelated services are added.
- **Weights:** equal. No weighting is claimed to be correct (spec §13).

| Service | Score | Main contributors |
|---|---|---|
| Driver's license A/B | 34.8 | many different fees, many conditions, many documents |
| Foreign license exchange | 25.1 | many documents, many conditions, incomplete official information |
| Vehicle registration | 21.7 | many documents, many different fees, many steps |

**Findings**
1. **The ranking depends on the weights.** Across 2,000 random weightings, the equal-weight order of the three services is reproduced only **52%** of the time. Driver's license A/B is usually ranked first (mean rank 1.19), but the order of the other two depends on the weights. With structural data alone, these services **cannot be ranked confidently**. This is the reason citizen feedback is needed.
2. **A design flaw was found and fixed.** The fee was first scaled on a logarithmic scale, which squashed everything together: 120,000 and 180,000 riel both scored about 0.87, so "high fee" topped every service. It now uses a linear scale. I'm recording this so the change can't be mistaken for tuning to a desired result.
3. **A missing field is counted as an information gap, not as zero effort.** For example, the exchange service shows 0 steps only because no steps are stated, and the gap adds to its learning cost.

**Validation:** `validate_against_feedback` computes the Spearman correlation between the score and the mean difficulty citizens report, and **refuses to report it with fewer than 8 services that have feedback**. None exists yet, so RQ1 is open.

**Limitations:** only 3 services are annotated, so these scores illustrate the method. They are not findings about Cambodian public services.

---

## RQ3: Confusing steps (status)

The Phase 4 analytics already rank steps by the **lower bound of a 95% Wilson interval**, so a step reported by 2 out of 2 people doesn't outrank one reported by 40 out of 50. The admin dashboard shows this ranking (Phase 5). Analysis starts once real feedback arrives. A small guided pilot (about 20 participants doing real tasks) would give a first dataset.

---

## Reproducing

```bash
.venv/Scripts/pip install -r ml-service/requirements.txt
cd ml-service
../.venv/Scripts/python -m pytest          # 23 tests
../.venv/Scripts/python run_experiments.py # writes data/evaluation/results/
../.venv/Scripts/python build_notebooks.py && ../.venv/Scripts/jupyter nbconvert --to notebook --execute --inplace ../notebooks/0[5-8]_*.ipynb
```

| Notebook | Contents |
|---|---|
| 01_data_exploration | Phase 2 EDA: sources, languages, coverage |
| 05_complexity_baseline | Features, scores, contributions chart, sensitivity, validation gate |
| 06_information_extraction | Extracted output, scores, error analysis |
| 07_service_similarity | Ranker comparison, chart, bootstrap significance, failure cases |
| 08_model_evaluation | Headline numbers from `summary.json` |

Where the spec's notebooks 02–04 are covered: cleaning (02) is `pipelines/extract_text.py` and its tests; EDA (03) is notebook 01; feature engineering (04) is `chlatvei_ml/complexity.py` and notebook 05.

The charts use a categorical palette checked for colour-blind separation (a validator run, all checks pass). Every chart sits next to its data table.
