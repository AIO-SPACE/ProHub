const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

type DeepPartial<T> = T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }

  return payload as T;
}

export type DownloadStatus = 'downloading' | 'queued' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface DownloadItem {
  id: string;
  gid?: string;
  provider?: string;
  sourceKind?: string;
  filename: string;
  url: string;
  size: string;
  totalBytes?: number;
  completedBytes?: number;
  progress: number;
  speed: string;
  speedBytes?: number;
  status: DownloadStatus;
  eta: string;
  type: string;
  savePath?: string;
  createdAt?: string;
  updatedAt?: string;
  seeds?: number;
  peers?: number;
  error?: string;
}

export interface DownloadsPayload {
  items: DownloadItem[];
  stats: {
    active: number;
    completed: number;
    failed: number;
    cancelled: number;
    queued: number;
    total: number;
    currentSpeed: string;
    completedSize: string;
  };
  health: DownloadHealth;
}

export interface DownloadHealth {
  engine: {
    id: string;
    label: string;
    rpcUrl: string;
    downloadDir: string;
    binaryPath: string | null;
    bundled: boolean;
    available: boolean;
    started: boolean;
    startup?: {
      started?: boolean;
      available?: boolean;
      reason?: string;
      expected?: string;
      pid?: number;
      binary?: string;
      bundled?: boolean;
    };
  };
  providers: Array<{
    id: string;
    label: string;
    ok: boolean;
    configured?: boolean;
    reason?: string;
    error?: string;
    note?: string;
    delegatedTo?: string;
  }>;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  artists?: Array<{ id: string | null; name: string }>;
  album: string;
  albumId?: string | null;
  duration: string;
  durationSeconds?: number;
  artwork: string | null;
  provider: string;
  sourceUrl?: string | null;
  localFile?: string;
  quality?: MusicQuality | null;
}

export interface MusicQuality {
  codec: string | null;
  container: string | null;
  bitrate: number | null;
  bitrateLabel: string | null;
  sampleRate: number | null;
  sampleRateLabel: string | null;
  channels: number | null;
  quality?: string | null;
  contentLength?: number | null;
  lossless?: boolean;
}

export interface MusicAlbum {
  id: string;
  title: string;
  artist?: string;
  artwork?: string | null;
  year?: string | null;
  tracks?: MusicTrack[];
}

export interface MusicArtist {
  id: string;
  name: string;
  artwork?: string | null;
  subscribers?: string | null;
}

export interface MusicPlaylist {
  id: string;
  name: string;
  description?: string;
  artwork?: string | null;
  author?: string | null;
  trackCount?: string | number | null;
  tracks?: MusicTrack[];
}

export interface MusicSectionEntry {
  type: 'track' | 'album' | 'artist' | 'playlist';
  item: MusicTrack | MusicAlbum | MusicArtist | MusicPlaylist;
}

export interface MusicPayload {
  provider?: {
    id: string;
    configured: boolean;
    status: string;
    message: string;
  };
  languages: Array<{ id: string; label: string; flag: string }>;
  playlists: MusicPlaylist[];
  tracks: MusicTrack[];
  albums?: MusicAlbum[];
  artists: MusicArtist[];
  localPlaylists?: {
    favorites: { id: string; name: string; trackIds: string[] };
    recentlyPlayed: { id: string; name: string; trackIds: string[] };
    custom: Array<{ id: string; name: string; trackIds: string[] }>;
  };
  history?: {
    recentlyPlayed: string[];
    mostPlayed: Record<string, number>;
    lastPlayed: string | null;
  };
  player: {
    currentTrackId: string | null;
    currentTrack: MusicTrack | null;
    isPlaying: boolean;
    progress: number;
    volume: number;
    isMuted: boolean;
    queue: Array<string | number>;
    likedTrackIds: string[];
    shuffle: boolean;
    repeat: boolean;
  };
  languageModalComplete: boolean;
  selectedLanguages: string[];
  message?: string;
  health?: {
    providers: Array<{ id: string; label: string; ok: boolean; configured?: boolean; latencyMs?: number; reason?: string }>;
  };
}

export interface MusicSearchPayload {
  provider: NonNullable<MusicPayload['provider']>;
  query?: string;
  items: MusicTrack[];
  playlists: MusicPayload['playlists'];
  tracks: MusicTrack[];
  albums: NonNullable<MusicPayload['albums']>;
  artists: MusicPayload['artists'];
  providerErrors?: Array<{ provider: string; message: string }>;
  message: string;
  sections?: Array<{ id: string; title: string; items: MusicSectionEntry[] }>;
}

export interface MovieQuality {
  resolution?: string | null;
  width?: number | null;
  height?: number | null;
  codec?: string | null;
  container?: string | null;
  size?: number | null;
  sizeLabel?: string | null;
}

