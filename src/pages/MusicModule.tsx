import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Download,
  GripVertical,
  Heart,
  Library,
  ListMusic,
  LoaderCircle,
  Maximize2,
  Mic2,
  MoreHorizontal,
  Music,
  Pause,
  Play,
  RefreshCw,
  Repeat2,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { api, type MusicAlbum, type MusicArtist, type MusicPayload, type MusicPlaylist, type MusicSearchPayload, type MusicSectionEntry, type MusicTrack } from '@/lib/api';
import { useArtworkAccent } from '@/features/music/useArtworkAccent';
import { useMusicPlayer } from '@/features/music/useMusicPlayer';
import './MusicModule.css';

type MusicView = 'now-playing' | 'explore' | 'library' | 'lyrics';

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
};

const isTrack = (entry: MusicSectionEntry): entry is MusicSectionEntry & { item: MusicTrack } => entry.type === 'track';
const trackKey = (track: MusicTrack, index: number) => `${track.provider}:${track.id}:${index}`;
const entryKey = (entry: MusicSectionEntry, index: number) => `${entry.type}:${entry.item.id}:${index}`;

function Artwork({ src, alt, className = '' }: { src?: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className={`music-artwork-fallback ${className}`}><Music aria-hidden="true" /></div>;
  }
  return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

function IconButton({ label, active = false, disabled = false, onClick, children }: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className={`music-icon-button ${active ? 'is-active' : ''}`} type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function LoadingState() {
  return (
    <div className="music-loading" aria-label="Loading Music Sky">
      <div className="music-skeleton music-skeleton-art" />
      <div className="music-loading-lines">
        <div className="music-skeleton music-skeleton-title" />
        <div className="music-skeleton music-skeleton-copy" />
        <div className="music-skeleton music-skeleton-copy short" />
      </div>
    </div>
  );
}

function EmptyState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div className="music-empty">
      <Music size={24} aria-hidden="true" />
      <strong>{title}</strong>
      <span>{message}</span>
      {onRetry ? <button type="button" onClick={onRetry}><RefreshCw size={13} /> Retry</button> : null}
    </div>
  );
}

