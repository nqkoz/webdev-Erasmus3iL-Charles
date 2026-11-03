function loginPage({
  showError = false,
  showGoogleError = false,
  showGoogleUnavailable = false,
  googleConfigured = true,
} = {}) {
  const messages = [
    showError ? '<p class="form-message" role="alert">E-mail or password is incorrect. Try again.</p>' : '',
    showGoogleError ? '<p class="form-message" role="alert">Google sign-in could not be completed. You can try again or use your e-mail and password.</p>' : '',
    showGoogleUnavailable ? '<p class="form-message" role="alert">Google sign-in is not configured. Use your e-mail and password instead.</p>' : '',
  ].join('');
  const googleLink = googleConfigured
    ? '<a class="google-signin-button" href="/auth/google">Continue with Google</a>'
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sign in · Lab Booking</title>
    <link rel="stylesheet" href="/app.css">
  </head>
  <body>
    <main class="auth-card">
      <p class="eyebrow">3iL · LAB BOOKING</p>
      <h1>Sign in</h1>
      <p class="intro">Sign in to see your workstation bookings.</p>
      ${messages}
      <form method="post" action="/login">
        <label for="email">E-mail</label>
        <input id="email" name="email" type="email" autocomplete="username" required>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" minlength="8" required>
        <button type="submit">Sign in</button>
      </form>
      ${googleLink}
    </main>
  </body>
</html>`;
}

module.exports = { loginPage };
