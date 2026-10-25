---
id: 2026-10-25-2035-try-maker-steps-in-the-maker-portal
title: Try maker-facing steps in the maker portal before documenting them
applies_when: >
  writing or reviewing a maker guide (configuration guide, README deployment steps) for
  a step that the team has only ever done by script or through the Web API
rule: >
  When a guide tells makers to do something in make.powerapps.com, do that exact step in
  the maker portal as a maker before publishing the guide, because scripted tests take a
  different path and the UI can refuse what the API accepts.
lesson_type: heuristic
phase: handover
domain: [dataverse-metadata, testing]
tech: [dataverse, claude-in-chrome]
scope: this-project
cost_if_ignored: rework
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-10-25
  source: direct-experience
  evidence: "PR #37 (configuration guide 'Deploy it' rewritten); controls/GridFormatter/docs/decisions.md V10; issue #35"
  author:
related: [2026-10-25-2034-maker-portal-web-resource-rejects-json-upload, 2026-10-25-2034-basic-user-cannot-read-publisher]
proposed_tags: []
---

When a maker guide describes a step the team has only done by script, the step may not work as written in the maker portal.

## What happened
GridFormatter's configuration guide (PR #27) told makers to "upload your `.json` file" as a Script web resource. Every rules file had been created by `scripts/test-env/upload-web-resource.mjs` through the Web API. The #35 spike tried the step in make.powerapps.com: the file picker doesn't offer `.json`, so the guide was rewritten to paste into the **Code** box. The same spike found the reverse case too: the maker form accepted a `_` in the name, which Microsoft Learn's naming rules suggested it wouldn't.

## Why it happened
Scripts and the Web API skip the maker UI's own checks (file pickers, prefix fields, name validation), and admins testing a design skip the Basic User's privileges. Tests passing by script say nothing about the maker's path.

## What to do instead
- For each maker-facing step in a guide, do it once in the maker portal in a test environment (Claude in Chrome can drive it), in a throwaway component you delete afterwards.
- Check the result through the API (name, type, content) and record it in the control's `docs/decisions.md`.
- Do the same for runtime behaviour as an ordinary user, not only as an admin.

## When this does NOT apply
Steps that are only ever scripted, such as test-environment setup in `docs/testing/`.
