import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Link,
  Plus,
  Play,
  Pause,
  Trash2,
  FolderOpen,
  RotateCcw,
  Gauge,
  FileText,
  FileArchive,
  Film,
  Music,
  Image,
  Download,
  Clock,
  AlertTriangle,
  Server,
  RefreshCw,
  Info,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { api, type DownloadHealth, type DownloadItem, type DownloadsPayload } from '@/lib/api';

const fileIcons: Record<string, LucideIcon> = {
  iso: FileArchive,
  pkg: FileArchive,
  exe: FileText,
  video: Film,
  archive: FileArchive,
  image: Image,
  audio: Music,
  torrent: FileArchive,
  file: FileText,
};

const statusColors: Record<string, string> = {
  downloading: 'bg-ph-indigo',
  queued: 'bg-ph-cloud',
  paused: 'bg-ph-warning',
  completed: 'bg-ph-success',
  failed: 'bg-ph-error',
  cancelled: 'bg-ph-error',
};

const statusBadges: Record<string, string> = {
  downloading: 'bg-ph-indigo/10 text-ph-indigo',
  queued: 'bg-ph-cloud/10 text-ph-cloud',
  paused: 'bg-ph-warning/10 text-ph-warning',
  completed: 'bg-ph-success/10 text-ph-success',
  failed: 'bg-ph-error/10 text-ph-error',
  cancelled: 'bg-ph-error/10 text-ph-error',
};

const parseSpeed = (value: string) => {
  const match = value.match(/([\d.]+)\s*(B|KB|MB|GB|TB)\/s/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = units.indexOf(match[2].toUpperCase());
  return index <= 0 ? amount / 1024 / 1024 : amount * (1024 ** (index - 2));
};

function LoadingRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="bg-[#27272a] border border-white/[0.08] rounded-xl p-4 animate-pulse">
          <div className="h-4 w-1/2 bg-white/[0.08] rounded mb-3" />
          <div className="h-2 bg-white/[0.06] rounded-full mb-3" />
          <div className="h-3 w-1/3 bg-white/[0.06] rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ health }: { health: DownloadHealth | null }) {
  const engineMissing = health && !health.engine.available;
  return (
    <div className="bg-[#27272a] border border-white/[0.08] rounded-xl p-8 text-center">
      <div className={`w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center ${engineMissing ? 'bg-ph-error/10' : 'bg-ph-indigo/10'}`}>
        {engineMissing ? <AlertTriangle size={22} className="text-ph-error" /> : <Download size={22} className="text-ph-indigo" />}
      </div>
      <div className="text-[13px] font-semibold text-[#fafafa] mb-1">
        {engineMissing ? 'Download engine unavailable' : 'No downloads yet'}
      </div>
      <p className="text-[11px] text-ph-muted max-w-md mx-auto">
        {engineMissing
          ? `aria2c was not found. Expected: ${health.engine.startup?.expected || 'server/bin/aria2/<platform>/aria2c'}`
          : 'Paste a supported HTTP, HTTPS, FTP, magnet, torrent, Google Drive public file, or GitHub release asset URL to add a real download.'}
      </p>
    </div>
  );
}

function DetailPanel({ item }: { item: DownloadItem | null }) {
  if (!item) {
    return (
      <div className="bg-[#27272a] border border-white/[0.08] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Info size={14} className="text-ph-indigo" />
          <span className="text-[12px] font-medium text-[#fafafa]">Download Details</span>
        </div>
        <p className="text-[11px] text-ph-muted">Select a download to inspect engine metadata.</p>
      </div>
    );
  }

  const rows = [
    ['Filename', item.filename],
    ['Source', item.url],
    ['Provider', item.provider || 'unknown'],
    ['Save Path', item.savePath || '--'],
    ['Status', item.status],
    ['Created', item.createdAt ? new Date(item.createdAt).toLocaleString() : '--'],
    ['Seeds / Peers', item.seeds || item.peers ? `${item.seeds || 0} / ${item.peers || 0}` : '--'],
  ];

  return (
    <div className="bg-[#27272a] border border-white/[0.08] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <FolderOpen size={14} className="text-ph-indigo" />
        <span className="text-[12px] font-medium text-[#fafafa]">Download Details</span>
      </div>
      <div className="space-y-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <div className="text-[10px] text-[#71717a] mb-0.5">{label}</div>
            <div className="text-[11px] text-[#d4d4d8] break-words">{value}</div>
          </div>
        ))}
        {item.error && (
          <div className="pt-2 border-t border-white/[0.06] text-[11px] text-ph-error">{item.error}</div>
        )}
      </div>
    </div>
  );
}

