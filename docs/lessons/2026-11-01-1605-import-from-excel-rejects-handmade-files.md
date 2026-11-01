---
id: 2026-11-01-1605-import-from-excel-rejects-handmade-files
title: "The app's Import from Excel rejects hand-made files; test data import via the Web API"
applies_when: >
  testing how a plug-in or rule behaves under Dataverse data import, and preparing a small CSV or
  xlsx to import from a model-driven app's list view
rule: >
  When a test needs a data import, run the import engine through the Web API (import + importfile
  with usesystemmap, then ParseImport, TransformImport, ImportRecordsImport), because the app's
  "Import from Excel" panel rejects CSV and accepts only xlsx exported from Dataverse.
lesson_type: workaround
phase: testing
domain: [testing]
tech: [dataverse-web-api, claude-in-chrome]
scope: this-stack
cost_if_ignored: minor
confidence: one-off
status: active
superseded_by:
expires: 2027-05-01
provenance:
  projects: [pcf-controls]
  date: 2026-11-01
  source: direct-experience
  evidence: "PR #69 (commit c6f8355); plugins/WBCodeFYName/docs/decisions.md 'Dev test matrix' note 1"
  author:
related: []
proposed_tags: []
---

When a test needs to push a small hand-made file through Dataverse's data import, the model-driven app's **Import from Excel** panel refuses it.

## What happened
For WBCodeFYName's data import case (#60):
- A two-row CSV gave "Selected file is a different file type than you selected for import".
- A minimal hand-built xlsx gave "Invalid Format in Import File … Try again with a file exported from Dynamics 365".

Running the same CSV through the import engine with the Web API worked. Row 2 was created, and row 3 was rejected, with the plug-in's message in `importlog.additionalinfo`.

## Why it happened
That panel expects the hidden mapping sheets that Dataverse's own Excel export adds. The classic Import Data wizard, which maps arbitrary files, isn't on that command.

## What to do instead
1. `POST imports` `{ modecode: 0 }`.
2. `POST importfiles` with `content` (the CSV text), `isfirstrowheader`, `usesystemmap: true`, `fielddelimitercode: 2`, `datadelimitercode: 1`, `processcode: 1`, `targetentityname`, and the import bound.
3. Call `ParseImport` (unbound, `{ ImportId }`) and `TransformImport`, then `imports(<id>)/Microsoft.Dynamics.CRM.ImportRecordsImport`, waiting for each async job (statuscode 30).
4. Read `importfiles` counts and `importlogs` (`linenumber`, `additionalinfo`, `errornumber`).

Lookups resolve by the target's primary name. Put `#` in names URL-encoded when querying.

## When this does NOT apply
A user test of the wizard itself. Export a template from the table first, then fill it in.
