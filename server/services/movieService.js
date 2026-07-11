import { basename } from 'node:path';
import { badRequest, notFound, unavailable } from '../lib/errors.js';
import { addDownload } from './downloads/downloadService.js';
import { pushActivity } from './activityService.js';
import { movieCache } from './movie/cache.js';
import { ProviderManager, ensureMovieState } from './movie/movieManager.js';
import { syncDownloadedMovies } from './movie/libraryService.js';

const dedupeById = (items) => [...new Map((items || []).filter((item) => item?.id).map((item) => [String(item.id), item])).values()];
const scopeName = (scope) => (scope === 'anime' ? 'Anime Sky' : 'Movie Sky');
const inScope = (item, scope) => (scope === 'anime' ? item?.mediaKind === 'anime' : item?.mediaKind !== 'anime');

const withManager = async (store, scope, fn) => {
  const state = await store.read();
  const manager = new ProviderManager(state, scope);
  return fn(manager, state);
};

async function persistCatalog(store, payload = {}) {
  await store.update((state) => {
    ensureMovieState(state);
    if (payload.movies?.length) state.movie.library.movies = dedupeById([...payload.movies, ...state.movie.library.movies]).slice(0, 600);
    if (payload.series?.length) state.movie.library.series = dedupeById([...payload.series, ...state.movie.library.series]).slice(0, 600);
    if (payload.items?.length) {
      state.movie.library.movies = dedupeById([...payload.items.filter((item) => item.type === 'movie'), ...state.movie.library.movies]).slice(0, 600);
      state.movie.library.series = dedupeById([...payload.items.filter((item) => item.type === 'series'), ...state.movie.library.series]).slice(0, 600);
    }
  });
}

function applyPersonalState(item, state) {
  if (!item) return item;
  const progress = state.movie.history.progress[item.id] || null;
  return {
    ...item,
    favorite: state.movie.favorites.itemIds.includes(item.id),
    watchLater: state.movie.watchLater.itemIds.includes(item.id),
    resume: progress,
  };
}

function findKnownItem(state, id) {
  ensureMovieState(state);
  return [
    ...state.movie.library.movies,
    ...state.movie.library.series,
    ...state.movie.library.downloaded,
  ].find((item) => String(item.id) === String(id)) || null;
}

function scopedPersonalIds(state, scope, ids) {
  return ids.filter((id) => inScope(findKnownItem(state, id), scope));
}

export async function getMediaHome(store, scope = 'movie') {
  await syncDownloadedMovies(store);
  const [home, health] = await withManager(store, scope, (manager) => Promise.all([manager.discover(), manager.health()]));
  const sections = home.sections || [];
  const flatItems = sections.flatMap((section) => section.items || []);
  await persistCatalog(store, { items: flatItems });
  return withManager(store, scope, async (manager, state) => ({
    ...manager.getHomeState(),
    sections: sections.map((section) => ({
      ...section,
      items: section.items.map((item) => applyPersonalState(item, state)),
    })),
    continueWatching: state.movie.history.recentlyWatched
      .map((id) => applyPersonalState(findKnownItem(state, id), state))
      .filter((item) => inScope(item, scope)),
    favorites: { itemIds: scopedPersonalIds(state, scope, state.movie.favorites.itemIds) },
    watchLater: { itemIds: scopedPersonalIds(state, scope, state.movie.watchLater.itemIds) },
    history: {
      ...state.movie.history,
      recentlyWatched: scopedPersonalIds(state, scope, state.movie.history.recentlyWatched),
    },
    providers: health.providers,
    providerErrors: home.providerErrors || [],
    message: sections.length ? `${scopeName(scope)} home loaded.` : 'No provider sections are available right now.',
  }));
}

export async function getMediaProviders(store, scope = 'movie') {
  return withManager(store, scope, (manager) => manager.health());
}

export async function searchMedia(store, scope, query, options = {}) {
  if (!String(query || '').trim()) throw badRequest('Search query is required');
  const result = await withManager(store, scope, (manager) => manager.search(query, options));
  await persistCatalog(store, result);
  return withManager(store, scope, (manager, state) => ({
    provider: { id: `${scope}-sky`, configured: true, status: 'ready', message: `${scopeName(scope)} search completed.` },
    query,
    ...result,
    items: result.items.map((item) => applyPersonalState(item, state)),
    movies: result.movies.map((item) => applyPersonalState(item, state)),
    series: result.series.map((item) => applyPersonalState(item, state)),
    message: result.items.length ? 'Live results loaded.' : `No matching ${scope === 'anime' ? 'anime' : 'movies or series'} were found.`,
  }));
}

export async function getMediaDetails(store, scope, id) {
  if (!id) throw badRequest('Media id is required');
  const item = await withManager(store, scope, (manager) => manager.getDetails(id));
  if (!item) throw notFound('Title not found');
  await persistCatalog(store, item.type === 'series' ? { series: [item] } : { movies: [item] });
  return withManager(store, scope, (manager, state) => ({
    item: applyPersonalState(item, state),
    message: `${item.type === 'series' ? 'Series' : 'Movie'} details loaded.`,
  }));
}

export async function getMediaEpisodes(store, scope, id, seasonNumber) {
  if (!id) throw badRequest('Series id is required');
  const result = await withManager(store, scope, (manager) => manager.getSeason(id, seasonNumber));
  if (!result) throw notFound('Episodes not found');
  await persistCatalog(store, { series: [result.series] });
  return result;
}

