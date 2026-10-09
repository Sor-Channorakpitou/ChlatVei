import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createApp, resetDb } from './helpers';

const REFRESH_COOKIE = 'chlatvei_refresh';

function refreshCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  if (!cookie) throw new Error('No refresh cookie set');
  return cookie.split(';')[0];
}

describe('Auth', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => ({ app, prisma } = await createApp()));
  beforeEach(() => resetDb(prisma));
  afterAll(() => app.close());

  const register = (body: object) => http().post('/api/auth/register').send(body);
  const valid = { email: 'Dara@Example.test', password: 'mekong-river-2026', displayName: 'Dara' };

  it('registers a citizen, normalizes the email and sets an httpOnly refresh cookie', async () => {
    const res = await register(valid).expect(201);
    expect(res.body.data.user).toMatchObject({ email: 'dara@example.test', role: 'CITIZEN', preferredLanguage: 'km' });
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.passwordHash).toBeUndefined();

    const cookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/auth');

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'dara@example.test' } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('cannot self-register as an admin', async () => {
    const res = await register({ ...valid, role: 'ADMIN' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(await prisma.user.count()).toBe(0);
  });

  it('rejects duplicate emails regardless of case', async () => {
    await register(valid).expect(201);
    const res = await register({ ...valid, email: 'DARA@example.test' }).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects weak and common passwords', async () => {
    await register({ ...valid, password: 'short' }).expect(400);
    const res = await register({ ...valid, password: 'password123' }).expect(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE');
  });

  it('gives the same error for an unknown email and a wrong password', async () => {
    await register(valid).expect(201);
    const unknown = await http().post('/api/auth/login').send({ email: 'nobody@example.test', password: 'whatever-123' }).expect(401);
    const wrong = await http().post('/api/auth/login').send({ email: valid.email, password: 'wrong-password-1' }).expect(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it('logs in and reads the profile', async () => {
    await register(valid).expect(201);
    const login = await http().post('/api/auth/login').send({ email: valid.email, password: valid.password }).expect(200);
    const me = await http().get('/api/users/me').set(bearer(login.body.data.accessToken)).expect(200);
    expect(me.body.data.email).toBe('dara@example.test');
  });

  it('rejects requests with a missing or tampered token', async () => {
    await http().get('/api/users/me').expect(401);
    const res = await http().get('/api/users/me').set(bearer('not.a.jwt')).expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rotates refresh tokens and revokes the family when an old token is reused', async () => {
    const reg = await register(valid).expect(201);
    const first = refreshCookie(reg);

    const r1 = await http().post('/api/auth/refresh').set('Cookie', first).expect(200);
    const second = refreshCookie(r1);
    expect(second).not.toBe(first);

    // Reusing the rotated (old) token looks like theft: it fails...
    await http().post('/api/auth/refresh').set('Cookie', first).expect(401);
    // ...and the legitimate newer token is revoked too.
    await http().post('/api/auth/refresh').set('Cookie', second).expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const reg = await register(valid).expect(201);
    const cookie = refreshCookie(reg);
    await http().post('/api/auth/logout').set('Cookie', cookie).expect(204);
    await http().post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('locks an account for 15 minutes after 10 failed sign-ins, even with the right password', async () => {
    await register(valid).expect(201);
    for (let i = 0; i < 9; i++) {
      await http().post('/api/auth/login').send({ email: valid.email, password: 'wrong-password-1' }).expect(401);
    }
    const locked = await http().post('/api/auth/login').send({ email: valid.email, password: 'wrong-password-1' }).expect(429);
    expect(locked.body.error.code).toBe('RATE_LIMITED');
    await http().post('/api/auth/login').send({ email: valid.email, password: valid.password }).expect(429);

    // After the lock expires, a correct password works and resets the counter.
    await prisma.user.update({ where: { email: 'dara@example.test' }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    await http().post('/api/auth/login').send({ email: valid.email, password: valid.password }).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: 'dara@example.test' } })).failedLogins).toBe(0);
  });

  it('rejects unsigned tokens (alg "none")', async () => {
    const reg = await register(valid).expect(201);
    const [, payload] = reg.body.data.accessToken.split('.');
    const unsigned = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${payload}.`;
    await http().get('/api/users/me').set(bearer(unsigned)).expect(401);
  });

  it('changes the password, ends other sessions and keeps the caller signed in', async () => {
    const reg = await register(valid).expect(201);
    const oldCookie = refreshCookie(reg);
    const token = reg.body.data.accessToken;
    const change = (body: object) => http().post('/api/auth/password').set(bearer(token)).send(body);

    await http().post('/api/auth/password').send({ currentPassword: valid.password, newPassword: 'tonle-sap-lake-2026' }).expect(401);
    expect((await change({ currentPassword: 'wrong-password-1', newPassword: 'tonle-sap-lake-2026' }).expect(422)).body.error.message).toMatch(/incorrect/);
    await change({ currentPassword: valid.password, newPassword: valid.password }).expect(422);
    await change({ currentPassword: valid.password, newPassword: 'password123' }).expect(422);
    await change({ currentPassword: valid.password, newPassword: 'short' }).expect(400);

    const res = await change({ currentPassword: valid.password, newPassword: 'tonle-sap-lake-2026' }).expect(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    await http().post('/api/auth/refresh').set('Cookie', refreshCookie(res)).expect(200);
    await http().post('/api/auth/refresh').set('Cookie', oldCookie).expect(401);

    await http().post('/api/auth/login').send({ email: valid.email, password: valid.password }).expect(401);
    await http().post('/api/auth/login').send({ email: valid.email, password: 'tonle-sap-lake-2026' }).expect(200);
    expect(await prisma.auditLog.count({ where: { action: 'user.password_change' } })).toBe(1);
  });

  it('updates own profile but ignores attempts to change role', async () => {
    const reg = await register(valid).expect(201);
    const token = reg.body.data.accessToken;
    await http().patch('/api/users/me').set(bearer(token)).send({ role: 'ADMIN' }).expect(400);
    const res = await http().patch('/api/users/me').set(bearer(token)).send({ preferredLanguage: 'en' }).expect(200);
    expect(res.body.data).toMatchObject({ preferredLanguage: 'en', role: 'CITIZEN' });
  });
});
