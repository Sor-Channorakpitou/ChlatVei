"""Generates notebooks 05–08 from code, so they stay in sync with the chlatvei_ml package.

    cd ml-service && ../.venv/Scripts/python build_notebooks.py
    ../.venv/Scripts/jupyter nbconvert --to notebook --execute --inplace ../notebooks/0[5-8]_*.ipynb
"""

from pathlib import Path

import nbformat as nbf

NB_DIR = Path(__file__).resolve().parent.parent / "notebooks"

SETUP = """import sys, json
from pathlib import Path
sys.path.insert(0, str(Path('..') / 'ml-service'))
import pandas as pd
import matplotlib.pyplot as plt
from chlatvei_ml.data import Dataset
pd.set_option('display.width', 160)
RESULTS = Path('..') / 'data' / 'evaluation' / 'results'
# Chart style: categorical palette validated for colour-blind separation (see docs/data-science/phase6_report.md)
PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300']
SURFACE, INK, MUTED = '#fcfcfb', '#0b0b0b', '#52514e'
plt.rcParams.update({'figure.facecolor': SURFACE, 'axes.facecolor': SURFACE, 'axes.edgecolor': MUTED, 'axes.labelcolor': INK,
                     'xtick.color': MUTED, 'ytick.color': MUTED, 'axes.spines.top': False, 'axes.spines.right': False,
                     'axes.grid': True, 'grid.color': '#e6e5e0', 'grid.linewidth': 0.6, 'axes.axisbelow': True, 'font.size': 10})
ds = Dataset.load()"""


def nb(title: str, intro: str, cells: list[tuple[str, str]]) -> nbf.NotebookNode:
    book = nbf.v4.new_notebook()
    book.metadata["kernelspec"] = {"name": "chlatvei", "display_name": "ChlatVei (.venv)", "language": "python"}
    book.cells = [nbf.v4.new_markdown_cell(f"# {title}\n\n{intro}"), nbf.v4.new_code_cell(SETUP)]
    for kind, src in cells:
        book.cells.append(nbf.v4.new_markdown_cell(src) if kind == "md" else nbf.v4.new_code_cell(src))
    return book


