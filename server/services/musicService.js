import { basename } from 'node:path';
import { badRequest, notFound } from '../lib/errors.js';
import { addDownload } from './downloads/downloadService.js';
import { pushActivity } from './activityService.js';
import { musicCache } from './music/cache.js';
import { syncDownloadedMusic } from './music/libraryService.js';
import { MusicManager } from './music/musicManager.js';

function ensureMusicState(state) {
  new MusicManager(state);
}

const dedupeById = (items) => [...new Map((items || []).filter((item) => item?.id).map((item) => [String(item.id), item])).values()];

async function persistCatalog(store, result) {
  await store.update((state) => {
    ensureMusicState(state);
    for (const key of ['tracks', 'albums', 'artists', 'playlists']) {
      state.music.library[key] = dedupeById([...(result[key] || []), ...state.music.library[key]]).slice(0, 250);
    }
  });
}

const withManager = async (store, fn) => {
  const state = await store.read();
  const manager = new MusicManager(state);
  return fn(manager, state);
};

export async function getMusicHome(store) {
  await syncDownloadedMusic(store);
  return withManager(store, async (manager) => ({
    ...manager.getHome(),
    health: await manager.health(),
  }));
}

export async function getMusicHealth(store) {
  return withManager(store, (manager) => manager.health());
}

export async function searchMusic(store, query) {
  if (!String(query || '').trim()) throw badRequest('Search query is required');
  const result = await withManager(store, (manager) => manager.search(query));
  await persistCatalog(store, result);
  return {
    provider: { id: 'music-sky', configured: true, status: 'ready', message: 'Live Music Sky search completed.' },
    query,
    items: result.tracks,
    ...result,
    message: result.tracks.length || result.playlists.length || result.albums.length || result.artists.length
      ? 'Live results loaded.'
      : 'No matching music was found.',
  };
}

export async function trendingMusic(store) {
  const result = await withManager(store, (manager) => manager.trending());
  await persistCatalog(store, result);
  return {
    provider: { id: 'music-sky', configured: true, status: 'ready', message: 'Live discovery feed loaded.' },
    items: result.tracks || [],
    ...result,
    message: result.sections?.length ? 'Discovery feed loaded.' : 'No discovery sections are available right now.',
  };
}

export async function musicPlaylists(store) {
  const trending = await trendingMusic(store);
  return { ...trending, tracks: [], items: [], message: trending.playlists.length ? 'Playlists loaded.' : 'No playlists are available right now.' };
}

async function lookupAndPersist(store, key, id, lookup) {
  const item = await withManager(store, lookup);
  if (!item) throw notFound(`${key.slice(0, -1)} not found`);
  await persistCatalog(store, { [key]: [item] });
  return item;
}

export async function getMusicTrack(store, id) {
  const track = await lookupAndPersist(store, 'tracks', id, (manager) => manager.getTrack(id));
  return { id, track, message: 'Track loaded.' };
}

export async function getMusicPlaylist(store, id) {
  const playlist = await lookupAndPersist(store, 'playlists', id, (manager) => manager.getPlaylist(id));
  if (playlist.tracks) await persistCatalog(store, { tracks: playlist.tracks });
  return { id, playlist, message: 'Playlist loaded.' };
}

export async function getMusicAlbum(store, id) {
  const album = await lookupAndPersist(store, 'albums', id, (manager) => manager.getAlbum(id));
  if (album.tracks) await persistCatalog(store, { tracks: album.tracks });
  return { id, album, message: 'Album loaded.' };
}

export async function getMusicArtist(store, id) {
  const artist = await lookupAndPersist(store, 'artists', id, (manager) => manager.getArtist(id));
  return { id, artist, message: 'Artist loaded.' };
}

export async function getMusicQueue(store, id) {
  const tracks = await withManager(store, (manager) => manager.getQueue(id));
  await persistCatalog(store, { tracks });
  return { trackId: id, tracks };
}

export async function getMusicLyrics(store, id) {
  return withManager(store, (manager) => manager.getLyrics(id));
}

export async function getMusicStream(store, id) {
  const stream = await withManager(store, (manager) => manager.getStream(id));
  if (!stream) throw notFound('No playable stream is available for this track');
  return stream;
}

