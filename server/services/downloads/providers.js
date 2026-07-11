import { unsupported } from '../../lib/errors.js';
import { formatBytes, formatEta, formatSpeed, toNumber } from '../../lib/format.js';
import { googleDriveDirectUrl } from './sourceDetection.js';

const aria2Keys = [
  'gid',
  'status',
  'totalLength',
  'completedLength',
  'downloadSpeed',
  'uploadSpeed',
  'connections',
  'numSeeders',
  'seeder',
  'files',
  'errorMessage',
  'bittorrent',
];

function normalizeStatus(status) {
  if (status === 'active') return 'downloading';
  if (status === 'waiting') return 'queued';
  if (status === 'paused') return 'paused';
  if (status === 'complete') return 'completed';
  if (status === 'removed') return 'cancelled';
  if (status === 'error') return 'failed';
  return status || 'queued';
}

function normalizeAria2Item(item, history = {}) {
  const total = toNumber(item.totalLength);
  const completed = toNumber(item.completedLength);
  const speed = toNumber(item.downloadSpeed);
  const firstFile = item.files?.[0];
  const filename = history.filename || firstFile?.path?.split(/[\\/]/).pop() || item.bittorrent?.info?.name || 'download';
  const progress = total > 0 ? Math.min(100, Number(((completed / total) * 100).toFixed(1))) : 0;

  return {
    id: item.gid,
    gid: item.gid,
    provider: history.provider || 'aria2',
    sourceKind: history.sourceKind || 'direct',
    filename,
    url: history.url || firstFile?.uris?.[0]?.uri || '',
    size: total > 0 ? formatBytes(total) : 'Pending metadata',
    totalBytes: total,
    completedBytes: completed,
    progress,
    speed: formatSpeed(speed),
    speedBytes: speed,
    eta: formatEta(total - completed, speed),
    status: normalizeStatus(item.status),
    type: history.type || 'file',
    savePath: firstFile?.path || history.savePath || '',
    createdAt: history.createdAt,
    updatedAt: new Date().toISOString(),
    seeds: toNumber(item.numSeeders),
    peers: toNumber(item.connections),
    error: item.errorMessage || history.error || null,
  };
}

export class Aria2Provider {
  constructor({ rpcClient }) {
    this.id = 'aria2';
    this.label = 'aria2';
    this.rpcClient = rpcClient;
  }

  async add(url, options = {}) {
    const gid = await this.rpcClient.call('addUri', [[url], options.aria2Options || {}]);
    return gid;
  }

  async pause(id) {
    await this.rpcClient.call('pause', [id]);
  }

  async resume(id) {
    await this.rpcClient.call('unpause', [id]);
  }

  async cancel(id) {
    await this.rpcClient.call('remove', [id]).catch(async (error) => {
      if (!String(error.message).includes('not found')) throw error;
      await this.rpcClient.call('removeDownloadResult', [id]);
    });
  }

  async list(historyById = new Map()) {
    const active = await this.rpcClient.call('tellActive', [aria2Keys]);
    const waiting = await this.rpcClient.call('tellWaiting', [0, 100, aria2Keys]);
    const stopped = await this.rpcClient.call('tellStopped', [0, 100, aria2Keys]);
    return [...active, ...waiting, ...stopped].map((item) => normalizeAria2Item(item, historyById.get(item.gid)));
  }

  async get(id, history) {
    const item = await this.rpcClient.call('tellStatus', [id, aria2Keys]);
    return normalizeAria2Item(item, history);
  }

  async health() {
    return this.rpcClient.health();
  }
}

export class GoogleDriveProvider {
  constructor({ aria2Provider }) {
    this.id = 'google-drive';
    this.label = 'Google Drive';
    this.aria2Provider = aria2Provider;
  }

  async add(url, options = {}) {
    const directUrl = googleDriveDirectUrl(url);
    if (!directUrl) throw unsupported('Google Drive URL does not expose a public file id');
    return this.aria2Provider.add(directUrl, options);
  }

  async health() {
    const aria2 = await this.aria2Provider.health();
    return { ok: aria2.ok, delegatedTo: 'aria2', note: 'Public file links are converted to Drive direct-download URLs.' };
  }
}

export class GitHubReleaseProvider {
  constructor({ aria2Provider }) {
    this.id = 'github-release';
    this.label = 'GitHub release assets';
    this.aria2Provider = aria2Provider;
  }

  async add(url, options = {}) {
    return this.aria2Provider.add(url, options);
  }

  async health() {
    const aria2 = await this.aria2Provider.health();
    return { ok: aria2.ok, delegatedTo: 'aria2', note: 'Release asset URLs are downloaded directly by aria2.' };
  }
}

export class MegaProvider {
  id = 'mega';
  label = 'Mega';

  async add() {
    throw unsupported('Mega downloads are not enabled yet because no Mega SDK/provider credentials are configured.');
  }

  async health() {
    return { ok: false, configured: false, reason: 'Mega provider is present but not configured.' };
  }
}

export class MediaFileProvider {
  id = 'mediafile';
  label = 'Media/file hosts';

  async add() {
    throw unsupported('This file host URL is not a direct downloadable file.');
  }

  async health() {
    return { ok: false, configured: false, reason: 'Only direct file URLs are supported right now.' };
  }
}
