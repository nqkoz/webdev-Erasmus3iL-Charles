const bookingRepository = require('../data/bookingRepository');
const userRepository = require('../data/userRepository');

const timeZone = 'Europe/Sofia';
const slotLengthMs = 60 * 60 * 1000;

class BookingError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'BookingError';
    this.status = status;
  }
}

function listMyBookings(database, userId) {
  ensureStudent(database, userId);
  return bookingRepository.listForUser(database, userId);
}

function listAllBookingsForStaff(database, userId) {
  ensureStaff(database, userId);
  return bookingRepository.listAllBookings(database);
}

function listWorkstationsForStaff(database, userId) {
  ensureStaff(database, userId);
  return bookingRepository.listWorkstations(database);
}

function createLabAndWorkstation(database, userId, input) {
  ensureStaff(database, userId);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BookingError(400, 'Enter valid lab and workstation details.');
  }

  const labName = requiredText(input.labName, 'Lab name', 100);
  const labLocation = requiredText(input.labLocation, 'Lab location', 200);
  const workstationName = requiredText(input.workstationName, 'Workstation name', 100);
  const workstationDescription = requiredText(input.workstationDescription, 'Workstation description', 500);
  if (!['web_cloud', 'networking'].includes(input.activityType)) {
    throw new BookingError(400, 'Choose a valid workstation activity.');
  }

  try {
    return bookingRepository.createLabAndWorkstation(database, {
      labName,
      labLocation,
      workstationName,
      workstationDescription,
      activityType: input.activityType,
    });
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new BookingError(409, 'A lab or workstation with that name already exists.');
    }
    throw error;
  }
}

function requiredText(value, label, maximumLength) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maximumLength) {
    throw new BookingError(400, `${label} must contain 1 to ${maximumLength} characters.`);
  }
  return value.trim();
}

function ensureDemoBookings(database, userId, now = new Date()) {
  if (!Number.isInteger(userId) || userId < 1) throw new Error('A seeded student is required');

  const dates = nextWeekdays(now, 2);
  const bookings = dates.map((date, index) => {
    const startsAt = zonedTimeToUtc(date.year, date.month, date.day, index === 0 ? 9 : 11);
    return {
      workstationId: index + 1,
      startsAt,
      endsAt: new Date(Date.parse(startsAt) + 60 * 60 * 1000).toISOString(),
    };
  });
  return bookingRepository.seedDemoBookings(database, { userId, bookings });
}

function listAvailableSlots(database, userId, requestedDate, now = new Date()) {
  ensureStudent(database, userId);
  const date = parseDate(requestedDate);
  const today = getLocalDateParts(now);
  const dayOffset = Math.round((date.getTime() - Date.UTC(today.year, today.month - 1, today.day)) / 86400000);
  if (dayOffset < 0 || dayOffset > 30) {
    throw new BookingError(400, 'Choose a date from today through the next 30 days.');
  }
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) {
    throw new BookingError(400, 'Bookings are available Monday to Friday.');
  }

  const nextDate = new Date(date.getTime() + 86400000);
  const startsAt = zonedTimeToUtc(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), 0);
  const endsAt = zonedTimeToUtc(nextDate.getUTCFullYear(), nextDate.getUTCMonth() + 1, nextDate.getUTCDate(), 0);
  const workstations = bookingRepository.listWorkstations(database);
  const conflicts = bookingRepository.listConflictingForRange(database, startsAt, endsAt);
  const nowIso = now.toISOString();
  const slots = [];

  for (let hour = 8; hour < 18; hour += 1) {
    const slotStartsAt = zonedTimeToUtc(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour);
    const slotEndsAt = new Date(Date.parse(slotStartsAt) + slotLengthMs).toISOString();
    if (slotStartsAt <= nowIso) continue;

    for (const workstation of workstations) {
      const isAvailable = !conflicts.some((conflict) =>
        conflict.workstationId === workstation.workstationId
        && conflict.startsAt < slotEndsAt
        && conflict.endsAt > slotStartsAt);
      if (isAvailable) slots.push({ ...workstation, startsAt: slotStartsAt, endsAt: slotEndsAt });
    }
  }

  return slots;
}

