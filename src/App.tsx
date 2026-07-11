import { useState, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Cloud,
  Download,
  AppWindow,
  Clapperboard,
  Music,
  Sparkles,
  LibraryBig,
  Shield,
  Settings,
  Bell,
  Wifi,
  Clock,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const CloudHub = lazy(() => import('./pages/CloudHub'));
const Downloads = lazy(() => import('./pages/Downloads'));
const AppTracker = lazy(() => import('./pages/AppTracker'));
const MusicModule = lazy(() => import('./pages/MusicModule'));
const MovieModule = lazy(() => import('./pages/MovieModule'));
const VPN = lazy(() => import('./pages/VPN'));
const SettingsPage = lazy(() => import('./pages/Settings'));

const modules = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, color: '#6366f1', accent: 'text-ph-indigo' },
  { id: 'downloads', label: 'Downloads', icon: Download, color: '#10b981', accent: 'text-ph-download' },
  { id: 'music', label: 'Music Sky', icon: Music, color: '#ff6b57', accent: 'text-ph-music' },
  { id: 'movie', label: 'Movie Sky', icon: Clapperboard, color: '#f43f5e', accent: 'text-rose-400' },
  { id: 'anime', label: 'Anime Sky', icon: Sparkles, color: '#22c55e', accent: 'text-emerald-400' },
  { id: 'cloud', label: 'Cloud Hub', icon: Cloud, color: '#3b82f6', accent: 'text-ph-cloud' },
  { id: 'apps', label: 'App Tracker', icon: AppWindow, color: '#f59e0b', accent: 'text-ph-app' },
  { id: 'vpn', label: 'VPN', icon: Shield, color: '#8b5cf6', accent: 'text-ph-vpn' },
  { id: 'settings', label: 'Settings', icon: Settings, color: '#6b7280', accent: 'text-gray-400' },
  { id: 'library', label: 'Library', icon: LibraryBig, color: '#14b8a6', accent: 'text-teal-400' },
];

function Sidebar({ active, onNavigate, expanded, onToggle }: {
  active: string;
  onNavigate: (id: string) => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: expanded ? 200 : 64 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="h-screen bg-[#18181b] border-r border-white/[0.08] flex flex-col relative z-50"
    >
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-white/[0.08]">
        <div className="w-8 h-8 rounded-lg bg-ph-indigo flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">P</span>
        </div>
        <AnimatePresence>
          {expanded && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="ml-3 font-semibold text-[#fafafa] text-sm whitespace-nowrap overflow-hidden"
            >
              ProHub
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 py-3 px-2 space-y-1">
        {modules.map((mod) => {
          const Icon = mod.icon;
          const isActive = active === mod.id;
          return (
            <button
              key={mod.id}
              onClick={() => onNavigate(mod.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 relative group ${
                isActive
                  ? 'bg-white/[0.06]'
                  : 'hover:bg-white/[0.04]'
              }`}
            >
              {/* Active indicator */}
              {isActive && (
                <motion.div
                  layoutId="activeIndicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                  style={{ backgroundColor: mod.color }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}

              <Icon
                size={20}
                style={{ color: isActive ? mod.color : '#a1a1aa' }}
                className="flex-shrink-0 transition-colors"
              />

              <AnimatePresence>
                {expanded && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    className={`text-sm font-medium whitespace-nowrap overflow-hidden ${
                      isActive ? 'text-[#fafafa]' : 'text-[#a1a1aa]'
                    }`}
                  >
                    {mod.label}
                  </motion.span>
                )}
              </AnimatePresence>

              {/* Tooltip for collapsed */}
              {!expanded && (
                <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-[#27272a] rounded-lg text-xs text-[#fafafa] opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 border border-white/[0.08] shadow-elevated transition-opacity">
                  {mod.label}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Toggle */}
      <div className="p-2 border-t border-white/[0.08]">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-white/[0.04] text-[#a1a1aa] hover:text-[#fafafa] transition-colors"
        >
          {expanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
      </div>
    </motion.aside>
  );
}

function TopBar({ activeModule }: { activeModule: typeof modules[0] }) {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <header className="h-12 flex items-center justify-between px-6 border-b border-white/[0.06]">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="min-w-0 truncate whitespace-nowrap text-[15px] font-semibold text-[#fafafa]">{activeModule.label}</h1>
        <div className="w-8 h-[2px] rounded-full flex-shrink-0" style={{ backgroundColor: activeModule.color }} />
      </div>

      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-ph-muted">
          <Wifi size={13} className="text-ph-success" />
          <span>Connected</span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-ph-muted">
          <Clock size={13} />
          <span>{time}</span>
        </div>
        <button className="relative p-1.5 rounded-lg hover:bg-white/[0.06] text-ph-muted hover:text-[#fafafa] transition-colors">
          <Bell size={15} />
          <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-ph-error rounded-full" />
        </button>
      </div>
    </header>
  );
}

function LoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-ph-indigo border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  const [active, setActive] = useState('dashboard');
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const activeModule = modules.find(m => m.id === active) || modules[0];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#09090b]">
      <Sidebar
        active={active}
        onNavigate={setActive}
        expanded={sidebarExpanded}
        onToggle={() => setSidebarExpanded(!sidebarExpanded)}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <TopBar activeModule={activeModule} />

        <div className="flex-1 overflow-y-auto scrollbar-thin grid-bg">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="p-6"
            >
              <Suspense fallback={<LoadingFallback />}>
                {active === 'dashboard' && <Dashboard onNavigate={setActive} />}
                {active === 'cloud' && <CloudHub />}
                {active === 'downloads' && <Downloads />}
                {active === 'apps' && <AppTracker />}
                {active === 'music' && <MusicModule />}
                {active === 'movie' && <MovieModule />}
                {active === 'anime' && <MovieModule sky="anime" />}
                {active === 'vpn' && <VPN />}
                {active === 'settings' && <SettingsPage />}
                {active === 'library' && <MusicModule initialView="library" />}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
