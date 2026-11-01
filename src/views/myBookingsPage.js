function myBookingsPage() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>My bookings · Lab Booking</title>
    <link rel="stylesheet" href="/app.css">
    <script src="/my-bookings.js" defer></script>
  </head>
  <body>
    <main class="bookings-page">
      <header class="page-header">
        <div>
          <p class="eyebrow">3iL · LAB BOOKING</p>
          <h1>My bookings</h1>
          <p class="intro">Your workstation reservations, read from the booking database.</p>
          <a class="action-link" href="/availability">Find a workstation</a>
        </div>
        <form method="post" action="/logout">
          <button class="secondary-button" type="submit">Sign out</button>
        </form>
      </header>
      <section aria-labelledby="bookings-heading">
        <h2 id="bookings-heading">Upcoming and past reservations</h2>
        <p id="bookings-status" class="status-message" role="status" aria-live="polite">Loading your bookings…</p>
        <ul id="bookings-list" class="booking-list" aria-busy="true"></ul>
      </section>
    </main>
  </body>
</html>`;
}

module.exports = { myBookingsPage };
