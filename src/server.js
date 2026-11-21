const path = require('node:path');
const express = require('express');
const {
  initializeDatabase,
  openDatabase,
  seedReferenceData,
} = require('./data/database');
const userRepository = require('./data/userRepository');
const authService = require('./services/authService');
const bookingService = require('./services/bookingService');
const { createAuthRouter } = require('./routes/authRoutes');
const { createBookingRouter } = require('./routes/bookingRoutes');

function createApp(database, {
  nowProvider = () => new Date(),
  googleClient,
  slotSuggestionClient,
  isDatabaseReady = () => true,
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
  app.get('/health', async (request, response) => {
    try {
      if (!isDatabaseReady()) {
        return response.status(503).json({ status: 'error', db: 'down' });
      }
      await database.ping();
      return response.status(200).json({ status: 'ok', db: 'ok' });
    } catch (error) {
      console.error('Health check failed:', error.stack || error.message);
      return response.status(503).json({ status: 'error', db: 'down' });
    }
  });
  app.use((request, response) => response.status(404).json({ error: 'Not found' }));
  app.use((error, request, response, next) => {
    console.error('Request failed:', error.stack || error.message);
    if (response.headersSent) return next(error);
    if ((error instanceof SyntaxError && 'body' in error) || error.type === 'entity.parse.failed') {
      return response.status(400).json({ error: 'Request body must be valid JSON.' });
    }
    return response.status(500).json({ error: 'The request could not be completed. Please try again.' });
  });
  return app;
}

async function startServer() {
  const database = await openDatabase({ initialize: false });
  const seedEmail = process.env.SEED_STUDENT_EMAIL;
  const seedPassword = process.env.SEED_STUDENT_PASSWORD;
  let port;
  try {
    if (seedEmail || seedPassword) {
      if (typeof seedEmail !== 'string' || !seedEmail.trim()
        || typeof seedPassword !== 'string' || seedPassword.length < 8) {
        throw new Error('SEED_STUDENT_EMAIL and an 8-character SEED_STUDENT_PASSWORD are required together');
      }
    }

    port = Number(process.env.PORT || 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('PORT must be an integer between 1 and 65535');
    }
  } catch (error) {
    await database.close();
    throw error;
  }

  let databaseReady = false;
  let serverStopping = false;
  let retryTimer;
  const server = createApp(database, {
    isDatabaseReady: () => databaseReady,
  }).listen(port, () => {
    console.log(`lab-booking listening on http://localhost:${port}`);
  });
  const initialize = async () => {
    try {
      await initializeDatabase(database);
      await seedReferenceData(database);
      if (seedEmail && seedPassword) {
        await authService.ensureSeedStudent(database, { email: seedEmail, password: seedPassword });
        const seededStudent = await userRepository.findByEmail(database, seedEmail.trim().toLowerCase());
        await bookingService.ensureDemoBookings(database, seededStudent.id);
      } else {
        console.error('Demo student is not seeded. Set SEED_STUDENT_EMAIL and SEED_STUDENT_PASSWORD locally to enable sign-in.');
      }
      databaseReady = true;
    } catch (error) {
      console.error('Could not initialize lab booking database:', error.message);
      if (!serverStopping) retryTimer = setTimeout(initialize, 5000);
    }
  };
  initialize();
  server.on('close', () => {
    serverStopping = true;
    clearTimeout(retryTimer);
    database.close().catch((error) => console.error('Could not close the database:', error.message));
  });
  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Could not start lab booking:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { createApp, startServer };
