import { badRequest, unavailable } from '../lib/errors.js';
import { formatBytes } from '../lib/format.js';

const githubHeaders = (token) => ({
  accept: 'application/vnd.github+json',
  'user-agent': 'ProHub',
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

async function fetchGithub(url, token) {
  const response = await fetch(url, { headers: githubHeaders(token) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `GitHub request failed with ${response.status}`);
  return payload;
}

async function fetchGithubRepos(state) {
  const token = state.settings?.apiKeys?.find((key) => key.id === 'github')?.value;
  const trackedRepos = state.settings?.apps?.trackedRepos || [];
  const files = [];
  const errors = [];

  if (token) {
    try {
      const repos = await fetchGithub('https://api.github.com/user/repos?per_page=20&sort=updated', token);
      files.push(...repos.map((repo) => ({
        name: repo.full_name,
        type: 'code',
        size: formatBytes((repo.size || 0) * 1024),
        url: repo.html_url,
      })));
      return { configured: true, connected: true, files, errors };
    } catch (error) {
      errors.push(error.message);
    }
  }

  for (const slug of trackedRepos) {
    try {
      const repo = await fetchGithub(`https://api.github.com/repos/${slug}`, token);
      files.push({
        name: repo.full_name,
        type: 'code',
        size: formatBytes((repo.size || 0) * 1024),
        url: repo.html_url,
      });
    } catch (error) {
      errors.push(`${slug}: ${error.message}`);
    }
  }

  return {
    configured: Boolean(token),
    connected: files.length > 0,
    files,
    errors,
  };
}

export async function getCloud(store) {
  const state = await store.read();
  const github = await fetchGithubRepos(state);
  const gdriveKey = state.settings?.apiKeys?.find((key) => key.id === 'gdrive')?.value;

  return {
    providers: [
      {
        id: 'gdrive',
        name: 'Google Drive',
        color: '#3b82f6',
        connected: false,
        configured: Boolean(gdriveKey),
        status: gdriveKey ? 'oauth_required' : 'not_configured',
        used: 0,
        total: 0,
        syncing: 0,
        files: [],
        fileCount: 0,
        transferStatus: 'idle',
        message: gdriveKey ? 'Google Drive OAuth is required before files can be listed.' : 'Google Drive is not configured.',
      },
      {
        id: 'github',
        name: 'GitHub Repos',
        color: '#a1a1aa',
        connected: github.connected,
        configured: github.configured,
        status: github.connected ? 'live' : 'not_configured',
        used: 0,
        total: 0,
        syncing: 0,
        files: github.files,
        fileCount: github.files.length,
        transferStatus: 'idle',
        message: github.errors.length
          ? github.errors.join('; ')
          : github.connected
            ? 'Loaded repository list from GitHub API.'
            : 'Configure a GitHub token or tracked repositories to browse repos.',
      },
      {
        id: 'mega',
        name: 'Mega',
        color: '#ef4444',
        connected: false,
        configured: false,
        status: 'not_configured',
        used: 0,
        total: 0,
        syncing: 0,
        files: [],
        fileCount: 0,
        transferStatus: 'idle',
        message: 'Mega provider is not configured.',
      },
    ],
    syncQueue: [],
  };
}

export async function cloudProviderAction(store, providerId, action, body = {}) {
  const cloud = await getCloud(store);
  const provider = cloud.providers.find((item) => item.id === providerId);
  if (!provider) throw badRequest(`Unknown cloud provider: ${providerId}`);

  if (action === 'refresh' || action === 'browse') {
    return { provider, files: provider.files, message: provider.message };
  }

  if (action === 'open') {
    if (provider.id === 'github') return { url: 'https://github.com', message: 'Open GitHub in browser.' };
    throw unavailable(`${provider.name} cannot be opened because it is not configured.`);
  }

  if (action === 'connect') {
    throw unavailable(`${provider.name} connection requires provider-specific credentials or OAuth setup.`);
  }

  if (action === 'upload') {
    throw unavailable(`${provider.name} upload is not available until authentication is configured.`);
  }

  if (action === 'download') {
    if (!body.url) throw badRequest('A direct file URL is required for cloud download.');
    return { url: body.url, message: 'Use Downloads to add this direct file URL.' };
  }

  throw badRequest(`Unsupported cloud action: ${action}`);
}
