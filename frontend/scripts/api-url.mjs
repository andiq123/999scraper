import { join } from 'node:path';

export function angularCli() {
  return join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'ng.cmd' : 'ng');
}

export function apiUrl() {
  const configured = process.env.API_URL?.trim();
  if (process.env.VERCEL === '1' && !configured) {
    throw new Error(
      'API_URL is required on Vercel. Set it to your public HTTPS backend, for example https://api.example.com/api/',
    );
  }
  const value = configured ?? '/api/';
  if (value.startsWith('/')) return value.endsWith('/') ? value : `${value}/`;

  const parsed = new URL(value);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('API_URL must not contain credentials, a query, or a fragment.');
  }
  if (process.env.VERCEL === '1' && parsed.protocol !== 'https:') {
    throw new Error('API_URL must use HTTPS for a Vercel deployment.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('API_URL must use HTTP or HTTPS.');
  if (parsed.pathname === '/') parsed.pathname = '/api/';
  else if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
  return parsed.toString();
}

export function vinSearchEngineId() {
  const value = process.env.VIN_SEARCH_ENGINE_ID?.trim() ?? '';
  if (value && !/^[a-z0-9:_-]+$/i.test(value)) {
    throw new Error('VIN_SEARCH_ENGINE_ID contains unsupported characters.');
  }
  return value;
}

export function angularDefines() {
  return [
    '--define',
    `__API_URL__=${JSON.stringify(apiUrl())}`,
    '--define',
    `__VIN_SEARCH_ENGINE_ID__=${JSON.stringify(vinSearchEngineId())}`,
  ];
}