export interface MovieCredit {
  name: string;
  role?: string | null;
  job?: string | null;
  character?: string | null;
  image?: string | null;
}

export interface MovieSeason {
  id: string;
  providerId?: string;
  seriesId?: string;
  number: number;
  title: string;
  episodeCount?: number;
  premiereDate?: string | null;
  endDate?: string | null;
  poster?: string | null;
}

export interface MovieItem {
  id: string;
  providerId?: string;
  provider: string;
  mediaKind?: 'movie' | 'anime';
  format?: string | null;
  type: 'movie' | 'series' | 'episode';
  title: string;
  originalTitle?: string | null;
  alternateTitles?: string[];
  description?: string;
  year?: string | null;
  releaseDate?: string | null;
  ended?: string | null;
  runtimeSeconds?: number | null;
  runtime?: string | null;
  genres?: string[];
  countries?: string[];
  rating?: number | null;
  ratingSource?: string | null;
  poster?: string | null;
  backdrop?: string | null;
  sourceUrl?: string | null;
  hasStream: boolean;
  hasDownload: boolean;
  quality?: MovieQuality | null;
  status?: string | null;
  language?: string | null;
  network?: string | null;
  cast?: MovieCredit[];
  crew?: MovieCredit[];
  seasons?: MovieSeason[];
  episodes?: MovieItem[];
  subtitles?: Array<{ id: string; label: string; language?: string | null; url?: string }>;
  audioTracks?: Array<{ id: string; label: string; language?: string | null }>;
  trailers?: Array<{ id: string; label: string; url: string }>;
  license?: string | null;
  favorite?: boolean;
  watchLater?: boolean;
  resume?: {
    itemId: string;
    episodeId?: string | null;
    progress: number;
    positionSeconds: number;
    durationSeconds: number;
    updatedAt: string;
  } | null;
  localFile?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  seriesId?: string;
}

export interface MovieSection {
  id: string;
  title: string;
  layout?: 'hero' | 'rail' | 'ranked' | string;
  items: MovieItem[];
}

export interface MovieProviderStatus {
  id: string;
  label: string;
  ok: boolean;
  configured?: boolean;
  latencyMs?: number;
  reason?: string;
}

export interface MoviePayload {
  provider?: {
    id: string;
    configured: boolean;
    status: string;
    message: string;
  };
  library: {
    movies: MovieItem[];
    series: MovieItem[];
    downloaded: MovieItem[];
    collections: Array<{ id: string; title: string; itemIds: string[] }>;
  };
  history: {
    recentlyWatched: string[];
    progress: Record<string, NonNullable<MovieItem['resume']>>;
    lastWatched: string | null;
  };
  favorites: { itemIds: string[] };
  watchLater: { itemIds: string[] };
  player: {
    currentItemId: string | null;
    currentEpisodeId: string | null;
    isPlaying: boolean;
    progress: number;
    volume: number;
    playbackRate: number;
    selectedSubtitleId: string | null;
    selectedAudioTrackId: string | null;
  };
  sections?: MovieSection[];
  continueWatching?: MovieItem[];
  providers?: MovieProviderStatus[];
  providerErrors?: Array<{ provider: string; message: string }>;
  message?: string;
}

export interface MovieSearchPayload {
  provider: NonNullable<MoviePayload['provider']>;
  query?: string;
  items: MovieItem[];
  movies: MovieItem[];
  series: MovieItem[];
  providerErrors?: Array<{ provider: string; message: string }>;
  message: string;
}

export interface MovieEpisodesPayload {
  series: MovieItem;
  season: MovieSeason | null;
  episodes: MovieItem[];
}

export interface VpnServer {
  id: string;
  country: string;
  city: string;
  flag: string;
  load: number;
  ping: number;
  protocol: 'WireGuard' | 'OpenVPN';
  favorite: boolean;
}

export interface VpnPayload {
  status?: string;
  connected: boolean;
  activeServerId: string | null;
  activeServer: VpnServer | null;
  publicIp: string | null;
  connectedAt: string | null;
  uptime: { days: number; hours: number; mins: number };
  dataTransferred: { up: string; down: string };
  servers: VpnServer[];
  settings?: { defaultProtocol: string; killSwitch: boolean; autoConnect: boolean };
  message?: string;
}

export interface CloudProvider {
  id: string;
  name: string;
  color: string;
  used: number;
  total: number;
  connected: boolean;
  configured?: boolean;
  status?: string;
  syncing: number;
  fileCount?: number;
  transferStatus?: string;
  message?: string;
  files: Array<{ name: string; type: string; size: string; url?: string }>;
}

export interface CloudPayload {
  providers: CloudProvider[];
  syncQueue: Array<{ id: string; file: string; from: string; to: string; status: string; progress: number }>;
}

