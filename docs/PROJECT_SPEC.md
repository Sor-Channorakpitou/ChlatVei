# ChlatVei — Smart Citizen Platform

## Master Project Specification

### 1. Product Identity

- **Product name:** ChlatVei (the name and logo are always written in English)
- **Meaning:** Smart / intelligent (from the Khmer word for "clever")
- **Tagline:** Smarter Citizens, Simpler Services.

### 2. Product Vision

ChlatVei is a Cambodian digital citizen platform that helps people understand and navigate public services.

**The problem:** Public-service information can be hard to find. It is often scattered across sources, written in complicated language, out of date, or hard for ordinary citizens to understand.

ChlatVei turns this information into clear, structured, searchable guidance.

Example: a citizen asks *"I want to apply for a passport. What do I need?"* ChlatVei should provide:

- Who is eligible
- Required documents
- Steps
- Fees
- Processing time
- Where to apply
- Important conditions
- Common mistakes
- Official sources
- Last verification date

The platform must clearly separate **official information** from information that ChlatVei generated or analyzed.

---

## 3. Main Goals

ChlatVei must demonstrate two major areas.

### Software Engineering

Clean architecture, REST APIs, authentication, role-based access control, PostgreSQL database design, API validation, error handling, logging, testing, security, documentation, Git workflow, Docker, CI/CD, deployment.

### Data Science

Data collection, data cleaning, EDA, feature engineering, statistics, NLP, information extraction, machine learning, model evaluation, data visualization, and integration of ML into a real application.

The data science work must solve real ChlatVei problems, not serve as an artificial demonstration.

---

## 4. Target Users

### Citizen

- Search public services
- Ask questions
- View requirements, steps, fees, processing times
- See official sources
- Create personal checklists and track progress
- Give feedback
- Report unclear or outdated information

### Administrator

- Create and edit services
- Review extracted information
- Approve or reject information
- Manage and verify sources
- View changes and analytics
- Manage users
- View citizen feedback

### Future Research/Data Role

May analyze service complexity and citizen feedback, evaluate ML models, monitor data quality, and generate reports. **Do not overbuild this role in the MVP.**

---

## 5. MVP Scope

Start with roughly **10–20 Cambodian public services**, for example: passport application, National ID services, birth certificate, business registration, driver's license, vehicle registration, visa services, marriage registration, and other high-value citizen services.

Do not try to cover every government service. The MVP should prove that the system works.

---

## 6. Core User Flow (Citizen)

1. Open ChlatVei
2. Search for a public service
3. Select a service
4. Read the simplified information
5. View requirements
6. View steps
7. View fees
8. View processing time
9. View location
10. View official sources
11. Create a personal checklist
12. Mark requirements and steps as completed
13. Provide feedback

```text
User → "I want to apply for a passport"
     → ChlatVei finds Passport Application
     → Service Information
        ├── Eligibility
        ├── Required Documents
        ├── Steps
        ├── Fee
        ├── Processing Time
        ├── Location
        └── Official Sources
     → Create Checklist → Track Progress
```

---

## 7. Admin Flow

Public information must not automatically become trusted information.

```text
Official Source → Data Collection → Raw Data → Data Processing
→ Information Extraction → Validation → Admin Review
→ Approve / Reject → Published Service
```

ChlatVei keeps the source and verification history.

---

## 8. Source Management

Every important piece of information needs provenance: source URL, name, type, collection date, last checked date, verification status, related service, extracted information, reviewer, approval date, and version/change history.

Source statuses: `PENDING`, `UNDER_REVIEW`, `VERIFIED`, `REJECTED`, `OUTDATED`.

**Never silently overwrite verified information.**

---

## 9. Data Model

Core entities:

```text
User, Role, Service, Category, Requirement, ServiceStep, Fee, Location,
Source, ServiceSource, Verification, Feedback, Checklist, ChecklistItem,
ChangeRecord, ExtractionJob, DatasetRecord, MLPrediction, AuditLog
```

Normalize the relationships properly. Avoid storing a whole service as one giant JSON object unless there is a strong reason.

---

## 10. Architecture

```text
                    ChlatVei
        ┌──────────────┴──────────────┐
     Frontend                       Backend
   Angular PWA                 NestJS + TypeScript
                         ┌────────────┼────────────┐
                      PostgreSQL   Search       ML Service
                                               Python/FastAPI
                                                    |
                                              pandas/sklearn
```

