// Single source of truth for the backend base URL.
// Every request in the app must be built with apiUrl() so that production
// never silently falls back to localhost.

const PRODUCTION_API_URL = ''; // Cloudflare serves the frontend and /api/* from the same origin.
const DEVELOPMENT_API_URL = 'http://localhost:5000';

function normalizeBaseUrl(raw: string | undefined): string | null {
  const value = (raw || '').trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // Keep origin + optional path prefix, drop trailing slashes.
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function resolveApiBase(): string {
  const fromEnv = normalizeBaseUrl(import.meta.env.VITE_API_URL);
  if (fromEnv) return fromEnv;

  if (import.meta.env.VITE_API_URL) {
    console.error(
      `[config] VITE_API_URL is set but is not a valid http(s) URL: "${import.meta.env.VITE_API_URL}"`
    );
  }

  // Local development uses the standalone Node backend. On Cloudflare, an empty
  // production base URL makes API requests same-origin (e.g. /api/health).
  return import.meta.env.DEV ? DEVELOPMENT_API_URL : PRODUCTION_API_URL;
}

export const API_BASE = resolveApiBase();

/** Build an absolute backend URL, e.g. apiUrl('/api/auth/me'). */
export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}
