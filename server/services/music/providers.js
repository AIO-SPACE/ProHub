export class LocalMusicProvider {
  id = 'local-library';
  label = 'Local Library';

  constructor(state) {
    this.state = state;
  }

  async health() {
    return {
      id: this.id,
      label: this.label,
      ok: true,
      configured: true,
      trackCount: this.state.music.library.tracks.length,
      playlistCount: this.state.music.library.playlists.length,
    };
  }

  async search(query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return { tracks: [], albums: [], artists: [], playlists: [] };
    const library = this.state.music.library;
    return {
      tracks: library.tracks.filter((track) => [track.title, track.artist, track.album].some((value) => String(value || '').toLowerCase().includes(q))),
      albums: library.albums.filter((album) => [album.title, album.artist].some((value) => String(value || '').toLowerCase().includes(q))),
      artists: library.artists.filter((artist) => artist.name.toLowerCase().includes(q)),
      playlists: library.playlists.filter((playlist) => playlist.name.toLowerCase().includes(q)),
    };
  }

  async getTrack(id) {
    return this.state.music.library.tracks.find((track) => String(track.id) === String(id)) || null;
  }

  async getPlaylist(id) {
    return this.state.music.library.playlists.find((playlist) => String(playlist.id) === String(id)) || null;
  }

  async getAlbum(id) {
    return this.state.music.library.albums.find((album) => String(album.id) === String(id)) || null;
  }

  async getArtist(id) {
    return this.state.music.library.artists.find((artist) => String(artist.id) === String(id)) || null;
  }
}

export class NotConfiguredMusicProvider {
  constructor({ id, label, reason }) {
    this.id = id;
    this.label = label;
    this.reason = reason;
  }

  async health() {
    return {
      id: this.id,
      label: this.label,
      ok: false,
      configured: false,
      reason: this.reason,
    };
  }

  async search() {
    return { tracks: [], albums: [], artists: [], playlists: [] };
  }

  async getTrack() {
    return null;
  }

  async getPlaylist() {
    return null;
  }

  async getAlbum() {
    return null;
  }

  async getArtist() {
    return null;
  }
}
