---
id: 2026-11-01-1604-preimage-patch-only-attributes
title: "PATCHing a step image fails unless you send only its attributes"
applies_when: >
  updating an existing sdkmessageprocessingstepimage (for example a PreImage's columns) through the
  Dataverse Web API, typically when re-running an idempotent registration script
rule: >
  When updating an existing step image through the Web API, PATCH only the attributes column, and
  only when it differs, because a PATCH that repeats name, entityalias, imagetype or
  messagepropertyname fails with 0x80040216 "An unexpected error occurred".
lesson_type: pitfall
phase: implementation
domain: [solutions-alm]
tech: [dataverse-web-api]
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
  evidence: "PR #66 (commit 24d8783); plugins/WBCodeFYName/docs/decisions.md W-1 findings; register.mjs ensurePreImage"
  author:
related: []
proposed_tags: [plugins]
---

When an existing step image is updated through the Web API with the full set of fields it was created with, the PATCH fails with `0x80040216` "An unexpected error occurred".

## What happened
`register.mjs` ran a second time over the WBCodeFYName registration in `LowCode`. Its PreImage update sent `name`, `entityalias`, `imagetype`, `messagepropertyname` and `attributes`, and got HTTP 400 `0x80040216`. Sending only `attributes`, and skipping the PATCH when they matched, made the re-run clean.

## Why it happened
Not confirmed. Dataverse appears to reject re-setting an image's identity fields after creation, and reports it as a generic error rather than naming the field.

## What to do instead
Read the image's current `attributes`. If they differ, `PATCH sdkmessageprocessingstepimages(<id>)` with `{ "attributes": "a,b" }` only. Recreate the image if its alias or type has to change.

## How to recognise it early
A first registration works, but every re-run fails at the image step with `0x80040216`.

## When this does NOT apply
Creating the image (POST), which needs all those fields.
