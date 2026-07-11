export const toNumber = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

export const formatBytes = (bytes) => {
  const value = toNumber(bytes);
  if (value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

export const formatSpeed = (bytesPerSecond) => `${formatBytes(bytesPerSecond)}/s`;

export const formatEta = (remainingBytes, bytesPerSecond) => {
  const speed = toNumber(bytesPerSecond);
  const remaining = toNumber(remainingBytes);
  if (speed <= 0 || remaining <= 0) return '--';
  const seconds = Math.ceil(remaining / speed);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};

export const relativeTime = (isoDate) => {
  if (!isoDate) return 'unknown';
  const diff = Math.max(0, Date.now() - Date.parse(isoDate));
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};
