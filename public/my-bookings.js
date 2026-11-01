const statusMessage = document.querySelector('#bookings-status');
const bookingsList = document.querySelector('#bookings-list');

function formatBookingTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Sofia',
  }).format(new Date(value));
}

function showBooking(booking) {
  const item = document.createElement('li');
  item.className = 'booking-card';

  const title = document.createElement('h3');
  title.textContent = `${booking.labName} · ${booking.workstationName}`;

  const location = document.createElement('p');
  location.textContent = booking.labLocation;

  const time = document.createElement('p');
  time.textContent = `${formatBookingTime(booking.startsAt)} – ${formatBookingTime(booking.endsAt)}`;

  const state = document.createElement('p');
  state.className = 'booking-state';
  state.textContent = booking.status === 'active' ? 'Active' : 'Cancelled';

  item.append(title, location, time, state);
  if (booking.status === 'active' && Date.parse(booking.startsAt) > Date.now()) {
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'secondary-button';
    cancelButton.textContent = 'Cancel booking';
    cancelButton.addEventListener('click', () => cancelBooking(booking.id, cancelButton));
    item.append(cancelButton);
  }
  bookingsList.append(item);
}

async function cancelBooking(bookingId, button) {
  button.disabled = true;
  statusMessage.classList.remove('form-message');
  statusMessage.textContent = 'Cancelling your booking…';
  try {
    const response = await fetch(`/api/bookings/${bookingId}/cancel`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The booking could not be cancelled.');
    await loadBookings('Booking cancelled.');
  } catch (error) {
    button.disabled = false;
    statusMessage.textContent = error.message;
    statusMessage.classList.add('form-message');
  }
}

async function loadBookings(successMessage = '') {
  try {
    const response = await fetch('/api/my-bookings', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('The bookings could not be loaded. Please try again.');

    const bookings = await response.json();
    bookingsList.replaceChildren();
    bookingsList.setAttribute('aria-busy', 'false');

    if (bookings.length === 0) {
      statusMessage.textContent = successMessage ? `${successMessage} You do not have any bookings yet.` : 'You do not have any bookings yet.';
      return;
    }

    for (const booking of bookings) showBooking(booking);
    const countMessage = `${bookings.length} booking${bookings.length === 1 ? '' : 's'} found.`;
    statusMessage.textContent = successMessage ? `${successMessage} ${countMessage}` : countMessage;
  } catch (error) {
    bookingsList.setAttribute('aria-busy', 'false');
    statusMessage.textContent = error.message;
    statusMessage.classList.add('form-message');
  }
}

loadBookings();