- **Frontend:** Angular (mobile-first PWA; see ADR-006). The original spec said React. Pages: Home, Search, Service detail, Checklist, Profile, Feedback, Admin dashboard, Admin review.
- **Backend:** NestJS, TypeScript, PostgreSQL, REST. Modules: `auth`, `users`, `services`, `requirements`, `steps`, `sources`, `verification`, `feedback`, `checklists`, `admin`, `analytics`. Keep it a modular monolith with no unnecessary microservices.
- **ML service:** a separate Python service, because it has a different runtime and purpose.

---

## 11. Data Science Pipeline

```text
Raw Sources → Collection → Raw Dataset → Cleaning → Normalization → EDA
→ Feature Engineering → Model Training → Evaluation → Model/API → Backend
```

`data/raw` is never modified. Folders: `raw/`, `processed/`, `external/`, `metadata/`.

---

## 12. DS Component 1: Information Extraction

Sources include web pages, PDFs, documents, announcements, and FAQs. Fields to extract: `service_name`, `eligibility`, `required_documents`, `steps`, `fees`, `processing_time`, `locations`, `contact_information`, `conditions`.

```json
{
  "service_name": "...",
  "requirements": [],
  "steps": [],
  "fee": "...",
  "processing_time": "...",
  "confidence": 0.91
}
```

Extracted results **must go through admin review** and never become trusted information automatically.

---

## 13. DS Component 2: Service Complexity Score

Candidate variables: number of documents, number of steps, number of agencies, processing time, number of locations, fee complexity, information clarity, and citizen-reported difficulty.

Don't claim that any particular weighting is scientifically correct. Instead:

1. Research the existing literature
2. Define measurable variables
3. Build a baseline score
4. Collect citizen feedback
5. Analyze relationships
6. Experiment with statistical and ML models
7. Evaluate the results
8. Explain the limitations

```text
Service Complexity: 72/100
Main contributors:
- Many required documents
- Multiple steps
- Long processing time
- Information clarity issues
```

The goal is to explain **why** a service is difficult, not just to produce a number.

---

## 14. DS Component 3: Intelligent Search

Users may not know a service's official name. Start with TF-IDF and cosine similarity, optionally try embeddings, then compare the approaches and document the results.

---

## 15. Citizen Feedback Dataset

Questions: Was it easy to understand? Did you find what you needed? Which step was confusing? Did you complete the service? How difficult was it?

Fields: `service_id`, anonymized user id, `rating`, `difficulty`, `confusing_step`, `success`, `comment`, `created_at`. Protect personal information and collect only what is needed.

---

## 16. ML Evaluation

- **Classification:** precision, recall, F1, confusion matrix
- **Regression:** MAE, RMSE, R²
- **Extraction:** field-level precision, recall, and F1
- **Search:** whether relevant services rank near the top, measured on a small labeled evaluation set

Always compare against a simple baseline. "The output looks good" is not evidence.

---

## 17. Notebooks

```text
01_data_exploration  02_data_cleaning  03_eda  04_feature_engineering
05_complexity_baseline  06_information_extraction  07_service_similarity
08_model_evaluation
```

Move reusable logic into Python modules.

---

## 18. ML Service Endpoints

`POST /extract`, `POST /predict-complexity`, `POST /search/similar`, `GET /health`.

The backend owns the business logic, and the ML service owns the ML logic.

---

## 19. API Design

```text
GET/POST           /api/services
GET/PATCH/DELETE   /api/services/:id
GET                /api/services/:id/requirements
GET                /api/services/:id/steps
GET/POST           /api/sources
GET/POST           /api/feedback
GET/POST           /api/checklists
PATCH              /api/checklists/:id/items/:itemId
GET                /api/admin/review
POST               /api/admin/review/:id/approve
POST               /api/admin/review/:id/reject
```

Include pagination, filtering, sorting, validation, and consistent error responses.

---

## 20. Auth

Registration and login, password hashing, and role-based authorization with the roles `CITIZEN` and `ADMIN`. A citizen must never be able to approve information.

## 21. Security

Input validation, hashing, authN/authZ, rate limiting, secrets kept in environment variables, CORS configuration, ORM-based SQL-injection protection, error handling that doesn't leak secrets, and audit logs for admin actions. Never commit `.env` files, keys, passwords, credentials, or tokens.

