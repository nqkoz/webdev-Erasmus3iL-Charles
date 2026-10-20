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
