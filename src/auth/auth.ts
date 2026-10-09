import { MSF_CONFIG, redirectUri } from '../config';
import { codeChallenge, randomString } from './pkce';
import { readJson, writeJson } from './storage';

/**
 * OAuth2 Authorization Code + PKCE against Scopely's auth server.
 *
 * Refresh tokens are single-use and reusing one can revoke the whole chain, so refreshes
 * are de-duplicated and sent through the API's /util/v1/gatedRefresh, which answers 473
 * (instead of revoking) while another tab is already using the same refresh token.
 */

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

export interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
}

interface PendingLogin {
  verifier: string;
  state: string;
}

const TOKENS_KEY = 'msf.auth.tokens';
const PENDING_KEY = 'msf.auth.pending';
const EXPIRY_SKEW_MS = 60_000;
const GATED_RETRY_MS = 3_000;

const listeners = new Set<() => void>();
let tokens: StoredTokens | null = readJson(localStorage, TOKENS_KEY);
let refreshInFlight: Promise<string | null> | null = null;

window.addEventListener('storage', (event) => {
  if (event.key === TOKENS_KEY) {
    tokens = readJson(localStorage, TOKENS_KEY);
    listeners.forEach((l) => l());
  }
});

export function onAuthChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isLoggedIn(): boolean {
  return tokens !== null;
}

function setTokens(next: StoredTokens | null): void {
  tokens = next;
  writeJson(localStorage, TOKENS_KEY, next);
  listeners.forEach((l) => l());
}

function storeTokens(response: TokenResponse, previousRefresh?: string): void {
  setTokens({
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? previousRefresh,
    expiresAt: Date.now() + response.expires_in * 1000,
    scope: response.scope,
  });
}

function form(fields: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  };
}

/** Sends the browser to the Scopely login and consent page. */
export async function login(): Promise<void> {
  const pending: PendingLogin = { verifier: randomString(64), state: randomString(32) };
  writeJson(sessionStorage, PENDING_KEY, pending);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: MSF_CONFIG.clientId,
    redirect_uri: redirectUri(),
    scope: MSF_CONFIG.scopes.join(' '),
    state: pending.state,
    code_challenge: await codeChallenge(pending.verifier),
    code_challenge_method: 'S256',
  });
  window.location.assign(`${MSF_CONFIG.authorizeUrl}?${params}`);
}

/** Exchanges the code from the redirect back for tokens. */
export async function completeLogin(params: URLSearchParams): Promise<void> {
  const error = params.get('error');
  if (error) throw new Error(params.get('error_description') || error);

  const pending = readJson<PendingLogin>(sessionStorage, PENDING_KEY);
  writeJson(sessionStorage, PENDING_KEY, null);
  const code = params.get('code');
  if (!pending || !code || params.get('state') !== pending.state) {
    throw new Error('This login link is stale. Please log in again.');
  }

  const res = await fetch(
    MSF_CONFIG.tokenUrl,
    form({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: MSF_CONFIG.clientId,
      code_verifier: pending.verifier,
    }),
  );
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  storeTokens((await res.json()) as TokenResponse);
}

export function logout(): void {
  setTokens(null);
}

/** A valid access token, refreshed first if needed; null when logged out. */
export async function accessToken(): Promise<string | null> {
  if (!tokens) return null;
  if (tokens.expiresAt - EXPIRY_SKEW_MS > Date.now()) return tokens.accessToken;
  if (!tokens.refreshToken) {
    setTokens(null);
    return null;
  }
  refreshInFlight ??= refresh(tokens.refreshToken).finally(() => (refreshInFlight = null));
  return refreshInFlight;
}

async function refresh(refreshToken: string): Promise<string | null> {
  const res = await fetch(
    `${MSF_CONFIG.apiBaseUrl}/util/v1/gatedRefresh`,
    {
      ...form({
        grant_type: 'refresh_token',
        client_id: MSF_CONFIG.clientId,
        redirect_uri: redirectUri(),
        refresh_token: refreshToken,
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-api-key': MSF_CONFIG.apiKey,
      },
    },
  );
  if (res.ok) {
    const body = (await res.json()) as TokenResponse;
    storeTokens(body, refreshToken);
    return body.access_token;
  }
  if (res.status === 473) {
    // Another tab is refreshing; it should store the rotated tokens shortly.
    await new Promise((r) => setTimeout(r, GATED_RETRY_MS));
    const latest = readJson<StoredTokens>(localStorage, TOKENS_KEY);
    if (latest && latest.refreshToken !== refreshToken) {
      tokens = latest;
      return latest.accessToken;
    }
  }
  setTokens(null);
  return null;
}
