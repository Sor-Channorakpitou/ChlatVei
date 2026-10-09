import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MlSearchCandidate {
  id: string;
  name: string;
  text: string;
}
export interface MlSearchResult {
  results: { id: string; score: number }[];
  modelVersion: string;
}
export interface MlExtraction {
  fees: { amount: number; currency: string; text: string }[];
  documents: string[];
  confidence: number;
  modelVersion: string;
}
export interface ComplexityFeatures {
  documents: number;
  steps: number;
  fee_tiers: number;
  max_fee_khr: number;
  conditions: number;
  information_gaps: number;
}
export interface MlComplexity {
  score: number;
  factors: { name: string; cost: string; contribution: number }[];
  modelVersion: string;
}

/**
 * HTTP client for the internal ML service (ADR-001, Phase 7).
 *
 * Every call has a timeout and returns `null` on any failure (not configured,
 * down, slow, bad response). Callers must handle `null` with a fallback, so the
 * application keeps working without ML (architecture design driver 5).
 */
@Injectable()
export class MlClient {
  private readonly logger = new Logger('MlClient');
  private readonly baseUrl: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('ML_SERVICE_URL')?.replace(/\/+$/, '') || undefined;
    this.apiKey = config.get<string>('ML_API_KEY') || undefined;
    this.timeoutMs = Number(config.get('ML_TIMEOUT_MS') ?? 3000);
  }

  get enabled(): boolean {
    return this.baseUrl !== undefined;
  }

  searchSimilar(query: string, candidates: MlSearchCandidate[], topK = 10): Promise<MlSearchResult | null> {
    return this.post<MlSearchResult>('/search/similar', { query, candidates, topK });
  }

  extract(text: string): Promise<MlExtraction | null> {
    return this.post<MlExtraction>('/extract', { text }, 15_000);
  }

  predictComplexity(features: ComplexityFeatures): Promise<MlComplexity | null> {
    return this.post<MlComplexity>('/predict-complexity', { features });
  }

  private async post<T>(path: string, body: unknown, timeoutMs = this.timeoutMs): Promise<T | null> {
    if (!this.baseUrl) return null;
    const started = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(this.apiKey ? { 'x-internal-key': this.apiKey } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        this.logger.warn({ path, status: res.status, ms: Date.now() - started }, 'ML service returned an error; using fallback');
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      this.logger.warn({ path, ms: Date.now() - started, error: (err as Error).name }, 'ML service unavailable; using fallback');
      return null;
    }
  }
}