export interface Repo {
  id: string;
  owner: string;
  name: string;
  description: string;
  stars: number;
  forks: number;
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  isCritical: boolean;
  lastChecked: string;
  autoCheck: boolean;
  language: string;
  languageColor: string;
  url?: string;
  releaseUrl?: string | null;
  releaseAssets?: Array<{
    id: number;
    name: string;
    size: number;
    downloadCount: number;
    contentType: string;
    browserDownloadUrl: string;
  }>;
  checkedAt?: string;
}

export interface AppsPayload {
  provider?: {
    id: string;
    configured: boolean;
    source: string;
    note: string;
  };
  repos: Repo[];
  updateHistory: Array<{ repo: string; from: string; to: string; date: string; type: string }>;
  errors?: Array<{ repo: string; error: string }>;
}

export interface SettingsPayload {
  apiKeys: Array<{ id: string; label: string; value: string }>;
  cloud: { defaultSyncPath: string };
  downloads: { downloadPath: string; maxConcurrent: number; speedLimit: boolean; autoStart: boolean };
  apps: { checkInterval: string; autoUpdateCritical: boolean };
  music: { audioQuality: string; crossfade: boolean; crossfadeDuration: number; normalizeVolume: boolean; languageModalComplete: boolean; selectedLanguages: string[] };
  moviebox: {
    baseUrl: string;
    assetBaseUrl: string;
    healthPath: string;
    homePath: string;
    searchPath: string;
    detailsPath: string;
    episodesPath: string;
    streamPath: string;
    downloadPath: string;
    subtitlesPath: string;
  };
  vpn: { defaultProtocol: string; killSwitch: boolean; autoConnect: boolean };
  appearance: { accentColor: string; glassOpacity: number; reduceMotion: boolean; notifications: boolean; darkMode: boolean };
}

export interface DashboardPayload {
  modules: Array<{
    id: string;
    label: string;
    status: string;
    statusColor: string;
    progress: number;
    stats: string[];
    isHero?: boolean;
  }>;
  activities: Array<{ id: string; type: string; text: string; time: string }>;
  quickStats: Array<{ label: string; value: string; sub: string; color: string }>;
  miniPlayer: { track: MusicTrack | null; isPlaying: boolean; progress: number };
}

const createMediaApi = (resource: 'movie' | 'anime') => ({
  home: () => request<MoviePayload>(`/${resource}/home`),
  search: (query: string) => request<MovieSearchPayload>(`/${resource}/search?q=${encodeURIComponent(query)}`),
  providers: () => request<{ providers: MovieProviderStatus[] }>(`/${resource}/providers`),
  details: (id: string) => request<{ item: MovieItem; message: string }>(`/${resource}/details/${encodeURIComponent(id)}`),
  episodes: (seriesId: string, season?: number) => request<MovieEpisodesPayload>(`/${resource}/episodes/${encodeURIComponent(seriesId)}${season ? `?season=${encodeURIComponent(String(season))}` : ''}`),
  subtitles: (id: string) => request<{ itemId: string; subtitles: Array<{ id: string; label: string; language?: string | null; url?: string }> }>(`/${resource}/subtitles/${encodeURIComponent(id)}`),
  download: (id: string) => request<DownloadItem>(`/${resource}/download/${encodeURIComponent(id)}`, { method: 'POST' }),
  library: () => request<MoviePayload>(`/${resource}/library`),
  updateHistory: (body: { id: string; episodeId?: string | null; progress?: number; positionSeconds?: number; durationSeconds?: number }) =>
    request<MoviePayload['history']>(`/${resource}/history`, { method: 'PATCH', body }),
  setFavorite: (id: string, favorite: boolean) => request<MoviePayload['favorites']>(`/${resource}/favorites/${encodeURIComponent(id)}`, { method: 'PATCH', body: { favorite } }),
  setWatchLater: (id: string, saved: boolean) => request<MoviePayload['watchLater']>(`/${resource}/watch-later/${encodeURIComponent(id)}`, { method: 'PATCH', body: { saved } }),
  streamUrl: (id: string) => `${API_BASE}/${resource}/stream/${encodeURIComponent(id)}`,
});

