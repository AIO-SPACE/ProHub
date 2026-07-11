import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const clone = (value) => JSON.parse(JSON.stringify(value));

export async function loadSecrets(secretsPath) {
  await mkdir(dirname(secretsPath), { recursive: true });
  try {
    return JSON.parse(await readFile(secretsPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const secrets = {
    aria2RpcSecret: randomBytes(32).toString('hex'),
    createdAt: new Date().toISOString(),
  };
  await writeFile(secretsPath, `${JSON.stringify(secrets, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  try {
    await chmod(secretsPath, 0o600);
  } catch {
    // Windows can ignore POSIX chmod; the secret still never leaves the backend.
  }
  return clone(secrets);
}
