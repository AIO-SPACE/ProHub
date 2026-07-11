import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Gauge,
  Maximize2,
  Minimize2,
  Monitor,
  MonitorUp,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  Settings2,
  SkipBack,
  SkipForward,
  Subtitles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { api, type MovieItem } from '@/lib/api';

type MediaApi = typeof api.movie;
type AspectRatioMode = 'fit' | 'fill' | 'stretch' | 'zoom';

export interface VideoPlayerProps {
  item: MovieItem;
  mediaApi: MediaApi;
  onClose: () => void;
  onNextEpisode?: () => void;
  onPreviousEpisode?: () => void;
  hasNextEpisode?: boolean;
  hasPreviousEpisode?: boolean;
  miniPlayer?: boolean;
  onToggleMini?: () => void;
}

interface SubtitleTrack {
  id: string;
  label: string;
  language?: string | null;
  url?: string;
}

interface PlaybackStats {
  resolution?: string;
  buffered?: number;
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs) return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function aspectStyle(mode: AspectRatioMode): CSSProperties {
  if (mode === 'fill') return { objectFit: 'cover' };
  if (mode === 'stretch') return { objectFit: 'fill' };
  if (mode === 'zoom') return { objectFit: 'cover', transform: 'scale(1.16)' };
  return { objectFit: 'contain' };
}

