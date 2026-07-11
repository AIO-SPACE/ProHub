import { getCachedApps } from './appsService.js';
import { downloadHealth, listDownloads } from './downloads/downloadService.js';
import { getVpnStatus } from './vpnService.js';

export async function getDashboard(store) {
  const state = await store.read();
  const downloads = await listDownloads(store);
  const health = await downloadHealth(store);
  const vpn = await getVpnStatus(store);
  const apps = getCachedApps(state);

  const cloudProviders = state.cloud?.providers || [];
  const configuredCloud = cloudProviders.filter((provider) => provider.configured).length;
  const downloadStats = downloads.stats;
  const appCount = apps.repos.length;

  return {
    modules: [
      {
        id: 'cloud',
        label: 'Cloud Hub',
        status: configuredCloud ? 'Configured' : 'Needs Setup',
        statusColor: configuredCloud ? '#22c55e' : '#eab308',
        progress: configuredCloud ? 50 : 5,
        stats: [`${configuredCloud} Configured`, '0 Syncing', 'Live providers only'],
      },
      {
        id: 'downloads',
        label: 'Downloads',
        status: health.engine.available ? 'Engine Ready' : 'Engine Missing',
        statusColor: health.engine.available ? '#22c55e' : '#ef4444',
        progress: downloadStats.total ? Math.min(100, downloadStats.completed * 20) : 0,
        stats: [`${downloadStats.active} Active`, `${downloadStats.queued || 0} Queued`, `${downloadStats.completed} Done`],
      },
      {
        id: 'apps',
        label: 'App Tracker',
        status: appCount ? 'Live GitHub' : 'No Data',
        statusColor: appCount ? '#22c55e' : '#eab308',
        progress: appCount ? 80 : 0,
        stats: [`${appCount} Watched`, `${apps.errors?.length || 0} Errors`, 'GitHub API'],
      },
      {
        id: 'music',
        label: 'Music',
        status: 'No Provider',
        statusColor: '#eab308',
        progress: 0,
        stats: ['No live source', '0 Tracks', '0 Playlists'],
        isHero: true,
      },
      {
        id: 'vpn',
        label: 'VPN',
        status: vpn.status === 'unavailable' ? 'Unavailable' : 'Disconnected',
        statusColor: '#eab308',
        progress: 0,
        stats: ['Manual setup', '0 Servers', 'No tunnel'],
      },
      {
        id: 'settings',
        label: 'Settings',
        status: 'Ready',
        statusColor: '#a1a1aa',
        progress: 100,
        stats: ['Providers', 'Secrets backend', `v${state.meta.version}`],
      },
    ],
    activities: state.activities || [],
    quickStats: [
      { label: 'Download Engine', value: health.engine.available ? 'Ready' : 'Missing', sub: 'aria2', color: health.engine.available ? '#10b981' : '#ef4444' },
      { label: 'Current Speed', value: downloadStats.currentSpeed || '0 B/s', sub: 'live', color: '#10b981' },
      { label: 'Apps Tracked', value: String(appCount), sub: 'repositories', color: '#f59e0b' },
      { label: 'VPN', value: 'Manual', sub: 'required', color: '#8b5cf6' },
    ],
    miniPlayer: { track: null, isPlaying: false, progress: 0 },
  };
}
