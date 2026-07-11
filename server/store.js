import { copyFile, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedState } from './data/seed.js';

const serverDir = dirname(fileURLToPath(import.meta.url));
const defaultStatePath = `${serverDir}/data/prohub-state.json`;

const clone = (value) => JSON.parse(JSON.stringify(value));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function replaceStateFile(tempPath, statePath) {
  const retryableCodes = new Set(['EACCES', 'EBUSY', 'EPERM']);
  let lastError;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rename(tempPath, statePath);
      return;
    } catch (error) {
      lastError = error;
      if (!retryableCodes.has(error.code)) throw error;
      await wait(40 * (attempt + 1));
    }
  }

  try {
    await copyFile(tempPath, statePath);
    await rm(tempPath, { force: true }).catch(() => {});
  } catch {
    throw lastError;
  }
}

export function createStore(statePath = defaultStatePath) {
  let writeQueue = Promise.resolve();

  const ensureStateFile = async () => {
    await mkdir(dirname(statePath), { recursive: true });
    try {
      await readFile(statePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await writeFile(statePath, `${JSON.stringify(clone(seedState), null, 2)}\n`, 'utf8');
    }
  };

  const read = async () => {
    await ensureStateFile();
    return JSON.parse(await readFile(statePath, 'utf8'));
  };

  const writeCrashSafe = async (state) => {
    await mkdir(dirname(statePath), { recursive: true });
    const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
    const handle = await open(tempPath, 'w');
    try {
      await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await replaceStateFile(tempPath, statePath);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => {});
      throw error;
    }
  };

  const write = async (state) => {
    writeQueue = writeQueue.catch(() => {}).then(() => writeCrashSafe(state));
    await writeQueue;
    return state;
  };

  const update = async (mutator) => {
    const state = await read();
    const result = await mutator(state);
    await write(state);
    return result ?? state;
  };

  const reset = async () => write(clone(seedState));

  return { read, write, update, reset, statePath };
}

export const store = createStore();
