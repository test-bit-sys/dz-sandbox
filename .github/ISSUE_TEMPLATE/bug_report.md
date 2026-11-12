---
name: Bug Report
about: Report a bug, inaccurate mock behavior, or CLI/dashboard issue
title: "[Bug]: "
labels: bug
---

## Summary
Describe what happened vs. what you expected.

## Provider / Package
- [ ] `@dz-sandbox/core`
- [ ] `@dz-sandbox/mock-chargily`
- [ ] `@dz-sandbox/mock-satim`
- [ ] `@dz-sandbox/mock-yalidine`
- [ ] `@dz-sandbox/control` / Dashboard
- [ ] `dz-sandbox` CLI / Docker

## Reproduction Steps
1. Active scenario / command / headers (`X-DZ-Scenario`, etc.)
2. Request method, path, and sanitized body
3. Response received vs. official provider behavior

## Official Evidence (if reporting a spec mismatch)
If a mock differs from the real provider API, link the public doc URL or attach a **sanitized/redacted** JSON response fixture (no real secrets or PII).
