# Agent log

One entry per agent session, newest at the bottom. Be honest: what went wrong is the useful part.

<!-- Copy this block for each session:

## YYYY-MM-DD · <short title>
- Goal:
- Delegated:
- Checkpoints:
- Went wrong:
- Changed by hand:

-->
## 2026-10-06 · MCP server implementation
- Goal: Build and test the MCP server for Exercise 1.
- Delegated: Asked the agent to explain the MCP protocol, help implement tools/list and tools/call, and debug the server.
- Checkpoints: Tested initialize, tools/list, find_lecture, tool errors, protocol errors, and reached 12/12 checks.
- Went wrong: student.json was initially missing, causing an ENOENT error. The package.json test script created by npm init also returned exit code 1.
- Changed by hand: Created student.json, tested the server from the terminal, and updated project configuration.
## 2026-10-20 · Recover repository and review Exercise 1

- Goal: recover the published work locally and repair its documentation.
- Delegated: ChatGPT/Codex inspected files, compared the official template, ran checks, and wrote documentation. No protocol handler was changed.
- Checkpoints: direct MCP check, npm.cmd test, and Windows npm launch check all passed 12/12; Exercise 2 check passed 14/30.
- Went wrong: no matching copy was found in the searched local folders; the MCP README sections were empty. The previous review incorrectly treated the 10-lecture dataset as necessarily outdated; the current template contains the same dataset.
- Changed by hand: none during this agent session; the student must review the changes.
- Remaining: manual terminal session, real-agent tool-choice experiment, and instructor decision on unavailable ChatGPT token statistics.

## 2026-10-20 · Check Exercise 1 against the course page

- Goal: compare the current Exercise 1 implementation with the official checklist.
- Delegated: none.
- Checkpoints: `npm.cmd test` passed 12/12; the configured npm launch passed 12/12; a direct call to `get_student_info` returned a successful text result.
- Went wrong: the first PowerShell pipeline reported a non-zero status despite printing the expected tool reply; rerunning through `cmd.exe` returned exit code 0.
- Changed by hand: no MCP server or course-provided check code was changed. The official instructions reserve protocol-handler implementation to the student.
- Remaining: the student must capture the required hand-entered terminal transcript and perform the real-agent tool-description experiment. These were not simulated or claimed.

## 2026-10-20 · Clarify Copilot access to local data

- Goal: make it clear how Copilot connects to the Exercise 1 data tools.
- Delegated: none.
- Checkpoints: called `find_lecture` and `get_student_info` through the available MCP tools; both returned data. Removed the unused `MCP_TOKEN` environment placeholder from the VS Code MCP configuration.
- Went wrong: the VS Code setup did not explain how to confirm the tools in Copilot Agent mode, and the unused token placeholder could suggest a key was required.
- Changed by hand: documented the VS Code Copilot connection and manual verification steps in `mcp-server/README.md`; simplified `.vscode/mcp.json`.
- Remaining: the student still needs to confirm tool visibility and selection in the local VS Code Copilot UI; this session did not verify that UI.

## 2026-10-20 · Verify Exercise 1 evidence and MCP availability

- Goal: rerun the Exercise 1 checks, capture actual server exchanges, verify both tools, and determine whether the description experiment can be performed in independent agent sessions.
- Delegated: started one independent Copilot session with the question "What does lecture 5 cover?" and no file edits.
- Checkpoints: direct self-check passed 12/12; Windows npm launch check passed 12/12; replayed every message from `messages.jsonl` against the actual server and captured the replies; called `find_lecture(5)` and `get_student_info` through MCP in this session; both calls returned the local data.
- Went wrong: the independent session did not use MCP and instead searched and read `mcp-server/lectures.json`. It is not valid evidence of an agent selecting the tool. The independent session's tool trace had no MCP invocation.
- Changed by hand: no code or data changed. This log records only actions and results actually observed.
- UI evidence reported by the student: in a fresh VS Code Copilot Agent conversation, the exact question "What does lecture 5 cover?" showed a visible `find_lecture` call. This is a user-reported UI observation, separate from the direct MCP tool invocations above.
- Preliminary UI attempt: before the controlled comparison, the student reported no visible tool call in one chat and was unsure whether `my-project` had reloaded. This attempt is excluded from the comparison because the reload was not confirmed.
- Controlled description comparison, user-reported UI observations: with the original description, a fresh Copilot Agent chat showed a visible `find_lecture` call and returned "What the agent built, part 1 covers HTTP, REST vs. GraphQL, data modeling, ORMs, and application layers." The student changed only the description to `Return course lecture information`, confirmed restarting `my-project` and seeing both tools, then asked the same question in a fresh chat; `find_lecture` was again visible and the answer was "Lecture 5 covers HTTP, REST vs. GraphQL, data modeling, ORMs, and application layers."
- Conclusion from the controlled observations: tool choice did not change between the two trials; both selected `find_lecture`, while the answer wording differed. This is based on the student's reports of the VS Code UI, not an independently captured UI trace.
- Cleanup and checks: restored the original description in the local `server.js`; the local server advertises the original description. The direct and Windows npm self-checks passed 12/12 after restoration.
- Remaining: the course's hand-entered terminal transcript is still outstanding. The automated replay was captured separately and is not presented as the student's manual transcript. Do not claim the lab is complete while this evidence requirement is outstanding.

