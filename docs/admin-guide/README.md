# Admin Guide (Phase 8)

How an administrator keeps ChlatVei's information correct, in the order you would usually work. Everything here happens under **Admin** (top-right in the app, visible only to admins).

## The one rule

**Nothing reaches citizens until an admin approves it against an official source.** Imported, extracted and typed-in information all wait in the **Review** queue first. Approved information is never overwritten: a change creates a new version for review, and the old one is kept as history.

## 1. Sources: decide what counts as official

**Admin → Sources** lists every page ChlatVei collected (`S001`, `S002`, …).

| Button | When to use it |
|---|---|
| **Verify** | You checked that the page is a genuine official source (a ministry website, an official PDF). Content from a source can only be approved after the source is verified. Secondary sources (tier T3) can never support public content |
| **Reject** | The page is not official or not relevant |
| **Mark outdated** | The page no longer reflects current rules |
| **Details** | Shows when copies were collected (with fingerprints) and which services use this source |
| **Extract into review queue** (inside Details, per service) | Runs the automatic extractor on the latest copy. The findings appear in Review as **Extracted**, with a confidence score. Running it twice does not create duplicates |

## 2. Review: approve or reject

**Admin → Review** is the queue of everything waiting.

- **Filter** by where the item came from: **Imported** (from the Phase 2 dataset), **Extracted** (found automatically), or **Manual** (typed by an admin).
- **On the right,** the **proposed content** sits next to the **evidence**: the exact words from the official source. Compare them.
- **Khmer text is required to approve.** Type the Khmer wording from the official source and press **Save**. **Approve** stays disabled until there is Khmer text *and* the source is verified.
- **Reject** needs a short comment explaining why (for example, "FAQ question, not a requirement"). Rejected items are kept as history.
- **Extracted items need extra care.** The extractor is a simple baseline. On the vehicle page, most "documents" it finds are FAQ questions. Reject anything that isn't a real requirement.

**What approval does, all at once:** the item becomes public; the version it replaces (if any) becomes *outdated*; a **change record** is published on the service page under "Recent changes"; and the audit log records who approved it and when.

## 3. Publishing a service

A service becomes visible to citizens when its status is **PUBLISHED**. That requires a **Khmer name** and **at least one verified requirement or step**. *(Publishing is done through the API today: `PATCH /api/admin/services/:id {publishStatus: "PUBLISHED"}`. A button for it is a small follow-up.)*

## 4. Dashboard: what needs attention

| Block | Question it answers |
|---|---|
| Tiles | How much is waiting for review? How many sources are verified? Is anything outdated, or not verified in 180 days? |
| Services by category | Where is coverage thin? |
| Hardest services | Which services do citizens rate most difficult (average 1–5)? |
| Most confusing steps | Which steps confuse people? Ranked by the *lower bound* of a 95% interval, so one or two reports can't dominate |
| **Complexity (ChlatVei estimate)** | ChlatVei's structural score per service and its main reason. **Recompute scores** after approving changes |
| Recent changes | What changed in public information lately |

The complexity score is labelled on the public page as ChlatVei's own estimate, not official information. It has not yet been validated against citizen feedback (see the [Phase 6 report](../data-science/phase6_report.md)).

## 5. Feedback

**Admin → Feedback** shows what citizens reported: clarity and difficulty scores, the step that confused them, whether they completed the service, and comments. **You never see who sent it** (privacy, spec §15).

- **Mark resolved** once you've fixed the information (for example, an "outdated" report led to a corrected fee).
- **Dismiss** if it isn't actionable.
- Use the **Open / Resolved / Dismissed** tabs to look back.

## 6. Users

**Admin → Users:** search by name or email.

- **Make admin / Make citizen** and **Deactivate / Activate** need a **second tap to confirm**.
- Changing someone's role or deactivating them **signs them out everywhere** and is recorded in the audit log.
- You can't change your own role or deactivate yourself, which prevents locking every admin out.
- The **first** admin is created on the server with `npm run create-admin` (see the [backend guide](../backend/README.md)). Nobody can sign up as an admin.

## Where things are recorded

| Record | Contents |
|---|---|
| `verifications` | Every approve, reject or outdated decision, with the reviewer and comment |
| `change_records` | Before and after values of every published change (public) |
| `audit_logs` | Every admin action, with the actor, time and IP address. Append-only |
