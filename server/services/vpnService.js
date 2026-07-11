import { unavailable } from '../lib/errors.js';

export async function getVpnStatus(store) {
  const state = await store.read();
  return {
    status: 'unavailable',
    connected: false,
    activeServerId: null,
    activeServer: null,
    publicIp: null,
    connectedAt: null,
    uptime: { days: 0, hours: 0, mins: 0 },
    dataTransferred: { up: '0 B', down: '0 B' },
    servers: [],
    settings: state.settings?.vpn,
    message: 'Real VPN integration is not configured. Manual setup is required.',
  };
}

export async function rejectVpnAction() {
  throw unavailable('VPN control is unavailable because no real VPN provider is configured.');
}
