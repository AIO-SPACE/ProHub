import { movieCache } from './cache.js';

const PROVIDER_ID = 'moviebox';
const SEARCH_TTL = 10 * 60 * 1000;
const DETAILS_TTL = 30 * 60 * 1000;

const trimSlash = (value = '') => String(value || '').trim().replace(/\/+$/, '');
const cleanPath = (value = '') => String(value || '').trim().replace(/^\/+/, '');
const text = (value, fallback = '') => (value == null || value === '' ? fallback : String(value));
const asArray = (value) => (Array.isArray(value) ? value : []);

function getSetting(state, key, fallback = '') {
  const settings = state?.settings?.moviebox || {};
  const envKey = key.replace(/[A-Z]/g, (char) => `_${char}`).toUpperCase();
  const apiBaseUrl = key === 'baseUrl' ? process.env.MOVIEBOX_API_BASE_URL : '';
  return settings[key] || settings.paths?.[key] || apiBaseUrl || process.env[`MOVIEBOX_${envKey}`] || fallback;
}

function getApiKey(state) {
  return (
    state?.settings?.apiKeys?.find((item) => item.id === PROVIDER_ID)?.value
    || process.env.MOVIEBOX_API_KEY
    || ''
  );
}

function runtimeLabel(seconds) {
  const total = Number(seconds || 0);
  if (!total) return null;
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function normalizeUrl(value, baseUrl, assetBaseUrl) {
  const raw = text(value).trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${assetBaseUrl || baseUrl}${raw}`;
  return `${assetBaseUrl || baseUrl}/${raw}`;
}

function normalizeType(value, fallback = 'movie') {
  const raw = String(value || '').toLowerCase();
  if (Number(value) === 2 || raw.includes('series') || raw.includes('show') || raw.includes('tv')) return 'series';
  if (raw.includes('episode')) return 'episode';
  return fallback;
}

function unwrapList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.subjects)) return payload.subjects;
  if (Array.isArray(payload?.banners)) return payload.banners;
  if (Array.isArray(payload?.banner?.banners)) return payload.banner.banners;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function unwrapItem(payload) {
  return payload?.data?.item || payload?.data?.subject || payload?.data || payload?.item || payload?.subject || payload;
}

function normalizePerson(entry) {
  const person = entry?.person || entry || {};
  const name = person.name || person.title || entry?.name;
  if (!name) return null;
  return {
    name,
    character: entry?.character?.name || entry?.character || entry?.role || null,
    role: entry?.role || null,
    job: entry?.job || null,
    image: person.image?.url || person.image?.medium || person.avatar || null,
  };
}

function normalizeQuality(item) {
  const quality = item?.quality;
  const resolution = (quality && typeof quality === 'object' ? quality.resolution : quality) || item?.resolution || item?.definition;
  if (!resolution) return null;
  return {
    resolution: String(resolution).toUpperCase(),
    source: item?.quality?.source || item?.source || PROVIDER_ID,
  };
}

export class MovieBoxProvider {
  id = PROVIDER_ID;
  label = 'MovieBox Compatible Provider';

  constructor(state, scope = 'movie') {
    this.scope = scope;
    this.baseUrl = trimSlash(getSetting(state, 'baseUrl'));
    this.assetBaseUrl = trimSlash(getSetting(state, 'assetBaseUrl')) || this.baseUrl;
    this.apiKey = getApiKey(state);
    this.paths = {
      health: getSetting(state, 'healthPath', '/health'),
      home: getSetting(state, 'homePath', '/home'),
      search: getSetting(state, 'searchPath', '/search'),
      details: getSetting(state, 'detailsPath', '/details/:id'),
      episodes: getSetting(state, 'episodesPath', '/episodes/:id'),
      stream: getSetting(state, 'streamPath', '/stream/:id'),
      download: getSetting(state, 'downloadPath', '/download/:id'),
      subtitles: getSetting(state, 'subtitlesPath', '/subtitles/:id'),
    };
  }

  get configured() {
    return Boolean(this.baseUrl);
  }

  path(template, params = {}) {
    let next = template || '';
    Object.entries(params).forEach(([key, value]) => {
      next = next.replace(`:${key}`, encodeURIComponent(String(value)));
    });
    return cleanPath(next);
  }

  url(path, params) {
    const next = new URL(this.path(path), `${this.baseUrl}/`);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value != null && value !== '') next.searchParams.set(key, String(value));
    });
    return next;
  }

  async fetchJson(path, { params, signalTimeout = 15_000 } = {}) {
    if (!this.configured) throw new Error('Authorized MovieBox-compatible API base URL is not configured.');
    const headers = { accept: 'application/json' };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    const response = await fetch(this.url(path, params), {
      headers,
      signal: AbortSignal.timeout(signalTimeout),
    });
    if (!response.ok) throw new Error(`MovieBox-compatible provider request failed with ${response.status}`);
    return response.json();
  }

  normalizeSubject(subject, fallback = {}) {
    const rawId = subject?.id || subject?.subjectId || subject?.itemId || subject?.providerId || subject?.mid;
    if (!rawId) return null;
    const id = String(rawId).startsWith(`${PROVIDER_ID}:`) ? String(rawId) : `${PROVIDER_ID}:${rawId}`;
    const image = subject?.cover?.url || subject?.image?.url || subject?.poster || subject?.posterUrl || subject?.coverUrl || subject?.thumbnail;
    const backdrop = subject?.backdrop?.url || subject?.backdrop || subject?.background || subject?.banner || subject?.bannerUrl || image;
    const seconds = subject?.runtimeSeconds || subject?.durationSeconds || subject?.seconds || (subject?.runtimeMinutes ? subject.runtimeMinutes * 60 : 0);
    const type = normalizeType(subject?.type || subject?.subjectType || subject?.contentType, fallback.type || 'movie');
    const cast = asArray(subject?.cast || subject?.casts || subject?.actors).map(normalizePerson).filter(Boolean);
    const crew = asArray(subject?.crew || subject?.directors).map(normalizePerson).filter(Boolean);
    const episodes = asArray(subject?.episodes).map((episode) => this.normalizeEpisode(id, episode)).filter(Boolean);
    const seasons = asArray(subject?.seasons).map((season) => ({
      id: `${id}:season:${season.number || season.season || season.id}`,
      providerId: String(season.id || season.number || season.season || ''),
      seriesId: id,
      number: Number(season.number || season.season || 1),
      title: season.title || season.name || `Season ${season.number || season.season || 1}`,
      episodeCount: Number(season.episodeCount || season.totalEpisodes || 0),
      premiereDate: season.premiereDate || season.releaseDate || null,
      endDate: season.endDate || null,
      poster: normalizeUrl(season.poster || season.cover?.url, this.baseUrl, this.assetBaseUrl),
    }));

    return {
      id,
      providerId: String(rawId),
      provider: PROVIDER_ID,
      mediaKind: fallback.mediaKind || this.scope,
      type,
      title: text(subject?.title || subject?.name || subject?.content, 'Untitled'),
      description: text(subject?.description || subject?.overview || subject?.summary || subject?.introduction),
      year: subject?.year || String(subject?.releaseDate || subject?.publishedAt || '').match(/\d{4}/)?.[0] || null,
      releaseDate: subject?.releaseDate || subject?.releasedAt || subject?.publishedAt || null,
      runtimeSeconds: seconds || null,
      runtime: subject?.runtime || runtimeLabel(seconds),
      genres: asArray(subject?.genres || subject?.genreList).length ? asArray(subject?.genres || subject?.genreList) : text(subject?.genre).split(',').map((item) => item.trim()).filter(Boolean),
      countries: asArray(subject?.countries || subject?.countryList).length ? asArray(subject?.countries || subject?.countryList) : text(subject?.country).split(',').map((item) => item.trim()).filter(Boolean),
      rating: subject?.rating || subject?.imdbRate || subject?.score || null,
      ratingSource: subject?.ratingSource || (subject?.imdbRate ? 'IMDb' : null),
      poster: normalizeUrl(image, this.baseUrl, this.assetBaseUrl),
      backdrop: normalizeUrl(backdrop, this.baseUrl, this.assetBaseUrl),
      sourceUrl: subject?.sourceUrl || subject?.detailUrl || null,
      hasStream: Boolean(subject?.hasStream || subject?.hasResource || subject?.streamUrl || subject?.playUrl),
      hasDownload: Boolean(subject?.hasDownload || subject?.downloadUrl || subject?.download),
      quality: normalizeQuality(subject),
      status: subject?.status || null,
      language: subject?.language || subject?.lang || null,
      network: subject?.network || null,
      license: subject?.license || null,
      cast,
      crew,
      seasons,
      episodes,
      subtitles: asArray(subject?.subtitles),
      audioTracks: asArray(subject?.audioTracks),
      trailers: asArray(subject?.trailers),
    };
  }

  normalizeEpisode(seriesId, episode) {
    const rawId = episode?.id || episode?.episodeId || `${episode?.season || 1}-${episode?.number || episode?.episode || 1}`;
    if (!rawId) return null;
    const id = `${seriesId}:episode:${rawId}`;
    const image = episode?.cover?.url || episode?.image?.url || episode?.poster || episode?.thumbnail;
    const seconds = episode?.runtimeSeconds || episode?.durationSeconds || episode?.seconds || 0;
    return {
      id,
      providerId: String(rawId),
      provider: PROVIDER_ID,
      mediaKind: this.scope,
      type: 'episode',
      seriesId,
      title: text(episode?.title || episode?.name, `Episode ${episode?.number || episode?.episode || ''}`).trim(),
      seasonNumber: Number(episode?.seasonNumber || episode?.season || 1),
      episodeNumber: Number(episode?.episodeNumber || episode?.number || episode?.episode || 0),
      description: text(episode?.description || episode?.summary || episode?.overview),
      releaseDate: episode?.releaseDate || episode?.airdate || null,
      runtimeSeconds: seconds || null,
      runtime: episode?.runtime || runtimeLabel(seconds),
      poster: normalizeUrl(image, this.baseUrl, this.assetBaseUrl),
      backdrop: normalizeUrl(episode?.backdrop || image, this.baseUrl, this.assetBaseUrl),
      hasStream: Boolean(episode?.hasStream || episode?.hasResource || episode?.streamUrl || episode?.playUrl),
      hasDownload: Boolean(episode?.hasDownload || episode?.downloadUrl || episode?.download),
      sourceUrl: episode?.sourceUrl || null,
    };
  }

  normalizeSection(section, index = 0) {
    const items = unwrapList(section).map((item) => this.normalizeSubject(item)).filter(Boolean);
    if (!items.length) return null;
    const rawTitle = section?.title || section?.name || section?.label || section?.operationTitle || `MovieBox ${index + 1}`;
    return {
      id: section?.id || section?.sectionId || section?.operationType || `moviebox-${index}`,
      title: text(rawTitle).replace(/^\p{Extended_Pictographic}+/u, '').trim() || `MovieBox ${index + 1}`,
      layout: section?.layout || (section?.operationType === 'BANNER' ? 'hero' : 'rail'),
      items,
    };
  }

  normalizeSections(payload) {
    const data = payload?.data || payload;
    const sectionCandidates = asArray(data?.sections).length ? data.sections : asArray(data?.items);
    const sections = sectionCandidates.map((section, index) => this.normalizeSection(section, index)).filter(Boolean);
    if (sections.length) return sections;
    const items = unwrapList(data).map((item) => this.normalizeSubject(item)).filter(Boolean);
    return items.length ? [{ id: 'moviebox-results', title: 'MovieBox', layout: 'rail', items }] : [];
  }

  async health() {
    if (!this.configured) {
      return {
        id: this.id,
        label: this.label,
        ok: false,
        configured: false,
        reason: 'Authorized MovieBox-compatible API base URL is not configured.',
      };
    }

    const startedAt = Date.now();
    try {
      await this.fetchJson(this.paths.health, { signalTimeout: 8_000 });
      return { id: this.id, label: this.label, ok: true, configured: true, latencyMs: Date.now() - startedAt };
    } catch (error) {
      return { id: this.id, label: this.label, ok: false, configured: true, reason: error.message };
    }
  }

  async home() {
    if (!this.configured) return [];
    const cacheKey = `${this.baseUrl}:${this.scope}`;
    const cached = await movieCache.get('moviebox-home', cacheKey, SEARCH_TTL);
    if (cached) return cached;
    const payload = await this.fetchJson(this.paths.home, { params: { scope: this.scope } });
    return movieCache.set('moviebox-home', cacheKey, this.normalizeSections(payload));
  }

  discover() {
    return this.home();
  }

  async search(query, options = {}) {
    if (!this.configured) return [];
    const key = String(query || '').trim();
    if (!key) return [];
    const cacheKey = `${this.baseUrl}:${this.scope}:${key}:${options.rows || 30}`;
    const cached = await movieCache.get('moviebox-search', cacheKey, SEARCH_TTL);
    if (cached) return cached;
    const payload = await this.fetchJson(this.paths.search, { params: { q: key, query: key, scope: this.scope, limit: options.rows || 30 } });
    const sections = this.normalizeSections(payload);
    const items = sections.flatMap((section) => section.items).slice(0, options.rows || 30);
    return movieCache.set('moviebox-search', cacheKey, items);
  }

  async getMovie(id) {
    return this.getDetails(id);
  }

  async getSeries(id) {
    return this.getDetails(id);
  }

  async getDetails(id) {
    if (!this.configured || !String(id || '').startsWith(`${PROVIDER_ID}:`)) return null;
    const providerId = String(id).replace(`${PROVIDER_ID}:`, '').split(':')[0];
    const cached = await movieCache.get('moviebox-details', `${this.baseUrl}:${providerId}`, DETAILS_TTL);
    if (cached) return cached;
    const payload = await this.fetchJson(this.path(this.paths.details, { id: providerId }));
    const item = this.normalizeSubject(unwrapItem(payload));
    return item ? movieCache.set('moviebox-details', `${this.baseUrl}:${providerId}`, item) : null;
  }

  async getSeason(id, seasonNumber) {
    const series = await this.getSeries(id);
    if (!series) return null;
    const number = Number(seasonNumber || series.seasons?.[0]?.number || 1);
    if (!this.configured) return null;
    try {
      const providerId = String(id).replace(`${PROVIDER_ID}:`, '').split(':')[0];
      const payload = await this.fetchJson(this.path(this.paths.episodes, { id: providerId }), { params: { season: number } });
      const episodes = unwrapList(payload).map((episode) => this.normalizeEpisode(series.id, episode)).filter(Boolean);
      if (episodes.length) {
        return {
          series,
          season: series.seasons.find((item) => Number(item.number) === number) || null,
          episodes,
        };
      }
    } catch {
      // Fall back to episodes embedded in the details payload.
    }
    return {
      series,
      season: series.seasons.find((item) => Number(item.number) === number) || null,
      episodes: asArray(series.episodes).filter((episode) => Number(episode.seasonNumber) === number),
    };
  }

  async getEpisode(id) {
    if (!String(id || '').startsWith(`${PROVIDER_ID}:`)) return null;
    const [seriesId] = String(id).split(':episode:');
    const series = await this.getSeries(seriesId);
    return series?.episodes?.find((episode) => episode.id === id) || null;
  }

  normalizeStream(payload, itemId) {
    const data = unwrapItem(payload);
    const source = data?.sources?.find((entry) => entry?.url) || data;
    const url = source?.url || source?.streamUrl || source?.playUrl || source?.downloadUrl;
    if (!url) return null;
    return {
      url,
      contentType: source?.contentType || source?.mimeType || 'video/mp4',
      filename: source?.filename || source?.name || null,
      quality: normalizeQuality(source || data),
      item: data?.item ? this.normalizeSubject(data.item) : { id: itemId, provider: PROVIDER_ID },
    };
  }

  async getStream(id) {
    if (!this.configured || !String(id || '').startsWith(`${PROVIDER_ID}:`)) return null;
    const providerId = String(id).replace(`${PROVIDER_ID}:`, '');
    const payload = await this.fetchJson(this.path(this.paths.stream, { id: providerId }));
    return this.normalizeStream(payload, id);
  }

  async getDownload(id) {
    if (!this.configured || !String(id || '').startsWith(`${PROVIDER_ID}:`)) return null;
    const providerId = String(id).replace(`${PROVIDER_ID}:`, '');
    try {
      const payload = await this.fetchJson(this.path(this.paths.download, { id: providerId }));
      return this.normalizeStream(payload, id);
    } catch {
      return this.getStream(id);
    }
  }

  async getSubtitles(id) {
    if (!this.configured || !String(id || '').startsWith(`${PROVIDER_ID}:`)) return [];
    const providerId = String(id).replace(`${PROVIDER_ID}:`, '');
    try {
      const payload = await this.fetchJson(this.path(this.paths.subtitles, { id: providerId }));
      return unwrapList(payload).map((entry, index) => {
        const language = entry?.language || entry?.lang || entry?.locale || null;
        const url = normalizeUrl(entry?.url || entry?.src || entry?.file, this.baseUrl, this.assetBaseUrl);
        return {
          id: String(entry?.id || entry?.subtitleId || `${providerId}:${language || index}`),
          label: entry?.label || entry?.name || language || `Subtitle ${index + 1}`,
          language,
          url,
          format: entry?.format || entry?.type || null,
        };
      }).filter((entry) => entry.url);
    } catch {
      return [];
    }
  }
}
