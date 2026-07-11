import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const cacheRoot = join(serverDir, 'movie', 'cache');

const hashKey = (value) => createHash('sha256').update(String(value)).digest('hex');

export class MovieCache {
  constructor(root = cacheRoot) {
    this.root = root;
  }

  path(namespace, key, extension = '.json') {
    return join(this.root, namespace, `${hashKey(key)}${extension}`);
  }

  async get(namespace, key, maxAgeMs) {
    const path = this.path(namespace, key);
    try {
      const fileStat = await stat(path);
      if (Date.now() - fileStat.mtimeMs > maxAgeMs) return null;
      return JSON.parse(await readFile(path, 'utf8'));
    } catch {
      return null;
    }
  }

  async set(namespace, key, value) {
    const path = this.path(namespace, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    return value;
  }

  async getArtwork(sourceUrl) {
    const allowedHosts = new Set([
      'static.tvmaze.com',
      'static.tvmaze.com.cdn.cloudflare.net',
      'cdn.myanimelist.net',
    ]);
    const parsed = new URL(sourceUrl);
    if (!allowedHosts.has(parsed.hostname)) {
      throw new Error('Artwork host is not allowed');
    }

    const metadataPath = this.path('artwork', sourceUrl);
    const metadata = await this.get('artwork', sourceUrl, 30 * 24 * 60 * 60 * 1000);
    if (metadata?.filePath) {
      try {
        await stat(metadata.filePath);
        return metadata;
      } catch {
        // Re-fetch missing artwork payload.
      }
    }

    const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Artwork request failed with ${response.status}`);
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const extension = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : extname(parsed.pathname) || '.jpg';
    const filePath = this.path('artwork', sourceUrl, extension);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
    const next = { filePath, contentType, sourceUrl, cachedAt: new Date().toISOString() };
    await mkdir(dirname(metadataPath), { recursive: true });
    await writeFile(metadataPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    return next;
  }
}

export const movieCache = new MovieCache();
