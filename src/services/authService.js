const { promisify } = require('node:util');
const {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} = require('node:crypto');
const userRepository = require('../data/userRepository');
const sessionRepository = require('../data/sessionRepository');
const oauthAccountRepository = require('../data/oauthAccountRepository');

const scryptAsync = promisify(scrypt);
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;

class GoogleAccountError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GoogleAccountError';
  }
}

async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Password must contain at least 8 characters');
  }
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, passwordHash) {
  if (typeof password !== 'string' || typeof passwordHash !== 'string') return false;
  const parts = passwordHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[a-f0-9]{32}$/i.test(parts[1]) || !/^[a-f0-9]{128}$/i.test(parts[2])) {
    return false;
  }
  const expected = Buffer.from(parts[2], 'hex');
  const actual = await scryptAsync(password, Buffer.from(parts[1], 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

async function ensureSeedStudent(database, { email, password }) {
  if (!email && !password) return false;
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || password.length < 8) {
    throw new Error('SEED_STUDENT_EMAIL and an 8-character SEED_STUDENT_PASSWORD are required together');
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (await userRepository.findByEmail(database, normalizedEmail)) return false;

  const passwordHash = await hashPassword(password);
  await userRepository.createUser(database, { email: normalizedEmail, passwordHash, role: 'student' });
  return true;
}

async function authenticate(database, email, password) {
  if (typeof email !== 'string' || typeof password !== 'string') return null;
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) return null;

  const user = await userRepository.findByEmail(database, normalizedEmail);
  if (!user || !user.passwordHash) {
    await hashPassword(password.length >= 8 ? password : `${password}12345678`);
    return null;
  }
  if (!await verifyPassword(password, user.passwordHash)) return null;

  return { id: user.id, email: user.email, role: user.role };
}

async function authenticateGoogle(database, profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)
    || typeof profile.sub !== 'string' || !profile.sub.trim() || profile.sub.length > 255
    || profile.email_verified !== true
    || typeof profile.email !== 'string') {
    throw new GoogleAccountError('Google must provide a verified e-mail address.');
  }

  const email = profile.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new GoogleAccountError('Google did not provide a valid e-mail address.');
  }
  const subject = profile.sub.trim();

  try {
    return await database.transaction(async (transaction) => {
      const linkedUser = await oauthAccountRepository.findUserByGoogleSubject(transaction, subject);
      if (linkedUser) return linkedUser;

      const existingUser = await userRepository.findByEmail(transaction, email);
      const userId = existingUser
        ? existingUser.id
        : await userRepository.createUser(transaction, { email, passwordHash: null, role: 'student' });
      await oauthAccountRepository.linkGoogleAccount(transaction, subject, userId);
      return userRepository.findById(transaction, userId);
    });
  } catch (error) {
    if (error.code === '23505') {
      throw new GoogleAccountError('This Google account cannot be linked to the requested account.');
    }
    throw error;
  }
}

function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

async function createSession(database, userId, now = Date.now()) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(now + sessionLifetimeMs).toISOString();
  await sessionRepository.createSession(database, {
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt,
  });
  return { token, expiresAt };
}

async function getUserForSession(database, token, now = new Date().toISOString()) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return null;
  return await sessionRepository.findActiveSession(database, hashSessionToken(token), now) ?? null;
}

async function revokeSession(database, token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return false;
  return await sessionRepository.deleteSession(database, hashSessionToken(token)) > 0;
}

module.exports = {
  GoogleAccountError,
  authenticate,
  authenticateGoogle,
  createSession,
  ensureSeedStudent,
  getUserForSession,
  hashPassword,
  revokeSession,
  verifyPassword,
};
