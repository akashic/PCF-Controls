---
id: 2026-11-02-2301-record-environment-facts-not-photos
title: "Photos of William Buck environments put client data in git history; write the facts down instead"
applies_when: >
  the developer supplies photos or screenshots of a William Buck environment (tables, columns,
  records, errors) to inform work in this repo
rule: >
  When given photos of a William Buck environment, read the names into a Markdown file such as
  fields.md and leave the images untracked, because the photos show client WBCodes and Vault IDs
  and, once pushed, deleting them doesn't remove them from history.
lesson_type: anti-pattern
phase: implementation
domain: [agent-workflow]
tech: []
scope: this-org
cost_if_ignored: rework
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-11-01
  source: direct-experience
  evidence: "commits f9d65c2 and 740b1a7 added photos to plugins/WBCodeFYName/Images/; commit 7e283cf removed them in favour of fields.md"
  author:
related: [2026-11-02-2300-maker-portal-name-column-is-schema-name]
proposed_tags: []
---

When the developer supplies photos of a William Buck environment to explain its tables, committing them puts client data into the repo's history for good, even after they're deleted.

## What happened
The developer added HEIC photos of the dev maker portal to `plugins/WBCodeFYName/Images/`. They were converted to PNG (about 65 MB) and, at the developer's request, pushed to `main` in two commits. The photos showed SuperFundClient rows with real WBCodes and Vault client IDs. Later the developer asked for them to be removed and for `fields.md` to be the record, which commit `7e283cf` did. The photos stay in history unless `main` is rewritten.

## Why it happened
The photos were the fastest way to share the schema. The names in them were the useful part, but the images also caught sample rows, and photos of error dialogs show record names.

## What to do instead
- Read the table and column names into a Markdown table (`plugins/WBCodeFYName/fields.md` is the model), and mark anything cut off or not shown.
- Leave the images untracked, and say so. Convert them only into the scratchpad, to read them.
- If the developer still asks to commit them, point out the client data and history first, then do what they decide.

## When this does NOT apply
Screenshots from `LowCode`, the test environment with made-up data, used as test evidence (for example ChoiceCounts' screenshots in #79).