## 22. Testing

- **Backend:** unit, integration, API, and authorization tests
- **Frontend:** component and key-flow tests
- **Data science:** schema, missing and invalid values, features, model I/O, evaluation pipeline
- **End-to-end (minimum):**
  - Citizen searches → views service → creates checklist → completes it
  - Admin receives extraction → reviews → approves → information becomes public

## 23. Admin Dashboard

Show services, verified sources, pending reviews, outdated information, feedback, complexity, and recent changes. Every chart must answer a question.

## 24. Change Detection (Phase 2 / later)

Compare stored and new versions of a source, detect changes (fees, documents, steps, processing time, eligibility), and route them to admin review. Never auto-publish them.

## 25. Language

Support Khmer and English, with Khmer prioritized and language switching in the UI. Public-service terminology must stay accurate rather than being mechanically translated.

## 26. Repository Structure

`frontend/`, `backend/`, `ml-service/`, `data/{raw,processed,external,metadata}`, `notebooks/`, `pipelines/`, `docs/`, `tests/`, `docker-compose.yml`, `README.md`, `.gitignore`.

## 27. Docker

Services: frontend, backend, ml-service, postgres. No Kubernetes in the MVP.

## 28. CI/CD

GitHub Actions: install → lint → test → build → docker build → deploy.

## 29. Git Workflow

Branches `main`, `development`, and `feature/*`; pull requests for important changes; Conventional Commits.

---

## 30. Development Order

| Phase | Focus | Deliverables |
|---|---|---|
| 1 | Research | Problem definition, users, existing solutions, Cambodian service research, academic research, data sources, RQs, scope |
| 2 | Data | 10–20 services, source docs, raw and clean datasets, data dictionary, initial EDA, methodology |
| 3 | Architecture | System architecture, ERD, schema, API spec, auth and role design |
| 4 | Backend | Auth → Users → Services → Requirements → Steps → Sources → Verification → Feedback → Checklists → Admin (no ML) |
| 5 | Frontend | Landing → Search → Service detail → Checklist → Feedback → Auth → Admin dashboard → Admin review |
| 6 | Data Science | Cleaning, EDA, features, complexity baseline and model, extraction, similarity, evaluation |
| 7 | ML Integration | Frontend → NestJS → ML service → model |
| 8 | Verification & Intelligence | Extraction review, source verification, confidence, change records, analytics |
| 9 | Testing & Security | All test suites, security review, data validation |
| 10 | Docker & Deployment | Compose, env config, CI/CD, deployment, monitoring, production DB |

---

## 31. Research Questions

- **RQ1:** Which factors contribute most to the perceived complexity of Cambodian public services?
- **RQ2:** Can public-service requirements be extracted automatically from unstructured government information?
- **RQ3:** Can citizen feedback identify problematic steps in public-service processes?
- **RQ4:** Do users find the right service more effectively with intelligent search than with keyword-only search?

---

## 32. Core Principle

ChlatVei is **not** a generic chatbot, an AI dashboard, a simple CRUD app, a prediction demo, or a copy of government websites.

ChlatVei **is** a data-driven digital citizen platform that turns public-service information into structured, understandable, verifiable guidance, and uses data science to identify and analyze service complexity.

---

## 33. Development Rules

1. Don't build the whole project in one step; follow the phases.
2. Before implementing a major feature, explain which parts of the architecture and which files it affects.
3. Don't change the architecture arbitrarily or add unnecessary libraries.
4. Prefer simple, maintainable solutions.
5. Keep business logic out of UI components and ML logic inside the ML service.
6. Don't hardcode secrets.
7. **Don't invent government information.**
8. Never mark information as verified outside the verification workflow.
9. Write tests for important functionality.
10. Update the docs when the architecture changes, and keep migrations version-controlled.
11. Preserve existing functionality.

With each code change, provide: files to create and modify, the reason for each change, the implementation, tests, how to run it, and any required migrations.

---

## 34. Definition of Done

- **Citizen:** search → find service → understand requirements → see sources → create checklist → track progress → give feedback
- **Admin:** manage services → manage sources → review extractions → verify → approve/reject changes → view analytics
- **Data science:** process real data → extract information → analyze complexity → evaluate models → expose ML functionality → integrate it into ChlatVei

Data science must directly improve the software product, not live in a disconnected notebook.
