# Security Policy

## Scope

`dz-sandbox` is a **local development and CI test sandbox**. It is **not** intended for handling real production money, real customer PII, or public internet exposure.

## Built-in Safety Defaults

- Binds to `127.0.0.1` by default (`DZ_SANDBOX_HOST=0.0.0.0` is opt-in, e.g. inside containers).
- Redacts `Authorization`, `X-API-TOKEN`, `X-API-ID`, passwords, and card-like keys in stored request logs.
- Supports `DZ_WEBHOOK_ALLOWLIST` (comma-separated hosts) to restrict outbound webhook targets in shared CI environments.
- Rejects oversized request bodies cleanly and runs as a non-root user (`sandbox`) in Docker.

## Reporting a Vulnerability

If you discover a security issue (for example, path traversal in YAML scenario loading, SSRF bypass when `DZ_WEBHOOK_ALLOWLIST` is enabled, HTML/XSS injection on hosted payment pages or dashboard, or credential leakage in logs):

1. **Do not** open a public issue with an active exploit.
2. Report privately to the repository maintainers via GitHub Security Advisories (`Security -> Advisories -> Report a vulnerability`).
3. Include reproduction steps, affected package(s), and impact assessment.

We aim to acknowledge reports within **72 hours** and ship a patched release promptly.
