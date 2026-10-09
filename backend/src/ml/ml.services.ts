import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GapField, Prisma } from '@prisma/client';
import { readFile } from 'fs/promises';
import { basename, join, resolve } from 'path';
import { AuditService } from '../audit/audit.service';
import { RequestMeta } from '../common/auth.decorators';
import { AppException, BusinessRuleError, NotFoundError } from '../common/errors/app-exceptions';
import { PrismaService } from '../prisma/prisma.service';
import { ComplexityFeatures, MlClient } from './ml.client';

const VERIFIED = { status: 'VERIFIED' } as const;
/** Core information fields; a field with no verified content counts as an information gap. */
const CORE_FIELDS: GapField[] = ['ELIGIBILITY', 'DOCUMENTS', 'STEPS', 'FEES', 'PROCESSING_TIME', 'LOCATIONS'];

class MlUnavailableError extends AppException {
  constructor() {
    super(503, 'DEPENDENCY_UNAVAILABLE', 'The ML service is not available right now; try again later');
  }
}

/**
 * Complexity scores (RQ1 baseline) computed from VERIFIED content only, so the
 * score always describes what citizens actually see. Each run is stored with its
 * model version and inputs, so a score can always be traced and reproduced.
 */
@Injectable()
export class ComplexityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ml: MlClient,
  ) {}

  async features(serviceId: string): Promise<ComplexityFeatures> {
    const [requirements, steps, fees, times, locations] = await Promise.all([
      this.prisma.requirement.findMany({ where: { serviceId, ...VERIFIED }, select: { kind: true } }),
      this.prisma.serviceStep.count({ where: { serviceId, ...VERIFIED } }),
      this.prisma.fee.findMany({ where: { serviceId, ...VERIFIED }, select: { amount: true, currency: true } }),
      this.prisma.processingTime.count({ where: { serviceId, ...VERIFIED } }),
      this.prisma.serviceLocation.count({ where: { serviceId, ...VERIFIED } }),
    ]);
    const documents = requirements.filter((r) => r.kind === 'DOCUMENT').length;
    const eligibility = requirements.filter((r) => r.kind === 'ELIGIBILITY').length;
    const conditions = requirements.filter((r) => r.kind !== 'DOCUMENT').length;
    const present: Record<GapField, boolean> = {
      ELIGIBILITY: eligibility > 0,
      DOCUMENTS: documents > 0,
      STEPS: steps > 0,
      FEES: fees.length > 0,
      PROCESSING_TIME: times > 0,
      LOCATIONS: locations > 0,
    };
    const khr = fees.filter((f) => f.currency === 'KHR').map((f) => Number(f.amount));
    return {
      documents,
      steps,
      fee_tiers: fees.length,
      max_fee_khr: khr.length ? Math.max(...khr) : 0,
      conditions,
      information_gaps: CORE_FIELDS.filter((f) => !present[f]).length,
    };
  }

  async recompute(serviceId: string) {
    const service = await this.prisma.service.findUnique({ where: { id: serviceId }, select: { id: true } });
    if (!service) throw new NotFoundError('Service');
    const features = await this.features(serviceId);
    const result = await this.ml.predictComplexity(features);
    if (!result) throw new MlUnavailableError();
    return this.prisma.mlPrediction.create({
      data: {
        serviceId,
        kind: 'COMPLEXITY',
        modelVersion: result.modelVersion,
        score: result.score,
        output: { factors: result.factors, features } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /** Recomputes every published service; returns how many succeeded. */
  async recomputeAll(): Promise<{ updated: number; failed: number }> {
    const services = await this.prisma.service.findMany({ where: { publishStatus: 'PUBLISHED' }, select: { id: true } });
    let updated = 0;
    let failed = 0;
    for (const s of services) {
      try {
        await this.recompute(s.id);
        updated++;
      } catch {
        failed++;
      }
    }
    return { updated, failed };
  }

  /** Latest score per service, for the admin analytics view. */
  async latest() {
    const rows = await this.prisma.mlPrediction.findMany({
      where: { kind: 'COMPLEXITY' },
      orderBy: { createdAt: 'desc' },
      include: { service: { select: { id: true, slug: true, nameKm: true, nameEn: true, publishStatus: true } } },
    });
    const seen = new Set<string>();
    return rows
      .filter((r) => (seen.has(r.serviceId) ? false : (seen.add(r.serviceId), true)))
      .map((r) => ({ service: r.service, score: r.score, modelVersion: r.modelVersion, output: r.output, createdAt: r.createdAt }))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }
}

/**
 * Extraction jobs (RQ2): run the ML extractor on a collected source snapshot and
 * put every finding into the review queue as PENDING / EXTRACTED content with the
 * matched text as evidence. Nothing extracted is ever published automatically.
 */
@Injectable()
export class ExtractionService {
  private readonly dataDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ml: MlClient,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.dataDir = resolve(process.cwd(), config.get<string>('DATA_DIR') ?? '../data');
  }

  async run(input: { sourceId: string; serviceId: string; snapshotId?: string }, actorId: string, meta: RequestMeta) {
    const source = await this.prisma.source.findUnique({ where: { id: input.sourceId } });
    if (!source) throw new NotFoundError('Source');
    const link = await this.prisma.serviceSource.findUnique({ where: { serviceId_sourceId: { serviceId: input.serviceId, sourceId: input.sourceId } } });
    if (!link) throw new BusinessRuleError('This source is not linked to that service');
    const snapshot = input.snapshotId
      ? await this.prisma.sourceSnapshot.findFirst({ where: { id: input.snapshotId, sourceId: source.id } })
      : await this.prisma.sourceSnapshot.findFirst({ where: { sourceId: source.id }, orderBy: { collectedAt: 'desc' } });
    if (!snapshot) throw new BusinessRuleError('This source has no collected snapshot yet');

    const job = await this.prisma.extractionJob.create({
      data: { sourceSnapshotId: snapshot.id, serviceId: input.serviceId, requestedById: actorId, status: 'RUNNING', startedAt: new Date() },
    });

    const text = await this.readText(source.code, snapshot.storagePath);
    const result = text ? await this.ml.extract(text) : null;
    if (!result) {
      const error = text ? 'ML service unavailable' : 'Extracted text for this snapshot was not found';
      return this.prisma.extractionJob.update({ where: { id: job.id }, data: { status: 'FAILED', error, finishedAt: new Date() } });
    }

    let proposed = 0;
    await this.prisma.$transaction(async (tx) => {
      const base = {
        serviceId: input.serviceId,
        sourceId: source.id,
        sourceSnapshotId: snapshot.id,
        extractionJobId: job.id,
        status: 'PENDING' as const,
        origin: 'EXTRACTED' as const,
        confidence: result.confidence,
        createdById: actorId,
      };
      for (const fee of result.fees) {
        if (await this.alreadyProposed(tx, 'fee', input.serviceId, fee.text)) continue;
        await tx.fee.create({ data: { ...base, amount: fee.amount, currency: fee.currency, labelEn: 'Fee found on the official page', evidence: fee.text } });
        proposed++;
      }
      for (const doc of result.documents) {
        if (await this.alreadyProposed(tx, 'requirement', input.serviceId, doc)) continue;
        const khmer = /[ក-៿]/.test(doc);
        await tx.requirement.create({ data: { ...base, kind: 'DOCUMENT', ...(khmer ? { textKm: doc } : { textEn: doc }), evidence: doc } });
        proposed++;
      }
      await tx.extractionJob.update({
        where: { id: job.id },
        data: { status: 'SUCCEEDED', modelVersion: result.modelVersion, itemsProposed: proposed, finishedAt: new Date() },
      });
      await this.audit.record(
        { actorId, action: 'extraction.run', entityType: 'EXTRACTION_JOB', entityId: job.id, metadata: { sourceId: source.id, proposed }, meta },
        tx,
      );
    });
    return this.get(job.id);
  }

  async get(id: string) {
    const job = await this.prisma.extractionJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundError('Extraction job');
    return job;
  }

  /** Skip findings already in the system for this service (any status except REJECTED). */
  private async alreadyProposed(tx: Prisma.TransactionClient, kind: 'fee' | 'requirement', serviceId: string, evidence: string): Promise<boolean> {
    const where = { serviceId, evidence, status: { not: 'REJECTED' as const } };
    return kind === 'fee' ? (await tx.fee.count({ where })) > 0 : (await tx.requirement.count({ where })) > 0;
  }

  /**
   * Reads data/processed/text/<code>/<snapshot>.txt. Both parts come from the database and are
   * reduced to safe file names, so a crafted value cannot point outside DATA_DIR.
   */
  private async readText(code: string, storagePath: string): Promise<string | null> {
    if (!/^S\d+$/.test(code)) return null;
    const stem = basename(storagePath).replace(/\.[^.]+$/, '');
    if (!/^[\w.-]+$/.test(stem)) return null;
    try {
      return await readFile(join(this.dataDir, 'processed', 'text', code, `${stem}.txt`), 'utf-8');
    } catch {
      return null;
    }
  }
}
