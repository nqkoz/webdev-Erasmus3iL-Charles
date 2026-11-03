const workstationList = document.querySelector('#staff-workstation-list');
const bookingList = document.querySelector('#staff-booking-list');
const form = document.querySelector('#staff-workstation-form');
const formStatus = document.querySelector('#staff-form-status');

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result;
}

function showEmptyMessage(list, message) {
  const item = document.createElement('li');
  item.className = 'status-message';
  item.textContent = message;
  list.replaceChildren(item);
}

function renderWorkstations(workstations) {
  if (workstations.length === 0) {
    showEmptyMessage(workstationList, 'No workstations have been added yet.');
    return;
  }
  workstationList.replaceChildren(...workstations.map((workstation) => {
    const item = document.createElement('li');
    item.className = 'booking-card';
    const title = document.createElement('h3');
    title.textContent = `${workstation.workstationName} - ${workstation.labName}`;
    const details = document.createElement('p');
    details.textContent = `${workstation.workstationDescription} - ${workstation.activityType === 'networking' ? 'Networking' : 'Web and cloud'} - ${workstation.labLocation}`;
    item.append(title, details);
    return item;
  }));
}

function renderBookings(bookings) {
  if (bookings.length === 0) {
    showEmptyMessage(bookingList, 'There are no student bookings yet.');
    return;
  }
  bookingList.replaceChildren(...bookings.map((booking) => {
    const item = document.createElement('li');
    item.className = 'booking-card';
    const title = document.createElement('h3');
    title.textContent = `${booking.studentEmail} - ${booking.workstationName}`;
    const details = document.createElement('p');
    details.textContent = `${booking.labName} - ${new Date(booking.startsAt).toLocaleString()} - ${booking.status}`;
    item.append(title, details);
    return item;
  }));
}

async function loadDashboard() {
  workstationList.setAttribute('aria-busy', 'true');
  bookingList.setAttribute('aria-busy', 'true');
  try {
    const [workstations, bookings] = await Promise.all([
      requestJson('/api/staff/workstations'),
      requestJson('/api/staff/bookings'),
    ]);
    renderWorkstations(workstations);
    renderBookings(bookings);
  } catch (error) {
    showEmptyMessage(workstationList, error.message);
    showEmptyMessage(bookingList, error.message);
  } finally {
    workstationList.setAttribute('aria-busy', 'false');
    bookingList.setAttribute('aria-busy', 'false');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  formStatus.classList.remove('form-message');
  formStatus.textContent = 'Adding workstation...';
  const details = Object.fromEntries(new FormData(form));
  try {
    await requestJson('/api/staff/workstations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(details),
    });
    form.reset();
    formStatus.textContent = 'The lab workstation was added.';
    await loadDashboard();
  } catch (error) {
    formStatus.classList.add('form-message');
    formStatus.textContent = error.message;
  }
});

loadDashboard();
