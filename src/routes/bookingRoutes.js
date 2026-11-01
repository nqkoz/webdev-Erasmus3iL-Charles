const express = require('express');
const bookingService = require('../services/bookingService');
const { requireUser } = require('./authRoutes');
const { availabilityPage } = require('../views/availabilityPage');

function createBookingRouter(database, { nowProvider = () => new Date() } = {}) {
  const router = express.Router();

  router.get('/availability', requireUser(database), (request, response) => {
    response.type('html').send(availabilityPage());
  });

  router.get('/api/my-bookings', requireUser(database, { api: true }), (request, response, next) => {
    try {
      return response.json(bookingService.listMyBookings(database, request.user.id));
    } catch (error) {
      return sendBookingError(error, response, next);
    }
  });

  router.get('/api/availability', requireUser(database, { api: true }), (request, response, next) => {
    try {
      return response.json(bookingService.listAvailableSlots(database, request.user.id, request.query.date, nowProvider()));
    } catch (error) {
      return sendBookingError(error, response, next);
    }
  });

  router.post('/api/bookings', requireUser(database, { api: true }), (request, response, next) => {
    try {
      const booking = bookingService.createBooking(database, request.user.id, request.body, nowProvider());
      return response.status(201).json(booking);
    } catch (error) {
      return sendBookingError(error, response, next);
    }
  });

  router.post('/api/bookings/:id/cancel', requireUser(database, { api: true }), (request, response, next) => {
    try {
      const booking = bookingService.cancelBooking(database, request.user.id, Number(request.params.id), nowProvider());
      return response.json(booking);
    } catch (error) {
      return sendBookingError(error, response, next);
    }
  });

  return router;
}

function sendBookingError(error, response, next) {
  if (error instanceof bookingService.BookingError) {
    return response.status(error.status).json({ error: error.message });
  }
  return next(error);
}

module.exports = { createBookingRouter };
