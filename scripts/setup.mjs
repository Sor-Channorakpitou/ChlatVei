// One-time (and safe to re-run) local setup: Python venv, npm packages, database migrations and seed data.
// Usage: npm run setup   (needs Python 3, Node and the database from scripts/local-db.sql)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const win = process.platform === 'win32';
const venvPython = join(root, '.venv', win ? 'Scripts/python.exe' : 'bin/python');

function run(title, cmd, args, cwd = root) {
  console.log(`\n=== ${title}`);
  // npm/npx are .cmd files on Windows and need a shell; the venv path has no such need (and may contain spaces).
  const shell = win && cmd !== venvPython;
  // With a shell, pass one command string (the args here are fixed, so there is nothing to escape).
  const r = shell ? spawnSync([cmd, ...args].join(' '), { cwd, stdio: 'inherit', shell }) : spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\nSetup failed at: ${title}`);
    process.exit(r.status ?? 1);
  }
}

if (!existsSync(venvPython)) run('Create Python venv', win ? 'python' : 'python3', ['-m', 'venv', '.venv']);
run('Install ML service packages', venvPython, ['-m', 'pip', 'install', '-q', '-r', 'ml-service/requirements.txt']);

if (!existsSync(join(root, 'backend', '.env'))) {
  console.error('\nbackend/.env is missing: copy backend/.env.example to backend/.env and set the secrets.');
  process.exit(1);
}

run('Install backend packages', 'npm', ['install'], join(root, 'backend'));
run('Install frontend packages', 'npm', ['install'], join(root, 'frontend'));
run('Apply database migrations', 'npx', ['prisma', 'migrate', 'deploy'], join(root, 'backend'));
run('Load seed data', 'npm', ['run', 'seed'], join(root, 'backend'));

console.log('\nSetup done. Start everything with: npm run dev');
