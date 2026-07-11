import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type MusicPayload, type MusicTrack } from '@/lib/api';

interface UseMusicPlayerOptions {
  initialPlayer?: MusicPayload['player'];
  onError: (message: string) => void;
}

const playbackErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  if (message.includes("user didn't interact") || (error instanceof DOMException && error.name === 'NotAllowedError')) {
    return 'Press Play to start audio.';
  }
  return message || 'Playback could not start';
};

export function useMusicPlayer({ initialPlayer, onError }: UseMusicPlayerOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<MusicTrack[]>([]);
  const repeatRef = useRef(false);
  const shuffleRef = useRef(false);
  const nextRef = useRef<() => void>(() => {});
  const initialVolumeRef = useRef(initialPlayer?.volume ?? 75);
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(initialPlayer?.currentTrack || null);
  const [queue, setQueue] = useState<MusicTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(initialPlayer?.volume ?? 75);
  const [shuffle, setShuffle] = useState(initialPlayer?.shuffle ?? false);
  const [repeat, setRepeat] = useState(initialPlayer?.repeat ?? false);
  const [buffering, setBuffering] = useState(false);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    repeatRef.current = repeat;
    void api.music.updatePlayer({ repeat }).catch(() => {});
  }, [repeat]);

  useEffect(() => {
    shuffleRef.current = shuffle;
    void api.music.updatePlayer({ shuffle }).catch(() => {});
  }, [shuffle]);

  const playTrack = useCallback(async (track: MusicTrack, sourceQueue?: MusicTrack[]) => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextQueue = sourceQueue?.length ? sourceQueue : queueRef.current.length ? queueRef.current : [track];
    setQueue(nextQueue);
    setCurrentTrack(track);
    setBuffering(true);
    audio.src = api.music.streamUrl(track.id);
    audio.currentTime = 0;
    try {
      await audio.play();
      setIsPlaying(true);
      onError('');
      await api.music.updatePlayer({ action: 'play', currentTrackId: track.id, queue: nextQueue.map((item) => item.id) });
    } catch (error) {
      setIsPlaying(false);
      onError(playbackErrorMessage(error));
    } finally {
      setBuffering(false);
    }
  }, [onError]);

  const next = useCallback(() => {
    const items = queueRef.current;
    if (!items.length || !currentTrack) return;
    const currentIndex = Math.max(0, items.findIndex((item) => item.id === currentTrack.id));
    const nextIndex = shuffleRef.current
      ? Math.floor(Math.random() * items.length)
      : (currentIndex + 1) % items.length;
    void playTrack(items[nextIndex], items);
  }, [currentTrack, playTrack]);

  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 5) {
      audio.currentTime = 0;
      return;
    }
    const items = queueRef.current;
    if (!items.length || !currentTrack) return;
    const currentIndex = Math.max(0, items.findIndex((item) => item.id === currentTrack.id));
    const previousIndex = (currentIndex - 1 + items.length) % items.length;
    void playTrack(items[previousIndex], items);
  }, [currentTrack, playTrack]);

  useEffect(() => {
    nextRef.current = next;
  }, [next]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = initialVolumeRef.current / 100;
    audioRef.current = audio;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDuration = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlaying = () => { setIsPlaying(true); setBuffering(false); };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setBuffering(true);
    const onErrorEvent = () => {
      setBuffering(false);
      setIsPlaying(false);
      onError('The provider stream could not be played. Try another track.');
    };
    const onEnded = () => {
      if (repeatRef.current) {
        audio.currentTime = 0;
        void audio.play();
      } else {
        nextRef.current();
      }
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('error', onErrorEvent);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
    };
  }, [onError]);

  useEffect(() => {
    if (!currentTrack || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      artwork: currentTrack.artwork ? [{ src: currentTrack.artwork, sizes: '512x512' }] : [],
    });
    navigator.mediaSession.setActionHandler('play', () => { void audioRef.current?.play(); });
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler('nexttrack', next);
    navigator.mediaSession.setActionHandler('previoustrack', previous);
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (audioRef.current && details.seekTime != null) audioRef.current.currentTime = details.seekTime;
    });
    return () => {
      for (const action of ['play', 'pause', 'nexttrack', 'previoustrack', 'seekto'] as MediaSessionAction[]) {
        navigator.mediaSession.setActionHandler(action, null);
      }
    };
  }, [currentTrack, next, previous]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (audio.src && !audio.paused) {
      audio.pause();
      await api.music.updatePlayer({ action: 'pause' }).catch(() => {});
      return;
    }
    if (!audio.src) audio.src = api.music.streamUrl(currentTrack.id);
    try {
      await audio.play();
      onError('');
      await api.music.updatePlayer({ action: 'play', currentTrackId: currentTrack.id, queue: queueRef.current.map((item) => item.id) });
    } catch (error) {
      onError(playbackErrorMessage(error));
    }
  }, [currentTrack, onError]);

  const seek = useCallback((nextTime: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(nextTime, audio.duration || nextTime));
    setCurrentTime(audio.currentTime);
  }, []);

  const setVolume = useCallback((nextVolume: number) => {
    const value = Math.max(0, Math.min(100, nextVolume));
    setVolumeState(value);
    if (audioRef.current) audioRef.current.volume = value / 100;
    void api.music.updatePlayer({ volume: value }).catch(() => {});
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setQueue((items) => items.filter((item) => item.id !== id));
  }, []);

  const clearQueue = useCallback(() => setQueue(currentTrack ? [currentTrack] : []), [currentTrack]);

  return {
    currentTrack,
    setCurrentTrack,
    queue,
    setQueue,
    isPlaying,
    buffering,
    currentTime,
    duration,
    volume,
    shuffle,
    setShuffle,
    repeat,
    setRepeat,
    playTrack,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    removeFromQueue,
    clearQueue,
  };
}
