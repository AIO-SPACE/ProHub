import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { HttpError } from './errors.js';
import { logger } from './logger.js';

const MAX_BODY_BYTES = 1024 * 1024;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export const sendJson = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
};

export const sendNoContent = (res) => {
  res.writeHead(204);
  res.end();
};

export const readJsonBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) {
      reject(new HttpError(413, 'Request body is too large'));
      req.destroy();
    }
  });
  req.on('end', () => {
    if (!body.trim()) {
      resolve({});
      return;
    }
    try {
      resolve(JSON.parse(body));
    } catch {
      reject(new HttpError(400, 'Request body must be valid JSON'));
    }
  });
  req.on('error', reject);
});

export const handleError = (res, error, context = {}) => {
  const status = error.statusCode || 500;
  const timestamp = new Date().toISOString();
  const module = context.url?.split('/')?.[2] || 'server';
  const operation = `${context.method || 'REQUEST'} ${context.url || ''}`.trim();
  const logContext = { ...context, module, operation, timestamp };
  if (status >= 500 && !(error instanceof HttpError)) logger.error(error.message || 'Internal server error', { ...logContext, stack: error.stack });
  else logger.warn(error.message, logContext);

  sendJson(res, status, {
    error: error.message || 'Internal server error',
    details: error.details,
    module,
    operation,
    timestamp,
    status,
  });
};

export async function serveStatic(req, res, staticRoot) {
  if (!staticRoot) return false;

  const requestUrl = new URL(req.url, 'http://localhost');
  const rawPath = decodeURIComponent(requestUrl.pathname);
  const normalizedPath = normalize(rawPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(staticRoot, normalizedPath === '/' ? 'index.html' : normalizedPath);

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    filePath = join(staticRoot, 'index.html');
  }

  try {
    await stat(filePath);
    res.writeHead(200, { 'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}
