import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createApp, resetDb, userWithToken } from './helpers';

/**
 * The two end-to-end flows required by the spec (§22), plus the versioning rules
 * from ADR-003, exercised through the HTTP API only.
 */
describe('Verification workflow and citizen journey', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: string;
  let citizen: string;
  let categoryId: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    await resetDb(prisma);
    admin = (await userWithToken(app, prisma, 'ADMIN')).token;
    citizen = (await userWithToken(app, prisma, 'CITIZEN')).token;
    categoryId = (await prisma.category.create({ data: { slug: 'transport', nameKm: 'ការដឹកជញ្ជូន', nameEn: 'Transport' } })).id;
  });
  afterAll(() => app.close());

  // Shared state across the ordered steps below.
  let serviceId: string;
  let sourceId: string;
  let docId: string;
  let stepId: string;
  let docV2Id: string;

  it('1. admin creates a draft service and an official source', async () => {
    const svc = await http().post('/api/admin/services').set(bearer(admin))
      .send({ slug: 'driver_license_ab', categoryId, nameEn: "Driver's license, Types A and B" }).expect(201);
    serviceId = svc.body.data.id;
    expect(svc.body.data.publishStatus).toBe('DRAFT');

    const src = await http().post('/api/sources').set(bearer(admin)).send({
      code: 'S001', url: 'https://mpwt.gov.kh/en/public-services/driver-s-license', name: "Driver's License",
      publisher: 'Ministry of Public Works and Transport', sourceType: 'WEB_PAGE', tier: 'T1', language: 'en',
    }).expect(201);
    sourceId = src.body.data.id;
    expect(src.body.data.status).toBe('PENDING');

    // Drafts are invisible to citizens.
    await http().get('/api/services/driver_license_ab').expect(404);
  });

  it('2. admin proposes content; it enters the review queue as PENDING', async () => {
    const doc = await http().post(`/api/admin/services/${serviceId}/requirements`).set(bearer(admin)).send({
      kind: 'DOCUMENT', textEn: 'Physical fitness (medical) certificate', sourceId, evidence: 'Medical Certificate',
    }).expect(201);
    docId = doc.body.data.id;
    expect(doc.body.data.status).toBe('PENDING');

    const step = await http().post(`/api/admin/services/${serviceId}/steps`).set(bearer(admin)).send({
      position: 1, titleKm: 'ប្រឡងទ្រឹស្តី', titleEn: 'Pass the theory test', sourceId, evidence: 'ការប្រឡងទ្រឹស្តី',
    }).expect(201);
    stepId = step.body.data.id;

    const queue = await http().get('/api/admin/review').set(bearer(admin)).expect(200);
    expect(queue.body.meta.total).toBe(2);
    expect(queue.body.data[0]).toMatchObject({ contentType: 'requirements', evidence: 'Medical Certificate', source: { code: 'S001' } });
  });

  it('3. content without evidence or a real source is refused', async () => {
    await http().post(`/api/admin/services/${serviceId}/fees`).set(bearer(admin))
      .send({ amount: 30000, currency: 'KHR', labelEn: 'Type A', sourceId }).expect(400); // no evidence
    await http().post(`/api/admin/services/${serviceId}/fees`).set(bearer(admin))
      .send({ amount: 30000, currency: 'EUR', labelEn: 'Type A', sourceId, evidence: 'x' }).expect(400); // bad currency
  });

  it('4. approval is refused until the source is verified and Khmer text exists', async () => {
    let res = await http().post(`/api/admin/review/requirements/${docId}/approve`).set(bearer(admin)).send({}).expect(422);
    expect(res.body.error.message).toMatch(/Khmer/);

    await http().patch(`/api/admin/content/requirements/${docId}`).set(bearer(admin)).send({ textKm: 'វិញ្ញាបនបត្របញ្ជាក់កាយសម្បទា' }).expect(200);
    res = await http().post(`/api/admin/review/requirements/${docId}/approve`).set(bearer(admin)).send({}).expect(422);
    expect(res.body.error.message).toMatch(/source must be verified/);

    await http().post(`/api/sources/${sourceId}/decision`).set(bearer(admin)).send({ status: 'VERIFIED' }).expect(200);
  });

  it('5. admin approves; the service can then be published and citizens see verified content only', async () => {
    await http().post(`/api/admin/review/requirements/${docId}/approve`).set(bearer(admin)).send({}).expect(200);

    // Publishing needs a Khmer name.
    await http().patch(`/api/admin/services/${serviceId}`).set(bearer(admin)).send({ publishStatus: 'PUBLISHED' }).expect(422);
    await http().patch(`/api/admin/services/${serviceId}`).set(bearer(admin)).send({ nameKm: 'ផ្តល់បណ្ណបើកបរ', publishStatus: 'PUBLISHED' }).expect(200);

    const pub = await http().get('/api/services/driver_license_ab').expect(200);
    expect(pub.body.data.requirements).toHaveLength(1);
    expect(pub.body.data.requirements[0]).toMatchObject({ textKm: 'វិញ្ញាបនបត្របញ្ជាក់កាយសម្បទា', source: { code: 'S001' } });
    expect(pub.body.data.steps).toHaveLength(0); // the step is still PENDING
    expect(pub.body.data.lastVerifiedAt).toEqual(expect.any(String));
    expect(pub.body.data.sources).toEqual([]); // not linked yet

    const changes = await http().get('/api/services/driver_license_ab/changes').expect(200);
    expect(changes.body.data[0]).toMatchObject({ changeType: 'ADDED', entityType: 'REQUIREMENT' });

    await http().post(`/api/admin/review/steps/${stepId}/approve`).set(bearer(admin)).send({}).expect(200);
  });

  it('6. editing verified content creates a new PENDING version; the public keeps the old one until approval', async () => {
    const edit = await http().patch(`/api/admin/content/requirements/${docId}`).set(bearer(admin))
      .send({ textKm: 'វិញ្ញាបនបត្របញ្ជាក់កាយសម្បទា (ច្បាប់ដើម)', textEn: 'Original medical certificate' }).expect(200);
    docV2Id = edit.body.data.id;
    expect(docV2Id).not.toBe(docId);
    expect(edit.body.data).toMatchObject({ status: 'PENDING', supersedesId: docId, sourceId });

    // A second concurrent proposal for the same item is refused.
    await http().patch(`/api/admin/content/requirements/${docId}`).set(bearer(admin)).send({ textEn: 'Another idea' }).expect(409);

    let pub = await http().get('/api/services/driver_license_ab/requirements').expect(200);
    expect(pub.body.data.map((r: { id: string }) => r.id)).toEqual([docId]);

    await http().post(`/api/admin/review/requirements/${docV2Id}/approve`).set(bearer(admin)).send({}).expect(200);

    pub = await http().get('/api/services/driver_license_ab/requirements').expect(200);
    expect(pub.body.data.map((r: { id: string }) => r.id)).toEqual([docV2Id]);
    const old = await prisma.requirement.findUniqueOrThrow({ where: { id: docId } });
    expect(old.status).toBe('OUTDATED'); // kept as history, never overwritten

    const changes = await http().get('/api/services/driver_license_ab/changes').expect(200);
    const changed = changes.body.data.find((c: { changeType: string }) => c.changeType === 'CHANGED');
    expect(changed.diff.before.textEn).toBe('Physical fitness (medical) certificate');
    expect(changed.diff.after.textEn).toBe('Original medical certificate');
  });

  it('7. rejected and outdated content cannot be edited or re-approved', async () => {
    await http().patch(`/api/admin/content/requirements/${docId}`).set(bearer(admin)).send({ textEn: 'x' }).expect(409);
    await http().post(`/api/admin/review/requirements/${docId}/approve`).set(bearer(admin)).send({}).expect(409);

    const p = await http().post(`/api/admin/services/${serviceId}/requirements`).set(bearer(admin))
      .send({ kind: 'CONDITION', textEn: 'Unclear claim', sourceId, evidence: 'something' }).expect(201);
    await http().post(`/api/admin/review/requirements/${p.body.data.id}/reject`).set(bearer(admin)).send({}).expect(400); // comment required
    await http().post(`/api/admin/review/requirements/${p.body.data.id}/reject`).set(bearer(admin)).send({ comment: 'Not in the source' }).expect(200);
    await http().post(`/api/admin/review/requirements/${p.body.data.id}/approve`).set(bearer(admin)).send({}).expect(409);
  });

  it('8. every decision is recorded in verifications and the audit log', async () => {
    const approvals = await prisma.verification.count({ where: { action: 'APPROVE' } });
    expect(approvals).toBe(4); // doc v1, step, doc v2, source
    expect(await prisma.auditLog.count({ where: { action: 'content.approve' } })).toBe(3);
    expect(await prisma.auditLog.count({ where: { action: 'content.reject' } })).toBe(1);
  });

  it('9. citizen searches, opens the service, creates and completes a checklist', async () => {
    const search = await http().get('/api/search').query({ q: 'driver' }).expect(200);
    expect(search.body.data[0]).toMatchObject({ slug: 'driver_license_ab', matchedBy: 'keyword' });
    const searchKm = await http().get('/api/search').query({ q: 'បណ្ណបើកបរ' }).expect(200);
    expect(searchKm.body.data[0].slug).toBe('driver_license_ab');

    const created = await http().post('/api/checklists').set(bearer(citizen)).send({ serviceSlug: 'driver_license_ab' }).expect(201);
    const list = created.body.data;
    expect(list.items.map((i: { kind: string }) => i.kind)).toEqual(['DOCUMENT', 'STEP']);
    expect(list.progress).toEqual({ done: 0, total: 2 });

    await http().post('/api/checklists').set(bearer(citizen)).send({ serviceSlug: 'driver_license_ab' }).expect(409);

    for (const item of list.items) {
      await http().patch(`/api/checklists/${list.id}/items/${item.id}`).set(bearer(citizen)).send({ isDone: true }).expect(200);
    }
    const done = await http().get(`/api/checklists/${list.id}`).set(bearer(citizen)).expect(200);
    expect(done.body.data.progress).toEqual({ done: 2, total: 2 });
    expect(done.body.data.completedAt).toEqual(expect.any(String));
  });

  it('10. another user cannot see or change that checklist', async () => {
    const mine = await http().get('/api/checklists').set(bearer(citizen)).expect(200);
    const id = mine.body.data[0].id;
    const other = (await userWithToken(app, prisma, 'CITIZEN')).token;
    await http().get(`/api/checklists/${id}`).set(bearer(other)).expect(404);
    await http().delete(`/api/checklists/${id}`).set(bearer(other)).expect(404);
  });

  it('11. checklist items are flagged when their content is withdrawn', async () => {
    await http().post(`/api/admin/content/steps/${stepId}/mark-outdated`).set(bearer(admin)).send({ comment: 'Procedure changed' }).expect(200);
    const mine = await http().get('/api/checklists').set(bearer(citizen)).expect(200);
    const detail = await http().get(`/api/checklists/${mine.body.data[0].id}`).set(bearer(citizen)).expect(200);
    const step = detail.body.data.items.find((i: { kind: string }) => i.kind === 'STEP');
    expect(step.contentChanged).toBe(true);
  });

  it('12. citizens give feedback (anonymously too) and admins see it in analytics', async () => {
    await http().post(`/api/admin/review/steps/${stepId}/approve`).set(bearer(admin)).send({}).expect(409); // outdated stays outdated
    const step2 = await http().post(`/api/admin/services/${serviceId}/steps`).set(bearer(admin))
      .send({ position: 1, titleKm: 'ប្រឡងទ្រឹស្តីតាមកុំព្យូទ័រ', sourceId, evidence: 'ប្រឡងទ្រឹស្តី' }).expect(201);
    await http().post(`/api/admin/review/steps/${step2.body.data.id}/approve`).set(bearer(admin)).send({}).expect(200);

    await http().post('/api/feedback').send({ serviceSlug: 'driver_license_ab', kind: 'RATING', rating: 4, difficulty: 2 }).expect(201);
    await http().post('/api/feedback').set(bearer(citizen))
      .send({ serviceSlug: 'driver_license_ab', kind: 'RATING', difficulty: 5, confusingStepId: step2.body.data.id, comment: 'Hard to book a test' }).expect(201);
    await http().post('/api/feedback').send({ serviceSlug: 'driver_license_ab', kind: 'RATING' }).expect(422); // empty rating
    await http().post('/api/feedback').send({ serviceSlug: 'driver_license_ab', kind: 'RATING', rating: 9 }).expect(400);

    await http().get('/api/feedback').set(bearer(citizen)).expect(403);
    const list = await http().get('/api/feedback').set(bearer(admin)).expect(200);
    expect(list.body.meta.total).toBe(2);
    expect(list.body.data[0].userId).toBeUndefined(); // admins do not see who gave feedback

    const analytics = await http().get('/api/admin/analytics/feedback').set(bearer(admin)).expect(200);
    expect(analytics.body.data.byService[0]).toMatchObject({ responses: 2, avgDifficulty: 3.5 });
    expect(analytics.body.data.confusingSteps[0]).toMatchObject({ reports: 1, responses: 2 });
    expect(analytics.body.data.confusingSteps[0].confusionRate.low).toBeGreaterThan(0);

    const overview = await http().get('/api/admin/analytics/overview').set(bearer(admin)).expect(200);
    expect(overview.body.data.services.byStatus).toEqual({ PUBLISHED: 1 });
    expect(overview.body.data.content.outdated).toBe(2);
  });

  it('13. errors use the documented shape with a request id', async () => {
    const res = await http().get('/api/services?pageSize=500').expect(400);
    expect(res.body).toEqual({
      error: { code: 'VALIDATION_FAILED', message: 'Request validation failed', details: expect.any(Array), requestId: expect.any(String) },
    });
    expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
    const sort = await http().get('/api/services?sort=passwordHash').expect(422);
    expect(sort.body.error.code).toBe('BUSINESS_RULE');
  });
});
