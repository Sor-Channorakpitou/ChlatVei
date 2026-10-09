import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { mkdirSync, writeFileSync } from 'fs';
import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { join } from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { MlClient } from '../src/ml/ml.client';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, resetDb, userWithToken } from './helpers';

type Mode = 'ok' | 'error' | 'slow';

/** A stand-in for the Python ML service whose behaviour each test controls. */
class FakeMl {
  mode: Mode = 'ok';
  topId = '';
  lastBody: Record<string, any> = {};
  server: Server;

  async start(): Promise<string> {
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        this.lastBody = raw ? JSON.parse(raw) : {};
        const send = (status: number, body: unknown) => {
          res.writeHead(status, { 'content-type': 'application/json' });
          res.end(JSON.stringify(body));
        };
        if (this.mode === 'error') return send(500, { detail: 'boom' });
        const respond = () => {
          if (req.url === '/search/similar') return send(200, { results: [{ id: this.topId, score: 0.9 }], modelVersion: 'search-test' });
          if (req.url === '/predict-complexity')
            return send(200, { score: 42, factors: [{ name: 'documents', cost: 'compliance', contribution: 30 }, { name: 'steps', cost: 'compliance', contribution: 12 }], modelVersion: 'complexity-test' });
          if (req.url === '/extract')
            return send(200, { fees: [{ amount: 30000, currency: 'KHR', text: '30,000 Riels' }], documents: ['Passport'], confidence: 1, modelVersion: 'extract-test' });
          send(404, {});
        };
        if (this.mode === 'slow') setTimeout(respond, 1500);
        else respond();
      });
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }
}

