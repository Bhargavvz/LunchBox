import createClient, { type Middleware } from 'openapi-fetch';
import { ApiError, NetworkError } from './errors';
import type { paths } from './generated/schema';

export interface ClientOptions {
  /** e.g. https://api.lunchbox.in */
  baseUrl: string;
  /** Returns a fresh Firebase ID token, or null when signed out. */
  getToken: () => Promise<string | null>;
  /** Called on 401 so the app can sign the user out. */
  onUnauthorized?: () => void;
  /** "en" | "hi" — sent as Accept-Language. */
  getLanguage?: () => string;
  fetch?: typeof fetch;
}

let counter = 0;
function requestId(): string {
  counter = (counter + 1) % 1_000_000;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${counter}`;
}

export function createRawClient(options: ClientOptions) {
  const client = createClient<paths>({ baseUrl: options.baseUrl, fetch: options.fetch });
  const auth: Middleware = {
    async onRequest({ request }) {
      const token = await options.getToken();
      if (token) request.headers.set('Authorization', `Bearer ${token}`);
      request.headers.set('X-Request-Id', requestId());
      const lang = options.getLanguage?.();
      if (lang) request.headers.set('Accept-Language', lang);
      return request;
    },
    async onResponse({ response }) {
      if (response.status === 401) options.onUnauthorized?.();
      return response;
    },
  };
  client.use(auth);
  return client;
}

export type RawClient = ReturnType<typeof createRawClient>;

/** Turns an openapi-fetch result into data-or-throw with a typed {@link ApiError}. */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await call;
  } catch (e) {
    throw new NetworkError(e);
  }
  if (!result.response.ok) {
    throw await ApiError.fromResponse(result.response, result.error);
  }
  return result.data as T;
}

/** Random, URL-safe Idempotency-Key for POSTs that create money or orders. */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
