# Lab Booking · 3iL

<!-- Exercise 2. Write the non-goals first. Every acceptance criterion must be checkable in under a minute.
     Keep these headings exactly as they are: the self-checks look for them by name.
     The full target is on the course site under Resources → The course project. -->

## Project option
Lab booking.

## Goals
- Students can find free workstations for a chosen date, book an available one-hour slot and cancel their own future booking.
- Lab staff can manage labs and workstations and inspect all bookings; students can see only their own bookings.

## Non-goals
- No payments, deposits or paid reservations; all bookings are free.
- No email, push or SMS notifications; users check the application.
- No native mobile application; the responsive web application is the only client.
- No recurring bookings, group bookings or reservations longer than one hour.

## Constraints
- Node.js 22, Express, PostgreSQL on Neon, numbered SQL migrations in `migrations/postgres/`, and plain HTML, CSS and JavaScript; all application rules are enforced by the service layer.
- Passwords are stored only as salted scrypt hashes; session identifiers are random, stored hashed in PostgreSQL, and sent only in HttpOnly cookies.
- Booking times use the Europe/Sofia time zone. Slots are one hour, Monday to Friday from 08:00 through 18:00; students may book up to 30 days ahead and hold at most three future active bookings.
- A workstation cannot have overlapping active bookings. Students can cancel only their own bookings, and only before a booking starts; staff permissions are checked in services.

## The model feature
- Model: Gemini 2.5 Flash (text), called only from `src/services/slotSuggestionService.js`; chosen because it can interpret structured workstation preferences and suggest from a supplied set of available slots.
- Input: the requested date, structured non-personal preferences, and the current free-slot identifiers with non-personal lab/workstation descriptions; no name, e-mail, account identifier, booking history or free-text prompt leaves the app.
- Output: a clearly labelled suggestion containing one offered slot identifier and a short reason; the service verifies that the identifier is still in the supplied free-slot list and never creates a booking.
- When it fails: an 8-second timeout, missing key, provider error or rate limit returns an explanatory message and the normal free-slot list remains usable; a deterministic rule chooses the first matching free slot, or says no match was found. Invalid model output is discarded.

## Auth
- Local: students sign in with e-mail and password; passwords are salted scrypt hashes and successful sign-in creates the application's ordinary session.
- Provider: Google OAuth 2.0 authorization-code flow, handled on the server with state validation, PKCE, an eight-second provider timeout and the same application session. The client secret stays in `GOOGLE_CLIENT_SECRET`.
- Linking: normalize e-mail addresses and link sign-in methods to one account only when Google reports `email_verified: true`; an unverified address is never linked to an existing account. A new Google-only account is a student without a local password. Both sign-in methods resolve to the same user id and permissions.

## MCP tools
| Tool | What it does | Who may call it |
| --- | --- | --- |
| `list_free_slots` | Lists available workstations and one-hour slots for a requested date, excluding overlapping active bookings. | Signed-in student or lab staff |
| `my_bookings` | Lists the current user's future and past bookings without exposing another student's records. | Signed-in student |
| `book_slot` | Books one currently free workstation slot and returns a conflict if it has become unavailable. | Signed-in student |
| `cancel_booking` | Cancels the current user's own future booking and refuses bookings owned by someone else. | Signed-in student |
| `suggest_slot` | Suggests one validated free slot from the current availability and never books it automatically. | Signed-in student |

## UI
Node.js 22 and Express provide JSON REST endpoints; plain HTML, CSS and JavaScript call them. Screens: sign-in, my bookings, workstation availability and booking, and the lab-staff dashboard. Every screen handles loading, empty, readable error and success states; the main flow is keyboard accessible, responsive at 380/768/1280 px, uses visible focus and design tokens, and meets 4.5:1 text contrast.

## Architecture

### 1. Page rendering
When a signed-in user opens `/availability`, the route in `src/routes/bookingRoutes.js` checks the session and returns the HTML created by `src/views/availabilityPage.js`. The page contains the date form, status message and available-slot list, and loads `public/availability.js`.

### 2. Browser request and display
When the user submits a date, `loadAvailability(date)` in `public/availability.js` clears the previous results, displays a loading message and sends `GET /api/availability?date=...` with the same-origin session. It displays each returned slot, a message when there are no slots, or an error when the request fails. The page state is represented in the DOM, including the status text and the list's `aria-busy` attribute.

### 3. API and service
The `GET /api/availability` route in `src/routes/bookingRoutes.js` checks the session and calls `bookingService.listAvailableSlots` in `src/services/bookingService.js`. The route returns the result as JSON. If the service raises a `BookingError`, the route sends its status code and message in the HTTP response.

### 4. Business rules and database
`listAvailableSlots` checks that the user is a student or staff member, validates that the date is today through 30 days ahead and a weekday, and considers one-hour slots from 08:00 to 18:00 in Europe/Sofia. It excludes slots that have already started and slots overlapping an active booking. It asks `src/data/bookingRepository.js` for workstations and conflicting bookings. The repository's SQL joins workstations to labs and reads active bookings overlapping the selected day. The service uses those results to produce the available slots.

