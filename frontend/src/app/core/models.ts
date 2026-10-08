/** Types for the ChlatVei API (docs/architecture/03_api_spec.md). */

export type Role = 'CITIZEN' | 'ADMIN';
export type Lang = 'km' | 'en';
export type ContentStatus = 'PENDING' | 'UNDER_REVIEW' | 'VERIFIED' | 'REJECTED' | 'OUTDATED';
export type ContentType = 'requirements' | 'steps' | 'fees' | 'processing-times' | 'locations';

export interface Page<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
export interface One<T> {
  data: T;
}
export interface ApiError {
  error: { code: string; message: string; details?: { field?: string; issue: string }[]; requestId?: string };
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  preferredLanguage: Lang;
}

export interface SourceRef {
  code: string;
  name: string;
  url: string;
  tier: 'T1' | 'T2' | 'T3';
}

export interface Category {
  id?: string;
  slug: string;
  nameKm: string;
  nameEn: string | null;
}

export interface ServiceSummary {
  id: string;
  slug: string;
  nameKm: string | null;
  nameEn: string | null;
  summaryKm: string | null;
  summaryEn: string | null;
  governmentLevel: string;
  lastVerifiedAt: string | null;
  category: Category;
  publishStatus?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

interface PublicMeta {
  id: string;
  appliesTo: string | null;
  verifiedAt: string | null;
  source: SourceRef | null;
}

export interface Requirement extends PublicMeta {
  kind: 'DOCUMENT' | 'ELIGIBILITY' | 'CONDITION';
  textKm: string;
  textEn: string | null;
  position: number;
}
export interface Step extends PublicMeta {
  position: number;
  titleKm: string;
  titleEn: string | null;
  detailKm: string | null;
  detailEn: string | null;
}
export interface Fee extends PublicMeta {
  amount: string;
  currency: 'KHR' | 'USD';
  labelKm: string;
  labelEn: string | null;
}
export interface ProcessingTime extends PublicMeta {
  minDays: number | null;
  maxDays: number | null;
  textKm: string;
  textEn: string | null;
}
export interface Location extends PublicMeta {
  nameKm: string;
  nameEn: string | null;
  addressKm: string | null;
  addressEn: string | null;
  channel: 'IN_PERSON' | 'ONLINE';
  url: string | null;
  phone: string | null;
  hoursText: string | null;
}

export type GapField = 'ELIGIBILITY' | 'DOCUMENTS' | 'STEPS' | 'FEES' | 'PROCESSING_TIME' | 'LOCATIONS';

export interface ServiceDetail extends ServiceSummary {
  responsibleBodyKm: string | null;
  responsibleBodyEn: string | null;
  requirements: Requirement[];
  steps: Step[];
  fees: Fee[];
  processingTimes: ProcessingTime[];
  locations: Location[];
  notStated: { field: GapField; appliesTo: string | null; checkedAt: string; source: SourceRef }[];
  sources: (SourceRef & { publisher: string; lastCheckedAt: string | null; relevance: string })[];
  complexity: { score: number | null; modelVersion: string; createdAt: string; output: ComplexityOutput } | null;
}

export type ComplexityFactorName = 'documents' | 'steps' | 'fee_tiers' | 'max_fee_khr' | 'conditions' | 'information_gaps';
export interface ComplexityOutput {
  factors: { name: ComplexityFactorName; cost: 'compliance' | 'learning'; contribution: number }[];
  features: Record<ComplexityFactorName, number>;
}

export interface SearchHit extends ServiceSummary {
  score: number;
  matchedBy: 'keyword' | 'similarity';
}

export interface ChecklistItem {
  id: string;
  labelKm: string;
  labelEn: string | null;
  position: number;
  isDone: boolean;
  kind: 'DOCUMENT' | 'STEP';
  contentChanged: boolean;
}
export interface Checklist {
  id: string;
  createdAt: string;
  completedAt: string | null;
  service: { slug: string; nameKm: string | null; nameEn: string | null };
  progress: { done: number; total: number };
  items?: ChecklistItem[];
}

export interface ReviewItem {
  contentType: ContentType;
  id: string;
  status: ContentStatus;
  origin: 'MANUAL' | 'IMPORTED' | 'EXTRACTED';
  confidence: number | null;
  label: { km: string | null; en: string | null };
  values: Record<string, unknown>;
  evidence: string | null;
  service: { id: string; slug: string; nameKm: string | null; nameEn: string | null };
  source: { id: string; code: string; name: string; url: string; tier: string; status: ContentStatus } | null;
  replaces: { id: string; values: Record<string, unknown> } | null;
  createdAt: string;
}

export interface Source {
  id: string;
  code: string;
  url: string;
  name: string;
  publisher: string;
  sourceType: string;
  tier: 'T1' | 'T2' | 'T3';
  language: Lang;
  status: ContentStatus;
  lastCheckedAt: string | null;
  notes: string | null;
  _count?: { snapshots: number; services: number };
}

export interface Overview {
  services: { byStatus: Record<string, number | undefined>; byCategory: { slug: string; nameKm: string; nameEn: string; count: number }[]; notVerifiedIn180Days: number };
  sources: Record<string, number | undefined>;
  content: { byStatus: Record<string, number | undefined>; pendingReview: number; outdated: number };
  feedback: { open: number };
  recentChanges: { id: string; changeType: string; entityType: string; summaryKm: string | null; summaryEn: string | null; createdAt: string; service: { slug: string; nameKm: string | null } }[];
}

export interface FeedbackAnalytics {
  byService: { service?: { slug: string; nameKm: string | null; nameEn: string | null }; responses: number; avgRating: number | null; avgDifficulty: number | null }[];
  confusingSteps: {
    step: { id: string; position: number; titleKm: string; titleEn: string | null };
    service?: { slug: string; nameKm: string | null; nameEn: string | null };
    reports: number;
    responses: number;
    confusionRate: { rate: number; low: number; high: number };
  }[];
  note: string;
}
