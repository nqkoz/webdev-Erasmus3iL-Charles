const availabilityForm = document.querySelector('#availability-form');
const dateInput = document.querySelector('#booking-date');
const availabilityStatus = document.querySelector('#availability-status');
const availabilityList = document.querySelector('#availability-list');

function sofiaToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Sofia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatBookingTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Sofia',
  }).format(new Date(value));
}

function showSlot(slot) {
  const item = document.createElement('li');
  item.className = 'booking-card';

  const title = document.createElement('h3');
  title.textContent = `${slot.labName} · ${slot.workstationName}`;

  const description = document.createElement('p');
  description.textContent = `${slot.labLocation} · ${slot.workstationDescription || 'Workstation'}`;

  const time = document.createElement('p');
  time.textContent = `${formatBookingTime(slot.startsAt)} – ${formatBookingTime(slot.endsAt)}`;

  const bookButton = document.createElement('button');
  bookButton.type = 'button';
  bookButton.textContent = 'Book this slot';
  bookButton.addEventListener('click', () => bookSlot(slot, bookButton));

  item.append(title, description, time, bookButton);
  availabilityList.append(item);
}

async function loadAvailability(date) {
  availabilityList.replaceChildren();
  availabilityList.setAttribute('aria-busy', 'true');
  availabilityStatus.classList.remove('form-message');
  availabilityStatus.textContent = 'Loading available workstations…';
  try {
    const response = await fetch(`/api/availability?date=${encodeURIComponent(date)}`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Availability could not be loaded.');
    availabilityList.setAttribute('aria-busy', 'false');
    if (result.length === 0) {
      availabilityStatus.textContent = 'No future slots are available for this date.';
      return;
    }
    for (const slot of result) showSlot(slot);
    availabilityStatus.textContent = `${result.length} available slot${result.length === 1 ? '' : 's'}.`;
  } catch (error) {
    availabilityList.setAttribute('aria-busy', 'false');
    availabilityStatus.textContent = error.message;
    availabilityStatus.classList.add('form-message');
  }
}

async function bookSlot(slot, button) {
  button.disabled = true;
  availabilityStatus.classList.remove('form-message');
  availabilityStatus.textContent = 'Booking your workstation…';
  try {
    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ workstationId: slot.workstationId, startsAt: slot.startsAt }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The booking could not be completed.');
    await loadAvailability(dateInput.value);
    availabilityStatus.textContent = 'Booking confirmed. It now appears in My bookings.';
  } catch (error) {
    button.disabled = false;
    availabilityStatus.textContent = error.message;
    availabilityStatus.classList.add('form-message');
  }
}

availabilityForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (dateInput.reportValidity()) loadAvailability(dateInput.value);
});

dateInput.value = sofiaToday();
