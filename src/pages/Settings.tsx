import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  FolderOpen,
  Palette,
  Eye,
  EyeOff,
  RefreshCw,
  Download,
  Cloud,
  Github,
  Music,
  Clapperboard,
  Shield,
  Info,
  Save,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { api, type DownloadHealth } from '@/lib/api';

interface ApiKeyField {
  id: string;
  label: string;
  icon: LucideIcon;
  value: string;
  placeholder: string;
}

const apiKeys: ApiKeyField[] = [
  { id: 'gdrive', label: 'Google Drive API Key', icon: Cloud, value: '', placeholder: 'Enter Google Drive API key...' },
  { id: 'mega', label: 'Mega API Key', icon: Cloud, value: '', placeholder: 'Enter Mega API key...' },
  { id: 'github', label: 'GitHub Personal Token', icon: Github, value: '', placeholder: 'Enter GitHub token...' },
  { id: 'listenfree', label: 'ListenFree API Key', icon: Music, value: '', placeholder: 'Enter ListenFree API key (optional)...' },
  { id: 'moviebox', label: 'MovieBox Compatible API Key', icon: Clapperboard, value: '', placeholder: 'Enter authorized provider key (optional)...' },
];

const accentColors = [
  { id: 'indigo', color: '#6366f1', label: 'Indigo' },
  { id: 'blue', color: '#3b82f6', label: 'Blue' },
  { id: 'emerald', color: '#10b981', label: 'Emerald' },
  { id: 'amber', color: '#f59e0b', label: 'Amber' },
  { id: 'pink', color: '#ec4899', label: 'Pink' },
  { id: 'violet', color: '#8b5cf6', label: 'Violet' },
];

