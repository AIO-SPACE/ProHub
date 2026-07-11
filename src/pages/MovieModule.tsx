import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Bookmark,
  Check,
  Clapperboard,
  Download,
  Film,
  Heart,
  History,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
  Star,
  Tv,
  Volume2,
  X,
} from 'lucide-react';
import { api, type MovieItem, type MoviePayload, type MovieProviderStatus, type MovieSearchPayload } from '@/lib/api';
import VideoPlayer from '@/features/video/VideoPlayer';
import './MovieModule.css';

type MediaSky = 'movie' | 'anime';
type MovieTabId = 'home' | 'trending' | 'series' | 'movie' | 'kids' | 'shorttv' | 'animation' | 'education' | 'game' | 'airing' | 'popular' | 'upcoming' | 'ova' | 'ona' | 'specials';
type MovieView = 'home' | 'library' | 'favorites' | 'history';

const MOVIE_TABS: Array<{ id: MovieTabId; label: string; query?: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'trending', label: 'Trending', query: 'trending' },
  { id: 'series', label: 'TV/Series', query: 'tv series' },
  { id: 'movie', label: 'Movie', query: 'movie' },
  { id: 'kids', label: 'Kids', query: 'children' },
  { id: 'shorttv', label: 'ShortTV', query: 'short film' },
  { id: 'animation', label: 'Animation', query: 'animation' },
  { id: 'education', label: 'Education', query: 'documentary education' },
  { id: 'game', label: 'Game', query: 'game movie' },
];

const ANIME_TABS: Array<{ id: MovieTabId; label: string; query?: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'airing', label: 'Airing', query: 'currently airing anime' },
  { id: 'trending', label: 'Trending', query: 'trending anime' },
  { id: 'popular', label: 'Popular', query: 'popular anime' },
  { id: 'upcoming', label: 'Upcoming', query: 'upcoming anime' },
  { id: 'movie', label: 'Movies', query: 'anime movie' },
  { id: 'ova', label: 'OVA', query: 'OVA' },
  { id: 'ona', label: 'ONA', query: 'ONA' },
  { id: 'specials', label: 'Specials', query: 'anime special' },
];

const MOVIE_CATEGORY_QUERIES = [
  { label: 'Hindi Movies', query: 'hindi movie' },
  { label: 'Hindi Series', query: 'hindi series' },
  { label: 'English Movies', query: 'english movie' },
  { label: 'English Series', query: 'english series' },
  { label: 'Tamil', query: 'tamil movie' },
  { label: 'Telugu', query: 'telugu movie' },
  { label: 'Malayalam', query: 'malayalam movie' },
  { label: 'Kannada', query: 'kannada movie' },
  { label: 'Punjabi', query: 'punjabi movie' },
  { label: 'Marathi', query: 'marathi movie' },
  { label: 'Bengali', query: 'bengali movie' },
  { label: 'Japanese', query: 'japanese movie' },
  { label: 'Korean Drama', query: 'korean drama' },
  { label: 'Chinese Drama', query: 'chinese drama' },
  { label: 'Animation', query: 'animation' },
  { label: 'Kids', query: 'kids movie' },
  { label: 'Action', query: 'action movie' },
  { label: 'Adventure', query: 'adventure movie' },
  { label: 'Comedy', query: 'comedy movie' },
  { label: 'Crime', query: 'crime movie' },
  { label: 'Drama', query: 'drama movie' },
  { label: 'Fantasy', query: 'fantasy movie' },
  { label: 'Horror', query: 'horror movie' },
  { label: 'Mystery', query: 'mystery movie' },
  { label: 'Romance', query: 'romance movie' },
  { label: 'Sci-Fi', query: 'sci-fi movie' },
  { label: 'Thriller', query: 'thriller movie' },
  { label: 'Documentary', query: 'documentary' },
  { label: 'Sports', query: 'sports movie' },
];

