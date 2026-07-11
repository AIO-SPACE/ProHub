import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { seedState } from './data/seed.js';
import { HttpError, notFound } from './lib/errors.js';
import { handleError, readJsonBody, sendJson, sendNoContent, serveStatic } from './lib/http.js';
import { createStore } from './store.js';
import { getApps, checkApps, getRepoReleases, updateRepoSetting } from './services/appsService.js';
import { cloudProviderAction, getCloud } from './services/cloudService.js';
import { getDashboard } from './services/dashboardService.js';
import {
  addBatch,
  addDownload,
  cancelDownload,
  downloadHealth,
  getDownload,
  listDownloads,
  openDownloadFile,
  openDownloadFolder,
  pauseDownload,
  removeDownload,
  resumeDownload,
  retryDownload,
} from './services/downloads/downloadService.js';
import {
  completeMusicLanguages,
  getMusicHome,
  getMusicTrack,
  getMusicAlbum,
  getMusicArtist,
  getMusicPlaylist,
  getMusicHealth,
  getMusicArtwork,
  getMusicLyrics,
  getMusicQueue,
  getMusicStream,
  downloadMusicTrack,
  musicPlaylists,
  setMusicLiked,
  updateMusicPlayer,
  searchMusic,
  trendingMusic,
} from './services/musicService.js';
import {
  downloadMedia,
  getMediaDetails,
  getMediaEpisodes,
  getMediaHome,
  getMediaLibrary,
  getMediaProviders,
  getMediaStream,
  getMediaSubtitles,
  getMovieArtwork,
  searchMedia,
  setMediaFavorite,
  setMediaWatchLater,
  updateMediaHistory,
} from './services/movieService.js';
import { getVpnStatus, rejectVpnAction } from './services/vpnService.js';

const FALLBACK_ARTWORK = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="960" viewBox="0 0 640 960">
  <rect width="640" height="960" fill="#17181d"/>
  <rect x="70" y="90" width="500" height="780" rx="28" fill="#20222a" stroke="#343743" stroke-width="2"/>
  <circle cx="320" cy="430" r="92" fill="#2f323c"/>
  <path d="M292 384v92l78-46-78-46z" fill="#f43f5e"/>
  <text x="320" y="575" text-anchor="middle" fill="#a9acb6" font-family="Arial, sans-serif" font-size="34" font-weight="700">Movie Sky</text>
