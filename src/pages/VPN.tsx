import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  ShieldOff,
  Globe,
  Zap,
  Clock,
  ArrowUpDown,
  Server,
  Activity,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { api, type VpnPayload } from '@/lib/api';

export default function VPN() {
  const [vpn, setVpn] = useState<VpnPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadVpn = async () => {
    try {
      setVpn(await api.vpn.get());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load VPN status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVpn();
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-center py-6">
        <div className="text-center">
          <motion.div
            className="relative w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-4 bg-ph-warning/10 shadow-[0_0_40px_rgba(234,179,8,0.18)]"
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          >
            {loading ? <Shield size={40} className="text-ph-warning" /> : <ShieldOff size={40} className="text-ph-warning" />}
          </motion.div>

          <h2 className="text-lg font-semibold mb-1 text-ph-warning">
            {loading ? 'Checking VPN...' : 'Manual Setup Required'}
          </h2>
          <div className="flex items-center justify-center gap-2 text-[12px] text-ph-muted">
            <AlertTriangle size={12} />
            {vpn?.message || 'No real VPN provider is configured.'}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-ph-error/10 border border-ph-error/20 rounded-xl p-3 flex items-center gap-2">
          <AlertTriangle size={15} className="text-ph-error" />
          <span className="text-[12px] text-[#fafafa]">{error}</span>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Connection Time', value: '0m', icon: Clock },
          { label: 'Download', value: vpn?.dataTransferred.down || '0 B', icon: ArrowUpDown },
          { label: 'Upload', value: vpn?.dataTransferred.up || '0 B', icon: Activity },
          { label: 'Protocol', value: vpn?.settings?.defaultProtocol || 'Manual', icon: Zap },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="bg-[#27272a] border border-white/[0.08] rounded-xl p-3 text-center">
              <Icon size={14} className="text-ph-vpn mx-auto mb-1.5" />
              <div className="text-[11px] text-[#71717a] mb-0.5">{stat.label}</div>
              <div className="text-[13px] font-semibold text-[#fafafa]">{stat.value}</div>
            </div>
          );
        })}
      </div>

      <div className="bg-[#27272a] border border-white/[0.08] rounded-xl p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-ph-vpn" />
          <span className="text-[12px] text-ph-muted">IP Address</span>
          <span className="text-[13px] font-mono text-[#fafafa]">Unavailable</span>
        </div>
        <button
          onClick={loadVpn}
          className="flex items-center gap-1 text-[11px] text-ph-muted hover:text-ph-indigo transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div className="bg-[#27272a] border border-white/[0.08] rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Server size={14} className="text-ph-vpn" />
            <span className="text-[13px] font-semibold text-[#fafafa]">Server List</span>
            <span className="text-[10px] text-ph-muted bg-white/[0.04] px-2 py-0.5 rounded-full">0 servers</span>
          </div>
        </div>

        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-ph-vpn/10 mx-auto mb-3 flex items-center justify-center">
            <ShieldOff size={22} className="text-ph-vpn" />
          </div>
          <div className="text-[13px] font-semibold text-[#fafafa] mb-1">No VPN provider connected</div>
          <p className="text-[11px] text-ph-muted max-w-md mx-auto">
            ProHub only shows real VPN state. Add a VPN integration before connection controls are enabled.
          </p>
        </div>
      </div>
    </div>
  );
}
