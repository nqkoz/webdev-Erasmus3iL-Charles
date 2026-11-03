const assert = require('node:assert/strict');
const test = require('node:test');
const { GoogleOAuthError, createGoogleOAuthClient } = require('../src/services/googleOAuthClient');

function response(ok, value) {
  return {
    ok,
    json: async () => {
      if (value instanceof Error) throw value;
      return value;
    },
  };
}

function configuredClient(fetchImpl = async () => response(true, {}), overrides = {}) {
  return createGoogleOAuthClient({
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    publicBaseUrl: 'http://localhost:3000',
    fetchImpl,
    ...overrides,
  });
}

test('Google OAuth client builds an authorization URL and local callback URI', () => {
  const client = configuredClient();
  const redirectUri = client.getRedirectUri();
  const authorizationUrl = new URL(client.getAuthorizationUrl({
    state: 'test-state',
    codeChallenge: 'test-challenge',
    redirectUri,
  }));
  assert.equal(redirectUri, 'http://localhost:3000/auth/google/callback');
  assert.equal(client.isConfigured(), true);
  assert.equal(authorizationUrl.origin, 'https://accounts.google.com');
  assert.equal(authorizationUrl.searchParams.get('client_id'), 'test-client-id');
  assert.equal(authorizationUrl.searchParams.get('redirect_uri'), redirectUri);
  assert.equal(authorizationUrl.searchParams.get('response_type'), 'code');
  assert.equal(authorizationUrl.searchParams.get('scope'), 'openid email');
  assert.equal(authorizationUrl.searchParams.get('state'), 'test-state');
  assert.equal(authorizationUrl.searchParams.get('code_challenge'), 'test-challenge');
  assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256');
});

test('Google OAuth client exchanges codes and fetches the verified profile from Google endpoints', async () => {
  const calls = [];
  const client = configuredClient(async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/token')) return response(true, { access_token: 'provider-token' });
    return response(true, { sub: 'provider-subject', email: 'student@example.test', email_verified: true });
  });

  const tokens = await client.exchangeCode({
    code: 'authorization-code',
    codeVerifier: 'verifier',
    redirectUri: 'http://localhost:3000/auth/google/callback',
  });
  const profile = await client.getProfile(tokens);
  assert.equal(tokens.accessToken, 'provider-token');
  assert.equal(profile.sub, 'provider-subject');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['content-type'], 'application/x-www-form-urlencoded');
  const body = new URLSearchParams(calls[0].options.body);
  assert.equal(body.get('client_secret'), 'test-client-secret');
  assert.equal(body.get('code'), 'authorization-code');
  assert.equal(body.get('code_verifier'), 'verifier');
  assert.equal(calls[1].url, 'https://openidconnect.googleapis.com/v1/userinfo');
  assert.equal(calls[1].options.headers.authorization, 'Bearer provider-token');
});

test('Google OAuth client refuses missing configuration and invalid callback origins', async () => {
  const noClientId = createGoogleOAuthClient({ clientId: '', clientSecret: 'secret' });
  const noClientSecret = createGoogleOAuthClient({ clientId: 'id', clientSecret: '' });
  assert.equal(noClientId.isConfigured(), false);
  assert.equal(noClientSecret.isConfigured(), false);
  assert.throws(() => noClientId.getAuthorizationUrl({}), GoogleOAuthError);
  await assert.rejects(noClientSecret.exchangeCode({}), GoogleOAuthError);

  const invalidOrigins = [
    'not a URL',
    'ftp://example.test',
    'http://example.test',
    'https://user:pass@example.test',
    'https://example.test/?query=1',
    'https://example.test/#fragment',
    'https://example.test/subpath',
  ];
  for (const publicBaseUrl of invalidOrigins) {
    assert.throws(
      () => configuredClient(undefined, { publicBaseUrl }).getRedirectUri(),
      GoogleOAuthError,
      publicBaseUrl,
    );
  }
});

test('Google OAuth client reports token exchange network and response errors', async () => {
  const input = {
    code: 'authorization-code',
    codeVerifier: 'verifier',
    redirectUri: 'http://localhost:3000/auth/google/callback',
  };
  const rejectingClient = configuredClient(async () => { throw new Error('network details'); });
  const failedClient = configuredClient(async () => response(false, {}));
  const invalidJsonClient = configuredClient(async () => response(true, new Error('invalid JSON')));
  const emptyTokenClient = configuredClient(async () => response(true, { access_token: '' }));

  await assert.rejects(rejectingClient.exchangeCode(input), GoogleOAuthError);
  await assert.rejects(failedClient.exchangeCode(input), GoogleOAuthError);
  await assert.rejects(invalidJsonClient.exchangeCode(input), GoogleOAuthError);
  await assert.rejects(emptyTokenClient.exchangeCode(input), GoogleOAuthError);
});

test('Google OAuth client reports profile network and response errors', async () => {
  const rejectingClient = configuredClient(async () => { throw new Error('network details'); });
  const failedClient = configuredClient(async () => response(false, {}));
  const invalidJsonClient = configuredClient(async () => response(true, new Error('invalid JSON')));
  const invalidProfileClient = configuredClient(async () => response(true, []));

  await assert.rejects(rejectingClient.getProfile({ accessToken: 'token' }), GoogleOAuthError);
  await assert.rejects(failedClient.getProfile({ accessToken: 'token' }), GoogleOAuthError);
  await assert.rejects(invalidJsonClient.getProfile({ accessToken: 'token' }), GoogleOAuthError);
  await assert.rejects(invalidProfileClient.getProfile({ accessToken: 'token' }), GoogleOAuthError);
});