export default function VideoPlayer({
  item,
  mediaApi,
  onClose,
  onNextEpisode,
  onPreviousEpisode,
  hasNextEpisode = false,
  hasPreviousEpisode = false,
  miniPlayer = false,
  onToggleMini,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHistoryRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatioMode>('fit');
  const [brightness, setBrightness] = useState(100);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PlaybackStats>({});
  const [resumePosition, setResumePosition] = useState(0);
  const [showResumePrompt, setShowResumePrompt] = useState(false);

  const sourceUrl = useMemo(() => mediaApi.streamUrl(item.id), [item.id, mediaApi]);
  const progress = duration ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const selectedSubtitle = subtitles.find((subtitle) => subtitle.id === selectedSubtitleId) || null;
  const metaLabel = item.quality?.resolution || item.runtime || item.format || (item.type === 'episode' ? 'Episode' : 'Stream');

  const saveProgress = useCallback((position: number, totalDuration: number) => {
    const percent = totalDuration ? (position / totalDuration) * 100 : 0;
    mediaApi.updateHistory({
      id: item.id,
      episodeId: item.type === 'episode' ? item.id : null,
      progress: percent,
      positionSeconds: position,
      durationSeconds: totalDuration,
    }).catch(() => {});
  }, [item.id, item.type, mediaApi]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => setError('Playback could not start.'));
    } else {
      video.pause();
    }
  }, []);

  const seekBy = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.max(0, Math.min(video.duration || duration || 0, video.currentTime + seconds));
    video.currentTime = next;
    setCurrentTime(next);
  }, [duration]);

  const seekToPercent = useCallback((value: number) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const next = (Math.max(0, Math.min(100, value)) / 100) * duration;
    video.currentTime = next;
    setCurrentTime(next);
  }, [duration]);

  const toggleMute = useCallback(() => {
    setIsMuted((muted) => !muted);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;
    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      setIsFullscreen((fullscreen) => !fullscreen);
    }
  }, []);

  const togglePictureInPicture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      setError('Picture-in-picture is not available for this stream.');
    }
  }, []);

  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    setShowControls(true);
    if (isPlaying && !showSettings) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [isPlaying, showSettings]);

  useEffect(() => {
    setError(null);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setIsBuffering(false);
    lastHistoryRef.current = 0;
    const resume = item.resume;
    if (resume && resume.positionSeconds > 30 && resume.progress < 95) {
      setResumePosition(resume.positionSeconds);
      setShowResumePrompt(true);
    } else {
      setResumePosition(0);
      setShowResumePrompt(false);
    }
  }, [item.id, item.resume]);

  useEffect(() => {
    let cancelled = false;
    setSubtitles([]);
    setSelectedSubtitleId('');
    mediaApi.subtitles(item.id)
      .then((response) => {
        if (cancelled) return;
        const next = response.subtitles || [];
        setSubtitles(next);
        setSelectedSubtitleId(next[0]?.id || '');
      })
      .catch(() => {
        if (!cancelled) setSubtitles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, mediaApi]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = isMuted ? 0 : volume;
  }, [isMuted, volume]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const applyTrackMode = () => {
      for (let index = 0; index < video.textTracks.length; index += 1) {
        const track = video.textTracks[index];
        track.mode = selectedSubtitle && track.label === selectedSubtitle.label ? 'showing' : 'disabled';
      }
    };
    const timeout = window.setTimeout(applyTrackMode, 0);
    return () => window.clearTimeout(timeout);
  }, [selectedSubtitle]);

  useEffect(() => {
    const handleFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const tagName = event.target instanceof HTMLElement ? event.target.tagName : '';
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tagName)) return;
      if (event.key === ' ' || event.key.toLowerCase() === 'k') {
        event.preventDefault();
        togglePlay();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        seekBy(event.shiftKey ? 30 : 10);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        seekBy(event.shiftKey ? -30 : -10);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setVolume((value) => Math.min(1, value + 0.1));
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setVolume((value) => Math.max(0, value - 0.1));
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        void toggleFullscreen();
      } else if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        toggleMute();
      } else if (event.key.toLowerCase() === 'n' && hasNextEpisode && onNextEpisode) {
        event.preventDefault();
        onNextEpisode();
      } else if (event.key.toLowerCase() === 'p' && hasPreviousEpisode && onPreviousEpisode) {
        event.preventDefault();
        onPreviousEpisode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasNextEpisode, hasPreviousEpisode, onNextEpisode, onPreviousEpisode, seekBy, toggleFullscreen, toggleMute, togglePlay]);

  useEffect(() => () => {
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
  }, []);

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextDuration = Number.isFinite(video.duration) ? video.duration : 0;
    setDuration(nextDuration);
    if (resumePosition > 0 && !showResumePrompt) {
      video.currentTime = resumePosition;
      setCurrentTime(resumePosition);
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextDuration = Number.isFinite(video.duration) ? video.duration : 0;
    setCurrentTime(video.currentTime);
    setDuration(nextDuration);
    if (video.videoWidth && video.videoHeight) {
      setStats((previous) => ({ ...previous, resolution: `${video.videoWidth}x${video.videoHeight}` }));
    }
    const bufferedEnd = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
    setStats((previous) => ({ ...previous, buffered: bufferedEnd }));
    const now = Date.now();
    if (now - lastHistoryRef.current > 5000) {
      lastHistoryRef.current = now;
      saveProgress(video.currentTime, nextDuration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    saveProgress(duration, duration);
    if (hasNextEpisode && onNextEpisode) onNextEpisode();
  };

  const handleResume = (resume: boolean) => {
    const video = videoRef.current;
    setShowResumePrompt(false);
    if (!video) return;
    const startAt = resume ? resumePosition : 0;
    video.currentTime = startAt;
    setCurrentTime(startAt);
    video.play().catch(() => setError('Playback could not start.'));
  };

  const videoElement = (
    <video
      ref={videoRef}
      src={sourceUrl}
      poster={item.backdrop || item.poster || undefined}
      className="w-full h-full bg-black"
      style={aspectStyle(aspectRatio)}
      playsInline
      muted={isMuted}
      onLoadedMetadata={handleLoadedMetadata}
      onTimeUpdate={handleTimeUpdate}
      onWaiting={() => setIsBuffering(true)}
      onCanPlay={() => setIsBuffering(false)}
      onPlaying={() => {
        setIsPlaying(true);
        setIsBuffering(false);
      }}
      onPause={() => setIsPlaying(false)}
      onEnded={handleEnded}
      onError={() => {
        setError('Playback error occurred. Please try again.');
        setIsPlaying(false);
        setIsBuffering(false);
      }}
      onClick={togglePlay}
    >
      {subtitles.filter((subtitle) => subtitle.url).map((subtitle) => (
        <track
          key={subtitle.id}
          kind="subtitles"
          src={subtitle.url}
          srcLang={subtitle.language || undefined}
          label={subtitle.label}
          default={subtitle.id === selectedSubtitleId}
        />
      ))}
    </video>
  );

  if (miniPlayer) {
    return (
      <div className="fixed z-[300] bottom-5 right-5 w-[380px] max-w-[calc(100vw-40px)] overflow-hidden rounded-lg border border-white/10 bg-[#050607] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/5 bg-[#101113] px-3 py-2">
          <div className="min-w-0">
            <strong className="block truncate text-xs text-white">{item.title}</strong>
            <span className="text-[10px] text-[#8c8e97]">{metaLabel}</span>
          </div>
          <div className="flex gap-1">
            <button type="button" aria-label="Expand player" onClick={onToggleMini} className="p-1 text-[#a1a3aa] hover:text-white">
              <ChevronUp size={14} />
            </button>
            <button type="button" aria-label="Close player" onClick={onClose} className="p-1 text-[#a1a3aa] hover:text-white">
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="aspect-video bg-black">{videoElement}</div>
        <div className="flex items-center gap-2 bg-[#101113] px-3 py-2">
          <button type="button" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={togglePlay} className="text-white">
            {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
          </button>
          <input aria-label="Seek" type="range" min="0" max="100" step="0.1" value={progress} onChange={(event) => seekToPercent(Number(event.target.value))} className="h-1 flex-1 accent-[#f43f5e]" />
          <button type="button" aria-label={isMuted ? 'Unmute' : 'Mute'} onClick={toggleMute} className="text-[#a1a3aa]">
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`fixed z-[220] bg-black ${isFullscreen ? 'inset-0' : 'inset-[72px_78px_42px] overflow-hidden rounded-lg border border-white/10'}`}
      onMouseMove={resetControlsTimeout}
      onClick={resetControlsTimeout}
    >
      <div className="relative flex h-full flex-col bg-black">
        <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
          {videoElement}
          <div className="pointer-events-none absolute inset-0" style={{ backgroundColor: `rgba(0,0,0,${Math.max(0, 100 - brightness) / 100})` }} />

          {isBuffering ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            </div>
          ) : null}

          {showResumePrompt ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
              <div className="max-w-sm rounded-lg bg-[#1a1b20] p-5 text-center">
                <h3 className="mb-2 font-semibold text-white">Resume Playback?</h3>
                <p className="mb-4 text-sm text-[#a1a3aa]">Continue from {formatTime(resumePosition)}?</p>
                <div className="flex justify-center gap-3">
                  <button type="button" onClick={() => handleResume(false)} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">Start Over</button>
                  <button type="button" onClick={() => handleResume(true)} className="rounded-lg bg-[#f43f5e] px-4 py-2 text-sm text-white hover:bg-[#fb5670]">Resume</button>
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70">
              <div className="text-center">
                <p className="mb-3 text-red-400">{error}</p>
                <button type="button" onClick={() => { setError(null); videoRef.current?.load(); }} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">Retry</button>
              </div>
            </div>
          ) : null}

          {!isPlaying && !showResumePrompt && !error ? (
            <button type="button" aria-label="Play" onClick={togglePlay} className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                <Play size={32} fill="white" className="ml-1 text-white" />
              </span>
            </button>
          ) : null}

          <div className={`absolute left-0 right-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <strong className="block truncate text-sm text-white">{item.title}</strong>
                <span className="text-xs text-[#a1a3aa]">{metaLabel}</span>
              </div>
              <div className="flex items-center gap-2">
                {onToggleMini ? (
                  <button type="button" aria-label="Minimize player" onClick={onToggleMini} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white">
                    <ChevronDown size={16} />
                  </button>
                ) : null}
                <button type="button" aria-label="Close player" onClick={onClose} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white">
                  <X size={16} />
                </button>
              </div>
            </div>
          </div>

          {showStats ? (
            <div className="absolute right-4 top-16 space-y-1 rounded-lg bg-black/80 p-3 text-xs text-[#a1a3aa]">
              <div>Resolution: {stats.resolution || 'N/A'}</div>
              <div>Buffered: {formatTime(stats.buffered || 0)}</div>
              <div>Playback: {playbackRate}x</div>
            </div>
          ) : null}
        </div>

        <div className={`border-t border-white/5 bg-[#101113] transition-all duration-300 ${showControls ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
          <div className="px-4 pt-2">
            <input aria-label="Seek" type="range" min="0" max="100" step="0.1" value={progress} onChange={(event) => seekToPercent(Number(event.target.value))} className="h-1 w-full accent-[#f43f5e]" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Previous episode" disabled={!hasPreviousEpisode} onClick={onPreviousEpisode} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35">
                <SkipBack size={18} />
              </button>
              <button type="button" aria-label="Back 10 seconds" onClick={() => seekBy(-10)} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white">
                <RotateCcw size={17} />
              </button>
              <button type="button" aria-label={isPlaying ? 'Pause' : 'Play'} onClick={togglePlay} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black hover:bg-[#f1f1f1]">
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
              </button>
              <button type="button" aria-label="Forward 10 seconds" onClick={() => seekBy(10)} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white">
                <SkipForward size={18} />
              </button>
              <button type="button" aria-label="Next episode" disabled={!hasNextEpisode} onClick={onNextEpisode} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35">
                <SkipForward size={18} />
              </button>
              <span className="min-w-[96px] text-xs tabular-nums text-[#a1a3aa]">{formatTime(currentTime)} / {formatTime(duration)}</span>
            </div>

            <div className="flex items-center gap-2">
              <button type="button" aria-label={isMuted ? 'Unmute' : 'Mute'} onClick={toggleMute} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white">
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={isMuted ? 0 : volume} onChange={(event) => { setVolume(Number(event.target.value)); setIsMuted(false); }} className="h-1 w-20 accent-[#f43f5e]" />
              <button type="button" aria-label="Player settings" onClick={() => setShowSettings((visible) => !visible)} className={`rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white ${showSettings ? 'bg-white/10 text-white' : ''}`}>
                <Settings2 size={18} />
              </button>
              <button type="button" aria-label="Playback stats" onClick={() => setShowStats((visible) => !visible)} className={`rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white ${showStats ? 'bg-white/10 text-white' : ''}`}>
                <Gauge size={18} />
              </button>
              <button type="button" aria-label="Picture in picture" onClick={() => void togglePictureInPicture()} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white">
                <PictureInPicture2 size={18} />
              </button>
              <button type="button" aria-label="Fullscreen" onClick={() => void toggleFullscreen()} className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white">
                {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
            </div>
          </div>

          {showSettings ? (
            <div className="grid gap-3 border-t border-white/5 px-4 py-3 text-xs text-[#a1a3aa] sm:grid-cols-4">
              <label className="flex flex-col gap-1">
                <span>Speed</span>
                <select value={playbackRate} onChange={(event) => setPlaybackRate(Number(event.target.value))} className="rounded-md border border-white/10 bg-[#18191d] px-2 py-1 text-white">
                  {PLAYBACK_RATES.map((rate) => <option key={rate} value={rate}>{rate}x</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span><Subtitles size={12} className="inline" /> Captions</span>
                <select value={selectedSubtitleId} onChange={(event) => setSelectedSubtitleId(event.target.value)} className="rounded-md border border-white/10 bg-[#18191d] px-2 py-1 text-white">
                  <option value="">Off</option>
                  {subtitles.map((subtitle) => <option key={subtitle.id} value={subtitle.id}>{subtitle.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span><Monitor size={12} className="inline" /> Frame</span>
                <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as AspectRatioMode)} className="rounded-md border border-white/10 bg-[#18191d] px-2 py-1 text-white">
                  <option value="fit">Fit</option>
                  <option value="fill">Fill</option>
                  <option value="stretch">Stretch</option>
                  <option value="zoom">Zoom</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span><MonitorUp size={12} className="inline" /> Brightness</span>
                <input type="range" min="40" max="100" value={brightness} onChange={(event) => setBrightness(Number(event.target.value))} className="h-8 accent-[#f43f5e]" />
              </label>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
