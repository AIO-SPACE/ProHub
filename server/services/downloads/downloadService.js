import { dirname, isAbsolute, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { badRequest, conflict, notFound, unsupported, unavailable } from '../../lib/errors.js';
import { formatBytes } from '../../lib/format.js';
import { loadSecrets } from '../../lib/secrets.js';
import { pushActivity } from '../activityService.js';
import { Aria2RpcClient } from './aria2RpcClient.js';
import { ensureAria2Started, resolveAria2Binary } from './aria2Process.js';
import { Aria2Provider, GitHubReleaseProvider, GoogleDriveProvider, MediaFileProvider, MegaProvider } from './providers.js';
import { detectDownloadSource, filenameFromUrl, fileTypeFromFilename } from './sourceDetection.js';

const serverDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const appDir = dirname(serverDir);
const secretsPath = join(serverDir, 'data', 'secrets.json');
const defaultDownloadDir = join(appDir, 'downloads');

const makeHistoryMap = (state) => new Map((state.downloads.history || []).map((item) => [item.gid || item.id, item]));

function ensureDownloadState(state) {
  state.downloads ||= {};
  state.downloads.history ||= [];
  state.downloads.engine ||= { rpcPort: 6800 };
  state.settings ||= {};
  state.settings.downloads ||= {};
  state.settings.downloads.downloadPath ||= defaultDownloadDir;
  state.settings.downloads.maxConcurrent ||= 5;
  state.settings.downloads.speedLimit ||= false;
  state.settings.downloads.autoStart ??= true;
}

function getDownloadConfig(state) {
  ensureDownloadState(state);
  const configuredDir = state.settings.downloads.downloadPath || defaultDownloadDir;
  return {
    rpcPort: state.downloads.engine.rpcPort || 6800,
    endpoint: `http://127.0.0.1:${state.downloads.engine.rpcPort || 6800}/jsonrpc`,
    downloadDir: isAbsolute(configuredDir) ? configuredDir : resolve(appDir, configuredDir),
    maxConcurrent: state.settings.downloads.maxConcurrent || 5,
    speedLimit: Boolean(state.settings.downloads.speedLimit),
  };
}

async function createProviders(state) {
  const secrets = await loadSecrets(secretsPath);
  const config = getDownloadConfig(state);
  const startup = await ensureAria2Started({
    secret: secrets.aria2RpcSecret,
    port: config.rpcPort,
    downloadDir: config.downloadDir,
    maxConcurrent: config.maxConcurrent,
    speedLimit: config.speedLimit,
  });
  const rpcClient = new Aria2RpcClient({ endpoint: config.endpoint, secret: secrets.aria2RpcSecret });
  const aria2 = new Aria2Provider({ rpcClient });

  return {
    config,
    startup,
    providers: {
      aria2,
      'google-drive': new GoogleDriveProvider({ aria2Provider: aria2 }),
      'github-release': new GitHubReleaseProvider({ aria2Provider: aria2 }),
      mega: new MegaProvider(),
      mediafile: new MediaFileProvider(),
    },
  };
}

async function getProviderHealth(state) {
  const { providers, startup, config } = await createProviders(state);
  const binary = await resolveAria2Binary();
  const entries = await Promise.all(Object.values(providers).map(async (provider) => ({
    id: provider.id,
    label: provider.label,
    ...(await provider.health()),
  })));

  return {
    engine: {
      id: 'aria2',
      label: 'aria2 JSON-RPC',
      rpcUrl: `http://127.0.0.1:${config.rpcPort}/jsonrpc`,
      downloadDir: config.downloadDir,
      binaryPath: binary.path,
      bundled: binary.bundled,
      available: Boolean(binary.path),
      started: Boolean(startup.started),
      startup,
    },
    providers: entries,
  };
}

function mergeHistory(state, items) {
  const existing = makeHistoryMap(state);
  for (const item of items) {
    existing.set(item.id, {
      ...(existing.get(item.id) || {}),
      ...item,
      gid: item.gid || item.id,
      updatedAt: new Date().toISOString(),
    });
  }
  state.downloads.history = [...existing.values()].sort((a, b) => Date.parse(b.createdAt || b.updatedAt || 0) - Date.parse(a.createdAt || a.updatedAt || 0));
}

function summarize(items) {
  const active = items.filter((item) => item.status === 'downloading').length;
  const completed = items.filter((item) => item.status === 'completed').length;
  const failed = items.filter((item) => item.status === 'failed').length;
  const cancelled = items.filter((item) => item.status === 'cancelled').length;
  const totalSpeed = items.reduce((sum, item) => sum + (item.speedBytes || 0), 0);
  const completedBytes = items.filter((item) => item.status === 'completed').reduce((sum, item) => sum + (item.totalBytes || 0), 0);

  return {
    active,
    completed,
    failed,
    cancelled,
    queued: items.filter((item) => item.status === 'queued').length,
    total: items.length,
    currentSpeed: `${formatBytes(totalSpeed)}/s`,
    completedSize: formatBytes(completedBytes),
  };
}

export async function listDownloads(store) {
  const state = await store.read();
  ensureDownloadState(state);
  const health = await getProviderHealth(state);
  if (!health.engine.available) {
    return { items: state.downloads.history, stats: summarize(state.downloads.history), health };
  }

  const { providers } = await createProviders(state);
  const items = await providers.aria2.list(makeHistoryMap(state));
  await store.update((current) => {
    ensureDownloadState(current);
    mergeHistory(current, items);
  });
  return { items, stats: summarize(items), health };
}

export async function getDownload(store, id) {
  const state = await store.read();
  ensureDownloadState(state);
  const history = makeHistoryMap(state).get(id);
  const health = await getProviderHealth(state);
  if (!health.engine.available) {
    if (!history) throw notFound('Download not found');
    return { item: history, health };
  }

  const { providers } = await createProviders(state);
  const item = await providers.aria2.get(id, history);
  await store.update((current) => {
    ensureDownloadState(current);
    mergeHistory(current, [item]);
  });
  return { item, health };
}

export async function addDownload(store, rawUrl, options = {}) {
  const detection = detectDownloadSource(rawUrl);
  if (!detection.supported) throw unsupported(detection.reason || 'Unsupported download source', detection);

  const state = await store.read();
  ensureDownloadState(state);
  const duplicate = (state.downloads.history || []).find((item) => (
    item.url === (options.sourceUrl || rawUrl) &&
    !['completed', 'failed', 'cancelled'].includes(item.status)
  ));
  if (duplicate) {
    throw conflict('This URL is already in the active download queue', {
      existingId: duplicate.id,
      status: duplicate.status,
      filename: duplicate.filename,
    });
  }

  const health = await getProviderHealth(state);
  if (!health.engine.available) throw unavailable('aria2 is required for this download source but is not available', health.engine);

  const { providers, config } = await createProviders(state);
  const provider = providers[detection.provider];
  if (!provider) throw unsupported(`No provider registered for ${detection.provider}`, detection);

  const filename = options.filename || filenameFromUrl(detection.normalizedUrl);
  const type = options.type || (detection.kind === 'magnet' ? 'torrent' : fileTypeFromFilename(filename));
  const gid = await provider.add(detection.normalizedUrl, {
    aria2Options: {
      dir: config.downloadDir,
      ...(options.filename ? { out: options.filename } : {}),
      ...(options.aria2Options || {}),
    },
  });
  const createdAt = new Date().toISOString();
  const history = {
    id: gid,
    gid,
    provider: options.provider || detection.provider,
    sourceKind: options.sourceKind || detection.kind,
    filename,
    url: options.sourceUrl || rawUrl,
    engineUrl: options.sourceUrl ? rawUrl : undefined,
    type,
    status: 'queued',
    progress: 0,
    size: 'Pending metadata',
    speed: '0 B/s',
    eta: '--',
    savePath: config.downloadDir,
    createdAt,
    updatedAt: createdAt,
    metadata: options.metadata || undefined,
  };

  await store.update((current) => {
    ensureDownloadState(current);
    current.downloads.history = [history, ...(current.downloads.history || []).filter((item) => item.gid !== gid && item.id !== gid)];
    pushActivity(current, 'download', `Added download: ${filename}`);
  });

  return getDownload(store, gid).then((result) => result.item).catch(() => history);
}

export async function addBatch(store, urls) {
  if (!Array.isArray(urls) || urls.length === 0) throw badRequest('Batch requires a non-empty urls array');
  const results = [];
  for (const url of urls) {
    try {
      results.push({ ok: true, item: await addDownload(store, url) });
    } catch (error) {
      results.push({ ok: false, url, error: error.message, details: error.details });
    }
  }
  return results;
}

export async function pauseDownload(store, id) {
  const state = await store.read();
  const { providers } = await createProviders(state);
  await providers.aria2.pause(id);
  await store.update((current) => {
    ensureDownloadState(current);
    const item = current.downloads.history.find((entry) => entry.id === id || entry.gid === id);
    if (item) item.status = 'paused';
    pushActivity(current, 'download', `Paused download ${id}`);
  });
  return getDownload(store, id).then((result) => result.item);
}

export async function resumeDownload(store, id) {
  const state = await store.read();
  const { providers } = await createProviders(state);
  await providers.aria2.resume(id);
  await store.update((current) => {
    ensureDownloadState(current);
    const item = current.downloads.history.find((entry) => entry.id === id || entry.gid === id);
    if (item) item.status = 'queued';
    pushActivity(current, 'download', `Resumed download ${id}`);
  });
  return getDownload(store, id).then((result) => result.item);
}

export async function cancelDownload(store, id) {
  const state = await store.read();
  const { providers } = await createProviders(state);
  await providers.aria2.cancel(id);
  await store.update((current) => {
    ensureDownloadState(current);
    const item = current.downloads.history.find((entry) => entry.id === id || entry.gid === id);
    if (item) {
      item.status = 'cancelled';
      item.error = 'Cancelled';
      item.updatedAt = new Date().toISOString();
    }
    pushActivity(current, 'download', `Cancelled download ${id}`);
  });
}

export async function removeDownload(store, id) {
  await cancelDownload(store, id).catch(() => {});
  await store.update((current) => {
    ensureDownloadState(current);
    const before = current.downloads.history.length;
    current.downloads.history = current.downloads.history.filter((entry) => entry.id !== id && entry.gid !== id);
    if (before === current.downloads.history.length) throw notFound('Download not found');
    pushActivity(current, 'download', `Removed download ${id}`);
  });
}

export async function retryDownload(store, id) {
  const state = await store.read();
  ensureDownloadState(state);
  const history = state.downloads.history.find((entry) => entry.id === id || entry.gid === id);
  if (!history?.url) throw notFound('Download history item not found or has no source URL');
  return addDownload(store, history.url);
}

export async function downloadHealth(store) {
  const state = await store.read();
  ensureDownloadState(state);
  return getProviderHealth(state);
}

function openPath(targetPath, selectFile = false) {
  if (!targetPath) throw notFound('No local path is available for this download yet');
  if (process.platform === 'win32') {
    const args = selectFile ? ['/select,', targetPath] : [targetPath];
    spawn('explorer.exe', args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return;
  }
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(opener, [targetPath], { detached: true, stdio: 'ignore' }).unref();
}

export async function openDownloadFile(store, id) {
  const { item } = await getDownload(store, id);
  openPath(item.savePath, true);
  return { opened: true, path: item.savePath };
}

export async function openDownloadFolder(store, id) {
  const { item } = await getDownload(store, id);
  const folder = item.savePath && item.savePath.includes(item.filename)
    ? dirname(item.savePath)
    : item.savePath;
  openPath(folder, false);
  return { opened: true, path: folder };
}