function TrackRows({ tracks, currentId, isPlaying, liked, onPlay, onLike, onDownload }: {
  tracks: MusicTrack[];
  currentId?: string | null;
  isPlaying: boolean;
  liked: Set<string>;
  onPlay: (track: MusicTrack, queue: MusicTrack[]) => void;
  onLike: (track: MusicTrack) => void;
  onDownload: (track: MusicTrack) => void;
}) {
  if (!tracks.length) return <EmptyState title="Nothing here yet" message="Search the live catalog or download a track to build this view." />;
  return (
    <div className="music-track-list" role="table" aria-label="Tracks">
      <div className="music-track-head" role="row">
        <span>#</span><span>Title</span><span>Album</span><span>Quality</span><span>Duration</span><span />
      </div>
      {tracks.map((track, index) => {
        const active = track.id === currentId;
        return (
          <motion.div className={`music-track-row ${active ? 'is-current' : ''}`} role="row" key={trackKey(track, index)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(index, 12) * 0.015 }}>
            <button className="music-track-index" type="button" aria-label={`Play ${track.title}`} onClick={() => onPlay(track, tracks)}>
              {active && isPlaying ? <span className="music-playing-bars"><i /><i /><i /></span> : <><span className="track-number">{index + 1}</span><Play className="track-play" size={12} fill="currentColor" /></>}
            </button>
            <button className="music-track-main" type="button" onClick={() => onPlay(track, tracks)}>
              <Artwork src={track.artwork} alt="" className="music-track-art" />
              <span><strong>{track.title}</strong><small>{track.artist}</small></span>
            </button>
            <span className="music-track-album">{track.album || 'Single'}</span>
            <span className="music-track-quality">{track.quality?.bitrateLabel || track.quality?.codec || 'Source'}</span>
            <span className="music-track-duration">{track.duration}</span>
            <span className="music-track-actions">
              <IconButton label={liked.has(track.id) ? 'Remove from favorites' : 'Add to favorites'} active={liked.has(track.id)} onClick={() => onLike(track)}><Heart size={14} fill={liked.has(track.id) ? 'currentColor' : 'none'} /></IconButton>
              <IconButton label={`Download ${track.title}`} onClick={() => onDownload(track)}><Download size={14} /></IconButton>
              <IconButton label="More options"><MoreHorizontal size={14} /></IconButton>
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

function DiscoveryRail({ title, entries, onPlay, onOpen }: {
  title: string;
  entries: MusicSectionEntry[];
  onPlay: (track: MusicTrack, queue: MusicTrack[]) => void;
  onOpen: (entry: MusicSectionEntry) => void;
}) {
  const tracks = entries.filter(isTrack).map((entry) => entry.item);
  return (
    <section className="music-rail-section">
      <div className="music-section-heading"><h3>{title}</h3><span>{entries.length} items</span></div>
      <div className="music-rail">
        {entries.map((entry, index) => {
          const item = entry.item;
          const label = entry.type === 'artist' ? (item as MusicArtist).name : entry.type === 'playlist' ? (item as MusicPlaylist).name : (item as MusicAlbum | MusicTrack).title;
          const artwork = (item as MusicTrack | MusicAlbum | MusicArtist | MusicPlaylist).artwork;
          const secondary = entry.type === 'track' ? (item as MusicTrack).artist : entry.type === 'album' ? (item as MusicAlbum).artist : entry.type === 'playlist' ? (item as MusicPlaylist).author : (item as MusicArtist).subscribers;
          return (
            <button className="music-rail-item" type="button" key={entryKey(entry, index)} onClick={() => entry.type === 'track' ? onPlay(item as MusicTrack, tracks.length ? tracks : [item as MusicTrack]) : onOpen(entry)}>
              <span className={`music-rail-art-wrap ${entry.type === 'artist' ? 'is-artist' : ''}`}>
                <Artwork src={artwork} alt="" className="music-rail-art" />
                <span className="music-rail-play"><Play size={15} fill="currentColor" /></span>
              </span>
              <strong>{label}</strong>
              <small>{secondary || entry.type}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function MusicModule({ initialView = 'now-playing' }: { initialView?: MusicView }) {
  const [view, setView] = useState<MusicView>(initialView);
  const [home, setHome] = useState<MusicPayload | null>(null);
  const [discovery, setDiscovery] = useState<MusicSearchPayload | null>(null);
  const [results, setResults] = useState<MusicSearchPayload | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [lyrics, setLyrics] = useState<{ text: string; footer: string; error?: string } | null>(null);
  const [detailTitle, setDetailTitle] = useState<string | null>(null);
  const [detailTracks, setDetailTracks] = useState<MusicTrack[]>([]);
  const reportError = useCallback((message: string) => setError(message), []);
  const player = useMusicPlayer({ initialPlayer: home?.player, onError: reportError });
  const { setCurrentTrack, setQueue, setVolume } = player;
  const colors = useArtworkAccent(player.currentTrack?.artwork);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextHome, nextDiscovery] = await Promise.all([api.music.get(), api.music.trending()]);
      setHome(nextHome);
      setDiscovery(nextDiscovery);
      setLikedIds(new Set(nextHome.player.likedTrackIds.map(String)));
      const initialTrack = nextHome.player.currentTrack || nextDiscovery.tracks[0] || nextHome.tracks[0] || null;
      if (initialTrack) setCurrentTrack(initialTrack);
      setQueue((nextDiscovery.tracks.length ? nextDiscovery.tracks : nextHome.tracks).slice(0, 25));
      setVolume(nextHome.player.volume);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Music Sky could not load');
    } finally {
      setLoading(false);
    }
  }, [setCurrentTrack, setQueue, setVolume]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (view !== 'lyrics' || !player.currentTrack) return;
    setLyrics(null);
    void api.music.lyrics(player.currentTrack.id)
      .then(setLyrics)
      .catch((err: Error) => setLyrics({ text: '', footer: '', error: err.message }));
  }, [player.currentTrack, view]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const visibleTracks = useMemo(() => {
    if (detailTracks.length) return detailTracks;
    if (results) return results.tracks;
    if (view === 'library') return home?.tracks.filter((track) => track.provider === 'local-library') || [];
    return discovery?.tracks.slice(0, 30) || [];
  }, [detailTracks, discovery, home, results, view]);

  const submitSearch = async () => {
    if (!query.trim()) {
      setResults(null);
      setDetailTitle(null);
      setDetailTracks([]);
      return;
    }
    setSearching(true);
    try {
      const next = await api.music.search(query.trim());
      setResults(next);
      setDetailTitle(`Results for "${query.trim()}"`);
      setDetailTracks([]);
      setView('explore');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const playTrack = async (track: MusicTrack, sourceQueue: MusicTrack[]) => {
    setError(null);
    void player.playTrack(track, sourceQueue);
    const [metadata, remoteQueue] = await Promise.allSettled([api.music.track(track.id), api.music.queue(track.id)]);
    if (metadata.status === 'fulfilled') player.setCurrentTrack(metadata.value.track);
    if (remoteQueue.status === 'fulfilled' && remoteQueue.value.tracks.length) player.setQueue(remoteQueue.value.tracks);
  };

  const openEntry = async (entry: MusicSectionEntry) => {
    setSearching(true);
    try {
      if (entry.type === 'album') {
        const { album } = await api.music.album(entry.item.id);
        setDetailTitle(album.title);
        setDetailTracks(album.tracks || []);
      } else if (entry.type === 'playlist') {
        const { playlist } = await api.music.playlist(entry.item.id);
        setDetailTitle(playlist.name);
        setDetailTracks(playlist.tracks || []);
      } else if (entry.type === 'artist') {
        const { artist } = await api.music.artist(entry.item.id);
        setDetailTitle(artist.name);
        setDetailTracks((artist.sections || []).flatMap((section) => section.items.filter(isTrack).map((item) => item.item)));
      }
      setResults(null);
      setView('explore');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This music page could not be opened');
    } finally {
      setSearching(false);
    }
  };

  const toggleLike = async (track: MusicTrack) => {
    const liked = !likedIds.has(track.id);
    setLikedIds((previous) => {
      const next = new Set(previous);
      if (liked) next.add(track.id); else next.delete(track.id);
      return next;
    });
    try {
      const response = await api.music.setLiked(track.id, liked);
      setLikedIds(new Set(response.likedTrackIds.map(String)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Favorite could not be updated');
    }
  };

  const downloadTrack = async (track: MusicTrack) => {
    try {
      const item = await api.music.download(track.id);
      setNotice(`${item.filename} was added to Downloads`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download could not be started');
    }
  };

  const current = player.currentTrack;
  const progress = player.duration ? (player.currentTime / player.duration) * 100 : 0;
  const sections = results?.sections || discovery?.sections || [];
  const tabs: Array<{ id: MusicView; label: string }> = [
    { id: 'now-playing', label: 'Now Playing' },
    { id: 'explore', label: 'Explore' },
    { id: 'library', label: 'Library' },
    { id: 'lyrics', label: 'Lyrics' },
  ];

  return (
    <div className="music-sky" style={{ '--music-accent': colors.accent, '--music-accent-soft': colors.soft } as React.CSSProperties}>
      <div className="music-subnav">
        <div className="music-subnav-title"><Music size={18} /><strong>Music Sky</strong></div>
        <div className="music-tabs" role="tablist">
          {tabs.map((tab) => <button type="button" role="tab" aria-selected={view === tab.id} className={view === tab.id ? 'is-active' : ''} key={tab.id} onClick={() => setView(tab.id)}>{tab.label}</button>)}
        </div>
        <div className="music-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void submitSearch()} placeholder="Search songs, albums, artists" aria-label="Search songs, albums, artists" />
          {query ? <IconButton label="Clear search" onClick={() => { setQuery(''); setResults(null); setDetailTitle(null); setDetailTracks([]); }}><X size={14} /></IconButton> : null}
          <IconButton label="Search" disabled={searching} onClick={() => void submitSearch()}>{searching ? <LoaderCircle className="animate-spin" size={14} /> : <Search size={14} />}</IconButton>
        </div>
        <IconButton label="Show queue" onClick={() => setQueueOpen((open) => !open)}><ListMusic size={16} /></IconButton>
      </div>

      {error ? <div className="music-error"><AlertTriangle size={15} /><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={14} /></button></div> : null}
      {notice ? <div className="music-notice"><Check size={14} /><span>{notice}</span></div> : null}

      <div className="music-workspace">
        <main className="music-main scrollbar-thin">
          {loading ? <LoadingState /> : (
            <>
              {view === 'now-playing' ? (
                <section className="music-now-playing">
                  <div className="music-artwork-stage">
                    <Artwork src={current?.artwork} alt={current?.album || current?.title || 'No track selected'} className="music-main-artwork" />
                  </div>
                  <div className="music-now-copy">
                    <span className="music-context-label">Now Playing</span>
                    <h2>{current?.title || 'Choose a track'}</h2>
                    <button type="button" className="music-artist-link">{current?.artist || 'Search the live catalog'}</button>
                    <span className="music-album-name">{current?.album || 'Music Sky'}</span>
                    <div className="music-quality-line">
                      {current?.quality?.codec ? <span>{current.quality.codec}</span> : null}
                      {current?.quality?.bitrateLabel ? <span>{current.quality.bitrateLabel}</span> : null}
                      {current?.quality?.sampleRateLabel ? <span>{current.quality.sampleRateLabel}</span> : null}
                      {current?.quality?.channels ? <span>{current.quality.channels} ch</span> : null}
                      <span>{current?.provider === 'local-library' ? 'Offline' : 'Music Sky'}</span>
                    </div>
                    <div className="music-progress-block">
                      <input type="range" min="0" max={player.duration || current?.durationSeconds || 1} step="0.1" value={Math.min(player.currentTime, player.duration || current?.durationSeconds || 1)} onChange={(event) => player.seek(Number(event.target.value))} aria-label="Seek" />
                      <div><span>{formatTime(player.currentTime)}</span><span>{formatTime(player.duration || current?.durationSeconds || 0)}</span></div>
                    </div>
                    <div className="music-primary-controls">
                      <IconButton label="Shuffle" active={player.shuffle} onClick={() => player.setShuffle(!player.shuffle)}><Shuffle size={16} /></IconButton>
                      <IconButton label="Previous track" onClick={player.previous}><SkipBack size={20} fill="currentColor" /></IconButton>
                      <button className="music-play-button" type="button" disabled={!current || player.buffering} aria-label={player.isPlaying ? 'Pause' : 'Play'} title={player.isPlaying ? 'Pause' : 'Play'} onClick={() => void player.togglePlay()}>
                        {player.buffering ? <LoaderCircle className="animate-spin" size={21} /> : player.isPlaying ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
                      </button>
                      <IconButton label="Next track" onClick={player.next}><SkipForward size={20} fill="currentColor" /></IconButton>
                      <IconButton label="Repeat" active={player.repeat} onClick={() => player.setRepeat(!player.repeat)}><Repeat2 size={16} /></IconButton>
                    </div>
                    <div className="music-track-commands">
                      <button type="button" className={current && likedIds.has(current.id) ? 'is-active' : ''} disabled={!current} onClick={() => current && void toggleLike(current)}><Heart size={15} fill={current && likedIds.has(current.id) ? 'currentColor' : 'none'} /> Favorite</button>
                      <button type="button" disabled={!current} onClick={() => current && void downloadTrack(current)}><Download size={15} /> Download</button>
                      <button type="button" disabled={!current} onClick={() => setView('lyrics')}><Mic2 size={15} /> Lyrics</button>
                    </div>
                  </div>
                  <aside className="music-lyric-preview">
                    <span>Lyrics</span>
                    <p>{lyrics?.text ? lyrics.text.split('\n').slice(0, 5).join('\n') : 'Open Lyrics for the provider text available with this track.'}</p>
                    <button type="button" onClick={() => setView('lyrics')}>View lyrics <Maximize2 size={13} /></button>
                  </aside>
                </section>
              ) : null}

              {view === 'lyrics' ? (
                <section className="music-lyrics-view">
                  <div className="music-lyrics-art"><Artwork src={current?.artwork} alt="" className="music-main-artwork" /><h2>{current?.title || 'No track selected'}</h2><span>{current?.artist}</span></div>
                  <div className="music-lyrics-copy">
                    {lyrics ? lyrics.text ? <p>{lyrics.text}</p> : <EmptyState title="Lyrics unavailable" message={lyrics.error || 'The provider did not return lyrics for this track.'} /> : <LoaderCircle className="animate-spin" size={24} />}
                    {lyrics?.footer ? <small>{lyrics.footer}</small> : null}
                  </div>
                </section>
              ) : null}

              {view === 'explore' && !sections.length && !visibleTracks.length ? <EmptyState title="No discovery items" message="The live catalog returned no items. Try a search or retry the provider." onRetry={() => void load()} /> : null}
              {view === 'explore' && sections.slice(0, 4).map((section) => <DiscoveryRail key={section.id || section.title} title={section.title} entries={section.items} onPlay={(track, queue) => void playTrack(track, queue)} onOpen={(entry) => void openEntry(entry)} />)}

              {view === 'library' ? (
                <section className="music-library-summary">
                  <div><Library size={18} /><span><strong>{home?.tracks.filter((track) => track.provider === 'local-library').length || 0}</strong> downloaded songs</span></div>
                  <div><Heart size={18} /><span><strong>{likedIds.size}</strong> favorites</span></div>
                  <div><ListMusic size={18} /><span><strong>{home?.history?.recentlyPlayed.length || 0}</strong> recent plays</span></div>
                </section>
              ) : null}

              {view !== 'lyrics' ? (
                <section className="music-results-section">
                  <div className="music-section-heading">
                    <h3>{detailTitle || (view === 'library' ? 'Downloaded Songs' : results ? 'Top Results' : 'Top Tracks')}</h3>
                    {detailTitle || results ? <button type="button" onClick={() => { setResults(null); setDetailTitle(null); setDetailTracks([]); }}>Clear</button> : null}
                  </div>
                  <TrackRows tracks={visibleTracks} currentId={current?.id} isPlaying={player.isPlaying} liked={likedIds} onPlay={(track, queue) => void playTrack(track, queue)} onLike={(track) => void toggleLike(track)} onDownload={(track) => void downloadTrack(track)} />
                </section>
              ) : null}
            </>
          )}
        </main>

        <aside className={`music-queue-panel ${queueOpen ? 'is-open' : ''}`}>
          <div className="music-queue-head"><div><strong>Queue</strong><ChevronDown size={14} /></div><IconButton label="Close queue" onClick={() => setQueueOpen(false)}><X size={15} /></IconButton></div>
          <div className="music-queue-list scrollbar-thin">
            {player.queue.length ? player.queue.map((track, index) => (
              <div className={`music-queue-row ${track.id === current?.id ? 'is-current' : ''}`} key={`${track.id}:${index}`}>
                <button type="button" className="music-queue-track" onClick={() => void playTrack(track, player.queue)}>
                  <Artwork src={track.artwork} alt="" className="music-queue-art" />
                  <span><strong>{track.title}</strong><small>{track.artist}</small></span>
                </button>
                <span>{track.duration}</span>
                <IconButton label={`Remove ${track.title} from queue`} onClick={() => player.removeFromQueue(track.id)}><Trash2 size={13} /></IconButton>
                <GripVertical size={13} aria-hidden="true" />
              </div>
            )) : <EmptyState title="Queue is empty" message="Play a live result to build the queue." />}
          </div>
          <div className="music-queue-foot"><span>{player.queue.length} songs</span><button type="button" onClick={player.clearQueue}>Clear Queue</button></div>
        </aside>
      </div>

      <footer className="music-mini-player">
        <div className="music-mini-track">
          <Artwork src={current?.artwork} alt="" className="music-mini-art" />
          <span><strong>{current?.title || 'No track selected'}</strong><small>{current?.artist || 'Music Sky'}</small></span>
          <IconButton label="Favorite" active={Boolean(current && likedIds.has(current.id))} disabled={!current} onClick={() => current && void toggleLike(current)}><Heart size={15} fill={current && likedIds.has(current.id) ? 'currentColor' : 'none'} /></IconButton>
        </div>
        <div className="music-mini-center">
          <div><IconButton label="Shuffle" active={player.shuffle} onClick={() => player.setShuffle(!player.shuffle)}><Shuffle size={14} /></IconButton><IconButton label="Previous" onClick={player.previous}><SkipBack size={17} fill="currentColor" /></IconButton><button className="music-mini-play" type="button" aria-label={player.isPlaying ? 'Pause' : 'Play'} onClick={() => void player.togglePlay()}>{player.isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button><IconButton label="Next" onClick={player.next}><SkipForward size={17} fill="currentColor" /></IconButton><IconButton label="Repeat" active={player.repeat} onClick={() => player.setRepeat(!player.repeat)}><Repeat2 size={14} /></IconButton></div>
          <div className="music-mini-progress"><span>{formatTime(player.currentTime)}</span><input type="range" min="0" max={player.duration || 1} step="0.1" value={Math.min(player.currentTime, player.duration || 1)} onChange={(event) => player.seek(Number(event.target.value))} aria-label="Seek" /><span>{formatTime(player.duration)}</span></div>
        </div>
        <div className="music-mini-volume">
          {player.volume ? <Volume2 size={15} /> : <VolumeX size={15} />}
          <input type="range" min="0" max="100" value={player.volume} onChange={(event) => player.setVolume(Number(event.target.value))} aria-label="Volume" />
          {current?.quality?.bitrateLabel ? <span>{current.quality.bitrateLabel}</span> : null}
          <IconButton label="Queue" onClick={() => setQueueOpen((open) => !open)}><ListMusic size={15} /></IconButton>
        </div>
        <div className="music-mini-fill" style={{ width: `${progress}%` }} />
      </footer>
    </div>
  );
}
