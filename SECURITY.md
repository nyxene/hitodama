# Security Policy

## What matters here

Hitodama is a mod: its code runs inside your Claude Code session with your permissions, sees session events and writes files. A defect there is more than a broken game. The classes that matter most:

- **Reaching outside its folder.** Any read or write outside `~/.claude/hitodama/`, or a path built from data another session wrote that escapes it.
- **Seeing more than it says.** Any path by which prompt text, replies, file contents or transcripts reach the mod's files, notifications or pane.
- **Interfering with the session.** A hook that changes, blocks or delays prompts, tool calls or compaction instead of only observing them.
- **Residue in a shipped file.** A credential, a private path or a private link that reached this repository through a release.

## Supported versions

The latest released version is supported. This project is pre-1.0: fixes land in a new release rather than as patches to an older one.

## Reporting

**Do not open a public issue.** Use GitHub private vulnerability reporting: the *Report a vulnerability* button on the [Security tab](https://github.com/nyxene/hitodama/security/advisories/new). The thread stays private until a fix ships.

Include the Hitodama and Claude Code versions, what you did and what happened. There is no guaranteed response time, but security reports are read before anything else.
