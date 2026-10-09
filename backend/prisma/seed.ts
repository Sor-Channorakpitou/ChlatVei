/**
 * Imports the Phase 2 dataset (data/metadata, data/processed/annotations) into the database.
 *
 * Rules (docs/architecture/02_data_model.md#seeding-from-phase-2-data):
 * - Everything is imported as DRAFT / PENDING. The seed NEVER marks anything VERIFIED;
 *   an admin approves imported content through the review queue like any other change.
 * - Re-running is safe: rows are matched by natural keys and not duplicated.
 *
 * Usage: npm run seed   (uses DATABASE_URL)
 */
import { ContentStatus, GapField, GovernmentLevel, Language, PrismaClient, RequirementKind, SourceRelevance, SourceTier, SourceType } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCsv } from './csv';

const DATA = join(__dirname, '..', '..', 'data');
const prisma = new PrismaClient();

const readCsv = (relative: string) => parseCsv(readFileSync(join(DATA, relative), 'utf-8'));

/**
 * Category labels for the UI. These are interface labels, not government facts.
 * The Khmer wording should be reviewed by a native speaker.
 */
const CATEGORIES: Record<string, { km: string; en: string; position: number }> = {
  identity: { km: 'អត្តសញ្ញាណ', en: 'Identity', position: 1 },
  identity_travel: { km: 'អត្តសញ្ញាណ និងការធ្វើដំណើរ', en: 'Identity and travel', position: 2 },
  civil_status: { km: 'អត្រានុកូលដ្ឋាន', en: 'Civil status', position: 3 },
  transport: { km: 'ការដឹកជញ្ជូន', en: 'Transport', position: 4 },
  business: { km: 'អាជីវកម្ម', en: 'Business', position: 5 },
  visa: { km: 'ទិដ្ឋាការ', en: 'Visa', position: 6 },
  local_administration: { km: 'រដ្ឋបាលមូលដ្ឋាន', en: 'Local administration', position: 7 },
};

const LEVEL: Record<string, GovernmentLevel> = { national: 'NATIONAL', provincial: 'PROVINCIAL', district: 'DISTRICT', commune: 'COMMUNE' };
const SOURCE_TYPE: Record<string, SourceType> = { web_page: 'WEB_PAGE', pdf: 'PDF', law_record: 'LAW_RECORD' };
const RELEVANCE: Record<string, SourceRelevance> = { primary: 'PRIMARY', supporting: 'SUPPORTING', legal_basis: 'LEGAL_BASIS', context: 'CONTEXT' };
const GAP_FIELD: Record<string, GapField> = {
  eligibility: 'ELIGIBILITY', required_document: 'DOCUMENTS', step: 'STEPS', fee: 'FEES', processing_time: 'PROCESSING_TIME', location: 'LOCATIONS',
};
const REQUIREMENT_KIND: Record<string, RequirementKind> = {
  required_document: 'DOCUMENT', eligibility: 'ELIGIBILITY', condition: 'CONDITION', validity: 'CONDITION',
};

