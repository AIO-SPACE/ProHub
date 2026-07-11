import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Cloud,
  HardDrive,
  ExternalLink,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Download,
  Upload,
  FileText,
  Image,
  Film,
  Music,
  Archive,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { api, type CloudPayload } from '@/lib/api';

const fileTypeIcons: Record<string, LucideIcon> = {
  archive: Archive,
  image: Image,
  film: Film,
  music: Music,
  doc: FileText,
  code: HardDrive,
};

export default function CloudHub() {
  const [payload, setPayload] = useState<CloudPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadCloud = async () => {
    try {
      setPayload(await api.cloud.get());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cloud providers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCloud();
  }, []);

  const runProviderAction = async (providerId: string, action: 'connect' | 'refresh' | 'browse' | 'download' | 'upload' | 'open') => {
    setActionMessage(null);
    setError(null);
    try {
      const result = await api.cloud.action(providerId, action);
      if (result.url) window.open(result.url, '_blank', 'noopener,noreferrer');
      setActionMessage(result.message || `${action} completed`);
      if (action === 'refresh' || action === 'browse') await loadCloud();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action} failed`);
    }
  };

  const providers = useMemo(() => payload?.providers || [], [payload?.providers]);
  const totals = useMemo(() => providers.reduce((acc, provider) => ({
    used: acc.used + (provider.used || 0),
    total: acc.total + (provider.total || 0),
  }), { used: 0, total: 0 }), [providers]);

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-ph-error/10 border border-ph-error/20 rounded-xl p-3 flex items-center gap-2">
          <AlertTriangle size={15} className="text-ph-error" />
          <span className="text-[12px] text-[#fafafa]">{error}</span>
        </div>
      )}
      {actionMessage && (
        <div className="bg-ph-success/10 border border-ph-success/20 rounded-xl p-3 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-ph-success" />
          <span className="text-[12px] text-[#fafafa]">{actionMessage}</span>
        </div>
      )}

      <div className="bg-[#27272a] border border-white/[0.08] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <HardDrive size={16} className="text-ph-cloud" />
            <span className="text-[13px] font-medium text-[#fafafa]">Storage Overview</span>
          </div>
          <button
            onClick={loadCloud}
            className="flex items-center gap-1 text-[11px] text-ph-muted hover:text-ph-cloud transition-colors"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        <div className="h-3 flex rounded-full overflow-hidden bg-white/[0.06]">
          <div
            className="h-full bg-ph-cloud transition-all"
            style={{ width: totals.total ? `${Math.round((totals.used / totals.total) * 100)}%` : '0%' }}
          />
        </div>

        <div className="flex flex-wrap gap-3 mt-3">
          {providers.map(provider => (
            <div key={provider.id} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: provider.color }} />
              <span className="text-[11px] text-ph-muted">{provider.name}</span>
              <span className={`text-[11px] ${provider.connected ? 'text-ph-success' : 'text-ph-warning'}`}>
                {provider.connected ? 'Live' : provider.configured ? 'Setup needed' : 'Not configured'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-48 bg-[#27272a] border border-white/[0.08] rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {providers.map((provider, i) => {
            const Icon = provider.id === 'github' ? HardDrive : Cloud;
            const pct = provider.total ? Math.round(((provider.used || 0) / provider.total) * 100) : 0;
            return (
              <motion.div
                key={provider.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-[#27272a] border border-white/[0.08] rounded-xl p-4 card-hover"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${provider.color}15` }}>
                      <Icon size={16} style={{ color: provider.color }} />
                    </div>
                    <span className="text-[13px] font-medium text-[#fafafa]">{provider.name}</span>
                  </div>
                  <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${provider.connected ? 'bg-ph-success/10 text-ph-success' : 'bg-ph-warning/10 text-ph-warning'}`}>
                    {provider.connected ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                    {provider.connected ? 'Live' : 'Setup'}
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-ph-muted">{provider.used || 0} / {provider.total || 0}</span>
                    <span className="text-[11px]" style={{ color: provider.color }}>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: provider.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 mb-3">
                  <button
                    onClick={() => runProviderAction(provider.id, 'connect')}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-ph-muted hover:text-[#fafafa] transition-colors"
                  >
                    <CheckCircle2 size={10} /> Connect
                  </button>
                  <button
                    onClick={() => runProviderAction(provider.id, 'refresh')}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-ph-muted hover:text-[#fafafa] transition-colors"
                  >
                    <RefreshCw size={10} /> Refresh
                  </button>
                  <button
                    onClick={() => runProviderAction(provider.id, 'browse')}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-ph-muted hover:text-[#fafafa] transition-colors"
                  >
                    <HardDrive size={10} /> Browse
                  </button>
                  <button
                    onClick={() => runProviderAction(provider.id, 'download')}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-ph-muted hover:text-[#fafafa] transition-colors"
                  >
                    <Download size={10} /> Download
                  </button>
                  <button
                    onClick={() => runProviderAction(provider.id, 'upload')}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-ph-muted hover:text-[#fafafa] transition-colors"
                  >
                    <Upload size={10} /> Upload
                  </button>
                  <button
                    onClick={() => runProviderAction(provider.id, 'open')}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-ph-muted hover:text-[#fafafa] transition-colors"
                  >
                    <ExternalLink size={10} /> Open
                  </button>
                </div>

                <div className="space-y-1.5">
                  {provider.files.length ? provider.files.map((file, fi) => {
                    const FTIcon = fileTypeIcons[file.type] || FileText;
                    return (
                      <div key={`${file.name}-${fi}`} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-white/[0.03] transition-colors">
                        <FTIcon size={12} className="text-[#71717a]" />
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-[#d4d4d8] flex-1 truncate hover:text-ph-cloud transition-colors"
                        >
                          {file.name}
                        </a>
                        <span className="text-[10px] text-[#71717a]">{file.size}</span>
                      </div>
                    );
                  }) : (
                    <div className="text-[11px] text-ph-muted leading-relaxed">{provider.message || 'No live files returned.'}</div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="bg-[#27272a] border border-white/[0.08] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <RefreshCw size={16} className="text-ph-indigo" />
          <span className="text-[13px] font-medium text-[#fafafa]">Sync Queue</span>
          <span className="text-[10px] text-ph-muted bg-white/[0.04] px-2 py-0.5 rounded-full">
            {payload?.syncQueue.length || 0} active
          </span>
        </div>
        <div className="text-[11px] text-ph-muted">No sync jobs are active. Live sync jobs will appear here once a provider starts one.</div>
      </div>
    </div>
  );
}
