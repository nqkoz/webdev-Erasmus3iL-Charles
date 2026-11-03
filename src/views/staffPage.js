function staffPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Staff dashboard · Lab Booking</title>
    <link rel="stylesheet" href="/app.css">
    <script src="/staff.js" defer></script>
  </head>
  <body>
    <main class="bookings-page">
      <header class="page-header">
        <div>
          <p class="eyebrow">3iL · LAB BOOKING</p>
          <h1>Staff dashboard</h1>
          <p class="intro">Manage lab workstations and review student bookings.</p>
        </div>
        <nav class="staff-nav" aria-label="Staff navigation">
          <form method="post" action="/logout">
            <button class="secondary-button" type="submit">Sign out</button>
          </form>
        </nav>
      </header>
      <section class="staff-section" aria-labelledby="create-workstation-heading">
        <h2 id="create-workstation-heading">Add a lab workstation</h2>
        <p id="staff-form-status" class="status-message" role="status" aria-live="polite"></p>
        <form id="staff-workstation-form" class="staff-form">
          <label for="lab-name">Lab name</label>
          <input id="lab-name" name="labName" maxlength="100" required>
          <label for="lab-location">Lab location</label>
          <input id="lab-location" name="labLocation" maxlength="200" required>
          <label for="workstation-name">Workstation name</label>
          <input id="workstation-name" name="workstationName" maxlength="100" required>
          <label for="workstation-description">Description</label>
          <input id="workstation-description" name="workstationDescription" maxlength="500" required>
          <label for="activity-type">Activity</label>
          <select id="activity-type" name="activityType" required>
            <option value="web_cloud">Web and cloud</option>
            <option value="networking">Networking</option>
          </select>
          <button type="submit">Add workstation</button>
        </form>
      </section>
      <section class="staff-section" aria-labelledby="workstations-heading">
        <h2 id="workstations-heading">Workstations</h2>
        <ul id="staff-workstation-list" class="booking-list" aria-busy="true"></ul>
      </section>
      <section class="staff-section" aria-labelledby="all-bookings-heading">
        <h2 id="all-bookings-heading">All student bookings</h2>
        <ul id="staff-booking-list" class="booking-list" aria-busy="true"></ul>
      </section>
    </main>
  </body>
</html>`;
}

module.exports = { staffPage };
