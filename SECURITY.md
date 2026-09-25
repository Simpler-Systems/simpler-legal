# Security

## Reporting a problem

Report it privately through GitHub:

<https://github.com/Simpler-Systems/simpler-legal/security/advisories/new>

That is the repository's **Security** tab, "Report a vulnerability". Only you and the
repository's maintainers see the report. Please do not open a public issue, pull request or
discussion for a security problem. If you cannot use GitHub, write to `support@simpler.asia`.
The private report is preferred for anything unpatched, because it keeps the report and the fix
in one place. Either way the report reaches the maintainer, Simpler Terminal Value Systems Pte
Ltd in Singapore.

Say which version you ran (the About screen gives it), which Windows version, what you did,
what you expected and what happened.

**Never attach a client's document**, or anything else you are not free to publish. Show the
problem with an invented document or a public one. If a name or number was not redacted, say
what kind it was and how it was written (spaced out, hyphenated, inside a link, in a footer),
with invented text.

## What is in scope

File names below are paths in the source repository, github.com/Simpler-Systems/simpler-legal.

- **The desktop app** (`app/src-tauri/`, `app/frontend/`). For example: document text, or the
  key from tags back to names, reaching anything other than the loopback address 127.0.0.1;
  text sent to a process on port 1436 or 49400 that the app did not check first; another
  program or a web page on the same computer reading or sending text through the app's
  services; the export check passing a file that holds a name it says it reads.
- **The engine service and the frozen pipeline it runs** (`serve-legal.mjs` and the engine
  files the installer carries). For example: a working copy left on disk where the app says
  it was removed, or a write outside the engine's working folder.
- **Redaction.** A name or number that ships where the README, the site or the export receipt
  says it is masked. One that ships in a way they already describe is a known limit, not a
  new finding, though a report that shows it matters more than they say is welcome. If you can
  show the miss with a public or invented document, a public issue is fine and is the most useful
  form (`README.md`, "Contributing"). Report it here when showing it would take a client's text.
- **The installer** and what it puts on disk (`app/src-tauri/tauri.conf.json`).
- **The build and release tools** in `tools/` and the steps in `BUILDING.md`, where they fetch
  or run something they should not.
- **A security claim** on simpler.legal, in the README or on an app screen that the code does
  not bear out.

## What goes elsewhere

- A problem in llama.cpp, Node.js, Microsoft WebView2, Tauri or another project this app uses
  goes to that project, unless it is the way this app uses it that exposes the problem.
- Version 0.1.0 is **not code-signed**, so Windows SmartScreen warns before the installer
  runs. That is known and stated wherever the installer is offered.
- A program running under your own Windows account can read what the app reads. The app does
  not defend against that, and says so (the IT brief, `site/it.html`, "What this does not
  cover").

## Versions

Only the latest release on
[GitHub Releases](https://github.com/Simpler-Systems/simpler-legal/releases) is supported. The app
has no updater and does not check for new versions, so a fix reaches you only when you
install the new release yourself.

There is no bug bounty.