describe('ML integration (search, complexity, extraction) with fallbacks', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  const fake = new FakeMl();
  let serviceId: string;
  let sourceId: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const url = await fake.start();
    const fakeConfig = { get: (key: string) => ({ ML_SERVICE_URL: url, ML_TIMEOUT_MS: 500 } as Record<string, unknown>)[key] } as ConfigService;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MlClient)
      .useValue(new MlClient(fakeConfig))
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await resetDb(prisma);
    admin = (await userWithToken(app, prisma, 'ADMIN')).token;

    // A published service with one verified document, cited from a verified source.
    const category = await prisma.category.create({ data: { slug: 'transport', nameKm: 'ការដឹកជញ្ជូន', nameEn: 'Transport' } });
    const source = await prisma.source.create({
      data: { code: 'S900', url: 'https://example.gov.kh/x', name: 'Test page', publisher: 'Test ministry', sourceType: 'WEB_PAGE', tier: 'T1', language: 'en', status: 'VERIFIED' },
    });
    sourceId = source.id;
    const service = await prisma.service.create({
      data: { slug: 'driver_license_ab', categoryId: category.id, nameKm: 'ផ្តល់បណ្ណបើកបរ', nameEn: "Driver's license", publishStatus: 'PUBLISHED' },
    });
    serviceId = service.id;
    await prisma.requirement.create({
      data: { serviceId, kind: 'DOCUMENT', textKm: 'អត្តសញ្ញាណបណ្ណ', textEn: 'National identity card', status: 'VERIFIED', sourceId, evidence: 'ID card' },
    });
    await prisma.serviceSource.create({ data: { serviceId, sourceId, relevance: 'PRIMARY' } });
    fake.topId = serviceId;
  });

  afterAll(async () => {
    await app.close();
    fake.server.close();
  });

  beforeEach(() => (fake.mode = 'ok'));

  it('search uses the ML ranking when the ML service answers', async () => {
    const res = await http().get('/api/search').query({ q: 'something only the model understands' }).expect(200);
    expect(res.body.data).toEqual([expect.objectContaining({ slug: 'driver_license_ab', matchedBy: 'similarity', score: 0.9 })]);
    // The backend sent published services with their verified content as candidates.
    expect(fake.lastBody.candidates[0]).toMatchObject({ id: serviceId });
    expect(fake.lastBody.candidates[0].text).toContain('អត្តសញ្ញាណបណ្ណ');
  });

  it('search falls back to the database when the ML service fails', async () => {
    fake.mode = 'error';
    const res = await http().get('/api/search').query({ q: 'driver' }).expect(200);
    expect(res.body.data[0]).toMatchObject({ slug: 'driver_license_ab', matchedBy: 'keyword' });
  });

  it('search falls back when the ML service is too slow (timeout)', async () => {
    fake.mode = 'slow';
    const started = Date.now();
    const res = await http().get('/api/search').query({ q: 'driver' }).expect(200);
    expect(res.body.data[0].matchedBy).toBe('keyword');
    expect(Date.now() - started).toBeLessThan(1400);
  });

  it('complexity is computed from verified content, stored, and shown on the public page', async () => {
    const res = await http().post(`/api/admin/services/${serviceId}/complexity`).set(bearer(admin)).expect(201);
    expect(res.body.data).toMatchObject({ kind: 'COMPLEXITY', score: 42, modelVersion: 'complexity-test' });
    expect(fake.lastBody.features).toEqual({ documents: 1, steps: 0, fee_tiers: 0, max_fee_khr: 0, conditions: 0, information_gaps: 5 });

    const pub = await http().get('/api/services/driver_license_ab').expect(200);
    expect(pub.body.data.complexity).toMatchObject({ score: 42, modelVersion: 'complexity-test' });
    expect(pub.body.data.complexity.output.factors[0].name).toBe('documents');

    const list = await http().get('/api/admin/analytics/complexity').set(bearer(admin)).expect(200);
    expect(list.body.data[0]).toMatchObject({ score: 42, service: { slug: 'driver_license_ab' } });
  });

  it('complexity reports 503 when the ML service is down', async () => {
    fake.mode = 'error';
    const res = await http().post(`/api/admin/services/${serviceId}/complexity`).set(bearer(admin)).expect(503);
    expect(res.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
  });

  it('extraction puts findings into the review queue as PENDING / EXTRACTED, never published', async () => {
    const dataDir = process.env.DATA_DIR!;
    mkdirSync(join(dataDir, 'processed', 'text', 'S900'), { recursive: true });
    writeFileSync(join(dataDir, 'processed', 'text', 'S900', '2026-10-08.txt'), 'Fees: 30,000 Riels\nRequired documents include:\nPassport\n');
    await prisma.sourceSnapshot.create({ data: { sourceId, collectedAt: new Date('2026-10-08'), sha256: 'a'.repeat(64), storagePath: 'data/raw/S900/2026-10-08.html' } });

    const job = await http().post('/api/admin/extraction-jobs').set(bearer(admin)).send({ sourceId, serviceId }).expect(201);
    expect(job.body.data).toMatchObject({ status: 'SUCCEEDED', itemsProposed: 2, modelVersion: 'extract-test' });

    const queue = await http().get('/api/admin/review').set(bearer(admin)).expect(200);
    const extracted = queue.body.data.filter((i: { origin: string }) => i.origin === 'EXTRACTED');
    expect(extracted).toHaveLength(2);
    expect(extracted.every((i: { status: string; confidence: number }) => i.status === 'PENDING' && i.confidence === 1)).toBe(true);

    // Nothing extracted is public.
    const pub = await http().get('/api/services/driver_license_ab').expect(200);
    expect(pub.body.data.fees).toHaveLength(0);

    // Running it again does not duplicate findings.
    const again = await http().post('/api/admin/extraction-jobs').set(bearer(admin)).send({ sourceId, serviceId }).expect(201);
    expect(again.body.data.itemsProposed).toBe(0);
  });

  it('extraction jobs are marked FAILED when the ML service is down', async () => {
    fake.mode = 'error';
    const job = await http().post('/api/admin/extraction-jobs').set(bearer(admin)).send({ sourceId, serviceId }).expect(201);
    expect(job.body.data).toMatchObject({ status: 'FAILED', error: 'ML service unavailable' });
  });

  it('extraction refuses a source that is not linked to the service', async () => {
    const other = await prisma.source.create({
      data: { code: 'S901', url: 'https://example.gov.kh/y', name: 'Other', publisher: 'Test', sourceType: 'WEB_PAGE', tier: 'T1', language: 'en' },
    });
    await http().post('/api/admin/extraction-jobs').set(bearer(admin)).send({ sourceId: other.id, serviceId }).expect(422);
  });
});