const ANIME_CATEGORY_QUERIES = [
  { label: 'Action', query: 'action anime' },
  { label: 'Adventure', query: 'adventure anime' },
  { label: 'Comedy', query: 'comedy anime' },
  { label: 'Fantasy', query: 'fantasy anime' },
  { label: 'Isekai', query: 'isekai anime' },
  { label: 'Romance', query: 'romance anime' },
  { label: 'Sci-Fi', query: 'sci-fi anime' },
  { label: 'Shounen', query: 'shounen anime' },
  { label: 'Seinen', query: 'seinen anime' },
  { label: 'Slice of Life', query: 'slice of life anime' },
  { label: 'Sports', query: 'sports anime' },
];

const uniqById = (items: MovieItem[]) => [...new Map(items.filter((item) => item?.id).map((item) => [item.id, item])).values()];
const itemKey = (item: MovieItem, index: number) => `${item.id}:${index}`;
const providerName = (id?: string) => id?.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) || 'Provider';
const skyNameForItem = (item?: MovieItem | null) => (item?.mediaKind === 'anime' ? 'Anime Sky' : 'Movie Sky');

function bestImage(item?: MovieItem | null) {
  return item?.backdrop || item?.poster || null;
}

function MovieArtwork({ item, className = '' }: { item?: MovieItem | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : bestImage(item);
  if (!src) {
    return (
      <div className={`movie-artwork-fallback ${className}`}>
        <Film aria-hidden="true" />
      </div>
    );
  }
  return <img className={className} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

function IconButton({ label, active = false, disabled = false, onClick, children }: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button className={`movie-icon-button ${active ? 'is-active' : ''}`} type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function EmptyState({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return (
    <div className="movie-empty">
      <Clapperboard size={24} aria-hidden="true" />
      <strong>{title}</strong>
      <span>{message}</span>
      {onRetry ? <button type="button" onClick={onRetry}><RefreshCw size={13} /> Retry</button> : null}
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="movie-loading" aria-label={`Loading ${label}`}>
      <div className="movie-skeleton movie-skeleton-hero" />
      <div className="movie-skeleton-row">
        <div className="movie-skeleton movie-skeleton-card" />
        <div className="movie-skeleton movie-skeleton-card" />
        <div className="movie-skeleton movie-skeleton-card" />
        <div className="movie-skeleton movie-skeleton-card" />
      </div>
    </div>
  );
}

function ProviderStrip({ providers = [], errors = [] }: { providers?: MovieProviderStatus[]; errors?: Array<{ provider: string; message: string }> }) {
  const visibleProviders = [...new Map(providers.map((provider) => [provider.id, provider])).values()];
  const providerIds = new Set(visibleProviders.map((provider) => provider.id));
  const visibleErrors = [...new Map(errors.filter((error) => !providerIds.has(error.provider)).map((error) => [error.provider, error])).values()];
  if (!visibleProviders.length && !visibleErrors.length) return null;
  return (
    <div className="movie-provider-strip">
      {visibleProviders.map((provider) => (
        <span className={provider.ok ? 'is-ok' : 'is-down'} key={provider.id}>
          <i />{provider.label || providerName(provider.id)}
        </span>
      ))}
      {visibleErrors.map((error) => (
        <span className="is-down" key={`${error.provider}:${error.message}`}>
          <i />{providerName(error.provider)} unavailable
        </span>
      ))}
    </div>
  );
}

function MovieCard({ item, rank, active, onOpen, onPlay }: {
  item: MovieItem;
  rank?: number;
  active?: boolean;
  onOpen: (item: MovieItem) => void;
  onPlay: (item: MovieItem) => void;
}) {
  return (
    <button className={`movie-card ${active ? 'is-active' : ''}`} type="button" onClick={() => onOpen(item)}>
      <span className="movie-card-poster">
        {rank ? <span className="movie-rank">{rank}</span> : null}
        <MovieArtwork item={item} className="movie-card-image" />
        <span className="movie-card-play" onClick={(event) => { event.stopPropagation(); onPlay(item); }}>
          {item.hasStream ? <Play size={16} fill="currentColor" /> : <Info size={15} />}
        </span>
      </span>
      <strong>{item.title}</strong>
      <small>{[item.year, item.runtime, item.type === 'series' ? 'Series' : item.quality?.resolution].filter(Boolean).join(' - ') || skyNameForItem(item)}</small>
    </button>
  );
}

function MovieRail({ title, items, ranked = false, activeId, onOpen, onPlay }: {
  title: string;
  items: MovieItem[];
  ranked?: boolean;
  activeId?: string | null;
  onOpen: (item: MovieItem) => void;
  onPlay: (item: MovieItem) => void;
}) {
  if (!items.length) return null;
  return (
    <section className="movie-rail-section">
      <div className="movie-section-heading">
        <h3>{title}</h3>
        <span>{items.length} items</span>
      </div>
      <div className={`movie-rail ${ranked ? 'is-ranked' : ''}`}>
        {items.map((item, index) => (
          <MovieCard key={itemKey(item, index)} item={item} rank={ranked ? index + 1 : undefined} active={activeId === item.id} onOpen={onOpen} onPlay={onPlay} />
        ))}
      </div>
    </section>
  );
}

export default function MovieModule({ sky = 'movie' }: { sky?: MediaSky }) {
  const isAnime = sky === 'anime';
  const skyLabel = isAnime ? 'Anime Sky' : 'Movie Sky';
  const tabs = isAnime ? ANIME_TABS : MOVIE_TABS;
  const categoryQueries = isAnime ? ANIME_CATEGORY_QUERIES : MOVIE_CATEGORY_QUERIES;
  const mediaApi = api[sky];
  const [home, setHome] = useState<MoviePayload | null>(null);
  const [results, setResults] = useState<MovieSearchPayload | null>(null);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<MovieTabId>('home');
  const [view, setView] = useState<MovieView>('home');
  const [selected, setSelected] = useState<MovieItem | null>(null);
  const [details, setDetails] = useState<MovieItem | null>(null);
  const [episodes, setEpisodes] = useState<MovieItem[]>([]);
  const [season, setSeason] = useState<number | null>(null);
  const [playerItem, setPlayerItem] = useState<MovieItem | null>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [miniPlayer, setMiniPlayer] = useState(false);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [watchLater, setWatchLater] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const allItems = useMemo(() => {
    const homeItems = (home?.sections || []).flatMap((section) => section.items);
    const resultItems = results?.items || [];
    const libraryItems = home ? [...home.library.movies, ...home.library.series, ...home.library.downloaded, ...(home.continueWatching || [])] : [];
    return uniqById([...homeItems, ...resultItems, ...libraryItems, ...(details ? [details] : [])]);
  }, [details, home, results]);

  const itemById = useMemo(() => new Map(allItems.map((item) => [item.id, item])), [allItems]);

  // Auto-categorization: derive language/genre/country sections from items
  const autoSections = useMemo(() => {
    if (!allItems.length) return [];
    const sections: Array<{ id: string; title: string; items: MovieItem[] }> = [];
    
    const byLanguage = new Map<string, MovieItem[]>();
    const byGenre = new Map<string, MovieItem[]>();
    const byCountry = new Map<string, MovieItem[]>();
    
    allItems.forEach((item) => {
      // Languages
      const languages = Array.isArray(item.language) 
        ? item.language 
        : item.language ? [item.language] : [];
      languages.forEach((lang) => {
        if (lang) {
          const key = String(lang).toLowerCase();
          if (!byLanguage.has(key)) byLanguage.set(key, []);
          byLanguage.get(key)!.push(item);
        }
      });
      
      // Genres
      (item.genres || []).forEach((genre) => {
        if (genre) {
          const key = String(genre).toLowerCase();
          if (!byGenre.has(key)) byGenre.set(key, []);
          byGenre.get(key)!.push(item);
        }
      });
      
      // Countries
      (item.countries || []).forEach((country) => {
        if (country) {
          const key = String(country).toLowerCase();
          if (!byCountry.has(key)) byCountry.set(key, []);
          byCountry.get(key)!.push(item);
        }
      });
    });
    
    // Language sections (only if >= 3 items)
    const languageLabels: Record<string, string> = {
      hindi: 'Hindi', english: 'English', japanese: 'Japanese', tamil: 'Tamil',
      telugu: 'Telugu', malayalam: 'Malayalam', kannada: 'Kannada', punjabi: 'Punjabi',
      marathi: 'Marathi', bengali: 'Bengali', chinese: 'Chinese', korean: 'Korean',
      spanish: 'Spanish', french: 'French', german: 'German',
    };
    
    byLanguage.forEach((items, key) => {
      if (items.length >= 3 && languageLabels[key]) {
        sections.push({
          id: `lang-${key}`,
          title: `${languageLabels[key]} ${isAnime ? 'Anime' : 'Movies'}`,
          items: uniqById(items).slice(0, 20),
        });
      }
    });
    
    // Genre sections
    const genreLabels: Record<string, string> = {
      action: 'Action', adventure: 'Adventure', animation: 'Animation', comedy: 'Comedy',
      crime: 'Crime', documentary: 'Documentary', drama: 'Drama', fantasy: 'Fantasy',
      family: 'Family', history: 'History', horror: 'Horror', kids: 'Kids',
      music: 'Music', mystery: 'Mystery', romance: 'Romance', 'sci-fi': 'Sci-Fi',
      sports: 'Sports', thriller: 'Thriller', war: 'War', western: 'Western',
      isekai: 'Isekai', shounen: 'Shounen', seinen: 'Seinen', 'slice of life': 'Slice of Life',
    };
    
    byGenre.forEach((items, key) => {
      if (items.length >= 3 && genreLabels[key]) {
        sections.push({
          id: `genre-${key}`,
          title: genreLabels[key],
          items: uniqById(items).slice(0, 20),
        });
      }
    });
    
    // Country sections
    const countryLabels: Record<string, string> = {
      india: 'India', japan: 'Japan', korea: 'Korea', 'south korea': 'Korea',
      china: 'China', usa: 'USA', 'united states': 'USA', uk: 'UK', 'united kingdom': 'UK',
    };
    
    byCountry.forEach((items, key) => {
      if (items.length >= 3 && countryLabels[key]) {
        sections.push({
          id: `country-${key}`,
          title: `From ${countryLabels[key]}`,
          items: uniqById(items).slice(0, 20),
        });
      }
    });
    
    return sections;
  }, [allItems, isAnime]);

  const loadHome = useCallback(async () => {
    setLoading(true);
    try {
      const next = await mediaApi.home();
      setHome(next);
      setFavorites(new Set(next.favorites.itemIds));
      setWatchLater(new Set(next.watchLater.itemIds));
      const first = next.continueWatching?.[0] || next.sections?.flatMap((section) => section.items)[0] || null;
      setSelected((current) => current || first);
      setDetails((current) => current || first);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : `${skyLabel} could not load.`);
    } finally {
      setLoading(false);
    }
  }, [mediaApi, skyLabel]);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 3400);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const activeSections = useMemo(() => {
    if (results?.items.length) {
      return [{ id: 'results', title: query ? `Results for "${query}"` : 'Results', layout: 'rail', items: results.items }];
    }
    return home?.sections || [];
  }, [home, query, results]);

  const heroItem = selected || home?.continueWatching?.[0] || activeSections.flatMap((section) => section.items)[0] || null;
  const topTen = useMemo(() => uniqById(activeSections.flatMap((section) => section.items)).slice(0, 10), [activeSections]);
  const movieItems = useMemo(() => uniqById(activeSections.flatMap((section) => section.items).filter((item) => item.type === 'movie')), [activeSections]);
  const seriesItems = useMemo(() => uniqById(activeSections.flatMap((section) => section.items).filter((item) => item.type === 'series')), [activeSections]);

  const openDetails = useCallback(async (item: MovieItem) => {
    setSelected(item);
    setDetails(item);
    setEpisodes([]);
    setSeason(null);
    setBusy(true);
    try {
      const response = await mediaApi.details(item.id);
      setDetails(response.item);
      if (response.item.type === 'series') {
        const firstSeason = response.item.seasons?.[0]?.number;
        if (firstSeason) {
          const episodeResponse = await mediaApi.episodes(response.item.id, firstSeason);
          setSeason(firstSeason);
          setEpisodes(episodeResponse.episodes);
        }
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Details could not be loaded.');
    } finally {
      setBusy(false);
    }
  }, [mediaApi]);

  const runSearch = useCallback(async (nextQuery: string) => {
    const cleanQuery = nextQuery.trim();
    if (!cleanQuery) {
      setResults(null);
      setActiveTab('home');
      return;
    }
    setBusy(true);
    try {
      const response = await mediaApi.search(cleanQuery);
      setResults(response);
      setView('home');
      const first = response.items[0] || null;
      setSelected(first);
      setDetails(first);
      setEpisodes([]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setBusy(false);
    }
  }, [mediaApi]);

  const selectTab = async (tab: MovieTabId) => {
    setActiveTab(tab);
    setView('home');
    const match = tabs.find((item) => item.id === tab);
    if (!match?.query) {
      setResults(null);
      return;
    }
    setQuery(match.query);
    await runSearch(match.query);
  };

  const selectSeason = async (seasonNumber: number) => {
    const series = details?.type === 'series' ? details : selected?.type === 'series' ? selected : null;
    if (!series) return;
    setBusy(true);
    try {
      const response = await mediaApi.episodes(series.id, seasonNumber);
      setSeason(seasonNumber);
      setEpisodes(response.episodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Episodes could not be loaded.');
    } finally {
      setBusy(false);
    }
  };

  const playMovie = async (item: MovieItem) => {
    if (!item.hasStream) {
      setError('No configured stream is available for this title.');
      return;
    }
    setPlayerItem(item);
    setPlayerOpen(true);
    setMiniPlayer(false);
    if (item.type === 'episode') {
      const episodeIndex = episodes.findIndex((episode) => episode.id === item.id);
      setCurrentEpisodeIndex(episodeIndex >= 0 ? episodeIndex : 0);
    } else {
      setCurrentEpisodeIndex(0);
    }
  };

  const toggleFavorite = async (item: MovieItem) => {
    const nextValue = !favorites.has(item.id);
    setFavorites((previous) => {
      const next = new Set(previous);
      if (nextValue) next.add(item.id); else next.delete(item.id);
      return next;
    });
    try {
      const response = await mediaApi.setFavorite(item.id, nextValue);
      setFavorites(new Set(response.itemIds));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Favorite could not be updated.');
    }
  };

  const toggleWatchLater = async (item: MovieItem) => {
    const nextValue = !watchLater.has(item.id);
    setWatchLater((previous) => {
      const next = new Set(previous);
      if (nextValue) next.add(item.id); else next.delete(item.id);
      return next;
    });
    try {
      const response = await mediaApi.setWatchLater(item.id, nextValue);
      setWatchLater(new Set(response.itemIds));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Watch later could not be updated.');
    }
  };

  const downloadMovie = async (item: MovieItem) => {
    if (!item.hasDownload) {
      setError('No configured download is available for this title.');
      return;
    }
    try {
      const download = await mediaApi.download(item.id);
      setNotice(`${download.filename} was added to Downloads`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download could not be started.');
    }
  };

  const closePlayer = () => {
    setPlayerOpen(false);
    setMiniPlayer(false);
  };

  const goToNextEpisode = useCallback(() => {
    if (!details || !episodes.length || currentEpisodeIndex >= episodes.length - 1) return;
    const nextIndex = currentEpisodeIndex + 1;
    setCurrentEpisodeIndex(nextIndex);
    setPlayerItem(episodes[nextIndex]);
    setDetails(episodes[nextIndex]);
    setSelected(episodes[nextIndex]);
  }, [details, episodes, currentEpisodeIndex]);

  const goToPreviousEpisode = useCallback(() => {
    if (!details || !episodes.length || currentEpisodeIndex <= 0) return;
    const prevIndex = currentEpisodeIndex - 1;
    setCurrentEpisodeIndex(prevIndex);
    setPlayerItem(episodes[prevIndex]);
    setDetails(episodes[prevIndex]);
    setSelected(episodes[prevIndex]);
  }, [details, episodes, currentEpisodeIndex]);

  const downloadedItems = home?.library.downloaded || [];
  const favoriteItems = [...favorites].map((id) => itemById.get(id)).filter(Boolean) as MovieItem[];
  const watchLaterItems = [...watchLater].map((id) => itemById.get(id)).filter(Boolean) as MovieItem[];
  const historyItems = (home?.history.recentlyWatched || []).map((id) => itemById.get(id)).filter(Boolean) as MovieItem[];
  const detailItem = details || selected;
  const heroStyle = { '--movie-hero-image': bestImage(heroItem) ? `url("${bestImage(heroItem)}")` : 'none' } as CSSProperties;

  return (
    <div className={`movie-sky ${isAnime ? 'is-anime' : ''}`}>
      <div className="movie-top-tabs">
        <div className="movie-brand"><Clapperboard size={18} /><strong>{skyLabel}</strong></div>
        <div className="movie-tab-scroll" role="tablist">
          {tabs.map((tab) => (
            <button type="button" role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? 'is-active' : ''} key={tab.id} onClick={() => void selectTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>
        <div className="movie-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void runSearch(query)} placeholder={isAnime ? 'Search anime' : 'Search movies or series'} aria-label={isAnime ? 'Search anime' : 'Search movies or series'} />
          {query ? <IconButton label="Clear search" onClick={() => { setQuery(''); setResults(null); setActiveTab('home'); }}><X size={14} /></IconButton> : null}
          <IconButton label="Search" disabled={busy} onClick={() => void runSearch(query)}>{busy ? <LoaderCircle className="animate-spin" size={14} /> : <Search size={14} />}</IconButton>
        </div>
      </div>

      {error ? <div className="movie-toast is-error"><AlertTriangle size={15} /><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss"><X size={14} /></button></div> : null}
      {notice ? <div className="movie-toast is-ok"><Check size={15} /><span>{notice}</span></div> : null}

      <div className="movie-workspace">
        <main className="movie-main scrollbar-thin">
          {loading ? <LoadingState label={skyLabel} /> : (
            <>
              <ProviderStrip providers={home?.providers} errors={[...(home?.providerErrors || []), ...(results?.providerErrors || [])]} />

              <section className="movie-hero" style={heroStyle}>
                <div className="movie-hero-copy">
                  <span className="movie-type-chip">{heroItem?.format || (heroItem?.type === 'series' ? 'Series' : 'Movie')}</span>
                  <h2>{heroItem?.title || skyLabel}</h2>
                  <p>{heroItem?.description || home?.message || 'No provider sections are available right now.'}</p>
                  <div className="movie-meta-line">
                    {[heroItem?.year, heroItem?.runtime, heroItem?.rating ? `${heroItem.rating} ${heroItem.ratingSource || ''}`.trim() : null, heroItem?.license, heroItem ? skyLabel : null].filter(Boolean).map((meta) => <span key={String(meta)}>{meta}</span>)}
                  </div>
                  <div className="movie-hero-actions">
                    <button type="button" className="movie-primary-action" disabled={!heroItem?.hasStream} onClick={() => heroItem && void playMovie(heroItem)}>
                      <Play size={17} fill="currentColor" /> Play
                    </button>
                    <button type="button" onClick={() => heroItem && void openDetails(heroItem)} disabled={!heroItem}>
                      <Info size={16} /> Details
                    </button>
                    <button type="button" className={heroItem && favorites.has(heroItem.id) ? 'is-active' : ''} onClick={() => heroItem && void toggleFavorite(heroItem)} disabled={!heroItem}>
                      <Heart size={16} fill={heroItem && favorites.has(heroItem.id) ? 'currentColor' : 'none'} /> Favorite
                    </button>
                  </div>
                </div>
                <div className="movie-hero-poster">
                  <MovieArtwork item={heroItem} className="movie-hero-image" />
                </div>
              </section>

              <div className="movie-category-row">
                {categoryQueries.map((category) => (
                  <button type="button" key={category.label} onClick={() => { setQuery(category.query); void runSearch(category.query); }}>
                    {category.label}
                  </button>
                ))}
              </div>

              <div className="movie-view-tabs">
                {[
                  { id: 'home' as const, label: 'Home', icon: Film },
                  { id: 'library' as const, label: 'Downloads', icon: Download },
                  { id: 'favorites' as const, label: 'Favorites', icon: Heart },
                  { id: 'history' as const, label: 'Me', icon: History },
                ].map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button type="button" className={view === tab.id ? 'is-active' : ''} key={tab.id} onClick={() => setView(tab.id)}>
                      <Icon size={14} />{tab.label}
                    </button>
                  );
                })}
              </div>

              {view === 'home' ? (
                <>
                  <MovieRail title="Top 10" items={topTen} ranked activeId={selected?.id} onOpen={(item) => void openDetails(item)} onPlay={(item) => void playMovie(item)} />
                  <MovieRail title={isAnime ? 'Anime Movies' : 'Movies'} items={movieItems.slice(0, 18)} activeId={selected?.id} onOpen={(item) => void openDetails(item)} onPlay={(item) => void playMovie(item)} />
                  <MovieRail title={isAnime ? 'Anime Series' : 'TV/Series'} items={seriesItems.slice(0, 18)} activeId={selected?.id} onOpen={(item) => void openDetails(item)} onPlay={(item) => void playMovie(item)} />
                  {autoSections.map((section) => (
                    <MovieRail key={section.id} title={section.title} items={section.items} activeId={selected?.id} onOpen={(item) => void openDetails(item)} onPlay={(item) => void playMovie(item)} />
                  ))}
                  {activeSections.map((section) => (
                    <MovieRail key={section.id || section.title} title={section.title} items={section.items} activeId={selected?.id} onOpen={(item) => void openDetails(item)} onPlay={(item) => void playMovie(item)} />
                  ))}
                  {!activeSections.length && !autoSections.length ? <EmptyState title="Nothing available" message={home?.message || 'No provider sections are available right now.'} onRetry={() => void loadHome()} /> : null}
                </>
              ) : null}

              {view === 'library' ? (
                downloadedItems.length
                  ? <MovieRail title="Downloaded" items={downloadedItems} activeId={selected?.id} onOpen={(item) => void openDetails(item)} onPlay={(item) => void playMovie(item)} />
                  : <EmptyState title="No downloads yet" message={`Playable provider videos added from ${skyLabel} will appear here after Downloads completes them.`} />
              ) : null}

              {view === 'favorites' ? (
                favoriteItems.length || watchLaterItems.length ? (
                  <>
                    <MovieRail title="Favorites" items={favoriteItems} activeId={selected?.id} onOpen={(item) => void openDetails(item)} onPlay={(item) => void playMovie(item)} />
                    <MovieRail title="Watch Later" items={watchLaterItems} activeId={selected?.id} onOpen={(item) => void openDetails(item)} onPlay={(item) => void playMovie(item)} />
                  </>
                ) : <EmptyState title="No saved titles" message="Saved movies and series from the live catalog will appear here." />
              ) : null}

              {view === 'history' ? (
                historyItems.length || home?.continueWatching?.length ? (
                  <>
                    <MovieRail title="Continue Watching" items={home?.continueWatching || []} activeId={selected?.id} onOpen={(item) => void openDetails(item)} onPlay={(item) => void playMovie(item)} />
                    <MovieRail title="History" items={historyItems} activeId={selected?.id} onOpen={(item) => void openDetails(item)} onPlay={(item) => void playMovie(item)} />
                  </>
                ) : <EmptyState title="No watch history" message="Your real playback history will appear after you watch a playable title." />
              ) : null}
            </>
          )}
        </main>

        <aside className="movie-detail-panel scrollbar-thin">
          {detailItem ? (
            <motion.div key={detailItem.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="movie-detail-inner">
              <div className="movie-detail-art">
                <MovieArtwork item={detailItem} className="movie-detail-image" />
                {busy ? <span className="movie-detail-busy"><LoaderCircle className="animate-spin" size={16} /></span> : null}
              </div>
              <div className="movie-detail-copy">
                <span className="movie-provider">{skyLabel}</span>
                <h3>{detailItem.title}</h3>
                <p>{detailItem.description || 'No description was returned by this provider.'}</p>
                <div className="movie-meta-grid">
                  <span><Star size={13} />{detailItem.rating ? `${detailItem.rating} ${detailItem.ratingSource || ''}`.trim() : 'Unrated'}</span>
                  <span><Volume2 size={13} />{detailItem.language || 'Original'}</span>
                  <span><Gauge size={13} />{detailItem.quality?.resolution || detailItem.runtime || 'Source'}</span>
                  <span><Tv size={13} />{detailItem.type === 'series' ? detailItem.status || 'Series' : detailItem.license || 'Movie'}</span>
                </div>
                <div className="movie-detail-actions">
                  <button type="button" className="movie-primary-action" disabled={!detailItem.hasStream} onClick={() => void playMovie(detailItem)}><Play size={15} fill="currentColor" /> Play</button>
                  <IconButton label="Download" disabled={!detailItem.hasDownload} onClick={() => void downloadMovie(detailItem)}><Download size={15} /></IconButton>
                  <IconButton label="Favorite" active={favorites.has(detailItem.id)} onClick={() => void toggleFavorite(detailItem)}><Heart size={15} fill={favorites.has(detailItem.id) ? 'currentColor' : 'none'} /></IconButton>
                  <IconButton label="Watch later" active={watchLater.has(detailItem.id)} onClick={() => void toggleWatchLater(detailItem)}><Bookmark size={15} fill={watchLater.has(detailItem.id) ? 'currentColor' : 'none'} /></IconButton>
                </div>
                {detailItem.genres?.length ? <div className="movie-genre-list">{detailItem.genres.slice(0, 7).map((genre) => <span key={genre}>{genre}</span>)}</div> : null}
              </div>

              {detailItem.cast?.length ? (
                <section className="movie-cast-section">
                  <div className="movie-section-heading"><h3>Cast</h3><span>{detailItem.cast.length}</span></div>
                  <div className="movie-cast-list">
                    {detailItem.cast.slice(0, 10).map((credit) => (
                      <div className="movie-cast-row" key={`${credit.name}:${credit.character || credit.role || credit.job}`}>
                        {credit.image ? <img src={credit.image} alt="" loading="lazy" /> : <span><Info size={14} /></span>}
                        <strong>{credit.name}</strong>
                        <small>{credit.character || credit.role || credit.job || 'Cast'}</small>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {detailItem.type === 'series' && detailItem.seasons?.length ? (
                <section className="movie-episodes-section">
                  <div className="movie-section-heading"><h3>Episodes</h3><span>{episodes.length}</span></div>
                  <div className="movie-season-tabs">
                    {detailItem.seasons.map((item) => (
                      <button type="button" className={season === item.number ? 'is-active' : ''} key={item.id} onClick={() => void selectSeason(item.number)}>
                        S{item.number}
                      </button>
                    ))}
                  </div>
                  <div className="movie-episode-list">
                    {episodes.map((episode) => (
                      <button type="button" key={episode.id} onClick={() => { setDetails(episode); setSelected(episode); }}>
                        <span>{episode.episodeNumber ? `${episode.seasonNumber}x${String(episode.episodeNumber).padStart(2, '0')}` : 'EP'}</span>
                        <strong>{episode.title}</strong>
                        <small>{episode.runtime || 'Metadata only'}</small>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </motion.div>
          ) : <EmptyState title="No title selected" message={`${skyLabel} will show real provider details here.`} />}
        </aside>
      </div>

      {/* Video Player */}
      {playerOpen && playerItem && (
        <VideoPlayer
          item={playerItem}
          mediaApi={mediaApi}
          onClose={closePlayer}
          onNextEpisode={goToNextEpisode}
          onPreviousEpisode={goToPreviousEpisode}
          hasNextEpisode={!!(episodes.length && currentEpisodeIndex < episodes.length - 1)}
          hasPreviousEpisode={!!(episodes.length && currentEpisodeIndex > 0)}
          miniPlayer={miniPlayer}
          onToggleMini={() => setMiniPlayer((m) => !m)}
        />
      )}
    </div>
  );
}
