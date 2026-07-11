const now = new Date().toISOString();

export const seedState = {
  meta: {
    appName: 'ProHub',
    version: '2.4.1',
    build: '20240610',
    lastStartedAt: now,
  },
  settings: {
    apiKeys: [
      { id: 'gdrive', label: 'Google Drive API Key', value: '' },
      { id: 'mega', label: 'Mega API Key', value: '' },
      { id: 'github', label: 'GitHub Personal Token', value: '' },
      { id: 'listenfree', label: 'ListenFree API Key', value: '' },
      { id: 'moviebox', label: 'MovieBox Compatible API Key', value: '' },
    ],
    cloud: {
      defaultSyncPath: '/home/user/ProHub/Sync',
    },
    downloads: {
      downloadPath: 'downloads',
      maxConcurrent: 5,
      speedLimit: false,
      autoStart: true,
    },
    apps: {
      checkInterval: '1hr',
      autoUpdateCritical: true,
      trackedRepos: ['tauri-apps/tauri', 'facebook/react', 'microsoft/vscode', 'tailwindlabs/tailwindcss', 'vercel/next.js'],
    },
    music: {
      audioQuality: 'auto',
      crossfade: true,
      crossfadeDuration: 5,
      normalizeVolume: true,
      languageModalComplete: true,
      selectedLanguages: ['en'],
    },
    moviebox: {
      baseUrl: '',
      assetBaseUrl: '',
      healthPath: '/health',
      homePath: '/home',
      searchPath: '/search',
      detailsPath: '/details/:id',
      episodesPath: '/episodes/:id',
      streamPath: '/stream/:id',
      downloadPath: '/download/:id',
      subtitlesPath: '/subtitles/:id',
    },
    vpn: {
      defaultProtocol: 'WireGuard',
      killSwitch: true,
      autoConnect: false,
    },
    appearance: {
      accentColor: 'indigo',
      glassOpacity: 60,
      reduceMotion: false,
      notifications: true,
      darkMode: true,
    },
  },
  downloads: {
    engine: {
      rpcPort: 6800,
    },
    history: [],
  },
  music: {
    provider: {
      id: 'listenfree',
      configured: false,
      status: 'unavailable',
      message: 'No real music provider is configured yet.',
    },
    languages: [
      { id: 'en', label: 'English', flag: 'GB' },
      { id: 'te', label: 'Telugu', flag: 'IN' },
      { id: 'hi', label: 'Hindi', flag: 'IN' },
      { id: 'ta', label: 'Tamil', flag: 'IN' },
      { id: 'ko', label: 'K-POP', flag: 'KR' },
    ],
    playlists: [],
    tracks: [],
    albums: [],
    artists: [],
    library: {
      tracks: [],
      albums: [],
      artists: [],
      playlists: [],
    },
    localPlaylists: {
      favorites: { id: 'favorites', name: 'Favorites', trackIds: [] },
      recentlyPlayed: { id: 'recently-played', name: 'Recently Played', trackIds: [] },
      custom: [],
    },
    history: {
      recentlyPlayed: [],
      mostPlayed: {},
      lastPlayed: null,
    },
    player: {
      currentTrackId: null,
      isPlaying: false,
      progress: 0,
      volume: 75,
      isMuted: false,
      queue: [],
      likedTrackIds: [],
      shuffle: false,
      repeat: false,
    },
  },
  movie: {
    provider: {
      id: 'movie-sky',
      configured: true,
      status: 'ready',
      message: 'MovieBox-compatible provider can be configured; metadata fallback is available.',
    },
    library: {
      movies: [],
      series: [],
      downloaded: [],
      collections: [],
    },
    history: {
      recentlyWatched: [],
      progress: {},
      lastWatched: null,
    },
    favorites: {
      itemIds: [],
    },
    watchLater: {
      itemIds: [],
    },
    player: {
      currentItemId: null,
      currentEpisodeId: null,
      isPlaying: false,
      progress: 0,
      volume: 80,
      playbackRate: 1,
      selectedSubtitleId: null,
      selectedAudioTrackId: null,
    },
  },
  vpn: {
    status: 'unavailable',
    connected: false,
    activeServerId: null,
    publicIp: null,
    connectedAt: null,
    message: 'Real VPN integration is not configured. Manual setup is required.',
    dataTransferred: { up: '0 B', down: '0 B' },
    servers: [],
  },
  cloud: {
    providers: [
      { id: 'gdrive', name: 'Google Drive', color: '#3b82f6', connected: false, configured: false, status: 'missing_credentials', files: [] },
      { id: 'github', name: 'GitHub Repos', color: '#a1a1aa', connected: false, configured: false, status: 'missing_credentials', files: [] },
      { id: 'mega', name: 'Mega', color: '#ef4444', connected: false, configured: false, status: 'not_implemented', files: [] },
    ],
    syncQueue: [],
  },
  apps: {
    repos: [],
    updateHistory: [],
    lastError: null,
  },
  activities: [
    { id: 'act-start', type: 'activity', text: 'ProHub backend initialized', time: 'just now', createdAt: now },
  ],
};
