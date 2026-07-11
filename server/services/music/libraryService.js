import { stat } from 'node:fs/promises';
import { parseFile } from 'music-metadata';

function ensureLibrary(state) {
  state.music ||= {};
  state.music.library ||= { tracks: [], albums: [], artists: [], playlists: [] };
  state.music.library.tracks ||= [];
  state.music.library.albums ||= [];
  state.music.library.artists ||= [];
  state.music.library.playlists ||= [];
}

function audioQuality(metadata) {
  const format = metadata.format || {};
  return {
    codec: format.codec || null,
    container: format.container || null,
    bitrate: format.bitrate || null,
    bitrateLabel: format.bitrate ? `${Math.round(format.bitrate / 1000)} kbps` : null,
    sampleRate: format.sampleRate || null,
    sampleRateLabel: format.sampleRate ? `${(format.sampleRate / 1000).toFixed(format.sampleRate % 1000 ? 1 : 0)} kHz` : null,
    channels: format.numberOfChannels || null,
    duration: format.duration || null,
    lossless: Boolean(format.lossless),
  };
}

export async function syncDownloadedMusic(store) {
  const state = await store.read();
  ensureLibrary(state);
  const candidates = (state.downloads?.history || []).filter((item) => (
    item.status === 'completed' &&
    item.provider === 'music-sky' &&
    item.metadata?.musicTrack &&
    item.savePath
  ));

  const additions = [];
  for (const download of candidates) {
    if (state.music.library.tracks.some((track) => track.downloadId === download.id)) continue;
    try {
      const fileStat = await stat(download.savePath);
      if (!fileStat.isFile()) continue;
      const parsed = await parseFile(download.savePath, { duration: true });
      additions.push({
        ...download.metadata.musicTrack,
        id: `local:${download.id}`,
        sourceTrackId: download.metadata.musicTrack.id,
        provider: 'local-library',
        localFile: download.savePath,
        downloadId: download.id,
        sizeBytes: fileStat.size,
        quality: audioQuality(parsed),
        downloadedAt: download.updatedAt || download.createdAt,
      });
    } catch {
      // A completed aria2 entry can briefly precede the final file rename.
    }
  }

  if (additions.length) {
    await store.update((current) => {
      ensureLibrary(current);
      current.music.library.tracks = [
        ...additions,
        ...current.music.library.tracks.filter((track) => !additions.some((item) => item.downloadId === track.downloadId)),
      ];
    });
  }

  return additions;
}