export const api = {
  health: () => request<{ status: string; service: string; version: string }>('/health'),
  dashboard: () => request<DashboardPayload>('/dashboard'),
  downloads: {
    list: () => request<DownloadsPayload>('/downloads'),
    add: (url: string) => request<DownloadItem>('/downloads/add', { method: 'POST', body: { url } }),
    batch: (urls: string[]) => request<{ results: Array<{ ok: boolean; item?: DownloadItem; url?: string; error?: string }> }>('/downloads/batch', { method: 'POST', body: { urls } }),
    get: (id: string) => request<{ item: DownloadItem; health: DownloadHealth }>(`/downloads/${id}`),
    pause: (id: string) => request<DownloadItem>(`/downloads/${id}/pause`, { method: 'PATCH' }),
    resume: (id: string) => request<DownloadItem>(`/downloads/${id}/resume`, { method: 'PATCH' }),
    retry: (id: string) => request<DownloadItem>(`/downloads/${id}/retry`, { method: 'PATCH' }),
    cancel: (id: string) => request<{ id: string; status: 'cancelled' }>(`/downloads/${id}/cancel`, { method: 'PATCH' }),
    remove: (id: string) => request<void>(`/downloads/${id}`, { method: 'DELETE' }),
    openFile: (id: string) => request<{ opened: boolean; path: string }>(`/downloads/${id}/open-file`, { method: 'POST' }),
    openFolder: (id: string) => request<{ opened: boolean; path: string }>(`/downloads/${id}/open-folder`, { method: 'POST' }),
    health: () => request<DownloadHealth>('/downloads/health'),
  },
  music: {
    get: () => request<MusicPayload>('/music'),
    search: (query: string) => request<MusicSearchPayload>(`/music/search?q=${encodeURIComponent(query)}`),
    trending: () => request<MusicSearchPayload>('/music/trending'),
    playlists: () => request<MusicSearchPayload>('/music/playlists'),
    health: () => request<{ providers: Array<{ id: string; label: string; ok: boolean; configured?: boolean; reason?: string }> }>('/music/health'),
    track: (id: string) => request<{ track: MusicTrack; message: string }>(`/music/track/${id}`),
    playlist: (id: string) => request<{ playlist: MusicPlaylist; message: string }>(`/music/playlist/${id}`),
    album: (id: string) => request<{ album: MusicAlbum; message: string }>(`/music/album/${id}`),
    artist: (id: string) => request<{ artist: MusicArtist & { sections?: Array<{ title: string; items: MusicSectionEntry[] }> }; message: string }>(`/music/artist/${id}`),
    queue: (id: string) => request<{ trackId: string; tracks: MusicTrack[] }>(`/music/queue/${id}`),
    lyrics: (id: string) => request<{ trackId: string; text: string; footer: string; synced: boolean; error?: string }>(`/music/lyrics/${id}`),
    download: (id: string) => request<DownloadItem>(`/music/download/${id}`, { method: 'POST' }),
    streamUrl: (id: string) => `${API_BASE}/music/stream/${encodeURIComponent(id)}`,
    updatePlayer: (body: Partial<MusicPayload['player']> & { action?: 'play' | 'pause' | 'next' | 'previous' | 'seek' }) => request<MusicPayload['player']>('/music/player', { method: 'PATCH', body }),
    setLiked: (trackId: string, liked: boolean) => request<{ likedTrackIds: string[] }>(`/music/liked/${trackId}`, { method: 'PATCH', body: { liked } }),
    completeLanguages: (selectedLanguages: string[]) => request<MusicPayload>('/music/languages', { method: 'PATCH', body: { selectedLanguages, complete: true } }),
  },
  movie: createMediaApi('movie'),
  anime: createMediaApi('anime'),
  vpn: {
    get: () => request<VpnPayload>('/vpn'),
    connect: (serverId?: string) => request<VpnPayload>('/vpn/connect', { method: 'POST', body: { serverId } }),
    disconnect: () => request<VpnPayload>('/vpn/disconnect', { method: 'POST' }),
    setFavorite: (serverId: string, favorite: boolean) => request<VpnPayload>(`/vpn/servers/${serverId}`, { method: 'PATCH', body: { favorite } }),
  },
  cloud: {
    get: () => request<CloudPayload>('/cloud'),
    updateProvider: (providerId: string, body: { connected?: boolean; syncNow?: boolean }) => request<CloudPayload>(`/cloud/providers/${providerId}`, { method: 'PATCH', body }),
    action: (providerId: string, action: 'connect' | 'refresh' | 'browse' | 'download' | 'upload' | 'open', body?: unknown) =>
      request<{ provider?: CloudProvider; files?: CloudProvider['files']; message?: string; url?: string }>(`/cloud/providers/${providerId}/${action}`, {
        method: action === 'browse' ? 'GET' : 'POST',
        body,
      }),
  },
  apps: {
    get: () => request<AppsPayload>('/apps'),
    checkAll: () => request<AppsPayload>('/apps/check', { method: 'POST' }),
    updateRepo: (repoId: string, body: { track?: boolean }) => request<AppsPayload>(`/apps/repos/${repoId}`, { method: 'PATCH', body }),
  },
  settings: {
    get: () => request<SettingsPayload>('/settings'),
    save: (body: DeepPartial<SettingsPayload>) => request<SettingsPayload>('/settings', { method: 'PATCH', body }),
    testKey: (id: string) => request<{ id: string; ok: boolean; message: string }>('/settings/test-key', { method: 'POST', body: { id } }),
  },
};
