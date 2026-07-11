import { Innertube, Platform } from 'youtubei.js';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { musicCache } from './cache.js';

const SEARCH_TTL = 15 * 60 * 1000;
const BROWSE_TTL = 60 * 60 * 1000;
const METADATA_TTL = 30 * 60 * 1000;

let clientPromise;
let evaluatorConfigured = false;
const streamCachePromises = new Map();

function configureEvaluator() {
  if (evaluatorConfigured) return;
  Platform.shim.eval = async (data) => new Function(data.output)();
  evaluatorConfigured = true;
}

function text(value, fallback = '') {
  if (value == null) return fallback;
  if (typeof value === 'string') return value;
  return value.toString?.() || fallback;
}

function largestThumbnail(thumbnails = []) {
  return [...thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null;
}

function artworkUrl(url) {
  return url ? `/api/music/artwork?url=${encodeURIComponent(url)}` : null;
}

function extractItems(result) {
  const items = [];
  for (const section of result?.contents || result?.sections || []) {
    if (Array.isArray(section?.contents)) items.push(...section.contents);
    else if (section?.contents) items.push(...section.contents);
  }
  return items;
}

function normalizeArtist(item) {
  const id = item.id || item.endpoint?.payload?.browseId;
  return {
    id: id || null,
    name: text(item.name || item.title),
    artwork: artworkUrl(largestThumbnail(item.thumbnails || item.thumbnail)),
    subscribers: item.subscribers || null,
    provider: 'music-sky',
  };
}

function normalizeAlbum(item) {
  const id = item.id || item.endpoint?.payload?.browseId;
  const artists = item.artists || (item.author ? [item.author] : []);
  return {
    id: id || null,
    title: text(item.title || item.name),
    artist: artists.map((artist) => artist.name).filter(Boolean).join(', '),
    artists: artists.map((artist) => ({ id: artist.channel_id || null, name: artist.name })),
    artwork: artworkUrl(largestThumbnail(item.thumbnails || item.thumbnail)),
    year: item.year || null,
    provider: 'music-sky',
  };
}

function normalizePlaylist(item) {
  const id = item.id || item.endpoint?.payload?.browseId;
  return {
    id: id?.replace(/^VL/, '') || null,
    name: text(item.title || item.name),
    description: text(item.subtitle),
    artwork: artworkUrl(largestThumbnail(item.thumbnails || item.thumbnail)),
    author: item.author?.name || null,
    trackCount: item.item_count || item.song_count || null,
    provider: 'music-sky',
  };
}

function normalizeTrack(item, overrides = {}) {
  const id = item.id || item.video_id || item.endpoint?.payload?.videoId;
  const artists = item.artists || (item.author ? [{ name: item.author }] : []);
  const album = item.album || null;
  const durationSeconds = item.duration?.seconds || overrides.durationSeconds || 0;
  return {
    id,
    title: text(item.title, overrides.title || 'Unknown track'),
    artist: artists.map((artist) => artist.name).filter(Boolean).join(', ') || overrides.artist || 'Unknown artist',
    artists: artists.map((artist) => ({ id: artist.channel_id || null, name: artist.name })),
    album: album?.name || overrides.album || '',
    albumId: album?.id || null,
    duration: item.duration?.text || (durationSeconds ? formatDuration(durationSeconds) : '--:--'),
    durationSeconds,
    artwork: artworkUrl(largestThumbnail(item.thumbnails || item.thumbnail || overrides.thumbnails)),
    provider: 'music-sky',
    sourceUrl: id ? `https://music.youtube.com/watch?v=${id}` : null,
    quality: overrides.quality || null,
  };
}

function normalizeUnknown(item) {
  if (['song', 'video', 'non_music_track'].includes(item.item_type) || item.video_id) return { type: 'track', item: normalizeTrack(item) };
  if (item.item_type === 'album') return { type: 'album', item: normalizeAlbum(item) };
  if (['artist', 'library_artist'].includes(item.item_type)) return { type: 'artist', item: normalizeArtist(item) };
  if (item.item_type === 'playlist') return { type: 'playlist', item: normalizePlaylist(item) };
  return null;
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatQuality(format) {
  if (!format) return null;
  const codecMatch = format.mime_type?.match(/codecs="([^"]+)"/);
  return {
    codec: codecMatch?.[1] || null,
    container: format.mime_type?.split(';')[0]?.split('/')[1] || null,
    bitrate: format.bitrate || null,
    bitrateLabel: format.bitrate ? `${Math.round(format.bitrate / 1000)} kbps` : null,
    sampleRate: format.audio_sample_rate || null,
    sampleRateLabel: format.audio_sample_rate ? `${(format.audio_sample_rate / 1000).toFixed(format.audio_sample_rate % 1000 ? 1 : 0)} kHz` : null,
    channels: format.audio_channels || null,
    quality: format.audio_quality || null,
    contentLength: format.content_length || null,
  };
}

function selectAudioFormat(formats) {
  return formats.find((format) => format.mime_type?.includes('audio/mp4'))
    || formats.toSorted((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
}

function extensionForFormat(format) {
  if (format?.mime_type?.includes('audio/mp4')) return '.m4a';
  if (format?.mime_type?.includes('audio/webm')) return '.webm';
  return '.audio';
}

async function cachedStreamFile(id, info, format) {
  const cacheKey = `${id}:${format.itag || 'audio'}:${format.content_length || 'unknown'}`;
  const filePath = musicCache.path('streams', cacheKey, extensionForFormat(format));
  try {
    const fileStat = await stat(filePath);
    if (!format.content_length || fileStat.size === Number(format.content_length)) return filePath;
  } catch {
    // Cache miss; download below.
  }

  if (streamCachePromises.has(filePath)) return streamCachePromises.get(filePath);

  const promise = (async () => {
    await mkdir(dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await rm(tempPath, { force: true }).catch(() => {});
    try {
      const stream = await info.download({ type: 'audio', format: format.mime_type?.includes('mp4') ? 'mp4' : 'any' });
      await pipeline(Readable.fromWeb(stream), createWriteStream(tempPath));
      await rename(tempPath, filePath);
      return filePath;
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => {});
      throw error;
    } finally {
      streamCachePromises.delete(filePath);
    }
  })();

  streamCachePromises.set(filePath, promise);
  return promise;
}

async function createClient() {
  configureEvaluator();
  return Innertube.create({
    lang: 'en',
    location: 'IN',
    retrieve_player: true,
    generate_session_locally: true,
    enable_session_cache: true,
  });
}

export class EchoMusicProvider {
  id = 'music-sky';
  label = 'Music Sky Catalog';

  async client() {
    clientPromise ||= createClient().catch((error) => {
      clientPromise = null;
      throw error;
    });
    return clientPromise;
  }

  async health() {
    const startedAt = Date.now();
    try {
      await this.client();
      return { id: this.id, label: this.label, ok: true, configured: true, latencyMs: Date.now() - startedAt };
    } catch (error) {
      return { id: this.id, label: this.label, ok: false, configured: true, reason: error.message };
    }
  }

  async search(query) {
    const key = query.trim().toLowerCase();
    if (!key) return { tracks: [], albums: [], artists: [], playlists: [] };
    const cached = await musicCache.get('search', key, SEARCH_TTL);
    if (cached) return cached;

    const client = await this.client();
    const [songs, albums, artists, playlists] = await Promise.all([
      client.music.search(query, { type: 'song' }),
      client.music.search(query, { type: 'album' }),
      client.music.search(query, { type: 'artist' }),
      client.music.search(query, { type: 'playlist' }),
    ]);
    const result = {
      tracks: extractItems(songs).map(normalizeTrack).filter((item) => item.id),
      albums: extractItems(albums).map(normalizeAlbum).filter((item) => item.id),
      artists: extractItems(artists).map(normalizeArtist).filter((item) => item.id),
      playlists: extractItems(playlists).map(normalizePlaylist).filter((item) => item.id),
    };
    return musicCache.set('search', key, result);
  }

  async trending() {
    const cached = await musicCache.get('trending', 'explore', SEARCH_TTL);
    if (cached) return cached;
    const client = await this.client();
    const explore = await client.music.getExplore();
    const sections = (explore.sections || []).map((section) => {
      const items = (section.contents || []).map(normalizeUnknown).filter(Boolean);
      return { id: text(section.header?.title || section.header?.strapline).toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: text(section.header?.title || section.header?.strapline, 'Explore'), items };
    }).filter((section) => section.items.length);
    const result = {
      sections,
      tracks: sections.flatMap((section) => section.items.filter((entry) => entry.type === 'track').map((entry) => entry.item)),
      albums: sections.flatMap((section) => section.items.filter((entry) => entry.type === 'album').map((entry) => entry.item)),
      artists: sections.flatMap((section) => section.items.filter((entry) => entry.type === 'artist').map((entry) => entry.item)),
      playlists: sections.flatMap((section) => section.items.filter((entry) => entry.type === 'playlist').map((entry) => entry.item)),
    };
    return musicCache.set('trending', 'explore', result);
  }

  async getTrack(id) {
    const cached = await musicCache.get('metadata', `track:v2:${id}`, METADATA_TTL);
    if (cached) return cached;
    const client = await this.client();
    const info = await client.music.getInfo(id);
    const formats = info.streaming_data?.adaptive_formats?.filter((format) => format.has_audio && !format.has_video) || [];
    const best = selectAudioFormat(formats);
    const track = normalizeTrack({
      id,
      title: info.basic_info.title,
      author: info.basic_info.author,
      duration: { seconds: info.basic_info.duration, text: formatDuration(info.basic_info.duration || 0) },
      thumbnail: info.basic_info.thumbnail,
    }, {
      title: info.basic_info.title,
      artist: info.basic_info.author,
      durationSeconds: info.basic_info.duration,
      thumbnails: info.basic_info.thumbnail,
      quality: formatQuality(best),
    });
    track.viewCount = info.basic_info.view_count || null;
    return musicCache.set('metadata', `track:v2:${id}`, track);
  }

  async getAlbum(id) {
    const cached = await musicCache.get('albums', id, BROWSE_TTL);
    if (cached) return cached;
    const client = await this.client();
    const page = await client.music.getAlbum(id);
    const header = page.header || {};
    const result = {
      id,
      title: text(header.title),
      description: text(header.description),
      artist: header.author?.name || text(header.strapline_text_one),
      year: header.year || null,
      artwork: artworkUrl(largestThumbnail(header.thumbnails || header.thumbnail?.contents || page.background?.contents)),
      tracks: (page.contents || []).map(normalizeTrack).filter((item) => item.id),
      provider: 'music-sky',
    };
    return musicCache.set('albums', id, result);
  }

  async getArtist(id) {
    const cached = await musicCache.get('artists', id, BROWSE_TTL);
    if (cached) return cached;
    const client = await this.client();
    const page = await client.music.getArtist(id);
    const header = page.header || {};
    const sections = (page.sections || []).map((section) => ({
      title: text(section.header?.title || section.title),
      items: (section.contents || []).map(normalizeUnknown).filter(Boolean),
    })).filter((section) => section.items.length);
    const result = {
      id,
      name: text(header.title),
      description: text(header.description),
      artwork: artworkUrl(largestThumbnail(header.thumbnail?.contents || header.thumbnail || [])),
      sections,
      provider: 'music-sky',
    };
    return musicCache.set('artists', id, result);
  }

  async getPlaylist(id) {
    const cached = await musicCache.get('playlists', id, BROWSE_TTL);
    if (cached) return cached;
    const client = await this.client();
    const page = await client.music.getPlaylist(id);
    const header = page.header || {};
    const result = {
      id,
      name: text(header.title),
      description: text(header.description),
      author: header.author?.name || text(header.strapline_text_one),
      artwork: artworkUrl(largestThumbnail(header.thumbnails || header.thumbnail?.contents || page.background?.contents)),
      tracks: (page.items || []).map(normalizeTrack).filter((item) => item.id),
      provider: 'music-sky',
    };
    return musicCache.set('playlists', id, result);
  }

  async getQueue(id) {
    const client = await this.client();
    const panel = await client.music.getUpNext(id);
    return (panel.contents || []).map(normalizeTrack).filter((item) => item.id);
  }

  async getLyrics(id) {
    const cached = await musicCache.get('lyrics', id, BROWSE_TTL);
    if (cached) return cached;
    const client = await this.client();
    try {
      const lyrics = await client.music.getLyrics(id);
      const result = { trackId: id, text: text(lyrics?.description), footer: text(lyrics?.footer), synced: false, provider: 'music-sky' };
      return musicCache.set('lyrics', id, result);
    } catch (error) {
      return { trackId: id, text: '', footer: '', synced: false, provider: 'music-sky', error: error.message };
    }
  }

  async getStream(id) {
    const client = await this.client();
    const info = await client.music.getInfo(id);
    const formats = info.streaming_data?.adaptive_formats?.filter((format) => format.has_audio && !format.has_video) || [];
    const format = selectAudioFormat(formats) || info.chooseFormat({ type: 'audio', quality: 'best', format: 'any' });
    const filePath = await cachedStreamFile(id, info, format);
    return { kind: 'file', filePath, contentType: format.mime_type || 'audio/mp4', quality: formatQuality(format) };
  }

  async getDownload(id) {
    return this.getStream(id);
  }
}

export const echoMusicProvider = new EchoMusicProvider();
