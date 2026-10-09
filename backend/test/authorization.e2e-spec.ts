import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { ROLES_KEY } from '../src/common/auth.decorators';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, resetDb, userWithToken } from './helpers';

interface Route {
  method: string;
  path: string;
}

/**
 * Finds every route restricted with @Roles('ADMIN') by reading Nest's own metadata,
 * so a newly added admin route is covered automatically.
 */
function adminRoutes(app: INestApplication): Route[] {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);
  const routes: Route[] = [];

  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const base = (Reflect.getMetadata(PATH_METADATA, metatype) as string) ?? '';
    for (const name of scanner.getAllMethodNames(Object.getPrototypeOf(instance))) {
      const handler = instance[name];
      const routePath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      if (routePath === undefined) continue;
      const roles = reflector.getAllAndOverride<Role[]>(ROLES_KEY, [handler, metatype]);
      if (!roles?.includes('ADMIN')) continue;
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number].toLowerCase();
      const full = `/api/${[base, routePath].filter((p) => p && p !== '/').join('/')}`
        .replace(/\/+/g, '/')
        .replace(/:type/g, 'requirements')
        .replace(/:[A-Za-z]+/g, '00000000-0000-4000-8000-000000000000');
      routes.push({ method, path: full });
    }
  }
  return routes;
}

describe('Authorization (every admin route)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let routes: Route[];
  let citizenToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await resetDb(prisma);
    routes = adminRoutes(app);
    citizenToken = (await userWithToken(app, prisma, 'CITIZEN')).token;
  });
  afterAll(() => app.close());

  it('discovers the admin routes', () => {
    // Sanity check that discovery works; the API has well over 20 admin routes.
    expect(routes.length).toBeGreaterThan(20);
    expect(routes).toEqual(expect.arrayContaining([{ method: 'post', path: expect.stringMatching(/review\/requirements\/.+\/approve$/) }]));
  });

  it('rejects anonymous callers with 401 on every admin route', async () => {
    for (const r of routes) {
      const res = await (request(app.getHttpServer()) as any)[r.method](r.path).send({});
      expect({ route: `${r.method} ${r.path}`, status: res.status }).toEqual({ route: `${r.method} ${r.path}`, status: 401 });
    }
  });

  it('rejects citizens with 403 on every admin route (a citizen can never approve information)', async () => {
    for (const r of routes) {
      const res = await (request(app.getHttpServer()) as any)[r.method](r.path).set(bearer(citizenToken)).send({});
      expect({ route: `${r.method} ${r.path}`, status: res.status }).toEqual({ route: `${r.method} ${r.path}`, status: 403 });
    }
  });

  it('a role change takes effect on the next login and ends existing sessions', async () => {
    const admin = await userWithToken(app, prisma, 'ADMIN');
    const target = await userWithToken(app, prisma, 'CITIZEN');
    const before = await prisma.refreshToken.count({ where: { userId: target.user.id, revokedAt: null } });
    expect(before).toBeGreaterThan(0);

    await request(app.getHttpServer()).patch(`/api/admin/users/${target.user.id}`).set(bearer(admin.token)).send({ role: 'ADMIN' }).expect(200);
    expect(await prisma.refreshToken.count({ where: { userId: target.user.id, revokedAt: null } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'user.update', entityId: target.user.id } })).toBe(1);
  });

  it('an admin cannot demote themselves', async () => {
    const admin = await userWithToken(app, prisma, 'ADMIN');
    const res = await request(app.getHttpServer()).patch(`/api/admin/users/${admin.user.id}`).set(bearer(admin.token)).send({ role: 'CITIZEN' }).expect(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });
});