export default function Settings() {
  const [keys, setKeys] = useState(apiKeys);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [engineHealth, setEngineHealth] = useState<DownloadHealth | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  // Cloud
  const [defaultSyncPath, setDefaultSyncPath] = useState('/home/user/ProHub/Sync');

  // Downloads
  const [downloadPath, setDownloadPath] = useState('/home/user/Downloads/ProHub');
  const [maxConcurrent, setMaxConcurrent] = useState([5]);
  const [speedLimit, setSpeedLimit] = useState(false);
  const [autoStart, setAutoStart] = useState(true);

  // App Tracker
  const [checkInterval, setCheckInterval] = useState('1hr');
  const [autoUpdateCritical, setAutoUpdateCritical] = useState(true);

  // Music
  const [audioQuality, setAudioQuality] = useState('auto');
  const [crossfade, setCrossfade] = useState(true);
  const [crossfadeDuration, setCrossfadeDuration] = useState([5]);
  const [normalizeVolume, setNormalizeVolume] = useState(true);

  // Media providers
  const [movieBoxBaseUrl, setMovieBoxBaseUrl] = useState('');
  const [movieBoxAssetBaseUrl, setMovieBoxAssetBaseUrl] = useState('');

  // Video playback settings
  const [videoQuality, setVideoQuality] = useState('auto');
  const [subtitleLanguage, setSubtitleLanguage] = useState('english');
  const [audioLanguage, setAudioLanguage] = useState('original');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [hardwareAcceleration, setHardwareAcceleration] = useState(true);
  const [playerTheme, setPlayerTheme] = useState('dark');
  const [autoPlayNext, setAutoPlayNext] = useState(true);
  const [skipIntro, setSkipIntro] = useState(false);
  const [skipCredits, setSkipCredits] = useState(false);
  const [continueWatchingEnabled, setContinueWatchingEnabled] = useState(true);

  // VPN
  const [defaultProtocol, setDefaultProtocol] = useState('WireGuard');
  const [killSwitch, setKillSwitch] = useState(true);
  const [autoConnect, setAutoConnect] = useState(false);

  // Appearance
  const [accentColor, setAccentColor] = useState('indigo');
  const [glassOpacity, setGlassOpacity] = useState([60]);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.settings.get(), api.downloads.health()])
      .then(([settings, health]) => {
        if (cancelled) return;
        setKeys(prev => prev.map(key => ({ ...key, value: settings.apiKeys.find(item => item.id === key.id)?.value || '' })));
        setDefaultSyncPath(settings.cloud.defaultSyncPath);
        setDownloadPath(settings.downloads.downloadPath);
        setMaxConcurrent([settings.downloads.maxConcurrent]);
        setSpeedLimit(settings.downloads.speedLimit);
        setAutoStart(settings.downloads.autoStart);
        setCheckInterval(settings.apps.checkInterval);
        setAutoUpdateCritical(settings.apps.autoUpdateCritical);
        setAudioQuality(settings.music.audioQuality);
        setCrossfade(settings.music.crossfade);
        setCrossfadeDuration([settings.music.crossfadeDuration]);
        setNormalizeVolume(settings.music.normalizeVolume);
        setMovieBoxBaseUrl(settings.moviebox.baseUrl);
        setMovieBoxAssetBaseUrl(settings.moviebox.assetBaseUrl);
        setVideoQuality(settings.moviebox.videoQuality || 'auto');
        setSubtitleLanguage(settings.moviebox.subtitleLanguage || 'english');
        setAudioLanguage(settings.moviebox.audioLanguage || 'original');
        setPlaybackSpeed(settings.moviebox.playbackSpeed || 1);
        setHardwareAcceleration(settings.moviebox.hardwareAcceleration !== false);
        setPlayerTheme(settings.moviebox.playerTheme || 'dark');
        setAutoPlayNext(settings.moviebox.autoPlayNext !== false);
        setSkipIntro(settings.moviebox.skipIntro === true);
        setSkipCredits(settings.moviebox.skipCredits === true);
        setContinueWatchingEnabled(settings.moviebox.continueWatchingEnabled !== false);
        setDefaultProtocol(settings.vpn.defaultProtocol);
        setKillSwitch(settings.vpn.killSwitch);
        setAutoConnect(settings.vpn.autoConnect);
        setAccentColor(settings.appearance.accentColor);
        setGlassOpacity([settings.appearance.glassOpacity]);
        setReduceMotion(settings.appearance.reduceMotion);
        setNotifications(settings.appearance.notifications);
        setDarkMode(settings.appearance.darkMode);
        setEngineHealth(health);
      })
      .catch(err => {
        if (!cancelled) setSettingsError(err instanceof Error ? err.message : 'Failed to load settings');
      });
    return () => { cancelled = true; };
  }, []);

  const updateKey = (id: string, value: string) => {
    setKeys(prev => prev.map(k => k.id === id ? { ...k, value } : k));
  };

  const saveSettings = async () => {
    setSettingsError(null);
    try {
      await api.settings.save({
        apiKeys: keys.map(({ id, label, value }) => ({ id, label, value })),
        cloud: { defaultSyncPath },
        downloads: { downloadPath, maxConcurrent: maxConcurrent[0], speedLimit, autoStart },
        apps: { checkInterval, autoUpdateCritical },
        music: { audioQuality, crossfade, crossfadeDuration: crossfadeDuration[0], normalizeVolume },
        moviebox: {
          baseUrl: movieBoxBaseUrl,
          assetBaseUrl: movieBoxAssetBaseUrl,
          videoQuality,
          subtitleLanguage,
          audioLanguage,
          playbackSpeed,
          hardwareAcceleration,
          playerTheme,
          autoPlayNext,
          skipIntro,
          skipCredits,
          continueWatchingEnabled,
        },
        vpn: { defaultProtocol, killSwitch, autoConnect },
        appearance: { accentColor, glassOpacity: glassOpacity[0], reduceMotion, notifications, darkMode },
      });
      setEngineHealth(await api.downloads.health());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to save settings');
    }
  };

  const testKey = async (id: string) => {
    setTestResults(prev => ({ ...prev, [id]: 'Testing...' }));
    try {
      const result = await api.settings.testKey(id);
      setTestResults(prev => ({ ...prev, [id]: result.message }));
    } catch (err) {
      setTestResults(prev => ({ ...prev, [id]: err instanceof Error ? err.message : 'Test failed' }));
    }
  };

  const SettingGroup = ({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) => (
    <div className="bg-[#27272a] border border-white/[0.08] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
        <Icon size={15} className="text-ph-indigo" />
        <span className="text-[13px] font-semibold text-[#fafafa]">{title}</span>
      </div>
      <div className="p-4 space-y-4">
        {children}
      </div>
    </div>
  );

  const ToggleRow = ({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-[12px] text-[#d4d4d8]">{label}</div>
        {description && <div className="text-[10px] text-[#71717a] mt-0.5">{description}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );

  return (
    <div className="max-w-2xl space-y-5">
      {settingsError && (
        <div className="bg-ph-error/10 border border-ph-error/20 rounded-xl p-3 text-[12px] text-[#fafafa]">
          {settingsError}
        </div>
      )}

      {/* Provider credentials */}
      <SettingGroup title="Provider Credentials" icon={Cloud}>
        <div className="space-y-3">
          {keys.map(key => {
            const KeyIcon = key.icon;
            return (
              <div key={key.id}>
                <label className="flex items-center gap-1.5 text-[11px] text-ph-muted mb-1.5">
                  <KeyIcon size={11} /> {key.label}
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center bg-white/[0.04] rounded-lg px-3 py-2 border border-white/[0.06] focus-within:border-ph-indigo/50 transition-colors">
                    <input
                      type={showKey[key.id] ? 'text' : 'password'}
                      value={key.value}
                      onChange={e => updateKey(key.id, e.target.value)}
                      placeholder={key.placeholder}
                      className="flex-1 bg-transparent text-[12px] text-[#fafafa] placeholder-[#71717a] outline-none font-mono"
                    />
                    <button
                      onClick={() => setShowKey(prev => ({ ...prev, [key.id]: !prev[key.id] }))}
                      className="text-[#71717a] hover:text-[#fafafa] transition-colors ml-2"
                    >
                      {showKey[key.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <button
                    onClick={() => testKey(key.id)}
                    className="px-3 py-2 rounded-lg bg-ph-indigo/10 hover:bg-ph-indigo/20 text-ph-indigo text-[11px] font-medium transition-colors"
                  >
                    Test
                  </button>
                </div>
                {testResults[key.id] && <div className="text-[10px] text-[#71717a] mt-1">{testResults[key.id]}</div>}
              </div>
            );
          })}
        </div>

        <div className="pt-2 border-t border-white/[0.06]">
          <label className="text-[11px] text-ph-muted mb-1.5 block">Default Sync Folder</label>
          <div className="flex items-center gap-2 bg-white/[0.04] rounded-lg px-3 py-2 border border-white/[0.06]">
            <FolderOpen size={13} className="text-[#71717a]" />
            <input
              type="text"
              value={defaultSyncPath}
              onChange={e => setDefaultSyncPath(e.target.value)}
              className="flex-1 bg-transparent text-[12px] text-[#fafafa] outline-none"
            />
          </div>
        </div>
      </SettingGroup>

      <SettingGroup title="Media Providers" icon={Clapperboard}>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-ph-muted mb-1.5 block">MovieBox-compatible API Base URL</label>
            <input
              type="url"
              value={movieBoxBaseUrl}
              onChange={e => setMovieBoxBaseUrl(e.target.value)}
              placeholder="https://media-provider.example/api/"
              className="w-full bg-white/[0.04] rounded-lg px-3 py-2 border border-white/[0.06] focus:border-ph-indigo/50 text-[12px] text-[#fafafa] placeholder-[#71717a] outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] text-ph-muted mb-1.5 block">Artwork Base URL</label>
            <input
              type="url"
              value={movieBoxAssetBaseUrl}
              onChange={e => setMovieBoxAssetBaseUrl(e.target.value)}
              placeholder="https://media-provider.example/assets/"
              className="w-full bg-white/[0.04] rounded-lg px-3 py-2 border border-white/[0.06] focus:border-ph-indigo/50 text-[12px] text-[#fafafa] placeholder-[#71717a] outline-none"
            />
          </div>
        </div>
      </SettingGroup>

      {/* Download Settings */}
      <SettingGroup title="Downloads" icon={Download}>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/[0.04] rounded-lg p-3 border border-white/[0.06]">
            <div className="text-[10px] text-[#71717a] mb-1">Engine</div>
            <div className={`text-[12px] font-semibold ${engineHealth?.engine.available ? 'text-ph-success' : 'text-ph-error'}`}>
              {engineHealth?.engine.available ? 'aria2 available' : 'aria2 missing'}
            </div>
          </div>
          <div className="bg-white/[0.04] rounded-lg p-3 border border-white/[0.06]">
            <div className="text-[10px] text-[#71717a] mb-1">RPC</div>
            <div className={`text-[12px] font-semibold ${engineHealth?.engine.started ? 'text-ph-success' : 'text-ph-warning'}`}>
              {engineHealth?.engine.started ? 'running' : 'not running'}
            </div>
          </div>
        </div>
        <div className="text-[10px] text-[#71717a] break-words">
          {engineHealth?.engine.binaryPath || engineHealth?.engine.startup?.expected || 'Checking bundled aria2 path...'}
        </div>
        <div className="space-y-1">
          <div className="text-[11px] text-ph-muted">Provider Status</div>
          {(engineHealth?.providers || []).map(provider => (
            <div key={provider.id} className="flex items-center justify-between text-[11px]">
              <span className="text-[#d4d4d8]">{provider.label}</span>
              <span className={provider.ok ? 'text-ph-success' : 'text-ph-warning'}>
                {provider.ok ? 'Ready' : provider.configured === false ? 'Needs setup' : 'Unavailable'}
              </span>
            </div>
          ))}
        </div>

        <div>
          <label className="text-[11px] text-ph-muted mb-1.5 block">Default Download Path</label>
          <div className="flex items-center gap-2 bg-white/[0.04] rounded-lg px-3 py-2 border border-white/[0.06]">
            <FolderOpen size={13} className="text-[#71717a]" />
            <input
              type="text"
              value={downloadPath}
              onChange={e => setDownloadPath(e.target.value)}
              className="flex-1 bg-transparent text-[12px] text-[#fafafa] outline-none"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] text-[#d4d4d8]">Max Concurrent Downloads</span>
            <span className="text-[12px] text-ph-indigo font-medium">{maxConcurrent[0]}</span>
          </div>
          <Slider value={maxConcurrent} onValueChange={setMaxConcurrent} min={1} max={10} step={1} className="w-full" />
        </div>

        <ToggleRow label="Speed Limit" description="Limit download speed to preserve bandwidth" checked={speedLimit} onChange={setSpeedLimit} />
        <ToggleRow label="Auto-start Downloads" description="Automatically start downloads when added" checked={autoStart} onChange={setAutoStart} />
      </SettingGroup>

      {/* App Tracker */}
      <SettingGroup title="App Tracker" icon={RefreshCw}>
        <div>
          <label className="text-[11px] text-ph-muted mb-1.5 block">Check Interval</label>
          <div className="flex gap-2">
            {['15min', '1hr', '6hr', '24hr'].map(interval => (
              <button
                key={interval}
                onClick={() => setCheckInterval(interval)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                  checkInterval === interval ? 'bg-ph-indigo/10 text-ph-indigo' : 'bg-white/[0.04] text-ph-muted hover:text-[#fafafa]'
                }`}
              >
                {interval}
              </button>
            ))}
          </div>
        </div>
        <ToggleRow label="Auto-update Critical" description="Automatically install critical security updates" checked={autoUpdateCritical} onChange={setAutoUpdateCritical} />
      </SettingGroup>

      {/* Music */}
      <SettingGroup title="Music" icon={Music}>
        <div>
          <label className="text-[11px] text-ph-muted mb-1.5 block">Audio Quality</label>
          <div className="flex gap-2">
            {['Auto', 'High', 'Medium', 'Low'].map(q => (
              <button
                key={q}
                onClick={() => setAudioQuality(q.toLowerCase())}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                  audioQuality === q.toLowerCase() ? 'bg-ph-indigo/10 text-ph-indigo' : 'bg-white/[0.04] text-ph-muted hover:text-[#fafafa]'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <ToggleRow label="Crossfade" description="Smoothly transition between tracks" checked={crossfade} onChange={setCrossfade} />
        {crossfade && (
          <div className="pl-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-ph-muted">Duration</span>
              <span className="text-[11px] text-ph-indigo">{crossfadeDuration[0]}s</span>
            </div>
            <Slider value={crossfadeDuration} onValueChange={setCrossfadeDuration} min={1} max={12} step={1} />
          </div>
        )}
        <ToggleRow label="Normalize Volume" description="Keep consistent volume across tracks" checked={normalizeVolume} onChange={setNormalizeVolume} />
      </SettingGroup>

      {/* VPN */}
      <SettingGroup title="VPN" icon={Shield}>
        <div>
          <label className="text-[11px] text-ph-muted mb-1.5 block">Default Protocol</label>
          <div className="flex gap-2">
            {['WireGuard', 'OpenVPN'].map(p => (
              <button
                key={p}
                onClick={() => setDefaultProtocol(p)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                  defaultProtocol === p ? 'bg-ph-indigo/10 text-ph-indigo' : 'bg-white/[0.04] text-ph-muted hover:text-[#fafafa]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <ToggleRow label="Kill Switch" description="Block internet if VPN disconnects" checked={killSwitch} onChange={setKillSwitch} />
        <ToggleRow label="Auto-connect on Launch" description="Connect to VPN when app starts" checked={autoConnect} onChange={setAutoConnect} />
      </SettingGroup>

      {/* Appearance */}
      <SettingGroup title="Appearance" icon={Palette}>
        <div>
          <label className="text-[11px] text-ph-muted mb-2 block">Accent Color</label>
          <div className="flex gap-2">
            {accentColors.map(c => (
              <button
                key={c.id}
                onClick={() => setAccentColor(c.id)}
                className={`w-7 h-7 rounded-full transition-all ${
                  accentColor === c.id ? 'ring-2 ring-white ring-offset-2 ring-offset-[#27272a] scale-110' : 'hover:scale-105'
                }`}
                style={{ backgroundColor: c.color }}
                title={c.label}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] text-[#d4d4d8]">Glass Panel Opacity</span>
            <span className="text-[12px] text-ph-indigo">{glassOpacity[0]}%</span>
          </div>
          <Slider value={glassOpacity} onValueChange={setGlassOpacity} min={20} max={100} step={5} />
        </div>

        <ToggleRow label="Dark Mode" checked={darkMode} onChange={setDarkMode} />
        <ToggleRow label="Reduced Motion" description="Disable animations for better performance" checked={reduceMotion} onChange={setReduceMotion} />
        <ToggleRow label="Notifications" description="Show notifications for events and updates" checked={notifications} onChange={setNotifications} />
      </SettingGroup>

      {/* About */}
      <SettingGroup title="About" icon={Info}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[12px] text-[#d4d4d8]">ProHub</div>
            <div className="text-[10px] text-[#71717a]">Version 2.4.1 • Build 20240610</div>
          </div>
          <span className="px-3 py-1.5 rounded-lg bg-ph-warning/10 text-ph-warning text-[11px] font-medium">
            Updates not configured
          </span>
        </div>
        <div className="pt-2 border-t border-white/[0.06] grid grid-cols-3 gap-2">
          {['Documentation', 'Report Issue', 'Changelog'].map(item => (
            <div key={item} className="rounded-lg bg-white/[0.03] px-3 py-2">
              <div className="text-[11px] text-[#d4d4d8]">{item}</div>
              <div className="text-[10px] text-[#71717a]">Not configured</div>
            </div>
          ))}
        </div>
      </SettingGroup>

      {/* Save Button */}
      <div className="flex justify-end">
        <motion.button
          onClick={saveSettings}
          whileTap={{ scale: 0.97 }}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[13px] font-semibold transition-all ${
            saved
              ? 'bg-ph-success text-white'
              : 'bg-ph-indigo hover:bg-ph-indigo/90 text-white'
          }`}
        >
          {saved ? <Check size={15} /> : <Save size={15} />}
          {saved ? 'Saved!' : 'Save Settings'}
        </motion.button>
      </div>
    </div>
  );
}
