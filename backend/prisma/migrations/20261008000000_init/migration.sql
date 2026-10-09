-- pg_trgm must exist before the GIN trigram indexes below
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CITIZEN', 'ADMIN');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('km', 'en');

-- CreateEnum
CREATE TYPE "GovernmentLevel" AS ENUM ('NATIONAL', 'PROVINCIAL', 'DISTRICT', 'COMMUNE');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'OUTDATED');

-- CreateEnum
CREATE TYPE "ContentOrigin" AS ENUM ('MANUAL', 'IMPORTED', 'EXTRACTED');

-- CreateEnum
CREATE TYPE "RequirementKind" AS ENUM ('DOCUMENT', 'ELIGIBILITY', 'CONDITION');

-- CreateEnum
CREATE TYPE "LocationChannel" AS ENUM ('IN_PERSON', 'ONLINE');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('WEB_PAGE', 'PDF', 'LAW_RECORD');

-- CreateEnum
CREATE TYPE "SourceTier" AS ENUM ('T1', 'T2', 'T3');

-- CreateEnum
CREATE TYPE "SourceRelevance" AS ENUM ('PRIMARY', 'SUPPORTING', 'LEGAL_BASIS', 'CONTEXT');

-- CreateEnum
CREATE TYPE "GapField" AS ENUM ('ELIGIBILITY', 'DOCUMENTS', 'STEPS', 'FEES', 'PROCESSING_TIME', 'LOCATIONS');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('REQUIREMENT', 'STEP', 'FEE', 'PROCESSING_TIME', 'LOCATION', 'SOURCE');

