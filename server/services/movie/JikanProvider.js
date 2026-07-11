import { movieCache } from './cache.js';

const PROVIDER_ID = 'jikan';
const API_BASE = 'https://api.jikan.moe/v4';
const SEARCH_TTL = 30 * 60 * 1000;
const DETAILS_TTL = 6 * 60 * 60 * 1000;

const asArray = (value) => (Array.isArray(value) ? value : []);
const text = (value, fallback = '') => (value == null || value === '' ? fallback : String(value));

function artwork(url) {
  return url ? `/api/movie/artwork?url=${encodeURIComponent(url)}` : null;
}

function runtimeLabel(minutes) {
  const total = Number(minutes || 0);
  if (!total) return null;
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

function normalizeType(value) {
  return String(value || '').toLowerCase() === 'movie' ? 'movie' : 'series';
}

function normalizeAnime(anime) {
  const rawId = anime?.mal_id;
  if (!rawId) return null;
  const id = `${PROVIDER_ID}:${rawId}`;
  const image = anime.images?.webp?.large_image_url
    || anime.images?.jpg?.large_image_url
    || anime.images?.webp?.image_url
    || anime.images?.jpg?.image_url;
  const trailer = anime.trailer?.url
    ? [{ id: `${id}:trailer`, label: 'Trailer', url: anime.trailer.url }]
    : [];
  const episodeCount = Number(anime.episodes || 0);
  const type = normalizeType(anime.type);

  return {
    id,
    providerId: String(rawId),
    provider: PROVIDER_ID,
    mediaKind: 'anime',
    format: anime.type || null,
    type,
    title: text(anime.title_english || anime.title, 'Untitled anime'),
    originalTitle: anime.title_japanese || anime.title || null,
    alternateTitles: asArray(anime.title_synonyms),
    description: text(anime.synopsis || anime.background),
    year: anime.year || String(anime.aired?.from || '').match(/\d{4}/)?.[0] || null,
    releaseDate: anime.aired?.from || null,
    ended: anime.aired?.to || null,
    runtimeSeconds: null,
    runtime: anime.duration || runtimeLabel(anime.duration_minutes),
    genres: [...asArray(anime.genres), ...asArray(anime.themes), ...asArray(anime.demographics)]
      .map((entry) => entry?.name)
      .filter(Boolean),
    countries: [],
    rating: anime.score || null,
    ratingSource: anime.score ? 'MyAnimeList' : null,
    poster: artwork(image),
    backdrop: artwork(image),
    sourceUrl: anime.url || null,
    hasStream: false,
    hasDownload: false,
    quality: null,
    status: anime.status || null,
    language: null,
    network: asArray(anime.studios).map((entry) => entry?.name).filter(Boolean).join(', ') || null,
    license: anime.rating || null,
    cast: [],
    crew: [
      ...asArray(anime.producers).map((entry) => ({ name: entry?.name, role: 'Producer' })),
      ...asArray(anime.studios).map((entry) => ({ name: entry?.name, role: 'Studio' })),
    ].filter((entry) => entry.name),
    seasons: type === 'series' && episodeCount
      ? [{
          id: `${id}:season:1`,
          providerId: '1',
          seriesId: id,
          number: 1,
          title: 'Episodes',
          episodeCount,
          premiereDate: anime.aired?.from || null,
          endDate: anime.aired?.to || null,
          poster: artwork(image),
        }]
      : [],
    episodes: [],
    subtitles: [],
    audioTracks: [],
    trailers: trailer,
  };
}

function normalizeEpisode(seriesId, episode) {
  const rawId = episode?.mal_id;
  if (!rawId) return null;
  return {
    id: `${seriesId}:episode:${rawId}`,
    providerId: String(rawId),
    provider: PROVIDER_ID,
    mediaKind: 'anime',
    type: 'episode',
    seriesId,
    title: text(episode.title, `Episode ${rawId}`),
    originalTitle: episode.title_japanese || null,
    seasonNumber: 1,
    episodeNumber: Number(rawId),
    description: null,
    releaseDate: episode.aired || null,
    runtimeSeconds: null,
    runtime: episode.filler ? 'Filler' : episode.recap ? 'Recap' : null,
    poster: null,
    backdrop: null,
    hasStream: false,
    hasDownload: false,
    sourceUrl: episode.forum_url || null,
  };
}

async function fetchJson(path, params = {}) {
  const url = new URL(`${API_BASE}/${String(path).replace(/^\/+/, '')}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Jikan request failed with ${response.status}`);
  return response.json();
}

export class JikanProvider {
  id = PROVIDER_ID;
  label = 'Jikan Anime Metadata';

  async health() {
    const startedAt = Date.now();
    try {
      await this.search('anime', { rows: 1 });
      return { id: this.id, label: this.label, ok: true, configured: true, latencyMs: Date.now() - startedAt };
    } catch (error) {
      return { id: this.id, label: this.label, ok: false, configured: true, reason: error.message };
    }
  }

  async discover() {
    const cacheKey = 'anime-home';
    const cached = await movieCache.get('jikan-discover', cacheKey, SEARCH_TTL);
    if (cached) return cached;
    const [airing, popular, upcoming] = await Promise.all([
      fetchJson('seasons/now', { limit: 20 }),
      fetchJson('top/anime', { filter: 'bypopularity', limit: 20 }),
      fetchJson('top/anime', { filter: 'upcoming', limit: 20 }),
    ]);
    const sections = [
      { id: 'anime-airing', title: 'Currently Airing', layout: 'rail', items: asArray(airing.data).map(normalizeAnime).filter(Boolean) },
      { id: 'anime-popular', title: 'Popular', layout: 'ranked', items: asArray(popular.data).map(normalizeAnime).filter(Boolean) },
      { id: 'anime-upcoming', title: 'Upcoming', layout: 'rail', items: asArray(upcoming.data).map(normalizeAnime).filter(Boolean) },
    ].filter((section) => section.items.length);
    return movieCache.set('jikan-discover', cacheKey, sections);
  }

  home() {
    return this.discover();
  }

  async search(query, options = {}) {
    const key = String(query || '').trim();
    if (!key) return [];
    const limit = Math.min(25, Number(options.rows || 24));
    const cacheKey = `${key}:${limit}`;
    const cached = await movieCache.get('jikan-search', cacheKey, SEARCH_TTL);
    if (cached) return cached;
    const payload = await fetchJson('anime', { q: key, limit, sfw: true, order_by: 'score', sort: 'desc' });
    const items = asArray(payload.data).map(normalizeAnime).filter(Boolean);
    return movieCache.set('jikan-search', cacheKey, items);
  }

  async getDetails(id) {
    if (!String(id || '').startsWith(`${PROVIDER_ID}:`)) return null;
    const providerId = String(id).replace(`${PROVIDER_ID}:`, '').split(':')[0];
    const cached = await movieCache.get('jikan-details', providerId, DETAILS_TTL);
    if (cached) return cached;
    const payload = await fetchJson(`anime/${encodeURIComponent(providerId)}/full`);
    const item = normalizeAnime(payload.data);
    return item ? movieCache.set('jikan-details', providerId, item) : null;
  }

  getMovie(id) {
    return this.getDetails(id);
  }

  getSeries(id) {
    return this.getDetails(id);
  }

  async getSeason(id, seasonNumber = 1) {
    const series = await this.getDetails(id);
    if (!series || Number(seasonNumber) !== 1) return null;
    const providerId = String(id).replace(`${PROVIDER_ID}:`, '').split(':')[0];
    const payload = await fetchJson(`anime/${encodeURIComponent(providerId)}/episodes`);
    return {
      series,
      season: series.seasons?.[0] || null,
      episodes: asArray(payload.data).map((episode) => normalizeEpisode(series.id, episode)).filter(Boolean),
    };
  }

  async getEpisode(id) {
    const [seriesId] = String(id || '').split(':episode:');
    const result = await this.getSeason(seriesId, 1);
    return result?.episodes.find((episode) => episode.id === id) || null;
  }

  async getStream() {
    return null;
  }

  async getDownload() {
    return null;
  }

  async getSubtitles() {
    return [];
  }
}
