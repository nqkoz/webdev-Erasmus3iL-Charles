const { promisify } = require('node:util');
const {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
} = require('node:crypto');
const userRepository = require('../data/userRepository');
const sessionRepository = require('../data/sessionRepository');

const scryptAsync = promisify(scrypt);
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;

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
  if (userRepository.findByEmail(database, normalizedEmail)) return false;

  const passwordHash = await hashPassword(password);
  userRepository.createUser(database, { email: normalizedEmail, passwordHash, role: 'student' });
  return true;
}

async function authenticate(database, email, password) {
  if (typeof email !== 'string' || typeof password !== 'string') return null;
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) return null;

  const user = userRepository.findByEmail(database, normalizedEmail);
  if (!user || !user.passwordHash) {
    await hashPassword(password.length >= 8 ? password : `${password}12345678`);
    return null;
  }
  if (!await verifyPassword(password, user.passwordHash)) return null;

  return { id: user.id, email: user.email, role: user.role };
}

function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function createSession(database, userId, now = Date.now()) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(now + sessionLifetimeMs).toISOString();
  sessionRepository.createSession(database, {
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt,
  });
  return { token, expiresAt };
}

function getUserForSession(database, token, now = new Date().toISOString()) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return null;
  return sessionRepository.findActiveSession(database, hashSessionToken(token), now) ?? null;
}

function revokeSession(database, token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) return false;
  return sessionRepository.deleteSession(database, hashSessionToken(token)) > 0;
}

module.exports = {
  authenticate,
  createSession,
  ensureSeedStudent,
  getUserForSession,
  hashPassword,
  revokeSession,
  verifyPassword,
};