</svg>
`);

const patchDeep = (target, patch) => {
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      patchDeep(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
};

function ensureMovieBoxSettings(settings) {
  settings.apiKeys ||= [];
  const movieBoxKey = seedState.settings.apiKeys.find((item) => item.id === 'moviebox');
  if (movieBoxKey && !settings.apiKeys.some((item) => item.id === movieBoxKey.id)) {
    settings.apiKeys.push({ ...movieBoxKey });
  }
  settings.moviebox = { ...seedState.settings.moviebox, ...(settings.moviebox || {}) };
  return settings;
}

async function settingsRoutes(req, res, store, parts) {
  const [, action] = parts;

  if (req.method === 'GET' && !action) {
    const settings = await store.update((state) => ensureMovieBoxSettings(state.settings));
    return sendJson(res, 200, settings);
  }

  if (req.method === 'PATCH' && !action) {
    const body = await readJsonBody(req);
    const settings = await store.update((state) => {
      patchDeep(state.settings, body);
      ensureMovieBoxSettings(state.settings);
      return state.settings;
    });
    return sendJson(res, 200, settings);
  }

  if (req.method === 'POST' && action === 'test-key') {
    const body = await readJsonBody(req);
    const settings = await store.update((current) => ensureMovieBoxSettings(current.settings));
    const key = settings.apiKeys.find((item) => item.id === body.id);
    return sendJson(res, 200, {
      id: body.id,
      ok: Boolean(key?.value),
      message: key?.value ? `${key.label} is stored on the backend` : `${key?.label || 'API key'} is empty`,
    });
  }

  throw notFound('Settings route not found');
}

async function downloadsRoutes(req, res, store, parts) {
  const [, id, action] = parts;

  if (req.method === 'GET' && !id) {
    return sendJson(res, 200, await listDownloads(store));
  }

  if (req.method === 'GET' && id === 'health') {
    return sendJson(res, 200, await downloadHealth(store));
  }

  if (req.method === 'POST' && (!id || id === 'add')) {
    const body = await readJsonBody(req);
    return sendJson(res, 201, await addDownload(store, body.url));
  }

  if (req.method === 'POST' && id === 'batch') {
    const body = await readJsonBody(req);
    return sendJson(res, 207, { results: await addBatch(store, body.urls) });
  }

  if (req.method === 'GET' && id && !action) {
    return sendJson(res, 200, await getDownload(store, id));
  }

  if (req.method === 'PATCH' && id && action === 'pause') {
    return sendJson(res, 200, await pauseDownload(store, id));
  }

  if (req.method === 'PATCH' && id && action === 'resume') {
    return sendJson(res, 200, await resumeDownload(store, id));
  }

  if (req.method === 'PATCH' && id && action === 'retry') {
    return sendJson(res, 201, await retryDownload(store, id));
  }

  if (req.method === 'PATCH' && id && action === 'cancel') {
    await cancelDownload(store, id);
    return sendJson(res, 200, { id, status: 'cancelled' });
  }

  if (req.method === 'POST' && id && action === 'open-file') {
    return sendJson(res, 200, await openDownloadFile(store, id));
  }

  if (req.method === 'POST' && id && action === 'open-folder') {
    return sendJson(res, 200, await openDownloadFolder(store, id));
  }

  if (req.method === 'DELETE' && id && !action) {
    await removeDownload(store, id);
    return sendNoContent(res);
  }

  throw notFound('Download route not found');
}

function streamContentType(filePath) {
  const extension = extname(filePath).toLowerCase();
  if (extension === '.m4a' || extension === '.mp4') return 'audio/mp4';
  if (extension === '.mp3') return 'audio/mpeg';
  if (extension === '.flac') return 'audio/flac';
  if (extension === '.ogg' || extension === '.opus') return 'audio/ogg';
  return 'audio/webm';
}

function videoContentType(filePath, fallback = 'video/mp4') {
  const extension = extname(filePath).toLowerCase();
  if (extension === '.mp4' || extension === '.m4v') return 'video/mp4';
  if (extension === '.webm') return 'video/webm';
  if (extension === '.ogv' || extension === '.ogg') return 'video/ogg';
  return fallback;
}

function pipeToResponse(readable, res) {
  readable.on('error', (error) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: error.message || 'Stream failed' }));
      return;
    }
    res.destroy(error);
  });
  res.on('close', () => readable.destroy?.());
  readable.pipe(res);
}

function sendFallbackArtwork(res) {
  res.writeHead(200, {
    'content-type': 'image/svg+xml',
    'cache-control': 'public, max-age=300',
    'content-length': FALLBACK_ARTWORK.length,
  });
  res.end(FALLBACK_ARTWORK);
}

async function sendLocalAudio(req, res, filePath) {
  const fileStat = await stat(filePath);
  const range = req.headers.range;
  const headers = { 'content-type': streamContentType(filePath), 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
  if (!range) {
    res.writeHead(200, { ...headers, 'content-length': fileStat.size });
    pipeToResponse(createReadStream(filePath), res);
    return;
  }
  const match = range.match(/bytes=(\d+)-(\d*)/);
  const start = Number(match?.[1] || 0);
  const end = match?.[2] ? Math.min(Number(match[2]), fileStat.size - 1) : fileStat.size - 1;
  if (start > end || start >= fileStat.size) throw new HttpError(416, 'Requested audio range is invalid');
  res.writeHead(206, {
    ...headers,
    'content-length': end - start + 1,
    'content-range': `bytes ${start}-${end}/${fileStat.size}`,
  });
  pipeToResponse(createReadStream(filePath, { start, end }), res);
}

async function sendLocalAudioHead(res, filePath) {
  const fileStat = await stat(filePath);
  res.writeHead(200, {
    'content-type': streamContentType(filePath),
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
    'content-length': fileStat.size,
  });
  res.end();
}

async function fetchRemoteAudio(stream, headers) {
  return fetch(stream.url, { headers, signal: AbortSignal.timeout(20_000) });
}

const REMOTE_AUDIO_CHUNK_SIZE = 256 * 1024;

function remoteRangeHeader(requestRange, contentLength) {
  const total = Number(contentLength) || 0;
  const match = requestRange?.match(/bytes=(\d+)-(\d*)/);
  const start = Number(match?.[1] || 0);
  const requestedEnd = match?.[2] ? Number(match[2]) : start + REMOTE_AUDIO_CHUNK_SIZE - 1;
  const maxEnd = start + REMOTE_AUDIO_CHUNK_SIZE - 1;
  const end = total
    ? Math.min(requestedEnd, maxEnd, total - 1)
    : Math.min(requestedEnd, maxEnd);
  return `bytes=${start}-${Math.max(start, end)}`;
}

async function sendRemoteAudio(req, res, stream, refreshStream) {
  const headers = { range: remoteRangeHeader(req.headers.range, stream.quality?.contentLength) };
  let upstream = await fetchRemoteAudio(stream, headers);
  if ([401, 403, 410].includes(upstream.status) && typeof refreshStream === 'function') {
    upstream.body?.cancel().catch(() => {});
    stream = await refreshStream();
    headers.range = remoteRangeHeader(req.headers.range, stream.quality?.contentLength);
    upstream = await fetchRemoteAudio(stream, headers);
  }
  if (!upstream.ok || !upstream.body) throw new HttpError(502, `Music provider stream failed with ${upstream.status}`);
  const responseHeaders = {
    'content-type': upstream.headers.get('content-type') || stream.contentType || 'audio/webm',
    'accept-ranges': upstream.headers.get('accept-ranges') || 'bytes',
    'cache-control': 'no-store',
  };
  for (const name of ['content-length', 'content-range']) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders[name] = value;
  }
  res.writeHead(upstream.status, responseHeaders);
  pipeToResponse(Readable.fromWeb(upstream.body), res);
}

function sendRemoteAudioHead(res, stream) {
  const headers = {
    'content-type': stream.contentType || 'audio/webm',
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
  };
  if (stream.quality?.contentLength) headers['content-length'] = stream.quality.contentLength;
  res.writeHead(200, headers);
  res.end();
}

async function sendLocalVideo(req, res, filePath, fallbackContentType) {
  const fileStat = await stat(filePath);
  const range = req.headers.range;
  const headers = { 'content-type': videoContentType(filePath, fallbackContentType), 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
  if (!range) {
    res.writeHead(200, { ...headers, 'content-length': fileStat.size });
    pipeToResponse(createReadStream(filePath), res);
    return;
  }
  const match = range.match(/bytes=(\d+)-(\d*)/);
  const start = Number(match?.[1] || 0);
  const end = match?.[2] ? Math.min(Number(match[2]), fileStat.size - 1) : fileStat.size - 1;
  if (start > end || start >= fileStat.size) throw new HttpError(416, 'Requested video range is invalid');
  res.writeHead(206, {
    ...headers,
    'content-length': end - start + 1,
    'content-range': `bytes ${start}-${end}/${fileStat.size}`,
  });
  pipeToResponse(createReadStream(filePath, { start, end }), res);
}

async function sendRemoteVideo(req, res, stream) {
  const headers = req.headers.range ? { range: req.headers.range } : {};
  const upstream = await fetch(stream.url, { headers });
  if (!upstream.ok || !upstream.body) throw new HttpError(502, `Movie provider stream failed with ${upstream.status}`);
  const responseHeaders = {
    'content-type': upstream.headers.get('content-type') || stream.contentType || 'video/mp4',
    'accept-ranges': upstream.headers.get('accept-ranges') || 'bytes',
    'cache-control': 'no-store',
  };
  for (const name of ['content-length', 'content-range']) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders[name] = value;
  }
  res.writeHead(upstream.status, responseHeaders);
  pipeToResponse(Readable.fromWeb(upstream.body), res);
}

function sendRemoteVideoHead(res, stream) {
  const headers = {
    'content-type': stream.contentType || 'video/mp4',
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
  };
  if (stream.quality?.size) headers['content-length'] = stream.quality.size;
  res.writeHead(200, headers);
  res.end();
}

async function musicRoutes(req, res, store, parts, url) {
  const [, action, id] = parts;

  if (req.method === 'GET' && !action) {
    return sendJson(res, 200, await getMusicHome(store));
  }

  if (req.method === 'GET' && action === 'search') {
    return sendJson(res, 200, await searchMusic(store, url.searchParams.get('q') || ''));
  }

  if (req.method === 'GET' && action === 'trending') {
    return sendJson(res, 200, await trendingMusic(store));
  }

  if (req.method === 'GET' && action === 'playlists') {
    return sendJson(res, 200, await musicPlaylists(store));
  }

  if (req.method === 'GET' && action === 'health') {
    return sendJson(res, 200, await getMusicHealth(store));
  }

  if (req.method === 'GET' && action === 'artwork') {
    const sourceUrl = url.searchParams.get('url');
    if (!sourceUrl) throw new HttpError(400, 'Artwork url is required');
    const artwork = await getMusicArtwork(sourceUrl);
    res.writeHead(200, { 'content-type': artwork.contentType, 'cache-control': 'public, max-age=86400' });
    createReadStream(artwork.filePath).pipe(res);
    return;
  }

  if (req.method === 'GET' && action === 'track' && id) {
    return sendJson(res, 200, await getMusicTrack(store, id));
  }

  if (req.method === 'GET' && action === 'playlist' && id) {
    return sendJson(res, 200, await getMusicPlaylist(store, id));
  }

  if (req.method === 'GET' && action === 'album' && id) {
    return sendJson(res, 200, await getMusicAlbum(store, id));
  }

  if (req.method === 'GET' && action === 'artist' && id) {
    return sendJson(res, 200, await getMusicArtist(store, id));
  }

  if (req.method === 'GET' && action === 'queue' && id) {
    return sendJson(res, 200, await getMusicQueue(store, id));
  }

  if (req.method === 'GET' && action === 'lyrics' && id) {
    return sendJson(res, 200, await getMusicLyrics(store, id));
  }

  if (req.method === 'HEAD' && action === 'stream' && id) {
    const stream = await getMusicStream(store, id);
    if (stream.kind === 'file') await sendLocalAudioHead(res, stream.filePath);
    else sendRemoteAudioHead(res, stream);
    return;
  }

  if (req.method === 'GET' && action === 'stream' && id) {
    const stream = await getMusicStream(store, id);
    if (stream.kind === 'file') await sendLocalAudio(req, res, stream.filePath);
    else await sendRemoteAudio(req, res, stream, () => getMusicStream(store, id));
    return;
  }

  if (req.method === 'POST' && action === 'download' && id) {
    return sendJson(res, 201, await downloadMusicTrack(store, id));
  }

  if (req.method === 'PATCH' && action === 'liked' && id) {
    const body = await readJsonBody(req);
    return sendJson(res, 200, await setMusicLiked(store, id, Boolean(body.liked)));
  }

  if (req.method === 'PATCH' && action === 'player') {
    const body = await readJsonBody(req);
    return sendJson(res, 200, await updateMusicPlayer(store, body));
  }

  if (req.method === 'PATCH' && action === 'languages') {
    const body = await readJsonBody(req);
    return sendJson(res, 200, await completeMusicLanguages(store, body.selectedLanguages));
  }

  throw notFound('Music route not found');
}

async function mediaRoutes(req, res, store, parts, url, scope) {
  const [, action, id, subAction] = parts;
  const itemId = id ? decodeURIComponent(id) : url.searchParams.get('id');

  if (req.method === 'GET' && (!action || action === 'home')) {
    return sendJson(res, 200, await getMediaHome(store, scope));
  }

  if (req.method === 'GET' && action === 'search') {
    return sendJson(res, 200, await searchMedia(store, scope, url.searchParams.get('q') || '', {
      type: url.searchParams.get('type') || 'all',
      genre: url.searchParams.get('genre') || 'all',
      sort: url.searchParams.get('sort') || 'popular',
    }));
  }

  if (req.method === 'GET' && action === 'providers') {
    return sendJson(res, 200, await getMediaProviders(store, scope));
  }

  if (req.method === 'GET' && action === 'artwork') {
    const sourceUrl = url.searchParams.get('url');
    if (!sourceUrl) throw new HttpError(400, 'Artwork url is required');
    const artwork = await getMovieArtwork(sourceUrl).catch(() => null);
    if (!artwork) return sendFallbackArtwork(res);
    res.writeHead(200, { 'content-type': artwork.contentType, 'cache-control': 'public, max-age=86400' });
    pipeToResponse(createReadStream(artwork.filePath), res);
    return;
  }

  if (req.method === 'GET' && action === 'details' && itemId) {
    return sendJson(res, 200, await getMediaDetails(store, scope, itemId));
  }

  if (req.method === 'GET' && action === 'episodes' && itemId) {
    return sendJson(res, 200, await getMediaEpisodes(store, scope, itemId, url.searchParams.get('season')));
  }

  if (req.method === 'HEAD' && action === 'stream' && itemId) {
    const stream = await getMediaStream(store, scope, itemId);
    if (stream.kind === 'file') {
      const fileStat = await stat(stream.filePath);
      res.writeHead(200, {
        'content-type': videoContentType(stream.filePath, stream.contentType),
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
        'content-length': fileStat.size,
      });
      res.end();
    } else {
      sendRemoteVideoHead(res, stream);
    }
    return;
  }

  if (req.method === 'GET' && action === 'stream' && itemId) {
    const stream = await getMediaStream(store, scope, itemId);
    if (stream.kind === 'file') await sendLocalVideo(req, res, stream.filePath, stream.contentType);
    else await sendRemoteVideo(req, res, stream);
    return;
  }

  if (req.method === 'POST' && action === 'download' && itemId) {
    return sendJson(res, 201, await downloadMedia(store, scope, itemId));
  }

  if (req.method === 'GET' && action === 'library') {
    return sendJson(res, 200, await getMediaLibrary(store, scope));
  }

  if (req.method === 'GET' && action === 'history') {
    return sendJson(res, 200, (await getMediaLibrary(store, scope)).history);
  }

  if (req.method === 'PATCH' && action === 'history') {
    const body = await readJsonBody(req);
    return sendJson(res, 200, await updateMediaHistory(store, scope, body));
  }

  if (req.method === 'GET' && action === 'favorites') {
    return sendJson(res, 200, (await getMediaLibrary(store, scope)).favorites);
  }

  if (req.method === 'PATCH' && action === 'favorites' && itemId) {
    const body = await readJsonBody(req);
    return sendJson(res, 200, await setMediaFavorite(store, scope, itemId, Boolean(body.favorite)));
  }

  if (req.method === 'PATCH' && action === 'watch-later' && itemId) {
    const body = await readJsonBody(req);
    return sendJson(res, 200, await setMediaWatchLater(store, scope, itemId, Boolean(body.saved)));
  }

  if (req.method === 'GET' && action === 'subtitles' && itemId) {
    return sendJson(res, 200, { itemId, subtitles: await getMediaSubtitles(store, scope, itemId) });
  }

  if (req.method === 'GET' && action === 'series' && itemId && subAction === 'episodes') {
    return sendJson(res, 200, await getMediaEpisodes(store, scope, itemId, url.searchParams.get('season')));
  }

  throw notFound('Media route not found');
}

async function appsRoutes(req, res, store, parts) {
  const [, action, id, subAction] = parts;

  if (req.method === 'GET' && !action) {
    return sendJson(res, 200, await getApps(store));
  }

  if (req.method === 'POST' && action === 'check') {
    return sendJson(res, 200, await checkApps(store));
  }

  if (req.method === 'PATCH' && action === 'repos' && id) {
    const body = await readJsonBody(req);
    return sendJson(res, 200, await updateRepoSetting(store, id, body));
  }

  if (req.method === 'GET' && action === 'repos' && id && subAction === 'releases') {
    return sendJson(res, 200, await getRepoReleases(store, decodeURIComponent(id)));
  }

  throw notFound('Apps route not found');
}

async function cloudRoutes(req, res, store, parts) {
  const [, action, id, operation] = parts;

  if (req.method === 'GET' && !action) {
    return sendJson(res, 200, await getCloud(store));
  }

  if (action === 'providers' && id && operation) {
    const body = req.method === 'GET' ? {} : await readJsonBody(req);
    return sendJson(res, 200, await cloudProviderAction(store, id, operation, body));
  }

  throw notFound('Cloud route not found');
}

async function vpnRoutes(req, res, store, parts) {
  const [, action] = parts;

  if (req.method === 'GET' && !action) {
    return sendJson(res, 200, await getVpnStatus(store));
  }

  if (req.method === 'POST' && ['connect', 'disconnect'].includes(action)) {
    await rejectVpnAction();
  }

  throw notFound('VPN route not found');
}

async function routeApi(req, res, store) {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const [resource] = parts;

  if (req.method === 'GET' && !resource) {
    return sendJson(res, 200, {
      app: 'ProHub API',
      resources: ['dashboard', 'downloads', 'music', 'movie', 'anime', 'cloud', 'apps', 'vpn', 'settings'],
    });
  }

  if (req.method === 'GET' && resource === 'health') {
    const state = await store.read();
    const downloads = await downloadHealth(store);
    return sendJson(res, 200, {
      status: 'ok',
      service: 'prohub-backend',
      version: state.meta.version,
      checkedAt: new Date().toISOString(),
      downloads: downloads.engine,
    });
  }

  if (resource === 'dashboard' && req.method === 'GET') return sendJson(res, 200, await getDashboard(store));
  if (resource === 'downloads') return downloadsRoutes(req, res, store, parts);
  if (resource === 'music') return musicRoutes(req, res, store, parts, url);
  if (resource === 'movie' || resource === 'anime') return mediaRoutes(req, res, store, parts, url, resource);
  if (resource === 'cloud') return cloudRoutes(req, res, store, parts);
  if (resource === 'apps') return appsRoutes(req, res, store, parts);
  if (resource === 'vpn') return vpnRoutes(req, res, store, parts);
  if (resource === 'settings') return settingsRoutes(req, res, store, parts);

  throw notFound('API route not found');
}

export function createApp(options = {}) {
  const store = options.store || createStore(options.statePath);
  const staticRoot = options.staticRoot || fileURLToPath(new URL('../dist', import.meta.url));

  return async function handleRequest(req, res) {
    res.setHeader('access-control-allow-origin', options.corsOrigin || '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type, range');
    res.setHeader('access-control-expose-headers', 'content-length, content-range, accept-ranges');

    if (req.method === 'OPTIONS') {
      sendNoContent(res);
      return;
    }

    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        await routeApi(req, res, store);
      } else if (!(await serveStatic(req, res, staticRoot))) {
        throw new HttpError(404, 'Route not found');
      }
    } catch (error) {
      handleError(res, error, { method: req.method, url: req.url });
    }
  };
}
