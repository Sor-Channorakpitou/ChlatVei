// Runs the whole stack locally without Docker: ML service, backend and frontend, all with live reload.
// Usage: npm run dev   (run `npm run setup` once first). Ctrl+C stops everything.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const win = process.platform === 'win32';
const venvPython = join(root, '.venv', win ? 'Scripts/python.exe' : 'bin/python');

const missing = [
  [venvPython, 'Python venv'],
  [join(root, 'backend', 'node_modules'), 'backend packages'],
  [join(root, 'frontend', 'node_modules'), 'frontend packages'],
  [join(root, 'backend', '.env'), 'backend/.env'],
].filter(([path]) => !existsSync(path));
if (missing.length) {
  console.error(`Missing: ${missing.map(([, name]) => name).join(', ')}. Run: npm run setup`);
  process.exit(1);
}

// The ML service must share the backend's API key, so read it from backend/.env.
const mlKey = /^ML_API_KEY=(.*)$/m.exec(readFileSync(join(root, 'backend', '.env'), 'utf8'))?.[1]?.trim() ?? '';

const services = [
  { name: 'ml', color: 35, cwd: 'ml-service', cmd: venvPython, args: ['-m', 'uvicorn', 'app:app', '--port', '8000', '--reload'], env: { ML_API_KEY: mlKey } },
  { name: 'api', color: 36, cwd: 'backend', cmd: 'npm', args: ['run', 'start:dev'] },
  { name: 'web', color: 32, cwd: 'frontend', cmd: 'npm', args: ['start'] },
];

const children = [];
let stopping = false;

function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // npm runs its script in a child process, so kill the whole tree.
    if (win) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  process.exit(code);
}

for (const s of services) {
  const tag = `\x1b[${s.color}m[${s.name}]\x1b[0m `;
  const options = { cwd: join(root, s.cwd), env: { ...process.env, ...s.env } };
  // npm is a .cmd file on Windows and needs a shell; then pass one command string (the args here are fixed).
  const child = win && s.cmd === 'npm' ? spawn([s.cmd, ...s.args].join(' '), { ...options, shell: true }) : spawn(s.cmd, s.args, options);
  for (const stream of [child.stdout, child.stderr]) {
    let buffered = '';
    stream.on('data', (chunk) => {
      const lines = (buffered + chunk).split(/\r?\n/);
      buffered = lines.pop();
      for (const line of lines) process.stdout.write(tag + line + '\n');
    });
  }
  child.on('exit', (code) => {
    if (stopping) return;
    console.error(`${tag}exited with code ${code}; stopping the others.`);
    stopAll(code ?? 1);
  });
  children.push(child);
}

console.log('Starting... open http://localhost:4200 once [web] is ready. Ctrl+C stops everything.');
process.on('SIGINT', () => stopAll());
process.on('SIGTERM', () => stopAll());
