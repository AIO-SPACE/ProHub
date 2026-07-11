import { existsSync } from 'node:fs';
import { MovieProviderManager, ensureMovieState } from './movieManager.js';

const dedupeById = (items) => [...new Map((items || []).filter((item) => item?.id).map((item) => [String(item.id), item])).values()];

export async function syncDownloadedMovies(store) {
  const state = await store.read();
  ensureMovieState(state);
  const completed = (state.downloads?.history || []).filter((item) => (
    item.status === 'completed'
    && item.metadata?.movieItem
    && item.savePath
    && existsSync(item.savePath)
  ));

  if (!completed.length) return state.movie.library;

  await store.update((current) => {
    ensureMovieState(current);
    const downloaded = completed.map((item) => ({
      ...item.metadata.movieItem,
      downloadId: item.id,
      localFile: item.savePath,
      downloadedAt: item.updatedAt || item.createdAt,
      quality: item.metadata.quality || item.metadata.movieItem.quality || null,
      hasStream: true,
      hasDownload: true,
      provider: 'local-library',
    }));
    const manager = new MovieProviderManager(current);
    current.movie.library.downloaded = dedupeById([...downloaded, ...current.movie.library.downloaded]);
    current.movie.library.movies = dedupeById([...downloaded.filter((item) => item.type === 'movie'), ...current.movie.library.movies]);
    return manager.getHomeState().library;
  });

  return (await store.read()).movie.library;
}
