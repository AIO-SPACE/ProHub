import { movieCache } from './cache.js';

const SEARCH_TTL = 30 * 60 * 1000;
const DETAILS_TTL = 6 * 60 * 60 * 1000;
const TVMAZE_API = 'https://api.tvmaze.com';

function stripHtml(value = '') {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function text(value, fallback = '') {
  if (value == null) return fallback;
  return String(value);
}

function artwork(url) {
  return url ? `/api/movie/artwork?url=${encodeURIComponent(url)}` : null;
}

function runtimeLabel(minutes) {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`TVMaze request failed with ${response.status}`);
  return response.json();
}

function normalizeShow(show) {
  const id = `tvmaze:${show.id}`;
  return {
    id,
    providerId: String(show.id),
    provider: 'tvmaze',
    mediaKind: 'movie',
    type: 'series',
    title: text(show.name, 'Untitled series'),
    description: stripHtml(show.summary),
    year: show.premiered?.match(/\d{4}/)?.[0] || null,
    releaseDate: show.premiered || null,
    ended: show.ended || null,
    runtimeSeconds: show.runtime ? show.runtime * 60 : null,
    runtime: runtimeLabel(show.runtime),
    genres: show.genres || [],
    countries: show.network?.country?.name ? [show.network.country.name] : [],
    rating: show.rating?.average || null,
    ratingSource: show.rating?.average ? 'TVMaze' : null,
    poster: artwork(show.image?.medium || show.image?.original),
    backdrop: artwork(show.image?.original || show.image?.medium),
    sourceUrl: show.url || null,
    hasStream: false,
    hasDownload: false,
    quality: null,
    status: show.status || null,
    language: show.language || null,
    network: show.network?.name || show.webChannel?.name || null,
    cast: [],
    crew: [],
    seasons: [],
    episodes: [],
    subtitles: [],
    audioTracks: [],
    trailers: [],
  };
}

function normalizeEpisode(showId, episode) {
  const id = `tvmaze:${showId}:episode:${episode.id}`;
  return {
    id,
    providerId: String(episode.id),
    provider: 'tvmaze',
    mediaKind: 'movie',
    type: 'episode',
    seriesId: `tvmaze:${showId}`,
    title: text(episode.name, `Episode ${episode.number || ''}`).trim(),
    seasonNumber: episode.season || 0,
    episodeNumber: episode.number || 0,
    description: stripHtml(episode.summary),
    releaseDate: episode.airdate || null,
    runtimeSeconds: episode.runtime ? episode.runtime * 60 : null,
    runtime: runtimeLabel(episode.runtime),
    poster: artwork(episode.image?.medium || episode.image?.original),
    backdrop: artwork(episode.image?.original || episode.image?.medium),
    hasStream: false,
    hasDownload: false,
    sourceUrl: episode.url || null,
  };
}

export class TVMazeProvider {
  id = 'tvmaze';
  label = 'TVMaze Series Metadata';

  async health() {
    const startedAt = Date.now();
    try {
      await this.search('drama', { rows: 1 });
      return { id: this.id, label: this.label, ok: true, configured: true, latencyMs: Date.now() - startedAt };
    } catch (error) {
      return { id: this.id, label: this.label, ok: false, configured: true, reason: error.message };
    }
  }

  async search(query, options = {}) {
    const key = String(query || '').trim();
    if (!key) return [];
    const cacheKey = `${key}:${options.rows || 20}`;
    const cached = await movieCache.get('tvmaze-search', cacheKey, SEARCH_TTL);
    if (cached) return cached;
    const payload = await fetchJson(`${TVMAZE_API}/search/shows?q=${encodeURIComponent(key)}`);
    const shows = payload.map((entry) => normalizeShow(entry.show)).slice(0, options.rows || 20);
    return movieCache.set('tvmaze-search', cacheKey, shows);
  }

  async home() {
    const [western, drama, animation] = await Promise.all([
      this.search('western', { rows: 12 }),
      this.search('drama', { rows: 12 }),
      this.search('animation', { rows: 12 }),
    ]);
    return [
      { id: 'tv-series', title: 'TV/Series', layout: 'rail', items: western },
      { id: 'popular-series', title: 'Popular Series', layout: 'rail', items: drama },
      { id: 'animation', title: 'Animation', layout: 'rail', items: animation },
    ];
  }

  discover() {
    return this.home();
  }

  async getMovie() {
    return null;
  }

  async getSeries(id) {
    const showId = id.replace(/^tvmaze:/, '').split(':')[0];
    const cached = await movieCache.get('tvmaze-details', showId, DETAILS_TTL);
    if (cached) return cached;

    const params = new URLSearchParams();
    params.append('embed[]', 'cast');
    params.append('embed[]', 'episodes');
    params.append('embed[]', 'seasons');
    const show = await fetchJson(`${TVMAZE_API}/shows/${encodeURIComponent(showId)}?${params}`);
    const series = normalizeShow(show);
    const episodes = (show._embedded?.episodes || []).map((episode) => normalizeEpisode(showId, episode));
    series.episodes = episodes;
    series.seasons = (show._embedded?.seasons || []).map((season) => ({
      id: `tvmaze:${showId}:season:${season.number}`,
      providerId: String(season.id),
      seriesId: series.id,
      number: season.number,
      title: season.name || `Season ${season.number}`,
      episodeCount: episodes.filter((episode) => episode.seasonNumber === season.number).length,
      premiereDate: season.premiereDate || null,
      endDate: season.endDate || null,
      poster: artwork(season.image?.medium || season.image?.original) || series.poster,
    }));
    series.cast = (show._embedded?.cast || []).map((entry) => ({
      name: entry.person?.name,
      character: entry.character?.name || null,
      image: artwork(entry.person?.image?.medium || entry.person?.image?.original),
    })).filter((entry) => entry.name).slice(0, 18);
    return movieCache.set('tvmaze-details', showId, series);
  }

  async getSeason(id, seasonNumber) {
    const series = await this.getSeries(id);
    const number = Number(seasonNumber || series.seasons[0]?.number || 1);
    return {
      series,
      season: series.seasons.find((item) => Number(item.number) === number) || null,
      episodes: series.episodes.filter((episode) => Number(episode.seasonNumber) === number),
    };
  }

  async getEpisode(id) {
    const [, showId, episodeId] = id.match(/^tvmaze:(\d+):episode:(\d+)$/) || [];
    if (!showId || !episodeId) return null;
    const series = await this.getSeries(`tvmaze:${showId}`);
    return series.episodes.find((episode) => episode.providerId === episodeId) || null;
  }

  async getStream() {
    throw new Error('This provider has metadata only; no configured stream is available.');
  }

  async getDownload() {
    throw new Error('This provider has metadata only; no configured download is available.');
  }

  async getSubtitles() {
    return [];
  }
}
