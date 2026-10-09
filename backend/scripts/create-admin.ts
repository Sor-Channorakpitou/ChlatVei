/**
 * Creates the first admin (or promotes an existing user). This is the only way
 * to get the first ADMIN account: registration through the API always creates CITIZENs.
 *
 * Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... npm run create-admin
 * (the values may also come from backend/.env)
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { assertAcceptablePassword, hashPassword } from '../src/auth/password';

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const displayName = process.env.ADMIN_NAME?.trim() || 'Administrator';
  if (!email || !password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD');
  if (password.length < 12) throw new Error('Admin passwords must be at least 12 characters');
  assertAcceptablePassword(password);

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, displayName, passwordHash: await hashPassword(password), role: 'ADMIN' },
      update: { role: 'ADMIN', isActive: true },
    });
    await prisma.auditLog.create({ data: { action: 'user.bootstrap_admin', entityType: 'USER', entityId: user.id, metadata: { via: 'cli' } } });
    console.log(`Admin ready: ${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