### 5. MCP integration
For `list_free_slots`, `mcp-server/labBookingServer.js` resolves the user from the configured MCP session token, then calls the same `bookingService.listAvailableSlots` function as the HTTP route. The MCP server has no SQL query of its own; it uses the service and repository layers against the same PostgreSQL database.

### 6. Front-end layering trade-off
`public/availability.js` handles the API request, renders the results and updates the page's status state in one file. This is less separated than having distinct browser API, view and state modules. It is kept together because this is a small page using plain JavaScript, and adding separate modules for it would add indirection without much benefit; the business rules and SQL remain in their service and repository layers.

The other MCP tools call `listMyBookings`, `createBooking`, `cancelBooking` and `slotSuggestionService.suggestSlot` through the same application services. The Exercise 1 `mcp-server/server.js` remains separate and continues serving its course JSON files. Google sign-in uses `src/services/googleOAuthClient.js` and links verified provider identities through `src/data/oauthAccountRepository.js`; OAuth tests use fake clients and do not call Google. Suggestions use `src/services/geminiClient.js`; tests inject fake clients and do not call Gemini.

## Acceptance criteria
- [AC-1] A student who signs in with a local e-mail and password sees their account's bookings; the database stores only a salted password hash.
- [AC-2] A student who asks for workstation availability on a valid date sees each free lab, workstation and one-hour slot; a slot with an overlapping active booking is absent.
- [AC-3] A student who books a free slot sees a confirmation and a new active row appears in `bookings` for that student and workstation.
- [AC-4] A student who tries to book a slot that overlaps an active booking sees “This slot is no longer available”, receives HTTP 409, and no second active overlapping row is stored.
- [AC-5] A student who already has three future active bookings sees “You have reached the booking limit” when trying to book a fourth, and no new active row is stored.
- [AC-6] A student who cancels their own booking before it starts sees a cancellation confirmation; its `bookings.status` becomes `cancelled` and the slot becomes available.
- [AC-7] A student who tries to cancel another student's booking receives HTTP 403 and that booking remains active and unchanged.
- [AC-8] A lab staff member who creates a lab and workstation sees them in the staff dashboard and corresponding rows exist in the database; a student receives HTTP 403 and creates no rows when attempting the same action.
- [AC-9] A lab staff member sees bookings from all students, while a student sees only bookings belonging to their own user id.
- [AC-10] A student who requests a model suggestion sees one clearly labelled suggested slot and reason; the slot identifier is in the current free-slot result and no booking is created until the student books it.
- [AC-11] When the model key is missing, the model times out, is rate-limited or returns an invalid slot, the student sees an explanatory fallback and can still use the ordinary availability list; no invalid suggestion is shown or saved.
- [AC-12] A signed-in student who uses an MCP booking tool receives the same booking result or service error as the matching HTTP operation, and the MCP session cannot perform lab-staff actions.
- [AC-13] A signed-in student whose local e-mail is verified by Google signs in by either method to the same user id and sees the same bookings; an unverified Google e-mail does not link to an existing account.

### Slice 1: sign-in and my bookings
- [AC-14] A visitor who opens `/my-bookings` without a session is redirected to `/login`, and `GET /api/my-bookings` without a session returns HTTP 401 without booking data.
- [AC-15] A student who signs in with the seeded local account sees the seeded booking rows for their own account, with lab, workstation, date, time and status; another student's seeded rows are absent.
- [AC-16] After a booking row is deleted from the database, reloading `/my-bookings` removes that row from the displayed list and the seed process does not recreate it.
- [AC-17] A visitor who submits an incorrect password sees a readable sign-in error, receives no authenticated session, and remains unable to access `/my-bookings`.

### Slice 2: suggest a workstation slot
- [AC-18] A signed-in student who requests a suggestion for a supported activity and date sees an available workstation, its lab, the time slot, and a short reason; no booking is created.
- [AC-19] When no available workstation matches the requested activity, the suggestion endpoint returns HTTP 200 with a clear “no matching workstation” message, and no booking is created.
- [AC-20] If Gemini is unavailable, returns an invalid slot, or fails, the system ignores that response and suggests the first available matching slot; if none matches, it reports no match. No booking is created.
- [AC-21] A visitor without a session who requests a suggestion receives HTTP 401 and no suggestion data.
- [AC-22] A signed-in student who submits an unsupported activity receives HTTP 422 and no suggestion or booking.
- [AC-23] After the migration runs, every seeded workstation has an `activity_type` of `web_cloud` or `networking`, matching the activity supported by that workstation.