export default function Downloads() {
  const [payload, setPayload] = useState<DownloadsPayload | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [speedSeries, setSpeedSeries] = useState<Array<{ time: number; speed: number }>>([]);
  const [adding, setAdding] = useState(false);

  const loadDownloads = useCallback(async () => {
    try {
      const next = await api.downloads.list();
      setPayload(next);
      setError(null);
      setSpeedSeries(prev => [
        ...prev.slice(-59),
        { time: prev.length ? prev[prev.length - 1].time + 1 : 0, speed: parseSpeed(next.stats.currentSpeed) },
      ]);
      if (!selectedId && next.items[0]) setSelectedId(next.items[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load downloads');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadDownloads();
    const interval = setInterval(loadDownloads, 3000);
    return () => clearInterval(interval);
  }, [loadDownloads]);

  const downloads = useMemo(() => payload?.items || [], [payload?.items]);
  const health = payload?.health || null;
  const selected = downloads.find(item => item.id === selectedId) || null;

  const filtered = useMemo(() => (
    activeFilter === 'all'
      ? downloads
      : downloads.filter(d => d.status === activeFilter)
  ), [activeFilter, downloads]);

  const addUrl = async () => {
    const url = urlInput.trim();
    if (!url || adding) return;
    setActionError(null);
    setAdding(true);
    try {
      const item = await api.downloads.add(url);
      setSelectedId(item.id);
      setUrlInput('');
      await loadDownloads();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not add download');
    } finally {
      setAdding(false);
    }
  };

  const runAction = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
      await loadDownloads();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Download action failed');
    }
  };

  return (
    <div className="flex gap-5">
      <div className="flex-1 space-y-4">
        <div className="bg-[#27272a] border border-white/[0.08] rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 flex items-center gap-2 bg-white/[0.04] rounded-lg px-3 py-2 border border-white/[0.06] focus-within:border-ph-indigo/50 transition-colors">
              <Link size={14} className="text-[#71717a]" />
              <input
                type="text"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addUrl()}
                placeholder="Paste supported download URL..."
                disabled={adding}
                className="flex-1 bg-transparent text-[13px] text-[#fafafa] placeholder-[#71717a] outline-none"
              />
              <button
                onClick={() => { navigator.clipboard.readText().then(t => setUrlInput(t)); }}
                className="text-[10px] text-ph-muted hover:text-ph-indigo transition-colors px-2 py-0.5 rounded hover:bg-white/[0.04]"
              >
                Paste
              </button>
            </div>
            <button
              onClick={addUrl}
              disabled={adding}
              className="flex items-center gap-1.5 px-4 py-2 bg-ph-indigo hover:bg-ph-indigo/90 text-white text-[12px] font-medium rounded-lg transition-colors"
            >
              <Plus size={14} /> {adding ? 'Adding' : 'Add'}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              {['all', 'queued', 'downloading', 'paused', 'completed', 'failed', 'cancelled'].map(f => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors capitalize ${
                    activeFilter === f ? 'bg-white/[0.08] text-[#fafafa]' : 'text-ph-muted hover:text-[#fafafa] hover:bg-white/[0.04]'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <button
              onClick={loadDownloads}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-ph-muted hover:bg-white/[0.04] hover:text-[#fafafa] transition-colors"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        </div>

        {(error || actionError) && (
          <div className="bg-ph-error/10 border border-ph-error/20 rounded-xl p-3 flex items-center gap-2 text-[12px] text-[#fafafa]">
            <AlertTriangle size={15} className="text-ph-error flex-shrink-0" />
            <span>{actionError || error}</span>
          </div>
        )}

        {loading ? <LoadingRows /> : filtered.length === 0 ? (
          <EmptyState health={health} />
        ) : (
          <div className="space-y-2">
            {filtered.map((item, i) => {
              const Icon = fileIcons[item.type] || FileText;
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => setSelectedId(item.id)}
                  className={`bg-[#27272a] border rounded-xl p-4 card-hover cursor-pointer ${
                    selectedId === item.id ? 'border-ph-indigo/50' : 'border-white/[0.08]'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2.5">
                    <div className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
                      <Icon size={16} className="text-ph-muted" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-[#fafafa] truncate">{item.filename}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusBadges[item.status] || statusBadges.failed}`}>
                          {item.status}
                        </span>
                      </div>
                      <span className="text-[11px] text-[#71717a] truncate block">{item.url}</span>
                    </div>
                    <span className="text-[11px] text-ph-muted flex-shrink-0">{item.size}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${statusColors[item.status] || statusColors.failed}`}
                        animate={{ width: `${item.progress}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-[#fafafa] w-10 text-right">{Math.round(item.progress)}%</span>
                  </div>

                  <div className="flex items-center justify-between mt-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-ph-indigo flex items-center gap-1">
                        <Download size={11} /> {item.speed}
                      </span>
                      <span className="text-[11px] text-[#71717a] flex items-center gap-1">
                        <Clock size={11} /> {item.eta}
                      </span>
                    </div>

                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    {item.status === 'downloading' && (
                        <button
                          onClick={() => runAction(() => api.downloads.pause(item.id))}
                          className="p-1.5 rounded-lg hover:bg-white/[0.06] text-ph-muted hover:text-[#fafafa] transition-colors"
                          title="Pause"
                        >
                          <Pause size={13} />
                        </button>
                      )}
                      {(item.status === 'downloading' || item.status === 'queued' || item.status === 'paused') && (
                        <button
                          onClick={() => runAction(() => api.downloads.cancel(item.id))}
                          className="p-1.5 rounded-lg hover:bg-ph-error/10 text-ph-muted hover:text-ph-error transition-colors"
                          title="Cancel"
                        >
                          <XCircle size={13} />
                        </button>
                      )}
                      {(item.status === 'paused' || item.status === 'queued') && (
                        <button
                          onClick={() => runAction(() => api.downloads.resume(item.id))}
                          className="p-1.5 rounded-lg hover:bg-white/[0.06] text-ph-muted hover:text-[#fafafa] transition-colors"
                          title="Resume"
                        >
                          <Play size={13} />
                        </button>
                      )}
                      {item.status === 'failed' && (
                        <button
                          onClick={() => runAction(() => api.downloads.retry(item.id))}
                          className="p-1.5 rounded-lg hover:bg-white/[0.06] text-ph-warning hover:text-ph-warning transition-colors"
                          title="Retry"
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                      {item.status === 'cancelled' && (
                        <button
                          onClick={() => runAction(() => api.downloads.retry(item.id))}
                          className="p-1.5 rounded-lg hover:bg-white/[0.06] text-ph-warning hover:text-ph-warning transition-colors"
                          title="Retry"
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                      {item.status === 'completed' && (
                        <>
                          <button
                            onClick={() => runAction(() => api.downloads.openFile(item.id))}
                            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-ph-success hover:text-ph-success transition-colors"
                            title="Open file"
                          >
                            <FileText size={13} />
                          </button>
                          <button
                            onClick={() => runAction(() => api.downloads.openFolder(item.id))}
                            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-ph-success hover:text-ph-success transition-colors"
                            title="Open folder"
                          >
                            <FolderOpen size={13} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => runAction(() => api.downloads.remove(item.id))}
                        className="p-1.5 rounded-lg hover:bg-ph-error/10 text-ph-muted hover:text-ph-error transition-colors"
                        title="Remove"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <div className="w-[300px] space-y-4 flex-shrink-0">
        <div className="bg-[#27272a] border border-white/[0.08] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Server size={14} className={health?.engine.available ? 'text-ph-success' : 'text-ph-error'} />
            <span className="text-[12px] font-medium text-[#fafafa]">Download Engine</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-ph-muted">aria2</span>
              <span className={`text-[11px] font-semibold ${health?.engine.available ? 'text-ph-success' : 'text-ph-error'}`}>
                {health?.engine.available ? 'Available' : 'Missing'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-ph-muted">RPC</span>
              <span className={`text-[11px] font-semibold ${health?.engine.started ? 'text-ph-success' : 'text-ph-warning'}`}>
                {health?.engine.started ? 'Started' : 'Not running'}
              </span>
            </div>
            <div className="pt-2 border-t border-white/[0.06] text-[10px] text-[#71717a] break-words">
              {health?.engine.binaryPath || health?.engine.startup?.expected || 'Checking engine path...'}
            </div>
          </div>
        </div>

        <div className="bg-[#27272a] border border-white/[0.08] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Download size={14} className="text-ph-indigo" />
            <span className="text-[12px] font-medium text-[#fafafa]">Download Stats</span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-[11px] text-[#71717a] mb-0.5">Completed</div>
              <div className="text-xl font-bold text-[#fafafa]">{payload?.stats.completedSize || '0 B'}</div>
            </div>
            <div>
              <div className="text-[11px] text-[#71717a] mb-0.5">Current Speed</div>
              <div className="text-xl font-bold text-[#fafafa]">{payload?.stats.currentSpeed || '0 B/s'}</div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-white/[0.06]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-ph-muted">Active</span>
              <span className="text-[13px] font-semibold text-ph-indigo">{payload?.stats.active || 0}</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-ph-muted">Queued</span>
              <span className="text-[13px] font-semibold text-ph-cloud">{payload?.stats.queued || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-ph-muted">Failed</span>
              <span className="text-[13px] font-semibold text-ph-error">{payload?.stats.failed || 0}</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-ph-muted">Cancelled</span>
              <span className="text-[13px] font-semibold text-ph-error">{payload?.stats.cancelled || 0}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#27272a] border border-white/[0.08] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[12px] font-medium text-[#fafafa]">Live Speed</span>
            <span className="text-[11px] text-ph-indigo font-semibold">{payload?.stats.currentSpeed || '0 B/s'}</span>
          </div>
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={speedSeries}>
                <defs>
                  <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="speed"
                  stroke="#6366f1"
                  strokeWidth={1.5}
                  fill="url(#speedGrad)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#27272a] border border-white/[0.08] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Gauge size={14} className="text-ph-indigo" />
            <span className="text-[12px] font-medium text-[#fafafa]">Providers</span>
          </div>
          <div className="space-y-2">
            {(health?.providers || []).map(provider => (
              <div key={provider.id} className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-ph-muted truncate">{provider.label}</span>
                <span className={`text-[10px] font-semibold ${provider.ok ? 'text-ph-success' : 'text-ph-warning'}`}>
                  {provider.ok ? 'Ready' : provider.configured === false ? 'Setup' : 'Unavailable'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <DetailPanel item={selected} />
      </div>
    </div>
  );
}
