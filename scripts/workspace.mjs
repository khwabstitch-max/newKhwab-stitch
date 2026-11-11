import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2];
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error('Run this helper through npm, for example: npm run dev');
  process.exit(1);
}
const children = new Set();
let shuttingDown = false;
function launch(project, args) {
  console.log(`\n[khwab] ${project}: npm ${args.join(' ')}`);
  const child = spawn(process.execPath, [npmCli, ...args], {
    cwd: path.join(root, project),
    stdio: 'inherit',
    env: process.env,
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}
function run(project, args) {
  return new Promise((resolve, reject) => {
    const child = launch(project, args);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `${project}: npm ${args.join(' ')} failed (${signal || code})`,
          ),
        );
    });
  });
}
function stop(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}
process.once('SIGINT', () => stop(130));
process.once('SIGTERM', () => stop(143));
try {
  if (mode === 'dev') {
    for (const project of ['server', 'client']) {
      const child = launch(project, ['run', 'dev']);
      child.once('error', (error) => {
        console.error(error.message);
        stop(1);
      });
      child.once('exit', (code) => {
        if (!shuttingDown) stop(code ?? 1);
      });
    }
  } else {
    const tasks =
      mode === 'setup'
        ? ['ci']
        : mode === 'check'
          ? ['lint', 'test', 'build']
          : [mode];
    if (!['setup', 'check', 'test', 'lint', 'build'].includes(mode))
      throw new Error('Unknown task');
    for (const task of tasks) {
      for (const project of ['server', 'client']) {
        await run(project, task === 'ci' ? ['ci'] : ['run', task]);
      }
    }
  }
} catch (error) {
  console.error(error.message);
  stop(1);
}
