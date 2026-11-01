---
id: 2026-11-01-1604-global-choice-bind-by-metadataid
title: "A choice column on a global choice must bind the choice by MetadataId, not by Name"
applies_when: >
  creating a Picklist column through the Dataverse Web API that should use an existing global
  choice (option set)
rule: >
  When creating a column on a global choice through the Web API, read the choice's MetadataId and
  bind "GlobalOptionSet@odata.bind": "/GlobalOptionSetDefinitions(<MetadataId>)", because binding
  by "(Name='…')" fails with "Guid should contain 32 digits with 4 dashes".
lesson_type: pitfall
phase: implementation
domain: [dataverse-metadata]
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
  evidence: "PR #71 (commit efd65b5), scripts/test-env/create-smsf-tasks.mjs ensureTaskTable"
  author:
related: []
proposed_tags: []
---

When a Web API script creates a Picklist column bound to a global choice with `"GlobalOptionSet@odata.bind": "/GlobalOptionSetDefinitions(Name='wbsuper_ragstatus')"`, Dataverse returns HTTP 500 "Guid should contain 32 digits with 4 dashes".

## What happened
`create-smsf-tasks.mjs` created the global RAG choice, then the task table, then failed on the `wbsuper_ragstatus` column with that error. Reading `GlobalOptionSetDefinitions(Name='wbsuper_ragstatus')?$select=MetadataId` and binding by that ID worked.

## Why it happened
The alternate-key form `(Name='…')` works for GET but isn't accepted inside an `@odata.bind` on attribute metadata. The bind expects the key GUID.

## What to do instead
Read `GlobalOptionSetDefinitions(Name='<name>')?$select=MetadataId`, then bind `"GlobalOptionSet@odata.bind": "/GlobalOptionSetDefinitions(<MetadataId>)"` on the `PicklistAttributeMetadata`.

## When this does NOT apply
Local choices, which are defined inline in `OptionSet`.
