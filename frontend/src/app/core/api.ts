import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import {
  AdminUser, Category, ChangeRecord, Checklist, ComplexityRow, ContentType, ExtractionJob, FeedbackAnalytics, FeedbackItem,
  FeedbackStatus, One, Overview, Page, ReviewItem, Role, SearchHit, ServiceDetail, ServiceSummary, Source, SourceDetail,
} from './models';

type Params = Record<string, string | number | boolean | undefined>;

function params(p: Params = {}): HttpParams {
  let hp = new HttpParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== '') hp = hp.set(k, String(v));
  return hp;
}

const data = <T>(o: Observable<One<T>>) => o.pipe(map((r) => r.data));

export interface FeedbackInput {
  serviceSlug: string;
  kind: 'RATING' | 'REPORT_UNCLEAR' | 'REPORT_OUTDATED';
  rating?: number;
  difficulty?: number;
  outcome?: string;
  confusingStepId?: string;
  comment?: string;
}

/**
 * Thin, typed wrapper around the REST API (docs/architecture/03_api_spec.md).
 * No business rules here: the backend decides what is allowed.
 */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  // ─── Public catalogue ────────────────────────────────────────────────
  categories(): Observable<Category[]> {
    return data(this.http.get<One<Category[]>>('/api/categories'));
  }
  services(p: { category?: string; page?: number; pageSize?: number } = {}): Observable<Page<ServiceSummary>> {
    return this.http.get<Page<ServiceSummary>>('/api/services', { params: params(p) });
  }
  service(slug: string): Observable<ServiceDetail> {
    return data(this.http.get<One<ServiceDetail>>(`/api/services/${encodeURIComponent(slug)}`));
  }
  changes(slug: string): Observable<ChangeRecord[]> {
    return data(this.http.get<One<ChangeRecord[]>>(`/api/services/${encodeURIComponent(slug)}/changes`));
  }
  search(q: string): Observable<SearchHit[]> {
    return data(this.http.get<One<SearchHit[]>>('/api/search', { params: params({ q }) }));
  }

  // ─── Citizen ─────────────────────────────────────────────────────────
  checklists(): Observable<Checklist[]> {
    return data(this.http.get<One<Checklist[]>>('/api/checklists'));
  }
  checklist(id: string): Observable<Checklist> {
    return data(this.http.get<One<Checklist>>(`/api/checklists/${id}`));
  }
  createChecklist(serviceSlug: string): Observable<Checklist> {
    return data(this.http.post<One<Checklist>>('/api/checklists', { serviceSlug }));
  }
  setChecklistItem(id: string, itemId: string, isDone: boolean): Observable<Checklist> {
    return data(this.http.patch<One<Checklist>>(`/api/checklists/${id}/items/${itemId}`, { isDone }));
  }
  deleteChecklist(id: string): Observable<void> {
    return this.http.delete<void>(`/api/checklists/${id}`);
  }
  sendFeedback(input: FeedbackInput): Observable<{ id: string }> {
    return data(this.http.post<One<{ id: string }>>('/api/feedback', input));
  }

  // ─── Admin ───────────────────────────────────────────────────────────
  reviewQueue(p: { page?: number; pageSize?: number; service?: string; origin?: string } = {}): Observable<Page<ReviewItem>> {
    return this.http.get<Page<ReviewItem>>('/api/admin/review', { params: params({ pageSize: 100, ...p }) });
  }
  updateContent(type: ContentType, id: string, patch: Record<string, unknown>): Observable<unknown> {
    return data(this.http.patch<One<unknown>>(`/api/admin/content/${type}/${id}`, patch));
  }
  approve(type: ContentType, id: string, comment?: string): Observable<unknown> {
    return data(this.http.post<One<unknown>>(`/api/admin/review/${type}/${id}/approve`, comment ? { comment } : {}));
  }
  reject(type: ContentType, id: string, comment: string): Observable<unknown> {
    return data(this.http.post<One<unknown>>(`/api/admin/review/${type}/${id}/reject`, { comment }));
  }
  overview(): Observable<Overview> {
    return data(this.http.get<One<Overview>>('/api/admin/analytics/overview'));
  }
  feedbackAnalytics(): Observable<FeedbackAnalytics> {
    return data(this.http.get<One<FeedbackAnalytics>>('/api/admin/analytics/feedback'));
  }
  sources(p: { page?: number; pageSize?: number; status?: string } = {}): Observable<Page<Source>> {
    return this.http.get<Page<Source>>('/api/sources', { params: params({ pageSize: 100, ...p }) });
  }
  decideSource(id: string, status: 'VERIFIED' | 'REJECTED' | 'OUTDATED', comment?: string): Observable<Source> {
    return data(this.http.post<One<Source>>(`/api/sources/${id}/decision`, { status, comment }));
  }
  source(id: string): Observable<SourceDetail> {
    return data(this.http.get<One<SourceDetail>>(`/api/sources/${id}`));
  }

  adminServices(): Observable<Page<ServiceSummary>> {
    return this.http.get<Page<ServiceSummary>>('/api/admin/services', { params: params({ pageSize: 100 }) });
  }
  updateService(id: string, patch: { nameKm?: string; publishStatus?: string }): Observable<ServiceSummary> {
    return data(this.http.patch<One<ServiceSummary>>(`/api/admin/services/${id}`, patch));
  }

  // ─── Admin: Phase 8 ──────────────────────────────────────────────────
  runExtraction(sourceId: string, serviceId: string): Observable<ExtractionJob> {
    return data(this.http.post<One<ExtractionJob>>('/api/admin/extraction-jobs', { sourceId, serviceId }));
  }
  complexity(): Observable<ComplexityRow[]> {
    return data(this.http.get<One<ComplexityRow[]>>('/api/admin/analytics/complexity'));
  }
  recomputeComplexity(): Observable<{ updated: number; failed: number }> {
    return data(this.http.post<One<{ updated: number; failed: number }>>('/api/admin/analytics/complexity/recompute', {}));
  }
  feedbackList(p: { status?: string; kind?: string; page?: number; pageSize?: number } = {}): Observable<Page<FeedbackItem>> {
    return this.http.get<Page<FeedbackItem>>('/api/feedback', { params: params({ pageSize: 50, ...p }) });
  }
  setFeedbackStatus(id: string, status: FeedbackStatus): Observable<{ id: string; status: FeedbackStatus }> {
    return data(this.http.patch<One<{ id: string; status: FeedbackStatus }>>(`/api/feedback/${id}`, { status }));
  }
  users(p: { q?: string; role?: string; page?: number; pageSize?: number } = {}): Observable<Page<AdminUser>> {
    return this.http.get<Page<AdminUser>>('/api/admin/users', { params: params({ pageSize: 50, ...p }) });
  }
  updateUser(id: string, patch: { role?: Role; isActive?: boolean }): Observable<AdminUser> {
    return data(this.http.patch<One<AdminUser>>(`/api/admin/users/${id}`, patch));
  }
}
