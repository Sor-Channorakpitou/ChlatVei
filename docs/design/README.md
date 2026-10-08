# UI Prototype

`prototype.html` is a clickable, self-contained prototype of the main screens. Open it in a browser; it needs no build step.

| Side | Screens |
|---|---|
| Citizen | Search, service detail, checklist, feedback |
| Admin | Review queue (proposed content next to source evidence), dashboard |

What it demonstrates:
- **Khmer first.** Khmer is the default language, with an English toggle. The Khmer UI copy still needs review by a native speaker.
- **"Not stated by official sources"** is shown where a source is silent, here for processing time.
- **Approval needs Khmer text.** The Approve button stays disabled until Khmer wording is entered, matching the backend rule and the database CHECK constraint.
- **Reject needs a comment.**
- **Dashboard:** field completeness uses real Phase 2 numbers. The confusing-steps chart uses **example** numbers, because no citizen feedback exists yet.

Content comes from the Phase 2 annotations (sources S001 and S003) and is labelled as not yet verified. The prototype is a design reference for Phase 5 (frontend), not production code.
