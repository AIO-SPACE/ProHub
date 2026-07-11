import { access, mkdir } from 'node:fs/promises';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { arch, platform } from 'node:os';
import { logger } from '../../lib/logger.js';

let processHandle = null;
let startupAttempted = false;

const serverDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const appDir = dirname(serverDir);

const executableName = platform() === 'win32' ? 'aria2c.exe' : 'aria2c';
const urlPattern = /https?:\/\/\S+/gi;
const ansiPattern = /\u001b\[[0-9;]*m/g;

function cleanAria2Line(line) {
  return line.replace(ansiPattern, '').replace(urlPattern, '[url redacted]').trim();
}

function shouldLogAria2Line(line) {
  if (!line) return false;
  if (/^\[#/.test(line)) return false;
  if (/Redirecting to/i.test(line)) return false;
  return /RPC: listening|Download complete|Download GID|not complete|ERROR|NOTICE|WARN/i.test(line);
}

function formatAria2Output(chunk) {
  return String(chunk)
    .split(/\r?\n/)
    .map(cleanAria2Line)
    .filter(shouldLogAria2Line)
    .join('\n')
    .slice(0, 1200);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findOnPath() {
  const pathValue = globalThis.process?.env?.PATH || '';
  for (const part of pathValue.split(delimiter).filter(Boolean)) {
    const candidate = join(part, executableName);
    if (await exists(candidate)) return candidate;
  }
  return null;
}

export async function resolveAria2Binary() {
  const platformKey = `${platform()}-${arch()}`;
  const candidates = [
    join(serverDir, 'bin', 'aria2', platformKey, executableName),
    join(serverDir, 'bin', 'aria2', executableName),
    join(appDir, 'bin', 'aria2', platformKey, executableName),
  ];

  for (const candidate of candidates) {
    if (await exists(candidate)) return { path: candidate, bundled: true };
  }

  const pathBinary = await findOnPath();
  if (pathBinary) return { path: pathBinary, bundled: false };

  return { path: null, bundled: false };
}

export async function ensureAria2Started({ secret, port, downloadDir, maxConcurrent, speedLimit }) {
  if (processHandle && !processHandle.killed) {
    return { started: true, reused: true, pid: processHandle.pid };
  }

  const binary = await resolveAria2Binary();
  if (!binary.path) {
    return {
      started: false,
      available: false,
      reason: 'aria2c binary was not found in server/bin/aria2 or PATH',
      expected: `server/bin/aria2/${platform()}-${arch()}/${executableName}`,
    };
  }

  await mkdir(downloadDir, { recursive: true });

  if (startupAttempted) {
    return { started: false, available: true, binary: binary.path, reason: 'aria2 startup was already attempted in this process' };
  }

  startupAttempted = true;
  const args = [
    '--enable-rpc=true',
    '--rpc-listen-all=false',
    `--rpc-listen-port=${port}`,
    `--rpc-secret=${secret}`,
    '--rpc-allow-origin-all=false',
    '--continue=true',
    '--auto-file-renaming=false',
    '--summary-interval=0',
    `--dir=${downloadDir}`,
    `--max-concurrent-downloads=${maxConcurrent}`,
  ];

  if (speedLimit) args.push('--max-overall-download-limit=1M');

  processHandle = spawn(binary.path, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  processHandle.stdout?.on('data', (chunk) => {
    const message = formatAria2Output(chunk);
    if (message) logger.info('aria2 stdout', { output: message });
  });
  processHandle.stderr?.on('data', (chunk) => {
    const message = formatAria2Output(chunk);
    if (message) logger.warn('aria2 stderr', { output: message });
  });
  processHandle.on('exit', (code, signal) => {
    logger.warn('aria2 process exited', { code, signal });
    processHandle = null;
    startupAttempted = false;
  });

  logger.info('aria2 process started', { pid: processHandle.pid, binary: binary.path, bundled: binary.bundled });
  return { started: true, available: true, pid: processHandle.pid, binary: binary.path, bundled: binary.bundled };
}