async function main() {
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);

  // ── Categories and services ────────────────────────────────────────────
  const services = readCsv('metadata/services.csv');
  const namesKm = new Map(readCsv('metadata/service_names_km.csv').map((r) => [r.service_slug, r.name_km]));
  const categoryIds = new Map<string, string>();
  for (const slug of new Set(services.map((s) => s.category))) {
    const c = CATEGORIES[slug];
    if (!c) throw new Error(`No label for category "${slug}"; add it to CATEGORIES`);
    const row = await prisma.category.upsert({
      where: { slug },
      create: { slug, nameKm: c.km, nameEn: c.en, position: c.position },
      update: { nameKm: c.km, nameEn: c.en, position: c.position },
    });
    categoryIds.set(slug, row.id);
  }

  const serviceIds = new Map<string, string>();
  for (const s of services) {
    const data = {
      nameEn: s.name_en,
      categoryId: categoryIds.get(s.category)!,
      responsibleBodyEn: s.responsible_body,
      governmentLevel: LEVEL[s.government_level] ?? 'NATIONAL',
    };
    const row = await prisma.service.upsert({
      where: { slug: s.service_slug },
      // Only Khmer names quoted from official pages are imported; others are added by an admin.
      create: { slug: s.service_slug, ...data, nameKm: namesKm.get(s.service_slug) ?? null, publishStatus: 'DRAFT' },
      update: data,
    });
    serviceIds.set(s.service_slug, row.id);
    bump('services');
  }

  // ── Sources, snapshots, links ──────────────────────────────────────────
  const sourceIds = new Map<string, string>();
  for (const s of readCsv('metadata/sources.csv')) {
    const data = {
      url: s.url, name: s.source_name, publisher: s.publisher,
      sourceType: SOURCE_TYPE[s.source_type], tier: s.tier as SourceTier, language: s.language as Language,
      notes: s.notes || null,
    };
    // New sources start PENDING; an existing source keeps the status an admin gave it.
    const row = await prisma.source.upsert({ where: { code: s.source_id }, create: { code: s.source_id, ...data, status: 'PENDING' }, update: data });
    sourceIds.set(s.source_id, row.id);
    bump('sources');
  }

  const snapshotIds = new Map<string, string>(); // "S001/2026-10-08.html" -> id
  for (const log of readCsv('metadata/collection_log.csv')) {
    if (!log.raw_path || !log.sha256) continue;
    const sourceId = sourceIds.get(log.source_id);
    if (!sourceId) continue;
    const row = await prisma.sourceSnapshot.upsert({
      where: { sourceId_sha256: { sourceId, sha256: log.sha256 } },
      create: {
        sourceId, sha256: log.sha256, storagePath: log.raw_path, collectedAt: new Date(log.collected_at),
        contentType: log.content_type || null, bytes: log.bytes ? Number(log.bytes) : null,
      },
      update: {},
    });
    snapshotIds.set(`${log.source_id}/${log.raw_path.split('/').pop()}`, row.id);
    await prisma.source.update({ where: { id: sourceId }, data: { lastCheckedAt: new Date(log.collected_at) } });
    bump('snapshots');
  }

  for (const link of readCsv('metadata/service_sources.csv')) {
    const serviceId = serviceIds.get(link.service_slug)!;
    const sourceId = sourceIds.get(link.source_id)!;
    await prisma.serviceSource.upsert({
      where: { serviceId_sourceId: { serviceId, sourceId } },
      create: { serviceId, sourceId, relevance: RELEVANCE[link.relevance] },
      update: { relevance: RELEVANCE[link.relevance] },
    });
    bump('serviceSources');
  }

  // ── Annotated facts → PENDING content and field gaps ───────────────────
  const stepPosition = new Map<string, number>();
  const PENDING: ContentStatus = 'PENDING';
  for (const f of readCsv('processed/annotations/service_facts.csv')) {
    const serviceId = serviceIds.get(f.service_slug)!;
    const sourceId = sourceIds.get(f.source_id)!;
    const sourceSnapshotId = snapshotIds.get(`${f.source_id}/${f.snapshot}`) ?? null;

    if (f.status === 'not_stated') {
      const field = GAP_FIELD[f.field];
      if (!field) continue;
      await prisma.fieldGap.upsert({
        where: { serviceId_field_appliesTo_sourceId: { serviceId, field, appliesTo: f.applies_to, sourceId } },
        create: { serviceId, field, appliesTo: f.applies_to, sourceId },
        update: {},
      });
      bump('fieldGaps');
      continue;
    }

    const meta = { serviceId, sourceId, sourceSnapshotId, evidence: f.evidence, status: PENDING, origin: 'IMPORTED' as const };
    // Idempotency: the same evidence for the same service and field is imported once.
    const already = { serviceId, evidence: f.evidence, origin: 'IMPORTED' as const };
    const appliesTo = f.applies_to || null;

    switch (f.field) {
      case 'required_document':
      case 'eligibility':
      case 'condition':
      case 'validity': {
        const kind = REQUIREMENT_KIND[f.field];
        if (await prisma.requirement.findFirst({ where: { ...already, kind, textEn: f.value } })) break;
        await prisma.requirement.create({ data: { ...meta, kind, textEn: f.value, appliesTo } });
        bump('requirements');
        break;
      }
      case 'step': {
        const position = (stepPosition.get(f.service_slug) ?? 0) + 1;
        stepPosition.set(f.service_slug, position);
        if (await prisma.serviceStep.findFirst({ where: { ...already, titleEn: f.value } })) break;
        await prisma.serviceStep.create({ data: { ...meta, position, titleEn: f.value, appliesTo } });
        bump('steps');
        break;
      }
      case 'fee': {
        if (await prisma.fee.findFirst({ where: { ...already, appliesTo } })) break;
        await prisma.fee.create({ data: { ...meta, amount: f.amount, currency: f.currency, labelEn: f.value, appliesTo } });
        bump('fees');
        break;
      }
      case 'processing_time': {
        if (await prisma.processingTime.findFirst({ where: { ...already, textEn: f.value } })) break;
        await prisma.processingTime.create({ data: { ...meta, textEn: f.value, appliesTo } });
        bump('processingTimes');
        break;
      }
      case 'location': {
        if (await prisma.serviceLocation.findFirst({ where: { ...already, nameEn: f.value } })) break;
        const online = /^online/i.test(f.value);
        await prisma.serviceLocation.create({ data: { ...meta, nameEn: f.value, channel: online ? 'ONLINE' : 'IN_PERSON', appliesTo } });
        bump('locations');
        break;
      }
      default:
        // `contact` facts (hotline, hours) have no table yet; see docs/backend/README.md.
        bump(`skipped:${f.field}`);
    }
  }

  console.log('Seed complete (nothing was marked VERIFIED):', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
