/**
 * Base API client.
 *
 * IMPORTANT ARCHITECTURE NOTE:
 * The frontend never talks to PostgreSQL directly and never holds DB
 * credentials. Every function in `src/api/*` is expected to eventually
 * call this client, which hits `VITE_API_BASE_URL` (a backend that owns
 * the actual database connection). Until that backend exists, each
 * `*Api.ts` file falls back to the mock generators in `src/mocks`.
 */
import type { ApiResponse } from '../types';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

/** Set to true once a real backend is deployed and reachable at API_BASE_URL. */
export const USE_MOCK_DATA = API_BASE_URL === '';

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | null | undefined>;
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const url = new URL(path.replace(/^\//, ''), API_BASE_URL || window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
}

/**
 * Thin fetch wrapper. Not called anywhere yet (USE_MOCK_DATA short-circuits
 * every api/*.ts function first), but kept ready so swapping to the real
 * backend is a one-line change per function.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  try {
    const { params, ...init } = options;
    const response = await fetch(buildUrl(path, params), {
      headers: { 'Content-Type': 'application/json', ...init.headers },
      ...init,
    });

    if (!response.ok) {
      return { success: false, error: `Request failed with status ${response.status}` };
    }

    const data = (await response.json()) as T;
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

export async function apiUpload<T>(
  path: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<ApiResponse<T>> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', buildUrl(path));

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText) as T;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ success: true, data });
        } else {
          resolve({ success: false, error: `Upload failed with status ${xhr.status}` });
        }
      } catch {
        resolve({ success: false, error: 'Invalid response from server' });
      }
    };

    xhr.onerror = () => resolve({ success: false, error: 'Network error during upload' });

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}

/** Small helper to simulate network latency for mock responses. */
export function mockDelay<T>(value: T, ms = 500): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