## Traceability
<!-- Add a test reference as each acceptance criterion is implemented. -->
| Criterion | Test |
| --- | --- |
| AC-1 | `AC-1 a valid local sign-in creates an opaque HttpOnly session cookie`; salted-hash verification test |
| AC-2 | `AC-2 availability lists future workstation slots and excludes active overlaps` |
| AC-3 | `AC-3 booking a free slot returns confirmation and stores an active row` |
| AC-4 | `AC-4 a booking conflict returns HTTP 409 and stores no overlapping row`; `AC-4 PostgreSQL rejects overlapping active bookings for a workstation` |
| AC-5 | `AC-5 a fourth future active booking is refused without inserting a row` |
| AC-6 | `AC-6 cancelling an owned future booking marks it cancelled and frees its slot` |
| AC-7 | `AC-7 cancelling another student’s booking returns HTTP 403 and leaves it active` |
| AC-8 | `AC-8 only staff can create a lab and workstation and see the new rows` |
| AC-9 | `AC-9 staff see all student bookings while students see only their own` |
| AC-10 | `AC-10 and AC-18 a student receives one available model suggestion without creating a booking` |
| AC-11 | `AC-11 and AC-20 model failure and invalid output fall back to the first matching available slot` |
| AC-12 | `AC-12 Lab Booking MCP exposes all five project tools through the JSON-RPC protocol`; `AC-12 a student MCP session receives the same results as the matching HTTP services`; `AC-12 staff MCP sessions can view slots but cannot use student-only operations`; `AC-12 an MCP tool call rejects missing or expired user sessions` |
| AC-13 | `AC-13 verified Google sign-in links to the local user and creates the same session identity`; `AC-13 an unverified Google e-mail is not linked to an existing local account` |
| AC-18 | `AC-10 and AC-18 a student receives one available model suggestion without creating a booking` |
| AC-19 | `AC-19 no matching free workstation returns a clear result and creates no booking` |
| AC-20 | `AC-11 and AC-20 model failure and invalid output fall back to the first matching available slot` |
| AC-21 | `AC-21 an unauthenticated visitor receives no suggestion data` |
| AC-22 | `AC-22 an unsupported activity returns HTTP 422 without a model call or booking` |
| AC-23 | `AC-23 PostgreSQL migration adds validated activity types and backfills workstations` |
| AC-14 | `AC-14 an unauthenticated visitor is redirected from the page and receives no API data` |
| AC-15 | `AC-15 the seeded student sees their booking details and no other student rows` |
| AC-16 | `AC-16 deleting a booking row removes it from the refreshed booking list and does not reseed it` |
| AC-17 | `AC-17 an incorrect password gives a readable error and no authenticated session` |

## Spec vs result
Database checkpoint: migration `001_initial_schema.sql` created the six initial tables, and the student confirmed the local database contains two seeded labs and three workstations. Migration `002_seed_state.sql` adds the marker that prevents deleted demo bookings from being recreated. Automated tests verify the schema, seed rows, overlap trigger, sign-in/session behavior, per-user booking list, availability, booking limits, conflicts and cancellation/ownership rules.

Exercise 2's requested sign-in-and-list slice is implemented and checked. AC-14's unauthenticated checks returned HTTP 401 for `/api/my-bookings` and HTTP 302 to `/login` for `/my-bookings`; AC-15's booking details and AC-16's deletion result were confirmed by the student in the browser. The bookings screen showed demo booking ID 2 (PC-02, Lab 1250) absent after deletion and reload. The availability form and slots were also visually checked by the student. The student chose not to create a persistent booking in their local database, so booking confirmation in that UI was not manually checked; API behavior for AC-2 through AC-7 is covered by automated tests.

Changed after checking: AC-16 now also says the startup seed must not recreate a deleted booking. The first implementation could have reseeded deleted rows; the migration 002 seed marker and test `AC-16 deleting a booking row removes it from the refreshed booking list and does not reseed it` enforce the observed behavior. The availability, booking and cancellation features (AC-2 through AC-7) are additional scope beyond Exercise 2's required first slice. The Exercise 3 staff dashboard and AC-8/9 are implemented and covered by automated tests. Google OAuth fake-client flows are tested; the student reports that Google OAuth credentials and the local callback were configured and that sign-in with a test account succeeded. The agent did not independently observe the browser session. The Gemini suggestion UI, authenticated API and deterministic fallback are implemented and covered by fake-client tests; no real Gemini request was made. The separate Lab Booking MCP server and its five shared-service tools are implemented and covered by AC-12 tests; the original student-authored Exercise 1 MCP server remains separate and unchanged.

Exercise 4 implementation checkpoint: the application now connects through `DATABASE_URL` to PostgreSQL and applies the separate migrations in `migrations/postgres/`; the earlier SQLite migrations remain unchanged, and existing local SQLite records have not been copied to Neon. Tests use in-memory PGlite. The app includes a database-aware `/health`, a short 404 response, generic error responses without stack traces, and a Node 22 Dockerfile. If PostgreSQL is unavailable during startup, the HTTP server remains available, `/health` returns 503 until migrations and seeding finish, and initialization retries every five seconds. The test suite also checks missing `DATABASE_URL`, migration/backfill behavior, and overlap constraints. Automated deployment readiness does not establish that a Neon database or Render service exists: the student still needs to configure provider dashboards and secrets, build/run the image, deploy, verify persistence and failure/rollback behavior, collect UI/waterfall evidence, fill in `docs/UI.md`, `course.json` and their own `READINESS.md`, then check the live deployment.
