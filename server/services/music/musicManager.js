import { EchoMusicProvider } from './EchoMusicProvider.js';
import { LocalMusicProvider } from './providers.js';

function ensureMusicState(state) {
  state.music ||= {};
  state.music.library ||= { tracks: [], albums: [], artists: [], playlists: [] };
  state.music.library.tracks ||= [];
  state.music.library.albums ||= [];
  state.music.library.artists ||= [];
  state.music.library.playlists ||= [];
  state.music.history ||= { recentlyPlayed: [], mostPlayed: {}, lastPlayed: null };
  state.music.player ||= {
    currentTrackId: null,
    isPlaying: false,
    progress: 0,
    volume: 75,
    isMuted: false,
    queue: [],
    likedTrackIds: [],
    shuffle: false,
    repeat: false,
  };
  state.music.player.queue ||= [];
  state.music.player.likedTrackIds ||= [];
  state.music.localPlaylists ||= {
    favorites: { id: 'favorites', name: 'Favorites', trackIds: [] },
    recentlyPlayed: { id: 'recently-played', name: 'Recently Played', trackIds: [] },
    custom: [],
  };
}

function createProviders(state) {
  return [
    new EchoMusicProvider(),
    new LocalMusicProvider(state),
  ];
}

function mergeResults(results) {
  const merged = { tracks: [], albums: [], artists: [], playlists: [], providerErrors: [] };
  const seen = {
    tracks: new Set(),
    albums: new Set(),
    artists: new Set(),
    playlists: new Set(),
  };

  for (const result of results) {
    if (result.error) {
      merged.providerErrors.push(result.error);
      continue;
    }
    for (const key of ['tracks', 'albums', 'artists', 'playlists']) {
      for (const item of result[key] || []) {
        const id = `${key}:${item.id}`;
        if (!seen[key].has(id)) {
          seen[key].add(id);
          merged[key].push(item);
        }
      }
    }
  }
  return merged;
}

export class MusicManager {
  constructor(state) {
    ensureMusicState(state);
    this.state = state;
    this.providers = createProviders(state);
  }

  async health() {
    return {
      providers: await Promise.all(this.providers.map((provider) => provider.health())),
    };
  }

  async search(query) {
    const results = await Promise.all(this.providers.map(async (provider) => {
      try {
        return await provider.search(query);
      } catch (error) {
        return { error: { provider: provider.id, message: error.message } };
      }
    }));
    return mergeResults(results);
  }

  async trending() {
    const provider = this.providers.find((item) => typeof item.trending === 'function');
    if (!provider) return { sections: [], tracks: [], albums: [], artists: [], playlists: [] };
    return provider.trending();
  }

  async getTrack(id) {
    for (const provider of this.providers) {
      try {
        const track = await provider.getTrack(id);
        if (track) return track;
      } catch {
        continue;
      }
    }
    return null;
  }

  async getPlaylist(id) {
    for (const provider of this.providers) {
      try {
        const playlist = await provider.getPlaylist(id);
        if (playlist) return playlist;
      } catch {
        continue;
      }
    }
    return null;
  }

  async getAlbum(id) {
    for (const provider of this.providers) {
      try {
        const album = await provider.getAlbum(id);
        if (album) return album;
      } catch {
        continue;
      }
    }
    return null;
  }

  async getArtist(id) {
    for (const provider of this.providers) {
      try {
        const artist = await provider.getArtist(id);
        if (artist) return artist;
      } catch {
        continue;
      }
    }
    return null;
  }

  async getQueue(id) {
    const provider = this.providers.find((item) => typeof item.getQueue === 'function');
    return provider ? provider.getQueue(id) : [];
  }

  async getLyrics(id) {
    const provider = this.providers.find((item) => typeof item.getLyrics === 'function');
    return provider ? provider.getLyrics(id) : { trackId: id, text: '', synced: false };
  }

  async getStream(id) {
    const localTrack = this.state.music.library.tracks.find((track) => String(track.id) === String(id));
    if (localTrack?.localFile) return { kind: 'file', filePath: localTrack.localFile, quality: localTrack.quality };
    const provider = this.providers.find((item) => typeof item.getStream === 'function');
    if (!provider) return null;
    return { kind: 'remote', ...(await provider.getStream(id)) };
  }

  async getDownload(id) {
    const provider = this.providers.find((item) => typeof item.getDownload === 'function');
    return provider ? provider.getDownload(id) : null;
  }

  getHome() {
    const library = this.state.music.library;
    const currentTrack = library.tracks.find((track) => String(track.id) === String(this.state.music.player.currentTrackId)) || null;
    return {
      provider: {
        id: 'music-sky',
        configured: true,
        status: 'ready',
        message: 'Live catalog and local library are ready.',
      },
      languages: this.state.music.languages || [],
      playlists: library.playlists,
      tracks: library.tracks,
      artists: library.artists,
      albums: library.albums,
      localPlaylists: this.state.music.localPlaylists,
      history: this.state.music.history,
      player: {
        ...this.state.music.player,
        currentTrack,
      },
      languageModalComplete: Boolean(this.state.settings?.music?.languageModalComplete),
      selectedLanguages: this.state.settings?.music?.selectedLanguages || ['en'],
      message: library.tracks.length > 0 ? null : 'Search the live catalog or open a discovery rail to begin.',
    };
  }
}
