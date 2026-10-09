import { execSync } from 'child_process';
import { config } from 'dotenv';
import { join } from 'path';

/**
 * Brings the dedicated test database up to date with the committed migrations.
 * Uses `migrate deploy` (applies pending migrations only; never drops anything).
 * Each suite then empties the tables it uses via resetDb() in helpers.ts.
 */
export default async function globalSetup(): Promise<void> {
  config({ path: join(__dirname, '..', '.env'), quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set');
  if (!/_test(\?|$)/.test(url)) throw new Error('TEST_DATABASE_URL must point at a database whose name ends in _test');
  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