function createBooking(database, userId, bookingInput, now = new Date()) {
  ensureStudent(database, userId);
  if (!bookingInput || typeof bookingInput !== 'object' || Array.isArray(bookingInput)) {
    throw new BookingError(400, 'Choose a valid workstation and time slot.');
  }
  const { workstationId, startsAt } = bookingInput;
  if (!Number.isInteger(workstationId) || workstationId < 1) {
    throw new BookingError(400, 'Choose a valid workstation.');
  }
  const start = parseInstant(startsAt);
  const localStart = getLocalDateParts(start);
  if (localStart.hour < 8 || localStart.hour >= 18 || localStart.minute !== 0 || localStart.second !== 0) {
    throw new BookingError(400, 'Choose a one-hour slot between 08:00 and 18:00.');
  }
  const end = new Date(start.getTime() + slotLengthMs);
  if (start <= now) throw new BookingError(400, 'Choose a future time.');
  validateBookableDate(start, now);
  const workstation = bookingRepository.findWorkstation(database, workstationId);
  if (!workstation) throw new BookingError(404, 'Workstation not found.');

  try {
    return database.transaction(() => {
      if (bookingRepository.countFutureActiveForUser(database, userId, now.toISOString()) >= 3) {
        throw new BookingError(409, 'You have reached the booking limit');
      }
      const bookingId = bookingRepository.createForUser(database, {
        userId,
        workstationId,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      });
      return { id: bookingId, workstationId, startsAt: start.toISOString(), endsAt: end.toISOString(), status: 'active' };
    })();
  } catch (error) {
    if (error instanceof BookingError) throw error;
    if (error.message.includes('overlaps an active booking')) {
      throw new BookingError(409, 'This slot is no longer available');
    }
    throw error;
  }
}

function cancelBooking(database, userId, bookingId, now = new Date()) {
  ensureStudent(database, userId);
  if (!Number.isInteger(bookingId) || bookingId < 1) throw new BookingError(400, 'Choose a valid booking.');

  return database.transaction(() => {
    const booking = bookingRepository.findBooking(database, bookingId);
    if (!booking) throw new BookingError(404, 'Booking not found.');
    if (booking.userId !== userId) throw new BookingError(403, 'You cannot cancel another student’s booking.');
    if (booking.status !== 'active') throw new BookingError(409, 'This booking is already cancelled.');
    if (booking.startsAt <= now.toISOString()) throw new BookingError(409, 'A booking cannot be cancelled after it starts.');
    bookingRepository.cancel(database, bookingId);
    return { id: bookingId, status: 'cancelled' };
  })();
}

function ensureStudent(database, userId) {
  if (!Number.isInteger(userId) || userId < 1) throw new BookingError(401, 'Sign in first.');
  const user = userRepository.findById(database, userId);
  if (!user) throw new BookingError(401, 'Sign in first.');
  if (user.role !== 'student') throw new BookingError(403, 'Student access is required.');
}

function ensureStaff(database, userId) {
  if (!Number.isInteger(userId) || userId < 1) throw new BookingError(401, 'Sign in first.');
  const user = userRepository.findById(database, userId);
  if (!user) throw new BookingError(401, 'Sign in first.');
  if (user.role !== 'staff') throw new BookingError(403, 'Staff access is required.');
}

function validateBookableDate(dateValue, now) {
  const date = parseDate(`${dateValue.getUTCFullYear()}-${pad(dateValue.getUTCMonth() + 1)}-${pad(dateValue.getUTCDate())}`);
  const today = getLocalDateParts(now);
  const dayOffset = Math.round((date.getTime() - Date.UTC(today.year, today.month - 1, today.day)) / 86400000);
  if (dayOffset < 0 || dayOffset > 30) throw new BookingError(400, 'Choose a date from today through the next 30 days.');
  const weekday = date.getUTCDay();
  if (weekday === 0 || weekday === 6) throw new BookingError(400, 'Bookings are available Monday to Friday.');
}

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BookingError(400, 'Choose a valid date in YYYY-MM-DD format.');
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BookingError(400, 'Choose a valid date in YYYY-MM-DD format.');
  }
  return date;
}

function parseInstant(value) {
  if (typeof value !== 'string') throw new BookingError(400, 'Choose a valid time slot.');
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw new BookingError(400, 'Choose a valid time slot.');
  }
  return date;
}

function nextWeekdays(now, count) {
  const current = getLocalDateParts(now);
  const start = new Date(Date.UTC(Number(current.year), Number(current.month) - 1, Number(current.day)));
  const dates = [];

  for (let offset = 1; dates.length < count && offset <= 14; offset += 1) {
    const date = new Date(start.getTime() + offset * 24 * 60 * 60 * 1000);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    dates.push({
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    });
  }

  if (dates.length !== count) throw new Error('Could not find upcoming weekdays for the demo bookings');
  return dates;
}

function zonedTimeToUtc(year, month, day, hour) {
  const targetAsUtc = Date.UTC(year, month - 1, day, hour);
  const formattedParts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(targetAsUtc));
  const parts = Object.fromEntries(formattedParts.map(({ type, value }) => [type, value]));
  const representedAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offset = representedAsUtc - targetAsUtc;
  return new Date(targetAsUtc - offset).toISOString();
}

function getLocalDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
}

function pad(value) {
  return String(value).padStart(2, '0');
}

module.exports = {
  BookingError,
  cancelBooking,
  createBooking,
  createLabAndWorkstation,
  ensureDemoBookings,
  ensureStaff,
  ensureStudent,
  listAllBookingsForStaff,
  listAvailableSlots,
  listMyBookings,
  listWorkstationsForStaff,
};