-- CreateEnum
CREATE TYPE "VerificationAction" AS ENUM ('START_REVIEW', 'APPROVE', 'REJECT', 'MARK_OUTDATED');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('ADDED', 'CHANGED', 'REMOVED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "PredictionKind" AS ENUM ('COMPLEXITY');

-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('RATING', 'REPORT_UNCLEAR', 'REPORT_OUTDATED');

-- CreateEnum
CREATE TYPE "FeedbackOutcome" AS ENUM ('COMPLETED', 'IN_PROGRESS', 'GAVE_UP', 'NOT_STARTED');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CITIZEN',
    "preferred_language" "Language" NOT NULL DEFAULT 'km',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name_km" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "name_km" TEXT,
    "name_en" TEXT,
    "summary_km" TEXT,
    "summary_en" TEXT,
    "responsible_body_km" TEXT,
    "responsible_body_en" TEXT,
    "government_level" "GovernmentLevel" NOT NULL DEFAULT 'NATIONAL',
    "publish_status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "last_verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirements" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "kind" "RequirementKind" NOT NULL,
    "text_km" TEXT,
    "text_en" TEXT,
    "applies_to" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'PENDING',
    "origin" "ContentOrigin" NOT NULL DEFAULT 'MANUAL',
    "supersedes_id" UUID,
    "source_id" UUID,
    "source_snapshot_id" UUID,
    "evidence" TEXT,
    "extraction_job_id" UUID,
    "confidence" REAL,
    "created_by" UUID,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_steps" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "title_km" TEXT,
    "title_en" TEXT,
    "detail_km" TEXT,
    "detail_en" TEXT,
    "applies_to" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'PENDING',
    "origin" "ContentOrigin" NOT NULL DEFAULT 'MANUAL',
    "supersedes_id" UUID,
    "source_id" UUID,
    "source_snapshot_id" UUID,
    "evidence" TEXT,
    "extraction_job_id" UUID,
    "confidence" REAL,
    "created_by" UUID,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "service_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fees" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "label_km" TEXT,
    "label_en" TEXT,
    "applies_to" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'PENDING',
    "origin" "ContentOrigin" NOT NULL DEFAULT 'MANUAL',
    "supersedes_id" UUID,
    "source_id" UUID,
    "source_snapshot_id" UUID,
    "evidence" TEXT,
    "extraction_job_id" UUID,
    "confidence" REAL,
    "created_by" UUID,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_times" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "min_days" INTEGER,
    "max_days" INTEGER,
    "text_km" TEXT,
    "text_en" TEXT,
    "applies_to" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'PENDING',
    "origin" "ContentOrigin" NOT NULL DEFAULT 'MANUAL',
    "supersedes_id" UUID,
    "source_id" UUID,
    "source_snapshot_id" UUID,
    "evidence" TEXT,
    "extraction_job_id" UUID,
    "confidence" REAL,
    "created_by" UUID,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "processing_times_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_locations" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "name_km" TEXT,
    "name_en" TEXT,
    "address_km" TEXT,
    "address_en" TEXT,
    "channel" "LocationChannel" NOT NULL DEFAULT 'IN_PERSON',
    "url" TEXT,
    "phone" TEXT,
    "hours_text" TEXT,
    "applies_to" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'PENDING',
    "origin" "ContentOrigin" NOT NULL DEFAULT 'MANUAL',
    "supersedes_id" UUID,
    "source_id" UUID,
    "source_snapshot_id" UUID,
    "evidence" TEXT,
    "extraction_job_id" UUID,
    "confidence" REAL,
    "created_by" UUID,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "service_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_gaps" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "field" "GapField" NOT NULL,
    "applies_to" TEXT NOT NULL DEFAULT '',
    "source_id" UUID NOT NULL,
    "checked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_by" UUID,

    CONSTRAINT "field_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "tier" "SourceTier" NOT NULL,
    "language" "Language" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'PENDING',
    "last_checked_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_snapshots" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "collected_at" TIMESTAMPTZ NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "content_type" TEXT,
    "bytes" INTEGER,
    "storage_path" TEXT NOT NULL,

    CONSTRAINT "source_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_sources" (
    "service_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "relevance" "SourceRelevance" NOT NULL,

    CONSTRAINT "service_sources_pkey" PRIMARY KEY ("service_id","source_id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" "VerificationAction" NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_records" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "previous_entity_id" UUID,
    "change_type" "ChangeType" NOT NULL,
    "summary_km" TEXT,
    "summary_en" TEXT,
    "diff" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extraction_jobs" (
    "id" UUID NOT NULL,
    "source_snapshot_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "model_version" TEXT,
    "requested_by" UUID,
    "items_proposed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extraction_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ml_predictions" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "kind" "PredictionKind" NOT NULL,
    "model_version" TEXT NOT NULL,
    "score" REAL,
    "output" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ml_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklists" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" UUID NOT NULL,
    "checklist_id" UUID NOT NULL,
    "requirement_id" UUID,
    "step_id" UUID,
    "label_km" TEXT NOT NULL,
    "label_en" TEXT,
    "position" INTEGER NOT NULL,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "done_at" TIMESTAMPTZ,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "user_id" UUID,
    "kind" "FeedbackKind" NOT NULL,
    "rating" SMALLINT,
    "difficulty" SMALLINT,
    "found_needed" BOOLEAN,
    "outcome" "FeedbackOutcome",
    "confusing_step_id" UUID,
    "comment" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "services_slug_key" ON "services"("slug");

-- CreateIndex
CREATE INDEX "services_publish_status_idx" ON "services"("publish_status");

-- CreateIndex
CREATE INDEX "services_name_km_trgm_idx" ON "services" USING GIN ("name_km" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "services_name_en_trgm_idx" ON "services" USING GIN ("name_en" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "requirements_service_id_status_idx" ON "requirements"("service_id", "status");

-- CreateIndex
CREATE INDEX "requirements_text_km_trgm_idx" ON "requirements" USING GIN ("text_km" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "service_steps_service_id_status_idx" ON "service_steps"("service_id", "status");

-- CreateIndex
CREATE INDEX "fees_service_id_status_idx" ON "fees"("service_id", "status");

-- CreateIndex
CREATE INDEX "processing_times_service_id_status_idx" ON "processing_times"("service_id", "status");

-- CreateIndex
CREATE INDEX "service_locations_service_id_status_idx" ON "service_locations"("service_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "field_gaps_service_id_field_applies_to_source_id_key" ON "field_gaps"("service_id", "field", "applies_to", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "sources_code_key" ON "sources"("code");

-- CreateIndex
CREATE UNIQUE INDEX "source_snapshots_source_id_sha256_key" ON "source_snapshots"("source_id", "sha256");

-- CreateIndex
CREATE INDEX "verifications_entity_type_entity_id_idx" ON "verifications"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "change_records_service_id_created_at_idx" ON "change_records"("service_id", "created_at");

-- CreateIndex
CREATE INDEX "ml_predictions_service_id_kind_created_at_idx" ON "ml_predictions"("service_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "checklists_user_id_service_id_key" ON "checklists"("user_id", "service_id");

-- CreateIndex
CREATE INDEX "feedback_service_id_created_at_idx" ON "feedback"("service_id", "created_at");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_source_snapshot_id_fkey" FOREIGN KEY ("source_snapshot_id") REFERENCES "source_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_extraction_job_id_fkey" FOREIGN KEY ("extraction_job_id") REFERENCES "extraction_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_steps" ADD CONSTRAINT "service_steps_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_steps" ADD CONSTRAINT "service_steps_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "service_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_steps" ADD CONSTRAINT "service_steps_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_steps" ADD CONSTRAINT "service_steps_source_snapshot_id_fkey" FOREIGN KEY ("source_snapshot_id") REFERENCES "source_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_steps" ADD CONSTRAINT "service_steps_extraction_job_id_fkey" FOREIGN KEY ("extraction_job_id") REFERENCES "extraction_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fees" ADD CONSTRAINT "fees_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fees" ADD CONSTRAINT "fees_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fees" ADD CONSTRAINT "fees_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fees" ADD CONSTRAINT "fees_source_snapshot_id_fkey" FOREIGN KEY ("source_snapshot_id") REFERENCES "source_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fees" ADD CONSTRAINT "fees_extraction_job_id_fkey" FOREIGN KEY ("extraction_job_id") REFERENCES "extraction_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_times" ADD CONSTRAINT "processing_times_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_times" ADD CONSTRAINT "processing_times_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "processing_times"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_times" ADD CONSTRAINT "processing_times_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_times" ADD CONSTRAINT "processing_times_source_snapshot_id_fkey" FOREIGN KEY ("source_snapshot_id") REFERENCES "source_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_times" ADD CONSTRAINT "processing_times_extraction_job_id_fkey" FOREIGN KEY ("extraction_job_id") REFERENCES "extraction_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_locations" ADD CONSTRAINT "service_locations_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_locations" ADD CONSTRAINT "service_locations_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "service_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_locations" ADD CONSTRAINT "service_locations_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_locations" ADD CONSTRAINT "service_locations_source_snapshot_id_fkey" FOREIGN KEY ("source_snapshot_id") REFERENCES "source_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_locations" ADD CONSTRAINT "service_locations_extraction_job_id_fkey" FOREIGN KEY ("extraction_job_id") REFERENCES "extraction_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_gaps" ADD CONSTRAINT "field_gaps_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_gaps" ADD CONSTRAINT "field_gaps_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_sources" ADD CONSTRAINT "service_sources_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_sources" ADD CONSTRAINT "service_sources_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_records" ADD CONSTRAINT "change_records_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_jobs" ADD CONSTRAINT "extraction_jobs_source_snapshot_id_fkey" FOREIGN KEY ("source_snapshot_id") REFERENCES "source_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extraction_jobs" ADD CONSTRAINT "extraction_jobs_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ml_predictions" ADD CONSTRAINT "ml_predictions_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "service_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_confusing_step_id_fkey" FOREIGN KEY ("confusing_step_id") REFERENCES "service_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── Hand-written CHECK constraints (Prisma schema cannot express these) ──
-- Fees are in Cambodian riel or US dollars only, and never negative
ALTER TABLE "fees" ADD CONSTRAINT "fees_currency_check" CHECK ("currency" IN ('KHR', 'USD'));
ALTER TABLE "fees" ADD CONSTRAINT "fees_amount_check" CHECK ("amount" >= 0);

ALTER TABLE "processing_times" ADD CONSTRAINT "processing_times_days_check"
  CHECK (("min_days" IS NULL OR "min_days" >= 0)
     AND ("max_days" IS NULL OR "max_days" >= 0)
     AND ("min_days" IS NULL OR "max_days" IS NULL OR "min_days" <= "max_days"));

-- A checklist item points at exactly one requirement or one step
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_target_check"
  CHECK (("requirement_id" IS NULL) <> ("step_id" IS NULL));

-- Feedback scales are 1..5 and comments are bounded
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5);
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_difficulty_check" CHECK ("difficulty" IS NULL OR "difficulty" BETWEEN 1 AND 5);
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_comment_length_check" CHECK ("comment" IS NULL OR char_length("comment") <= 1000);

-- Khmer first: nothing can be public without Khmer text (also checked in the app)
ALTER TABLE "services" ADD CONSTRAINT "services_published_name_km_check" CHECK ("publish_status" <> 'PUBLISHED' OR "name_km" IS NOT NULL);
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_verified_km_check" CHECK ("status" <> 'VERIFIED' OR "text_km" IS NOT NULL);
ALTER TABLE "service_steps" ADD CONSTRAINT "service_steps_verified_km_check" CHECK ("status" <> 'VERIFIED' OR "title_km" IS NOT NULL);
ALTER TABLE "fees" ADD CONSTRAINT "fees_verified_km_check" CHECK ("status" <> 'VERIFIED' OR "label_km" IS NOT NULL);
ALTER TABLE "processing_times" ADD CONSTRAINT "processing_times_verified_km_check" CHECK ("status" <> 'VERIFIED' OR "text_km" IS NOT NULL);
ALTER TABLE "service_locations" ADD CONSTRAINT "service_locations_verified_km_check" CHECK ("status" <> 'VERIFIED' OR "name_km" IS NOT NULL);
