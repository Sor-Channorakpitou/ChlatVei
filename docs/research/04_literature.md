# 04: Literature and Methodological Grounding

This review covers enough literature to make sure each data-science component has a defensible basis. Read the items marked *to read* in full during Phase 6 before finalizing any method.

## A. Service complexity → administrative burden (RQ1, RQ3)

**Moynihan, D., Herd, P., & Harvey, H. (2015).** *Administrative Burden: Learning, Psychological, and Compliance Costs in Citizen-State Interactions.* Journal of Public Administration Research and Theory, 25(1), 43–69.
**Herd, P., & Moynihan, D. (2018).** *Administrative Burden: Policymaking by Other Means.* Russell Sage Foundation.

The framework splits burden into three costs:

| Cost | Meaning | Measurable proxy in ChlatVei |
|---|---|---|
| **Learning** | Finding out what exists, whether you are eligible, and how to apply | Information clarity (readability, missing fields, citizen "easy to understand?" rating), number of conditions |
| **Compliance** | Forms, documents, steps, fees, travel, waiting | Number of documents, steps, agencies, and locations; fee amount and structure; processing time |
| **Psychological** | Stress, stigma, frustration, loss of autonomy | Self-reported difficulty and free-text comments only. **Not inferred** from structural data |

**Why this matters for ChlatVei:** the complexity score is not an arbitrary weighting. Each structural feature maps to a cost type with an established theoretical basis. Herd and Moynihan also note that there is **no standard measurement instrument** yet, which justifies ChlatVei's approach: build an interpretable baseline, then test it against citizen-reported difficulty instead of asserting weights.

The framework also stresses that burden is **distributive**: it falls harder on lower-income or less-connected groups. This supports Khmer-first, mobile-first design.

Context reading: [Nextgov, *Measuring administrative burden* (2022)](https://www.nextgov.com/digital-government/2022/05/measuring-administrative-burden/366683/) covers the push for standard measures.

## B. Cambodian service-delivery context

- **Royal Government of Cambodia, *Digital Government Policy 2022–2035*** (Ministry of Post and Telecommunications; [ODC record](https://data.opendevelopmentcambodia.net/en/laws_record/cambodian-digital-government-policy)). Its vision is "Building a Digital Government to improve the quality of life and confidence of the people through better public service." ChlatVei's goals align with the policy's user-centric service access outcome. *To read in full.*
- **OWSO evaluation study (2013)**, Takhmao municipality ([Atlantis Press PDF](https://www.atlantis-press.com/article/6453.pdf)): clients were generally satisfied but shortfalls remained. *To read.* This is a source of variables for service experience.
- **Transparency International**, *Making services accessible and easy to use in Cambodia* ([blog](https://transparency.org/en/blog/making-services-accessible-and-easy-to-use-in-cambodia)). Civil-society perspective on access barriers. *To read.*
- **UNESCAP CRVS country profile** ([PDF](https://crvs.unescap.org/sites/default/files/resources/Cambodia%20CRVS%20Country%20Profile.pdf)) covers civil registration structure and coverage. Use it as context, and check its numbers against the source before citing.

## C. Intelligent search (RQ4)

| Method | Role in ChlatVei | Reference |
|---|---|---|
| **Keyword / exact match** | The **baseline** RQ4 compares against | n/a |
| **TF-IDF + cosine similarity** | First interpretable model | Salton & Buckley (1988), *Term-weighting approaches in automatic text retrieval*, Information Processing & Management 24(5) |
| **BM25** | Strong lexical baseline, cheap to add | Robertson & Zaragoza (2009), *The Probabilistic Relevance Framework: BM25 and Beyond* |
| **Multilingual sentence embeddings** | Optional experiment for paraphrases ("new passport" → "Passport Application") and Khmer↔English queries | Reimers & Gurevych (2020), *Making Monolingual Sentence Embeddings Multilingual using Knowledge Distillation* |

**Evaluation:** Recall@k, MRR, and nDCG on a small labeled query → correct-service set (Järvelin & Kekäläinen, 2002, *Cumulated gain-based evaluation of IR techniques*).

**Khmer-specific issue (important):** written Khmer does **not put spaces between words**, so off-the-shelf TF-IDF tokenization fails on Khmer text. Options to compare in Phase 6:
1. Character n-gram TF-IDF, which needs no segmenter (likely the strongest simple baseline).
2. Word segmentation with an open-source Khmer tokenizer (for example, `khmer-nltk`; *to evaluate*, not yet adopted).
3. Multilingual embeddings, which handle segmentation internally.

## D. Information extraction (RQ2)

- Official pages mix **semi-structured** content (fee tables, bulleted document lists) with **prose** (steps, conditions). Start with rule- and structure-based extraction (HTML tables and lists, regular expressions for currency amounts and durations) as the **baseline**. Then experiment with learned or LLM-assisted extraction on the same labeled set.
- **Evaluation:** field-level precision, recall, and F1 against hand-labeled gold annotations for each source (standard IE practice; see Jurafsky & Martin, *Speech and Language Processing*, 3rd ed. draft, chapter on information extraction).
- Every extraction outputs a **confidence score** and goes to **admin review**. It is never auto-published (spec §12).

## E. Readability / information clarity

There is no validated readability formula for Khmer. For the MVP, clarity is measured with **observable proxies** (missing fields, sentence length in characters, share of legal terms, number of conditions) **plus citizen ratings**. We will not claim it as a readability score. This limitation will be documented.