export async function getMediaStream(store, scope, id) {
  const state = await store.read();
  ensureMovieState(state);
  const local = state.movie.library.downloaded.find((item) => String(item.id) === String(id) && item.localFile && inScope(item, scope));
  if (local) return { kind: 'file', filePath: local.localFile, contentType: 'video/mp4', item: local, quality: local.quality };

  const stream = await withManager(store, scope, (manager) => manager.getStream(id));
  if (!stream) throw unavailable('No configured playable stream is available for this title.');
  return { kind: 'remote', ...stream };
}

export async function getMediaSubtitles(store, scope, id) {
  return withManager(store, scope, (manager) => manager.getSubtitles(id));
}

export async function getMovieArtwork(sourceUrl) {
  return movieCache.getArtwork(sourceUrl);
}

export async function downloadMedia(store, scope, id) {
  const [{ item }, stream] = await Promise.all([
    getMediaDetails(store, scope, id),
    withManager(store, scope, (manager) => manager.getDownload(id)),
  ]);
  if (!stream?.url) throw unavailable('No configured downloadable stream is available for this title.');
  const clean = (value) => String(value || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim();
  const extension = stream.contentType?.includes('webm') ? 'webm' : stream.contentType?.includes('ogg') ? 'ogv' : 'mp4';
  const filename = `${clean(item.title)}.${extension}`;
  const download = await addDownload(store, stream.url, {
    filename,
    type: 'video',
    provider: `${scope}-sky`,
    sourceKind: 'media-stream',
    sourceUrl: item.sourceUrl,
    metadata: { movieItem: item, mediaKind: scope, quality: stream.quality },
  });
  return { ...download, filename: basename(filename) };
}

export async function getMediaLibrary(store, scope = 'movie') {
  await syncDownloadedMovies(store);
  return withManager(store, scope, (manager, state) => ({
    ...manager.getHomeState(),
    continueWatching: state.movie.history.recentlyWatched
      .map((id) => applyPersonalState(findKnownItem(state, id), state))
      .filter((item) => inScope(item, scope)),
    favorites: { itemIds: scopedPersonalIds(state, scope, state.movie.favorites.itemIds) },
    watchLater: { itemIds: scopedPersonalIds(state, scope, state.movie.watchLater.itemIds) },
    history: {
      ...state.movie.history,
      recentlyWatched: scopedPersonalIds(state, scope, state.movie.history.recentlyWatched),
    },
  }));
}

export async function updateMediaHistory(store, scope, body = {}) {
  const id = body.id || body.itemId;
  if (!id) throw badRequest('History item id is required');
  await store.update((state) => {
    ensureMovieState(state);
    const now = new Date().toISOString();
    state.movie.history.progress[id] = {
      itemId: id,
      episodeId: body.episodeId || null,
      progress: Math.max(0, Math.min(100, Number(body.progress || 0))),
      positionSeconds: Math.max(0, Number(body.positionSeconds || 0)),
      durationSeconds: Math.max(0, Number(body.durationSeconds || 0)),
      updatedAt: now,
    };
    state.movie.history.recentlyWatched = [id, ...state.movie.history.recentlyWatched.filter((item) => item !== id)].slice(0, 120);
    state.movie.history.lastWatched = now;
    state.movie.player.currentItemId = id;
    state.movie.player.currentEpisodeId = body.episodeId || null;
    state.movie.player.progress = state.movie.history.progress[id].progress;
    pushActivity(state, scope, `Watched ${id}`);
  });
  return getMediaLibrary(store, scope).then((library) => library.history);
}

export async function setMediaFavorite(store, scope, id, favorite) {
  if (!id) throw badRequest('Favorite item id is required');
  await store.update((state) => {
    ensureMovieState(state);
    const ids = new Set(state.movie.favorites.itemIds);
    if (favorite) ids.add(id); else ids.delete(id);
    state.movie.favorites.itemIds = [...ids];
  });
  return getMediaLibrary(store, scope).then((library) => library.favorites);
}

export async function setMediaWatchLater(store, scope, id, saved) {
  if (!id) throw badRequest('Watch later item id is required');
  await store.update((state) => {
    ensureMovieState(state);
    const ids = new Set(state.movie.watchLater.itemIds);
    if (saved) ids.add(id); else ids.delete(id);
    state.movie.watchLater.itemIds = [...ids];
  });
  return getMediaLibrary(store, scope).then((library) => library.watchLater);
}

export const getMovieHome = (store) => getMediaHome(store, 'movie');
export const getMovieProviders = (store) => getMediaProviders(store, 'movie');
export const searchMovies = (store, query, options) => searchMedia(store, 'movie', query, options);
export const getMovieDetails = (store, id) => getMediaDetails(store, 'movie', id);
export const getMovieEpisodes = (store, id, season) => getMediaEpisodes(store, 'movie', id, season);
export const getMovieStream = (store, id) => getMediaStream(store, 'movie', id);
export const getMovieSubtitles = (store, id) => getMediaSubtitles(store, 'movie', id);
export const downloadMovie = (store, id) => downloadMedia(store, 'movie', id);
export const getMovieLibrary = (store) => getMediaLibrary(store, 'movie');
export const updateMovieHistory = (store, body) => updateMediaHistory(store, 'movie', body);
export const setMovieFavorite = (store, id, favorite) => setMediaFavorite(store, 'movie', id, favorite);
export const setMovieWatchLater = (store, id, saved) => setMediaWatchLater(store, 'movie', id, saved);
