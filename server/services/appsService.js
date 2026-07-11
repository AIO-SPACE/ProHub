import { badRequest } from '../lib/errors.js';
import { relativeTime } from '../lib/format.js';

const githubHeaders = (token) => ({
  accept: 'application/vnd.github+json',
  'user-agent': 'ProHub',
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

async function fetchJson(url, token) {
  const response = await fetch(url, { headers: githubHeaders(token) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `GitHub request failed with ${response.status}`);
  }
  return payload;
}

function parseRepoSlug(slug) {
  const [owner, name] = String(slug || '').split('/');
  if (!owner || !name) throw badRequest(`Invalid GitHub repository: ${slug}`);
  return { owner, name };
}

async function loadRepo(slug, token) {
  const { owner, name } = parseRepoSlug(slug);
  const repo = await fetchJson(`https://api.github.com/repos/${owner}/${name}`, token);
  let latestRelease = null;
  try {
    latestRelease = await fetchJson(`https://api.github.com/repos/${owner}/${name}/releases/latest`, token);
  } catch {
    latestRelease = null;
  }

  return {
    id: repo.full_name,
    owner: repo.owner.login,
    name: repo.name,
    description: repo.description || '',
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    currentVersion: latestRelease?.tag_name || repo.default_branch,
    latestVersion: latestRelease?.tag_name || repo.default_branch,
    hasUpdate: false,
    isCritical: false,
    lastChecked: 'just now',
    checkedAt: new Date().toISOString(),
    autoCheck: true,
    language: repo.language || 'Unspecified',
    languageColor: '#a1a1aa',
    url: repo.html_url,
    releaseUrl: latestRelease?.html_url || null,
    releaseAssets: (latestRelease?.assets || []).map((asset) => ({
      id: asset.id,
      name: asset.name,
      size: asset.size,
      downloadCount: asset.download_count,
      contentType: asset.content_type,
      browserDownloadUrl: asset.browser_download_url,
    })),
  };
}

export async function getApps(store) {
  const state = await store.read();
  const token = state.settings?.apiKeys?.find((key) => key.id === 'github')?.value;
  const trackedRepos = state.settings?.apps?.trackedRepos || [];
  const repos = [];
  const errors = [];

  for (const slug of trackedRepos) {
    try {
      repos.push(await loadRepo(slug, token));
    } catch (error) {
      errors.push({ repo: slug, error: error.message });
    }
  }

  await store.update((current) => {
    current.apps.repos = repos;
    current.apps.lastError = errors.length ? errors : null;
  });

  return {
    provider: {
      id: 'github',
      configured: Boolean(token),
      source: 'GitHub REST API',
      note: token ? 'Using backend GitHub token.' : 'Using public GitHub API; rate limits may apply.',
    },
    repos,
    updateHistory: state.apps?.updateHistory || [],
    errors,
  };
}

export async function checkApps(store) {
  return getApps(store);
}

export async function updateRepoSetting(store, repoId, body) {
  await store.update((state) => {
    const trackedRepos = new Set(state.settings.apps.trackedRepos || []);
    if (body.track === false) trackedRepos.delete(repoId);
    if (body.track === true) trackedRepos.add(repoId);
    state.settings.apps.trackedRepos = [...trackedRepos];
  });
  return getApps(store);
}

export async function getRepoReleases(store, slug) {
  const state = await store.read();
  const token = state.settings?.apiKeys?.find((key) => key.id === 'github')?.value;
  const { owner, name } = parseRepoSlug(slug);
  return {
    repo: `${owner}/${name}`,
    releases: await fetchJson(`https://api.github.com/repos/${owner}/${name}/releases?per_page=20`, token),
  };
}

export function getCachedApps(state) {
  const repos = state.apps?.repos || [];
  return {
    repos: repos.map((repo) => ({
      ...repo,
      lastChecked: repo.checkedAt ? relativeTime(repo.checkedAt) : repo.lastChecked,
    })),
    errors: state.apps?.lastError || [],
  };
}
