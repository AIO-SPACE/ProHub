import { spawn } from 'node:child_process';

const shell = process.platform === 'win32';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const children = [
  spawn('node', ['server/index.js'], { stdio: 'inherit', shell }),
  spawn(npmCommand, ['run', 'dev'], { stdio: 'inherit', shell }),
];

const shutdown = () => {
  for (const child of children) child.kill();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      shutdown();
      process.exit(code);
    }
  });
}
