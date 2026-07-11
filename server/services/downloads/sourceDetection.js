const directProtocols = new Set(['http:', 'https:', 'ftp:']);

export function detectDownloadSource(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return { provider: 'unsupported', supported: false, reason: 'URL is required' };

  if (url.startsWith('magnet:')) {
    return { provider: 'aria2', kind: 'magnet', supported: true, normalizedUrl: url };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { provider: 'unsupported', supported: false, reason: 'Invalid URL' };
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.toLowerCase();

  if (hostname.includes('drive.google.com') || hostname === 'docs.google.com') {
    return { provider: 'google-drive', kind: 'google-drive', supported: true, normalizedUrl: url };
  }

  if (hostname.includes('mega.nz') || hostname.includes('mega.co.nz')) {
    return { provider: 'mega', kind: 'mega', supported: false, normalizedUrl: url, reason: 'Mega links require a Mega SDK provider before they can be downloaded safely.' };
  }

  if (hostname === 'github.com' && pathname.includes('/releases/download/')) {
    return { provider: 'github-release', kind: 'github-release-asset', supported: true, normalizedUrl: url };
  }

  if (hostname.includes('mediafire.com') && !pathname.includes('/download')) {
    return { provider: 'mediafile', kind: 'mediafire-page', supported: false, normalizedUrl: url, reason: 'MediaFire page links are not direct file URLs.' };
  }

  if (pathname.endsWith('.torrent')) {
    return { provider: 'aria2', kind: 'torrent', supported: true, normalizedUrl: url };
  }

  if (directProtocols.has(parsed.protocol)) {
    return { provider: 'aria2', kind: 'direct', supported: true, normalizedUrl: url };
  }

  return { provider: 'unsupported', kind: parsed.protocol.replace(':', ''), supported: false, normalizedUrl: url, reason: `Unsupported protocol: ${parsed.protocol}` };
}

export function filenameFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const last = parsed.pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : 'download';
  } catch {
    return String(rawUrl).split('/').filter(Boolean).pop() || 'download';
  }
}

export function fileTypeFromFilename(filename) {
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  if (['iso', 'zip', 'gz', 'tar', 'rar', '7z'].includes(extension)) return extension === 'iso' ? 'iso' : 'archive';
  if (['mp4', 'mov', 'mkv', 'webm'].includes(extension)) return 'video';
  if (['mp3', 'wav', 'flac', 'aac'].includes(extension)) return 'audio';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension)) return 'image';
  if (['exe', 'msi'].includes(extension)) return 'exe';
  if (['pkg', 'deb', 'rpm'].includes(extension)) return 'pkg';
  return 'file';
}

export function googleDriveDirectUrl(rawUrl) {
  const url = new URL(rawUrl);
  const byQuery = url.searchParams.get('id');
  const byPath = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || url.pathname.match(/\/open\/([^/]+)/)?.[1];
  const id = byQuery || byPath;
  if (!id) return null;
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
}
