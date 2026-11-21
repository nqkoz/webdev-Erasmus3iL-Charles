# Exercise 1 · MCP server

Hand-written Node.js server using JSON-RPC over standard input/output. No MCP SDK or framework is used.

## How to start it

Run from the repository root in the course Codespace:

```bash
npm run --silent mcp
```

The server waits for one JSON object per line on stdin. stdout contains protocol replies only; diagnostic messages go to stderr. Stop an interactive session with Ctrl+C.

On Windows PowerShell, use `npm.cmd run --silent mcp` or `node mcp-server/server.js`.

## Use the tools from VS Code Copilot

The repository's `.vscode/mcp.json` registers this local server as `my-project`. Open the repository folder in VS Code, open Copilot Chat in **Agent** mode, and check the tools menu for `find_lecture` and `get_student_info`. If you edit the MCP configuration or server, restart the MCP server from that menu before checking again. No API key or `MCP_TOKEN` is needed for this Exercise 1 server.

## Lab Booking project server (Exercise 3)

The separate `lab-booking` server exposes the five tools listed in `SPEC.md` and calls the same service layer as the HTTP API. The existing Exercise 1 server and its two course-data tools remain unchanged.

1. Sign in to Lab Booking locally, then copy the value of the `lab_session` cookie from the browser's developer tools. Never paste the value into chat, a committed file, or a terminal command.
2. Store that value as `MCP_TOKEN` in the ignored local `.env` file. It is the user's ordinary session and expires after seven days; update it after signing in again.
3. Restart `lab-booking` in the VS Code MCP server list. The configuration runs Node with `--env-file-if-exists=.env`, so the token stays local.

For a terminal session, run `npm run --silent mcp:lab-booking` (PowerShell: `npm.cmd run --silent mcp:lab-booking`). The process requires a valid current session token and `DATABASE_URL`, then opens the same PostgreSQL database as the web app. stdout is reserved for JSON-RPC; diagnostics go to stderr. Do not use the Exercise 1 `mcp` command for Lab Booking.

The MCP tools are `list_free_slots`, `my_bookings`, `book_slot`, `cancel_booking` and `suggest_slot`. Students can use all five; staff can only list free slots. Every call validates the configured session and calls the shared application services, which enforce the same access and booking rules as HTTP.

Try asking Copilot, without naming a tool, "What does lecture 5 cover?" It should use `find_lecture` and return the lecture title and topics. This is a manual check in the VS Code UI; a passing self-check below only verifies the protocol and does not prove that Copilot connected.

## The two tools

| Tool | Input | Result |
| --- | --- | --- |
| find_lecture | Required integer number | Title and topics from lectures.json; a missing lecture produces isError: true |
| get_student_info | Empty object | Name, school and studies from the local student.json file |

The current official template and this repository both contain 10 lectures. The exercise website currently says 12; this mismatch was checked on 2026-10-20. Do not invent two additional lectures: confirm the intended dataset with the instructor.

## Run the self-check

```bash
node mcp-server/check.mjs -- node mcp-server/server.js
node mcp-server/check.mjs -- npm run --silent mcp
```

On Windows the supplied check uses child_process.spawn without a shell; npm needs its command interpreter:

```powershell
npm.cmd test
node mcp-server/check.mjs -- cmd.exe /d /s /c npm.cmd run --silent mcp
```

On 2026-10-20, the direct Node check, npm.cmd test and the Windows npm launch check each passed 12/12 checks. These checks do not prove a real agent has connected or chosen a tool.

## Session transcript

The exchange below was captured by running the actual server on 2026-10-20 with the messages in messages.jsonl. It is an automated replay, not a claim that the original manual exercise was performed. The original lab also asks the student to enter the messages individually in a terminal.

```text
Client → server: {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"course-check","version":"1.0.0"}}}
Server → client: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-11-25","capabilities":{"tools":{}},"serverInfo":{"name":"lectures","version":"0.1.0"}}}
Client → server: {"jsonrpc":"2.0","method":"notifications/initialized"}
Server → client: (no reply; notification)
Client → server: {"jsonrpc":"2.0","id":2,"method":"tools/list"}
Server → client: {"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"find_lecture","description":"Return the title and topics of one course lecture by its number, 1 to 10. Use it when asked what a lecture covers.","inputSchema":{"type":"object","properties":{"number":{"type":"integer","description":"Lecture number, 1 to 10"}},"required":["number"]}},{"name":"get_student_info","description":"Return local information about the student, including name, school and studies. Use it when asked about the student.","inputSchema":{"type":"object","properties":{}}}]}}
Client → server: {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"find_lecture","arguments":{"number":5}}}
Server → client: {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"Lecture 5: What the agent built, part 1. Topics: HTTP, REST vs GraphQL, data modeling, ORM, layers"}],"isError":false}}
Client → server: {"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"find_lecture","arguments":{"number":99}}}
Server → client: {"jsonrpc":"2.0","id":4,"result":{"content":[{"type":"text","text":"There is no lecture 99. The course has lectures 1 to 10."}],"isError":true}}
Client → server: {"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"no_such_tool","arguments":{}}}
Server → client: {"jsonrpc":"2.0","id":5,"error":{"code":-32602,"message":"Unknown tool: no_such_tool"}}
Client → server: {"jsonrpc":"2.0","id":6,"method":"nonsense/method"}
Server → client: {"jsonrpc":"2.0","id":6,"error":{"code":-32601,"message":"Unknown method: nonsense/method"}}
```

## The description experiment

With the original `find_lecture` description, the student asked Copilot “What does lecture 5 cover?” and reported a visible `find_lecture` call; the answer was “What the agent built, part 1 covers HTTP, REST vs. GraphQL, data modeling, ORMs, and application layers.” After changing only the description to `Return course lecture information` and confirming that `my-project` had restarted, the student asked the same question in a fresh chat, reported that `find_lecture` was still called, and received “Lecture 5 covers HTTP, REST vs. GraphQL, data modeling, ORMs, and application layers.” Tool choice did not change in these two observed trials; the wording of the answers differed, and per-session usage statistics were unavailable.

## Project server architecture

The project server is kept separate from the student-authored Exercise 1 protocol server. It validates `MCP_TOKEN` through the session service, dispatches each project tool to an existing booking or suggestion service, and writes no SQL of its own. Both front doors therefore reach the same repositories, PostgreSQL migrations in `migrations/postgres/`, and data.
