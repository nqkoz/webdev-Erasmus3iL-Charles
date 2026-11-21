const express = require('express');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const authService = require('../services/authService');
const { GoogleOAuthError, createGoogleOAuthClient } = require('../services/googleOAuthClient');
const { loginPage } = require('../views/loginPage');
const { myBookingsPage } = require('../views/myBookingsPage');

const sessionCookieName = 'lab_session';
const sessionCookieMaxAgeSeconds = 7 * 24 * 60 * 60;
const googleStateCookieName = 'google_oauth_state';
const googleVerifierCookieName = 'google_oauth_verifier';
const googleCookieMaxAgeSeconds = 10 * 60;

function sessionToken(request) {
  const cookie = request.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)lab_session=([a-f0-9]{64})(?:;|$)/i);
  return match?.[1] ?? null;
}

function requireUser(database, { api = false } = {}) {
  return async (request, response, next) => {
    const token = sessionToken(request);
    const user = token ? await authService.getUserForSession(database, token) : null;
    if (!user) {
      if (api) return response.status(401).json({ error: 'Sign in first.' });
      return response.redirect(302, '/login');
    }
    request.user = user;
    request.sessionToken = token;
    return next();
  };
}

function cookieOptions(isProduction) {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${sessionCookieMaxAgeSeconds}${isProduction ? '; Secure' : ''}`;
}

function clearCookieOptions(isProduction) {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProduction ? '; Secure' : ''}`;
}

function createAuthRouter(database, {
  isProduction = process.env.NODE_ENV === 'production',
  googleClient = createGoogleOAuthClient(),
} = {}) {
  const router = express.Router();

  router.get('/login', (request, response) => {
    response.type('html').send(loginPage({
      showError: request.query.error === 'credentials',
      showGoogleError: request.query.error === 'google',
      showGoogleUnavailable: request.query.error === 'google-unavailable',
      googleConfigured: googleClient.isConfigured(),
    }));
  });

  router.post('/login', async (request, response, next) => {
    try {
      const user = await authService.authenticate(database, request.body.email, request.body.password);
      if (!user) return response.redirect(303, '/login?error=credentials');

      const session = await authService.createSession(database, user.id);
      response.setHeader('Set-Cookie', `${sessionCookieName}=${session.token}; ${cookieOptions(isProduction)}`);
      return response.redirect(303, user.role === 'staff' ? '/staff' : '/my-bookings');
    } catch (error) {
      return next(error);
    }
  });

  router.get('/auth/google', (request, response, next) => {
    try {
      if (!googleClient.isConfigured()) {
        return response.redirect(303, '/login?error=google-unavailable');
      }
      const state = randomBytes(32).toString('hex');
      const codeVerifier = randomBytes(32).toString('base64url');
      const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
      const redirectUri = googleClient.getRedirectUri();
      const authorizationUrl = googleClient.getAuthorizationUrl({ state, codeChallenge, redirectUri });
      if (typeof authorizationUrl !== 'string' || !authorizationUrl.startsWith('https://')) {
        throw new GoogleOAuthError('Google sign-in is not configured correctly.');
      }
      const cookieAttributes = `Path=/auth/google; HttpOnly; SameSite=Lax; Max-Age=${googleCookieMaxAgeSeconds}${isProduction ? '; Secure' : ''}`;
      response.append('Set-Cookie', `${googleStateCookieName}=${state}; ${cookieAttributes}`);
      response.append('Set-Cookie', `${googleVerifierCookieName}=${codeVerifier}; ${cookieAttributes}`);
      return response.redirect(302, authorizationUrl);
    } catch (error) {
      if (error instanceof GoogleOAuthError) {
        return response.redirect(303, '/login?error=google-unavailable');
      }
      return next(error);
    }
  });

  router.get('/auth/google/callback', async (request, response, next) => {
    clearGoogleCookies(response, isProduction);
    const stateCookie = requestCookie(request, googleStateCookieName);
    const codeVerifier = requestCookie(request, googleVerifierCookieName);
    const state = request.query.state;
    if (!isMatchingState(state, stateCookie) || !isValidCodeVerifier(codeVerifier)) {
      return response.redirect(303, '/login?error=google');
    }
    if (request.query.error !== undefined || typeof request.query.code !== 'string') {
      return response.redirect(303, '/login?error=google');
    }

    try {
      const redirectUri = googleClient.getRedirectUri();
      const tokens = await googleClient.exchangeCode({
        code: request.query.code,
        codeVerifier,
        redirectUri,
      });
      const profile = await googleClient.getProfile({ accessToken: tokens.accessToken });
      const user = await authService.authenticateGoogle(database, profile);
      const session = await authService.createSession(database, user.id);
      response.append('Set-Cookie', `${sessionCookieName}=${session.token}; ${cookieOptions(isProduction)}`);
      return response.redirect(303, user.role === 'staff' ? '/staff' : '/my-bookings');
    } catch (error) {
      if (error instanceof GoogleOAuthError || error instanceof authService.GoogleAccountError) {
        return response.redirect(303, '/login?error=google');
      }
      return next(error);
    }
  });

  router.post('/logout', requireUser(database), async (request, response, next) => {
    try {
      await authService.revokeSession(database, request.sessionToken);
      response.setHeader('Set-Cookie', `${sessionCookieName}=; ${clearCookieOptions(isProduction)}`);
      return response.redirect(303, '/login');
    } catch (error) {
      return next(error);
    }
  });

  router.get('/my-bookings', requireUser(database), (request, response) => {
    response.type('html').send(myBookingsPage());
  });

  return router;
}

function requestCookie(request, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = (request.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${escapedName}=([A-Za-z0-9_-]+)(?:;|$)`));
  return match?.[1] ?? null;
}

function isMatchingState(state, stateCookie) {
  if (typeof state !== 'string' || !/^[a-f0-9]{64}$/i.test(state)
    || typeof stateCookie !== 'string' || !/^[a-f0-9]{64}$/i.test(stateCookie)) return false;
  return timingSafeEqual(Buffer.from(state), Buffer.from(stateCookie));
}

function isValidCodeVerifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

function clearGoogleCookies(response, isProduction) {
  const attributes = `Path=/auth/google; HttpOnly; SameSite=Lax; Max-Age=0${isProduction ? '; Secure' : ''}`;
  response.append('Set-Cookie', `${googleStateCookieName}=; ${attributes}`);
  response.append('Set-Cookie', `${googleVerifierCookieName}=; ${attributes}`);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

module.exports = { createAuthRouter, requireUser };
