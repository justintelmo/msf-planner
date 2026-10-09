/**
 * MSF API settings. The client ID and API key come from the MSF developer portal and are
 * read from .env.local (see .env.example) so they stay out of the repository.
 */
export const MSF_CONFIG = {
  apiBaseUrl: 'https://api.marvelstrikeforce.com',
  apiKey: import.meta.env.VITE_MSF_API_KEY ?? '',
  clientId: import.meta.env.VITE_MSF_CLIENT_ID ?? '',
  authorizeUrl: 'https://hydra-public.prod.m3.scopelypv.com/oauth2/auth',
  tokenUrl: 'https://hydra-public.prod.m3.scopelypv.com/oauth2/token',
  /** Must match the "OAuth2 Redirect" registered in the developer portal. */
  redirectPath: '/callback',
  scopes: [
    'm3p.f.pr.pro', // profile
    'm3p.f.pr.ros', // roster
    'm3p.f.pr.inv', // inventory
    'm3p.f.pr.act', // events / activities
    'm3p.f.ar.pro',
    'openid',
    'offline',
  ],
};

export function redirectUri(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${window.location.origin}${base}${MSF_CONFIG.redirectPath}`;
}