NOTEBOOKS = {
    "05_complexity_baseline.ipynb": nb(
        "05 · Service Complexity Baseline (RQ1)",
        "A transparent baseline score from structural features, grouped by administrative-burden cost type "
        "(compliance vs. learning). Equal weights and fixed reference caps; no weighting is claimed to be correct.",
        [
            ("md", "## Features\nComputed from the annotated facts. `information_gaps` counts core fields the official source does not state."),
            ("code", "from chlatvei_ml import complexity as cx\nfeatures = cx.service_features(ds.facts)\npd.DataFrame([{ 'feature': f.name, 'cost type': f.cost, 'reference cap': f.cap } for f in cx.FEATURES])"),
            ("code", "features"),
            ("md", "## Scores and what drives them\nEach `part_*` column is that feature's share of the 0–100 score."),
            ("code", "scores = cx.score(features)\nscores['main contributors'] = [', '.join(cx.explain(r)) for _, r in scores.iterrows()]\nscores"),
            ("code", """parts = scores[[c for c in scores.columns if c.startswith('part_')]]
labels = [c.removeprefix('part_').replace('_', ' ') for c in parts.columns]
fig, ax = plt.subplots(figsize=(8, 2.6))
left = pd.Series(0.0, index=parts.index)
for i, col in enumerate(parts.columns):
    ax.barh(parts.index, parts[col], left=left, color=PALETTE[i], edgecolor=SURFACE, linewidth=2, height=0.55, label=labels[i])
    left += parts[col]
for y, total in enumerate(scores['score']):
    ax.text(total + 1, y, f'{total:.1f}', va='center', color=INK)
ax.invert_yaxis(); ax.set_xlim(0, 100); ax.set_xlabel('Complexity score (0–100)'); ax.grid(axis='y', visible=False)
ax.legend(ncol=3, frameon=False, bbox_to_anchor=(0, -0.35), loc='upper left', fontsize=9)
ax.set_title('Which features make each service complex?', loc='left', color=INK)
plt.show()"""),
            ("md", "## Sensitivity: does the ranking depend on the equal weights?\n2,000 random weightings (flat Dirichlet). If the ranking changes often, the services cannot be ranked confidently from structure alone."),
            ("code", "sens = cx.sensitivity(features)\nprint(f\"Equal-weight order reproduced in {sens.attrs['same_order_share']:.0%} of weightings\")\nsens"),
            ("md", "## Validation against citizen feedback\nThe score is only meaningful if it agrees with what citizens report. That needs feedback on at least 8 services; none exists yet, so the check refuses to report a number."),
            ("code", "cx.validate_against_feedback(scores['score'], pd.Series(dtype=float))"),
            ("md", "## Limitations\n- Only 3 services are annotated: scores are illustrative, not findings about Cambodian services in general.\n- Reference caps (e.g. 10 documents, 1,000,000 riel) are assumptions; they are listed above and easy to change.\n- A missing field counts as an information gap, not as zero effort; e.g. the exchange service shows 0 steps because steps are not stated."),
        ],
    ),
    "06_information_extraction.ipynb": nb(
        "06 · Information Extraction Baseline (RQ2)",
        "A rule-based extractor for fees and required documents, scored field by field against the hand-labelled Phase 2 facts. "
        "S001 was used while writing the rules (development); S003 was not (held out), so S003 is the honest estimate.",
        [
            ("code", "from chlatvei_ml.extraction import extract, evaluate_source\nfor sid in ['S001', 'S003']:\n    r = extract(ds.source_text(sid))\n    print(sid, 'fees found:', sorted({f['amount'] for f in r.fees}))\n    print(sid, 'documents found:', r.documents, '\\n')"),
            ("code", "pd.read_csv(RESULTS / 'extraction.csv')"),
            ("md", "## Error analysis\n- **Fees, high recall / low precision:** the regex finds every amount, including fines (500 ៛/day) and fees outside the annotation scope (types C–E, plate prices). Part of the 'error' is incomplete gold data: precision is a lower bound.\n- **Documents on S003: 0 found.** The vehicle page states documents inside a sentence (\"…attachments of your vehicle's receipt of import tax, letter from the dealer…\"), not as a list. Rules built on S001's list layout do not transfer.\n- **Khmer FAQ content** (age limits, validity, test stages) is prose and is not extracted at all.\n\n**Conclusion for RQ2:** layout rules are a usable baseline for list-formatted English pages only. Prose and Khmer need a learned or LLM-assisted extractor, evaluated on this same gold data, and every extraction still goes to admin review."),
        ],
    ),
    "07_service_similarity.ipynb": nb(
        "07 · Intelligent Search (RQ4)",
        "Five rankers on the same service documents and the same 62 labelled queries (37 English, 23 Khmer, 2 mixed). "
        "Documents contain only what ChlatVei holds: names, annotated facts and official page text; no hand-written synonyms.",
        [
            ("code", "summary = pd.read_csv(RESULTS / 'search_summary.csv')\nsummary.pivot(index='ranker', columns='language', values='mrr').sort_values('all', ascending=False)"),
            ("code", "summary[summary.language == 'all'].sort_values('mrr', ascending=False)[['ranker', 'recall@1', 'recall@3', 'mrr']]"),
            ("code", """piv = summary.pivot(index='ranker', columns='language', values='mrr').sort_values('all')
fig, axes = plt.subplots(1, 2, figsize=(9, 2.8), sharey=True)
for ax, lang, title in zip(axes, ['km', 'en'], ['Khmer queries (n=23)', 'English queries (n=37)']):
    ax.barh(piv.index, piv[lang], color=PALETTE[0], height=0.55)
    for y, v in enumerate(piv[lang]):
        ax.text(v + 0.02, y, f'{v:.2f}', va='center', color=INK, fontsize=9)
    ax.set_xlim(0, 1.1); ax.set_title(title, loc='left', color=INK); ax.set_xlabel('MRR'); ax.grid(axis='y', visible=False)
fig.suptitle('Mean reciprocal rank by ranker (higher is better)', x=0.01, ha='left', color=INK)
plt.tight_layout(); plt.show()"""),
            ("md", "## Is the improvement real?\nPaired bootstrap (2,000 resamples of the same queries) of each ranker's MRR minus the keyword baseline. A difference counts only if the 95% interval excludes 0."),
            ("code", "sig = json.loads((RESULTS / 'search_significance.json').read_text(encoding='utf-8'))\npd.DataFrame([{ 'ranker': r, 'language': l, **v } for r, d in sig.items() for l, v in d.items()])"),
            ("md", "## Where does the best ranker still fail?"),
            ("code", "per_query = pd.read_csv(RESULTS / 'search_per_query.csv')\nbest = per_query[per_query.ranker.str.startswith('tf-idf char 2-4, names 50%')]\nbest[(best['rank'].isna()) | (best['rank'] > 3)][['query', 'language', 'expected', 'rank', 'top']]"),
            ("md", "Most failures are **data** problems, not model problems: the five civil-status services share the same official pages (near-identical documents); the e-Visa page could not be collected; the one-window-office text is noisy OCR; and the very common Khmer word ចុះបញ្ជី ('register') pulls queries towards the long vehicle-registration page."),
        ],
    ),
    "08_model_evaluation.ipynb": nb(
        "08 · Evaluation Summary",
        "Headline numbers for RQ1, RQ2 and RQ4, read from `data/evaluation/results/summary.json` (regenerate with `ml-service/run_experiments.py`).",
        [
            ("code", "summary = json.loads((RESULTS / 'summary.json').read_text(encoding='utf-8'))\nprint('Queries:', summary['queries'], summary['queries_by_language'])\nprint('Best search ranker overall:', summary['search_best_overall'])"),
            ("code", "pd.DataFrame(summary['search_mrr']).T.sort_values('all', ascending=False)"),
            ("code", "pd.DataFrame(summary['extraction'])"),
            ("code", "pd.Series(summary['complexity_scores'], name='score').to_frame().assign(same_order_share=summary['complexity_same_order_share'])"),
            ("md", "See `docs/data-science/phase6_report.md` for interpretation, limitations and next steps."),
        ],
    ),
}

if __name__ == "__main__":
    for name, book in NOTEBOOKS.items():
        nbf.write(book, NB_DIR / name)
        print("wrote", name)
