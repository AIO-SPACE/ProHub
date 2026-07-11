import { JikanProvider } from './JikanProvider.js';
import { MovieBoxProvider } from './MovieBoxProvider.js';
import { TVMazeProvider } from './TVMazeProvider.js';

const RETIRED_PROVIDERS = new Set(['internet-archive', 'wikimedia-commons']);
const RETIRED_ID_PREFIXES = ['archive:', 'wikimedia:'];

function keepMediaItem(item) {
  if (!item) return false;
  if (item.localFile || item.downloaded) return true;
  return !RETIRED_PROVIDERS.has(item.provider);
}

function keepMediaId(id) {
  const value = String(id || '');
  return value && !RETIRED_ID_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export function ensureMovieState(state) {
  state.movie ||= {};
  state.movie.library ||= { movies: [], series: [], downloaded: [], collections: [] };
  state.movie.library.movies ||= [];
  state.movie.library.series ||= [];
  state.movie.library.downloaded ||= [];
  state.movie.library.collections ||= [];
  state.movie.library.movies = state.movie.library.movies.filter(keepMediaItem);
  state.movie.library.series = state.movie.library.series.filter(keepMediaItem);
  state.movie.history ||= { recentlyWatched: [], progress: {}, lastWatched: null };
  state.movie.history.recentlyWatched ||= [];
  state.movie.history.recentlyWatched = state.movie.history.recentlyWatched.filter(keepMediaId);
  state.movie.history.progress ||= {};
  state.movie.history.progress = Object.fromEntries(Object.entries(state.movie.history.progress).filter(([id]) => keepMediaId(id)));
  state.movie.favorites ||= { itemIds: [] };
  state.movie.favorites.itemIds ||= [];
  state.movie.favorites.itemIds = state.movie.favorites.itemIds.filter(keepMediaId);
  state.movie.watchLater ||= { itemIds: [] };
  state.movie.watchLater.itemIds ||= [];
  state.movie.watchLater.itemIds = state.movie.watchLater.itemIds.filter(keepMediaId);
  state.movie.player ||= {
    currentItemId: null,
    currentEpisodeId: null,
    isPlaying: false,
    progress: 0,
    volume: 80,
    playbackRate: 1,
    selectedSubtitleId: null,
    selectedAudioTrackId: null,
  };
  return state.movie;
}

export const ensureMediaState = ensureMovieState;

function createProviders(state, scope) {
  return [
    new MovieBoxProvider(state, scope),
    scope === 'anime' ? new JikanProvider() : new TVMazeProvider(),
  ];
}

function itemMatchesScope(item, scope) {
  return scope === 'anime' ? item?.mediaKind === 'anime' : item?.mediaKind !== 'anime';
}

function normalizedTitle(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function itemIdentity(item) {
  return `${normalizedTitle(item?.title)}:${item?.year || ''}:${item?.type || ''}`;
}

function preferItem(current, candidate) {
  const currentScore = Number(Boolean(current?.hasStream)) * 4 + Number(Boolean(current?.hasDownload)) * 2 + Number(Boolean(current?.description));
  const candidateScore = Number(Boolean(candidate?.hasStream)) * 4 + Number(Boolean(candidate?.hasDownload)) * 2 + Number(Boolean(candidate?.description));
  return candidateScore > currentScore ? candidate : current;
}

function dedupeItems(items = [], scope) {
  const byIdentity = new Map();
  items.filter((item) => item?.id && itemMatchesScope(item, scope)).forEach((item) => {
    const key = itemIdentity(item) || String(item.id);
    byIdentity.set(key, byIdentity.has(key) ? preferItem(byIdentity.get(key), item) : item);
  });
  return [...byIdentity.values()];
}

function splitItems(items = []) {
  return {
    movies: items.filter((item) => item.type === 'movie'),
    series: items.filter((item) => item.type === 'series'),
  };
}

function relevance(item, query) {
  const title = normalizedTitle(item.title);
  const needle = normalizedTitle(query);
  if (!needle) return Number(item.rating || 0);
  if (title === needle) return 1000;
  if (title.startsWith(needle)) return 700;
  if (title.includes(needle)) return 500;
  return Number(item.rating || 0);
}

function dynamicSections(items, scope) {
  const values = new Map();
  const add = (group, value, item) => {
    const label = String(value || '').trim();
    if (!label) return;
    const key = `${group}:${label.toLowerCase()}`;
    if (!values.has(key)) values.set(key, { group, label, items: [] });
    values.get(key).items.push(item);
  };

  items.forEach((item) => {
    (item.genres || []).forEach((value) => add('genre', value, item));
    (item.countries || []).forEach((value) => add('country', value, item));
    const languages = Array.isArray(item.languages) ? item.languages : [item.language];
    languages.forEach((value) => add('language', value, item));
    if (scope === 'anime' && item.format) add('format', item.format, item);
  });

  return [...values.values()]
    .map((entry) => ({ ...entry, items: dedupeItems(entry.items, scope) }))
    .filter((entry) => entry.items.length >= 3)
    .sort((left, right) => right.items.length - left.items.length || left.label.localeCompare(right.label))
    .slice(0, 12)
    .map((entry) => ({
      id: `auto-${scope}-${entry.group}-${normalizedTitle(entry.label).replace(/\s+/g, '-')}`,
      title: entry.label,
      layout: 'rail',
      items: entry.items,
    }));
}

export class ProviderManager {
  constructor(state, scope = 'movie') {
    ensureMovieState(state);
    this.state = state;
    this.scope = scope === 'anime' ? 'anime' : 'movie';
    this.providers = createProviders(state, this.scope).filter((provider) => provider.enabled !== false);
  }

  async health() {
    return {
      providers: await Promise.all(this.providers.map(async (provider) => {
        try {
          return await provider.health();
        } catch (error) {
          return { id: provider.id, label: provider.label || provider.id, ok: false, configured: true, reason: error.message };
        }
      })),
    };
  }

  async discover() {
    const results = await Promise.all(this.providers.map(async (provider) => {
      try {
        return { sections: await (provider.discover?.() || provider.home?.() || []) };
      } catch (error) {
        return { sections: [], error: { provider: provider.id, message: error.message } };
      }
    }));
    const providerSections = results.flatMap((result) => result.sections)
      .map((section) => ({ ...section, items: dedupeItems(section.items, this.scope) }))
      .filter((section) => section.items.length);
    const allItems = dedupeItems(providerSections.flatMap((section) => section.items), this.scope);
    return {
      sections: [...providerSections, ...dynamicSections(allItems, this.scope)],
      providerErrors: results.filter((result) => result.error).map((result) => result.error),
    };
  }

  home() {
    return this.discover();
  }

  async search(query, options = {}) {
    const results = await Promise.all(this.providers.map(async (provider) => {
      try {
        return await provider.search(query, options);
      } catch (error) {
        return { error: { provider: provider.id, message: error.message } };
      }
    }));
    const providerErrors = results.filter((result) => result?.error).map((result) => result.error);
    const items = dedupeItems(results.filter(Array.isArray).flat(), this.scope)
      .sort((left, right) => relevance(right, query) - relevance(left, query));
    return { items, ...splitItems(items), providerErrors };
  }

  async callFirst(method, ...args) {
    for (const provider of this.providers) {
      try {
        const result = await provider[method]?.(...args);
        if (result && (!result.mediaKind || itemMatchesScope(result, this.scope))) return result;
      } catch {
        continue;
      }
    }
    return null;
  }

  getMovie(id) {
    return this.callFirst('getMovie', id);
  }

  getSeries(id) {
    return this.callFirst('getSeries', id);
  }

  async getDetails(id) {
    return (await this.callFirst('getDetails', id))
      || (await this.getSeries(id))
      || this.getMovie(id);
  }

  getSeason(id, seasonNumber) {
    return this.callFirst('getSeason', id, seasonNumber);
  }

  getEpisode(id) {
    return this.callFirst('getEpisode', id);
  }

  async getStream(id) {
    for (const provider of this.providers) {
      try {
        const stream = await provider.getStream?.(id);
        if (stream) return { provider: stream.provider || provider.id, ...stream };
      } catch {
        continue;
      }
    }
    return null;
  }

  async getDownload(id) {
    for (const provider of this.providers) {
      try {
        const stream = await provider.getDownload?.(id);
        if (stream) return { provider: stream.provider || provider.id, ...stream };
      } catch {
        continue;
      }
    }
    return null;
  }

  async getSubtitles(id) {
    for (const provider of this.providers) {
      try {
        const subtitles = await provider.getSubtitles?.(id);
        if (Array.isArray(subtitles) && subtitles.length) return subtitles;
      } catch {
        continue;
      }
    }
    return [];
  }

  getHomeState() {
    const library = this.state.movie.library;
    const filter = (items) => items.filter((item) => itemMatchesScope(item, this.scope));
    return {
      provider: {
        id: `${this.scope}-sky`,
        configured: true,
        status: 'ready',
        message: `${this.scope === 'anime' ? 'Anime' : 'Movie'} providers are queried through the shared provider manager.`,
      },
      library: {
        ...library,
        movies: filter(library.movies),
        series: filter(library.series),
        downloaded: filter(library.downloaded),
      },
      history: this.state.movie.history,
      favorites: this.state.movie.favorites,
      watchLater: this.state.movie.watchLater,
      player: this.state.movie.player,
    };
  }
}

export const MovieProviderManager = ProviderManager;
