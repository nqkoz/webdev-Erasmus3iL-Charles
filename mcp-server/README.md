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

Not yet evidenced in this repository. No real-agent experiment was performed during the local repair session; Gemini CLI is not installed in this Windows environment.

Complete in the course Codespace:

1. Start Gemini CLI, run /mcp and verify that my-project exposes both tools.
2. Ask "What does lecture 5 cover?" without naming a tool, and record the tool chosen and result.
3. Record /stats, quit, and change only the find_lecture description.
4. Start a fresh session, repeat the same question, and record /stats again.
5. Replace this pending note with three sentences: the exact description change, whether tool choice changed, and your explanation based on the observation. Log both sessions in AGENT_LOG.md and USAGE.md. Retain a meaningful final description of at least 20 characters.

## Where this goes next

Keep this folder for Club events. The web application belongs outside mcp-server/. Future event tools must call the same service functions as HTTP routes and act through an ordinary user session. These project services and authentication do not exist yet in Exercise 1.
