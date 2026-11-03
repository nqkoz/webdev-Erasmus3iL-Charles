const authorizationEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const profileEndpoint = 'https://openidconnect.googleapis.com/v1/userinfo';
const requestTimeoutMs = 8000;

class GoogleOAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GoogleOAuthError';
  }
}

function createGoogleOAuthClient({
  clientId = process.env.GOOGLE_CLIENT_ID,
  clientSecret = process.env.GOOGLE_CLIENT_SECRET,
  publicBaseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000',
  fetchImpl = fetch,
} = {}) {
  const isConfigured = () => typeof clientId === 'string' && clientId.length > 0
    && typeof clientSecret === 'string' && clientSecret.length > 0;

  function getRedirectUri() {
    let baseUrl;
    try {
      baseUrl = new URL(publicBaseUrl);
    } catch {
      throw new GoogleOAuthError('Google sign-in is not configured correctly.');
    }
    const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname);
    if (!['http:', 'https:'].includes(baseUrl.protocol)
      || (baseUrl.protocol !== 'https:' && !isLocalHost)
      || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash
      || (baseUrl.pathname !== '/' && baseUrl.pathname !== '')) {
      throw new GoogleOAuthError('Google sign-in is not configured correctly.');
    }
    return new URL('/auth/google/callback', baseUrl).toString();
  }

  function getAuthorizationUrl({ state, codeChallenge, redirectUri }) {
    if (!isConfigured()) throw new GoogleOAuthError('Google sign-in is not configured.');
    const url = new URL(authorizationEndpoint);
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString();
    return url.toString();
  }

  async function exchangeCode({ code, codeVerifier, redirectUri }) {
    if (!isConfigured()) throw new GoogleOAuthError('Google sign-in is not configured.');
    let response;
    try {
      response = await fetchImpl(tokenEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          code_verifier: codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch {
      throw new GoogleOAuthError('Google sign-in could not reach the provider.');
    }
    if (!response.ok) throw new GoogleOAuthError('Google could not complete sign-in.');

    let tokenResponse;
    try {
      tokenResponse = await response.json();
    } catch {
      throw new GoogleOAuthError('Google returned an invalid sign-in response.');
    }
    if (!tokenResponse || typeof tokenResponse.access_token !== 'string' || !tokenResponse.access_token) {
      throw new GoogleOAuthError('Google returned an invalid sign-in response.');
    }
    return { accessToken: tokenResponse.access_token };
  }

  async function getProfile({ accessToken }) {
    let response;
    try {
      response = await fetchImpl(profileEndpoint, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch {
      throw new GoogleOAuthError('Google sign-in could not reach the provider.');
    }
    if (!response.ok) throw new GoogleOAuthError('Google could not verify the sign-in.');

    let profile;
    try {
      profile = await response.json();
    } catch {
      throw new GoogleOAuthError('Google returned an invalid profile.');
    }
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
      throw new GoogleOAuthError('Google returned an invalid profile.');
    }
    return profile;
  }

  return { exchangeCode, getAuthorizationUrl, getProfile, getRedirectUri, isConfigured };
}

module.exports = { GoogleOAuthError, createGoogleOAuthClient };
