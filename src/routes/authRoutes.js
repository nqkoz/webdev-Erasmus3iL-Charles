const express = require('express');
const authService = require('../services/authService');
const { loginPage } = require('../views/loginPage');
const { myBookingsPage } = require('../views/myBookingsPage');

const sessionCookieName = 'lab_session';
const sessionCookieMaxAgeSeconds = 7 * 24 * 60 * 60;

function sessionToken(request) {
  const cookie = request.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)lab_session=([a-f0-9]{64})(?:;|$)/i);
  return match?.[1] ?? null;
}

function requireUser(database, { api = false } = {}) {
  return (request, response, next) => {
    const token = sessionToken(request);
    const user = token ? authService.getUserForSession(database, token) : null;
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

function createAuthRouter(database, { isProduction = process.env.NODE_ENV === 'production' } = {}) {
  const router = express.Router();

  router.get('/login', (request, response) => {
    response.type('html').send(loginPage({ showError: request.query.error === 'credentials' }));
  });

  router.post('/login', async (request, response, next) => {
    try {
      const user = await authService.authenticate(database, request.body.email, request.body.password);
      if (!user) return response.redirect(303, '/login?error=credentials');

      const session = authService.createSession(database, user.id);
      response.setHeader('Set-Cookie', `${sessionCookieName}=${session.token}; ${cookieOptions(isProduction)}`);
      return response.redirect(303, user.role === 'staff' ? '/staff' : '/my-bookings');
    } catch (error) {
      return next(error);
    }
  });

  router.post('/logout', requireUser(database), (request, response, next) => {
    try {
      authService.revokeSession(database, request.sessionToken);
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
