const path = require('node:path');
const express = require('express');
const { openDatabase } = require('./data/database');
const userRepository = require('./data/userRepository');
const authService = require('./services/authService');
const bookingService = require('./services/bookingService');
const { createAuthRouter } = require('./routes/authRoutes');
const { createBookingRouter } = require('./routes/bookingRoutes');

function createApp(database, {
  nowProvider = () => new Date(),
  googleClient,
  slotSuggestionClient,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    response.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; form-action 'self'; frame-ancestors 'none'");
    next();
  });
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));
  app.use(express.json({ limit: '10kb' }));
  app.use(express.static(path.resolve(__dirname, '../public')));
  app.use(createAuthRouter(database, { googleClient }));
  app.use(createBookingRouter(database, { nowProvider, slotSuggestionClient }));
  app.get('/', (request, response) => response.redirect(302, '/login'));
  app.use((error, request, response, next) => {
    console.error('Request failed:', error.message);
    if (response.headersSent) return next(error);
    if (error instanceof SyntaxError && 'body' in error) {
      return response.status(400).json({ error: 'Request body must be valid JSON.' });
    }
    return response.status(500).type('text').send('The request could not be completed. Please try again.');
  });
  return app;
}

async function startServer() {
  const database = openDatabase();
  const seedEmail = process.env.SEED_STUDENT_EMAIL;
  const seedPassword = process.env.SEED_STUDENT_PASSWORD;

  if (seedEmail || seedPassword) {
    await authService.ensureSeedStudent(database, { email: seedEmail, password: seedPassword });
    const seededStudent = userRepository.findByEmail(database, seedEmail.trim().toLowerCase());
    bookingService.ensureDemoBookings(database, seededStudent.id);
  } else {
    console.error('Demo student is not seeded. Set SEED_STUDENT_EMAIL and SEED_STUDENT_PASSWORD locally to enable sign-in.');
  }

  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    database.close();
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const server = createApp(database).listen(port, () => {
    console.log(`lab-booking listening on http://localhost:${port}`);
  });
  server.on('close', () => database.close());
  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Could not start lab booking:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { createApp, startServer };
