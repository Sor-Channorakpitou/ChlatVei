import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

export async function createApp(): Promise<{ app: INestApplication; prisma: PrismaService }> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: process.env.E2E_LOGS ? ['error'] : false });
  configureApp(app);
  await app.init();
  return { app, prisma: app.get(PrismaService) };
}

/** Empties every table in the TEST database (fast, keeps the schema). */
export async function resetDb(prisma: PrismaService): Promise<void> {
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  if (!db.endsWith('_test')) throw new Error(`Refusing to empty non-test database "${db}"`);
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

let counter = 0;

/** Creates a user directly in the DB and returns a valid access token for it. */
export async function userWithToken(app: INestApplication, prisma: PrismaService, role: Role = 'CITIZEN') {
  const email = `${role.toLowerCase()}${++counter}-${Date.now()}@example.test`;
  const password = 'correct-horse-battery';
  const user = await prisma.user.create({
    data: { email, displayName: `${role} ${counter}`, role, passwordHash: await hashPassword(password) },
  });
  const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(200);
  return { user, token: res.body.data.accessToken as string, email, password };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
