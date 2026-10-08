# Security Policy

## Supported versions

Only the latest minor release of the current major line receives security fixes.

## Reporting a vulnerability

Do not open a public issue. Use GitHub's private vulnerability reporting on this repository
(Security tab, "Report a vulnerability"), which reaches the maintainer directly.

Include the affected version, a description of the issue, and a minimal reproduction if you have
one. You will get an acknowledgement within seven days. Fixes ship as a patch release with a GitHub
Security Advisory; reporters are credited unless they ask not to be.

## Scope

hono-jsonapi parses untrusted request documents and query strings and renders responses. Reports we
care about most:

- prototype pollution through member names, query parameter names, or `lid` values taken from a
  request
- server internals (stack traces, database detail, file paths) reaching an error response
- a request document or query string that bypasses a definition's declared fields, relationships,
  sort fields, filter operators, or page size bounds
- denial of service through pathological documents, query strings, or operation lists
- header injection through `Location`, `Content-Type`, or `Vary`
