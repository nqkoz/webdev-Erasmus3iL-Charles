function availabilityPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Find a workstation · Lab Booking</title>
    <link rel="stylesheet" href="/app.css">
    <script src="/availability.js" defer></script>
  </head>
  <body>
    <main class="bookings-page">
      <header class="page-header">
        <div>
          <p class="eyebrow">3iL · LAB BOOKING</p>
          <h1>Find a workstation</h1>
          <p class="intro">Choose a weekday within the next 30 days to find a free one-hour slot.</p>
        </div>
        <a class="action-link" href="/my-bookings">My bookings</a>
      </header>
      <form id="availability-form" class="date-form">
        <label for="booking-date">Booking date</label>
        <input id="booking-date" name="date" type="date" required>
        <button type="submit">Show available slots</button>
      </form>
      <section class="suggestion-section" aria-labelledby="suggestion-heading">
        <h2 id="suggestion-heading">Get a workstation suggestion</h2>
        <p class="intro">The suggestion uses current availability and never books a slot automatically.</p>
        <form id="suggestion-form" class="suggestion-form">
          <label for="activity-type">Activity</label>
          <select id="activity-type" name="activityType" required>
            <option value="web_cloud">Web and cloud</option>
            <option value="networking">Networking</option>
          </select>
          <button type="submit">Suggest a slot</button>
        </form>
        <p id="suggestion-status" class="status-message" role="status" aria-live="polite">Choose an activity and date to get a suggestion.</p>
        <article id="suggestion-result" class="booking-card" hidden aria-labelledby="suggested-slot-heading"></article>
      </section>
      <section aria-labelledby="availability-heading">
        <h2 id="availability-heading">Available workstations</h2>
        <p id="availability-status" class="status-message" role="status" aria-live="polite">Choose a date to see available times.</p>
        <ul id="availability-list" class="booking-list" aria-busy="false"></ul>
      </section>
    </main>
  </body>
</html>`;
}

module.exports = { availabilityPage };