## 2026-11-01 · Exercise 2 Lab Booking vertical slices

- Goal: complete Exercise 2 for the selected Lab Booking project, building and verifying the specification, database, sign-in, bookings list, availability, booking and cancellation flows.
- Delegated: none.
- User decisions: Node.js 22, Express, SQLite and plain HTML/CSS/JavaScript; Google OAuth with verified-email account linking; Gemini 2.5 Flash slot suggestions with non-personal structured input; one-hour weekday slots, 08:00–18:00 Europe/Sofia, a 30-day booking horizon and a three-future-booking student limit. User approved adding and installing `express` and `better-sqlite3`, and approved the sign-in/my-bookings slice plan.
- Checkpoints: `node checks/ex2.mjs` passed 32/32; installed only the two approved dependencies; student inspected the initial database (two labs and three workstations) and confirmed local sign-in. The student confirmed the bookings page details, deletion/reload behavior for demo booking ID 2 (PC-02, Lab 1250), and the availability form and slots. Unauthenticated requests to the running server returned 401 for `/api/my-bookings` and 302 to `/login` for `/my-bookings`. The student declined a persistent UI booking test. The complete automated suite passes 16 app tests plus the Exercise 1 MCP check 12/12; `npm run coverage` reports 100% lines, branches and functions for included `src/**`; the Exercise 2 self-check passes 32/32.
- Went wrong: the first database test run exposed Windows SQLite file handles being deleted before the database closed; cleanup order was corrected and the tests then passed.
- Changed by hand: replaced the Exercise 2 template with the Lab Booking specification; updated project commands/conventions; added migrations `001_initial_schema.sql` and `002_seed_state.sql`, SQLite setup and reference data, local scrypt password hashing and persistent sessions, login/bookings/availability routes and pages, service/repository operations for per-user bookings, availability, booking and cancellation, and tests for AC-1 through AC-7 and AC-14 through AC-17. Added blank seed-account settings to `.env.example` after approval; did not create or inspect `.env`.
- Went wrong: the integrated browser could not connect to the temporary local test server, so it did not provide visual evidence for the new bookings page.
- Remaining: browser UI observations are user-reported, not independently captured. The booking-creation confirmation was not manually tested because the student chose not to create a persistent booking; automated tests prove its API behavior. The availability/booking/cancellation work was kept as bonus scope at the student's request. No Google OAuth, AI model, staff management/dashboard or project MCP tool has been implemented; these are wider-project requirements, not Exercise 2's first slice.

## 2026-11-03 · Exercise 3 — slot suggestion and full self-check

