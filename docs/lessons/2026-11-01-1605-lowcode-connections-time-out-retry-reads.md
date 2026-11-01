---
id: 2026-11-01-1605-lowcode-connections-time-out-retry-reads
title: "Node fetch to LowCode sometimes times out on connect; scripts retry reads only"
applies_when: >
  running the repo's Node test-environment or registration scripts against LowCode from Windows, and
  a call fails with TypeError fetch failed / ETIMEDOUT before any request is sent
rule: >
  When a Dataverse script call fails with fetch failed (connect ETIMEDOUT), re-run it or rely on the
  shared client's read retries, but never blindly retry writes, because the timeouts are intermittent
  and a repeated write that did reach the server can create a duplicate row.
lesson_type: pitfall
phase: testing
domain: [testing]
tech: [dataverse-web-api]
scope: this-project
cost_if_ignored: minor
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-11-01
  source: direct-experience
  evidence: "PR #69 (commit c6f8355): scripts/lib/dataverse.mjs send() retry and its test"
  author:
related: []
proposed_tags: []
---

When the repo's Node scripts call LowCode's Web API from the Windows machine, a call sometimes fails before it's sent, with `TypeError: fetch failed` and `connect ETIMEDOUT 52.159.219.114:443` (and `ENETUNREACH` on IPv6).

## What happened
It happened four times on 1 Nov 2026, during registration, the duplicate-key test and the data import. Each time an immediate re-run worked. One failure came after an import job had already been created, so the run was resumed from that job rather than started again.

## Why it happened
Not confirmed. The IPv6 route is unreachable, and the IPv4 connect sometimes times out, which points to the network path from this machine rather than Dataverse.

## What to do instead
- `scripts/lib/dataverse.mjs` retries **GETs** after a network error, up to three attempts with a short backoff. Writes are never retried automatically.
- After a failed write, check what exists before re-running. The scripts are idempotent, so re-running them is safe.
- For long multi-step jobs (imports), record the job's ID so a failure can resume it.

## When this does NOT apply
HTTP errors (4xx/5xx) that came back from Dataverse. Those aren't network failures and shouldn't be retried blindly.
