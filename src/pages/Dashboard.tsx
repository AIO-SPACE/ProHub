import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Cloud,
  Download,
  AppWindow,
  Music,
  Shield,
  Settings,
  Activity,
  HardDrive,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Globe,
  Zap,
  FileCheck,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import { api, type DashboardPayload } from '@/lib/api';

const moduleMeta: Record<string, { icon: LucideIcon; color: string; glowClass: string; progressColor: string }> = {
  cloud: { icon: Cloud, color: '#3b82f6', glowClass: 'hover:shadow-glow-blue', progressColor: 'bg-ph-cloud' },
  downloads: { icon: Download, color: '#10b981', glowClass: 'hover:shadow-glow-green', progressColor: 'bg-ph-download' },
  apps: { icon: AppWindow, color: '#f59e0b', glowClass: 'hover:shadow-glow-amber', progressColor: 'bg-ph-app' },
  music: { icon: Music, color: '#ec4899', glowClass: 'hover:shadow-glow-pink', progressColor: 'bg-ph-music' },
  vpn: { icon: Shield, color: '#8b5cf6', glowClass: 'hover:shadow-glow-purple', progressColor: 'bg-ph-vpn' },
  settings: { icon: Settings, color: '#6b7280', glowClass: '', progressColor: 'bg-gray-500' },
};

const activityIcons: Record<string, { icon: LucideIcon; color: string }> = {
  success: { icon: CheckCircle2, color: '#22c55e' },
  download: { icon: Download, color: '#10b981' },
  cloud: { icon: Cloud, color: '#3b82f6' },
  warning: { icon: AlertTriangle, color: '#eab308' },
  music: { icon: Music, color: '#ec4899' },
  vpn: { icon: Shield, color: '#8b5cf6' },
  error: { icon: XCircle, color: '#ef4444' },
  activity: { icon: Activity, color: '#6366f1' },
  settings: { icon: Settings, color: '#6b7280' },
};

const statIcons = [HardDrive, Zap, FileCheck, Clock];

function ModuleCard({ mod, onNavigate }: { mod: DashboardPayload['modules'][number]; onNavigate: (id: string) => void }) {
  const meta = moduleMeta[mod.id] || moduleMeta.settings;
  const Icon = meta.icon;
  const isHero = mod.isHero;

  return (
    <motion.div
      layout
      onClick={() => onNavigate(mod.id)}
      className={`bg-[#27272a] border border-white/[0.08] rounded-xl p-4 cursor-pointer card-hover ${meta.glowClass} ${isHero ? 'col-span-2' : ''}`}
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <Icon size={20} style={{ color: meta.color }} />
          <span className="text-[13px] font-medium text-[#fafafa]">{mod.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="status-dot" style={{ backgroundColor: mod.statusColor, color: mod.statusColor }} />
          <span className="text-[11px] text-ph-muted">{mod.status}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {mod.stats.map((stat, i) => (
          <div key={`${mod.id}-${stat}`} className="text-center">
            <div className="text-[15px] font-semibold text-[#fafafa]">
              {i === 0 && mod.id === 'music' ? <Music size={14} className="inline text-ph-music" /> : stat.split(' ')[0]}
            </div>
            <div className="text-[10px] text-[#71717a] mt-0.5 truncate">{stat}</div>
          </div>
        ))}
      </div>

      <div className="relative h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <motion.div
          className={`absolute inset-y-0 left-0 rounded-full ${meta.progressColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${mod.progress}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
        <div className="absolute inset-0 shimmer-bar" />
      </div>
    </motion.div>
  );
}

export default function Dashboard({ onNavigate }: { onNavigate: (id: string) => void }) {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    try {
      setDashboard(await api.dashboard());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-36 bg-[#27272a] border border-white/[0.08] rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-ph-error/10 border border-ph-error/20 rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-ph-error" />
          <span className="text-[12px] text-[#fafafa]">{error}</span>
        </div>
        <button onClick={loadDashboard} className="flex items-center gap-1.5 text-[11px] text-ph-muted hover:text-[#fafafa]">
          <RefreshCw size={12} /> Retry
        </button>
      </div>
    );
  }

  const activities = dashboard?.activities || [];
  const quickStats = dashboard?.quickStats || [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        {(dashboard?.modules || []).map((mod) => (
          <ModuleCard key={mod.id} mod={mod} onNavigate={onNavigate} />
        ))}
      </div>

      <div className="bg-[#27272a] border border-white/[0.08] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity size={16} className="text-ph-indigo" />
          <h2 className="text-[13px] font-semibold text-[#fafafa]">Recent Activity</h2>
          <span className="ml-auto text-[10px] text-[#71717a] bg-white/[0.04] px-2 py-0.5 rounded-full">{activities.length} events</span>
        </div>

        <div className="space-y-0 max-h-[240px] overflow-y-auto scrollbar-thin pr-1">
          {activities.length ? activities.map((activity, i) => {
            const meta = activityIcons[activity.type] || activityIcons.activity;
            const Icon = meta.icon;
            return (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors group"
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${meta.color}15` }}
                >
                  <Icon size={14} style={{ color: meta.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-[#d4d4d8] truncate group-hover:text-[#fafafa] transition-colors">
                    {activity.text}
                  </p>
                </div>
                <span className="text-[10px] text-[#71717a] flex-shrink-0">{activity.time}</span>
              </motion.div>
            );
          }) : (
            <div className="text-[11px] text-ph-muted">No activity yet.</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {quickStats.map((stat, i) => {
          const Icon = statIcons[i] || Globe;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="bg-[#27272a] border border-white/[0.08] rounded-xl p-3 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${stat.color}15` }}>
                <Icon size={16} style={{ color: stat.color }} />
              </div>
              <div>
                <div className="text-[11px] text-[#71717a]">{stat.label}</div>
                <div className="text-[15px] font-semibold text-[#fafafa]">
                  {stat.value} <span className="text-[10px] text-[#71717a] font-normal">{stat.sub}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
