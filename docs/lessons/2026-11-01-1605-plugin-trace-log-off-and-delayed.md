---
id: 2026-11-01-1605-plugin-trace-log-off-and-delayed
title: "Plug-in trace logs are off by default and arrive a minute or two after the failure"
applies_when: >
  looking for a plug-in's trace output (tracing.Trace) in plugintracelogs after a save it blocked or
  failed, in a test or dev environment
rule: >
  When checking a plug-in's trace output, first make sure organization.plugintracelogsetting is
  Exception (1) or All (2), then wait one to two minutes before querying plugintracelogs, because the
  setting is Off by default and entries appear late, so an immediate empty result proves nothing.
lesson_type: pitfall
phase: testing
domain: [testing]
tech: [dataverse, dataverse-web-api]
scope: this-stack
cost_if_ignored: minor
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-11-01
  source: direct-experience
  evidence: "PR #69 (commit c6f8355); plugins/WBCodeFYName/docs/decisions.md 'Dev test matrix' note 3"
  author:
related: []
proposed_tags: [plugins]
---

When a plug-in's broken-configuration case was tested in `LowCode`, `plugintracelogs` was empty twice: once because tracing was off, and once because the entries hadn't arrived yet.

## What happened
- `organization.plugintracelogsetting` was `0` (Off), so a blocked save left no details anywhere. It was set to `1` (Exception).
- The next blocked saves returned the admin message at once, but a query straight afterwards found **0** trace entries.
- About a minute later, the entries appeared: `the step configuration is invalid: Missing property "nameColumn".` and `The step's unsecure configuration is empty.`

## Why it happened
Trace logging is opt-in per environment. Trace records are written asynchronously after the failing operation, so they lag the response.

## What to do instead
- In dev and UAT, set System Settings → Customization → plug-in trace log to **Exception**, or PATCH `organizations(<id>)` with `{ plugintracelogsetting: 1 }`.
- Poll `plugintracelogs?$orderby=createdon desc` for up to two minutes before concluding there's nothing.
- Filter on `typename` with care: it's the full assembly-qualified name, so `eq 'WBCodeFYName.SetPrimaryName'` doesn't match.

## When this does NOT apply
Production, where the trace setting is the business's call. Synchronous error messages, which return at once.
