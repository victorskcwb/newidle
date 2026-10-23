import { Google, decodeIdToken, generateCodeVerifier, generateState } from 'arctic';
import type { GoogleProvider } from './authRoutes.ts';

/**
 * Google sign-in with Arctic (OAuth 2.0 code flow with PKCE). The ID token comes straight
 * from Google's token endpoint over TLS, so its claims are read without checking the
 * signature again (Arctic's guidance).
 */
export function googleProvider(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): GoogleProvider {
  const google = new Google(clientId, clientSecret, redirectUri);
  return {
    start() {
      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const url = google.createAuthorizationURL(state, codeVerifier, ['openid', 'email']);
      return { url: url.toString(), state, codeVerifier };
    },
    async exchange(code, codeVerifier) {
      const tokens = await google.validateAuthorizationCode(code, codeVerifier);
      const claims = decodeIdToken(tokens.idToken()) as { sub: string; email?: string };
      return { sub: claims.sub, email: claims.email ?? null };
    },
  };
}