- Goal: build the workstation suggestion feature end-to-end and satisfy Exercise 3's self-check against the current SPEC.
- Autonomy: the agent works on one approved plan step at a time; it stops after each step for tests and the student's diff review. The student makes each commit after reviewing it.
- Checkpoints: user approved the final plan before code; proceed one step at a time with tests and diff review; fake Google/Gemini clients in tests; no `.env` inspection/edit; student reviews UI and HTTP results; ask before committing or pushing.
- User decisions: preferences are web/cloud or networking; no match returns a clear result without booking; Gemini failures or invalid output use the first matching available slot, or report no match; only non-identifying preference, date and current availability may be sent to Gemini; add an `activity_type` migration to workstations. User expanded scope to cover all current acceptance criteria and Exercise 3 self-check requirements, including staff, Google OAuth and the five specified MCP tools.
- Reviewed plan (approved 2026-11-03): (1) migration 003 for constrained workstation activity types, existing-row backfill and Google identities; (2) staff create/list services, protected routes/dashboard and AC-8/9 tests; (3) Google authorization-code flow, verified-email account linking and fake-client AC-13 tests; (4) Gemini suggestion service, authenticated API and UI with timeout, validated output, deterministic fallback and AC-18..23 tests; (5) separate Lab Booking MCP server with the five specified tools, session authentication, shared services and AC-12 tests; (6) complete AC-1..23 test traceability, architecture note, rule-removal proof and all final checks.
- Changes made in plan review: expanded the initial suggestion-plus-three-tools scope to include staff and Google OAuth after the student requested the full Exercise 3 self-check; preserve the Exercise 1 server and do not weaken the course checker.
- Step 2 checkpoint: implemented staff-only lab/workstation creation, staff workstation and all-bookings listings, protected `/staff` and `/api/staff/*` routes, role-aware login redirect, and the staff dashboard. The student committed this step as `9536a20 Staff: add dashboard and booking management`.
- Step 3 checkpoint: implemented Google authorization-code sign-in with state and PKCE, a provider client with eight-second network timeouts, verified-email-only linking, passwordless student account creation and the existing application session. `npm.cmd test` passed 30 app tests and Exercise 1 MCP 12/12; `npm.cmd run coverage` passed 30 tests at 100% lines, branches and functions; `node checks/ex2.mjs` passed 32/32. OAuth tests use fake clients/stubbed fetch and make no Google requests. No `.env` or persistent database was inspected or modified.
- The student reviewed and committed step 3 as `c3e84c7 Google: add verified OAuth sign-in`.
- At the time of the OAuth implementation commit, real provider credentials and browser sign-in had not yet been verified; see the following dated entry for the student's subsequent report.
- Step 4 checkpoint: added the authenticated slot-suggestion API and UI, Gemini client with an 8-second timeout, non-personal availability-only request payload, slot-id/reason validation and deterministic first-match fallback. `npm.cmd test` passed 42 application tests and Exercise 1 MCP 12/12; `npm.cmd run coverage` passed all 42 tests at 100% lines, branches and functions; `node checks/ex2.mjs` passed 32/32. All model tests used stubs; no real provider request was made. The changed-file check confirmed `.env` was not modified.
- At the time of this entry, step 4 was current. The student later reviewed and committed that step; see the dated follow-up entries for subsequent work.

## 2026-11-03 · Verify Google OAuth setup

- Goal: guide the student through configuring the Google OAuth test client and verify the end-to-end sign-in.
- Delegated: none.
- Checkpoints: the student reported creating a Google web OAuth client, registering `http://localhost:3000/auth/google/callback`, adding their test account and configuring the local `.env`. The student reported that the login page showed the Google button and that sign-in with the test account succeeded.
- Went wrong: no shared browser page was available, so the agent did not independently observe the provider redirect or authenticated session. Treat the successful login as student-reported evidence.
- Changed by hand: updated the project status and spec evidence to distinguish the student's report from independently observed test results. No credentials were requested in chat; `.env` was not read or modified by the agent.
- Remaining: the student reported stopping the temporary test server. The Gemini feature is now implemented and awaits review/commit; the Lab Booking MCP server remains outstanding.

## 2026-11-10 · Exercise 3 Lab Booking MCP server

- Goal: implement the Exercise 3 project MCP server without changing the student-authored Exercise 1 server or its tools.
- User decisions: approved a separate Lab Booking server with `list_free_slots`, `my_bookings`, `book_slot`, `cancel_booking` and `suggest_slot`; approved staff read-only access to free-slot listings while keeping booking, cancellation and suggestions student-only.
- Implemented: the new JSON-RPC server authenticates every call against the user's active `lab_session`, then calls the same booking and suggestion services used by HTTP. Added VS Code/Gemini MCP configuration, the `mcp:lab-booking` command, and documentation for the session token and separate servers. The existing Exercise 1 configuration and MCP command remain in place.
- Authorization: `bookingService.listAvailableSlots` now allows students and staff, as required by `SPEC.md`; student-only service guards still apply to bookings, cancellations and suggestions.
- Evidence: AC-12 tests cover tool registration/protocol behavior, parity with HTTP, staff read-only permissions, expired sessions and refusing startup without a token. The Exercise 1 server tests remain unchanged.
- Verification: targeted MCP and booking tests passed 12/12; `npm.cmd test` passed 47/47 app tests and Exercise 1 MCP 12/12; `npm.cmd run coverage` passed all 47 tests at 100% lines, branches and functions; `node checks/ex2.mjs` passed 32/32; `node checks/ex3.mjs` passed 18/18 when run with a temporary local Windows shim resolving `npm` to `npm.cmd` (the shim was removed afterward).
- Safety: `.env` was not read or modified; no credentials were sent to a provider. No commit was created.
- Remaining: the student should review and commit this step before any further work.