export async function getMusicArtwork(sourceUrl) {
  return musicCache.getArtwork(sourceUrl);
}

export async function downloadMusicTrack(store, id) {
  const [{ track }, stream] = await Promise.all([
    getMusicTrack(store, id),
    withManager(store, (manager) => manager.getDownload(id)),
  ]);
  const streamUrl = stream?.url || `http://127.0.0.1:4173/api/music/stream/${encodeURIComponent(id)}`;
  if (!streamUrl) throw notFound('No downloadable stream is available for this track');
  const extension = stream.contentType?.includes('mp4') ? 'm4a' : 'webm';
  const clean = (value) => String(value || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim();
  const filename = `${clean(track.artist)} - ${clean(track.title)}.${extension}`;
  const item = await addDownload(store, streamUrl, {
    filename,
    type: 'audio',
    provider: 'music-sky',
    sourceKind: 'music-stream',
    sourceUrl: track.sourceUrl,
    metadata: { musicTrack: track, quality: stream.quality },
  });
  return { ...item, filename: basename(filename) };
}

export async function updateMusicPlayer(store, body) {
  await store.update((state) => {
    const manager = new MusicManager(state);
    const player = state.music.player;
    const action = body.action;
    if (typeof body.volume === 'number') player.volume = Math.max(0, Math.min(100, body.volume));
    if (typeof body.progress === 'number') player.progress = Math.max(0, Math.min(100, body.progress));
    if (typeof body.isMuted === 'boolean') player.isMuted = body.isMuted;
    if (typeof body.shuffle === 'boolean') player.shuffle = body.shuffle;
    if (typeof body.repeat === 'boolean') player.repeat = body.repeat;
    if (Array.isArray(body.queue)) player.queue = body.queue;
    if (body.currentTrackId !== undefined) {
      player.currentTrackId = body.currentTrackId;
      if (!player.queue.some((item) => String(item) === String(body.currentTrackId))) player.queue.unshift(body.currentTrackId);
    }

    if (action === 'play') {
      if (!player.currentTrackId && player.queue[0]) player.currentTrackId = player.queue[0];
      if (!player.currentTrackId) throw badRequest('No track is loaded.');
      player.isPlaying = true;
      const id = String(player.currentTrackId);
      state.music.history.lastPlayed = new Date().toISOString();
      state.music.history.recentlyPlayed = [id, ...state.music.history.recentlyPlayed.filter((item) => item !== id)].slice(0, 50);
      state.music.history.mostPlayed[id] = (state.music.history.mostPlayed[id] || 0) + 1;
      state.music.localPlaylists.recentlyPlayed.trackIds = state.music.history.recentlyPlayed;
      pushActivity(state, 'music', `Playing ${id}`);
    }

    if (action === 'pause') player.isPlaying = false;
    if (action === 'seek') player.progress = Math.max(0, Math.min(100, Number(body.progress || 0)));
    if (action === 'next' || action === 'previous') {
      const queue = player.queue;
      if (!queue.length) return manager.getHome().player;
      const index = queue.findIndex((item) => String(item) === String(player.currentTrackId));
      const nextIndex = action === 'next'
        ? (index + 1) % queue.length
        : (index - 1 + queue.length) % queue.length;
      player.currentTrackId = queue[nextIndex];
      player.progress = 0;
    }
    return manager.getHome().player;
  });
  return getMusicHome(store).then((home) => home.player);
}

export async function setMusicLiked(store, trackId, liked) {
  await store.update((state) => {
    ensureMusicState(state);
    const ids = new Set(state.music.player.likedTrackIds.map(String));
    if (liked) ids.add(String(trackId));
    else ids.delete(String(trackId));
    state.music.player.likedTrackIds = [...ids];
    state.music.localPlaylists.favorites.trackIds = [...ids];
  });
  return getMusicHome(store).then((home) => ({ likedTrackIds: home.player.likedTrackIds }));
}

export async function completeMusicLanguages(store, selectedLanguages) {
  await store.update((state) => {
    state.settings.music.selectedLanguages = Array.isArray(selectedLanguages) ? selectedLanguages : state.settings.music.selectedLanguages;
    state.settings.music.languageModalComplete = true;
  });
  return getMusicHome(store);
}
