---
id: 2026-11-02-2302-pull-main-before-looking-for-files
title: "Other sessions push to main in parallel; pull before deciding a file doesn't exist"
applies_when: >
  an agent session that has run for hours is asked to change a document or code that it can't
  find in its local checkout
rule: >
  When a requested file isn't in the local checkout, run git fetch and look at origin/main before
  saying it doesn't exist, because other agent sessions merge PRs to main in parallel and a
  long-running session's local main falls behind.
lesson_type: pitfall
phase: implementation
domain: [agent-workflow]
tech: []
scope: this-project
cost_if_ignored: minor
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-11-02
  source: direct-experience
  evidence: "plugins/WBCodeFYName/docs/runbook.md arrived in commit 1e8eaef (PR #69) while this session's local main was at 711415e; PRs #66 to #79 merged meanwhile"
  author:
related: [2026-10-22-2034-trial-merge-overlapping-prs]
proposed_tags: []
---

When an agent session in this repo has run for a long time and is asked to "update the runbook" or another file it can't find, the file has usually been added on `main` by another session.

## What happened
Asked to update the WBCodeFYName runbook, this session searched its working tree and found nothing. Local `main` was at `711415e`. Meanwhile other sessions had merged PRs #66 to #79, including `plugins/WBCodeFYName/docs/runbook.md` (`1e8eaef`), and changed the plug-in's messages. A `git fetch` showed the new remote branches, and `git pull` brought in the runbook.

## Why it happened
Several Claude sessions work on this repo at once (for example on Windows for `LowCode` testing and on macOS), each merging its own PRs. A session only sees their work after it pulls.

## What to do instead
- Before searching for a named file, or starting a branch, run `git fetch` and `git pull --ff-only` on `main`.
- Check `git log origin/main` for recent merges that touch the files you're about to change, so your edits build on the current version.

## How to recognise it early
`git branch -a` shows remote branches you didn't create, or a file the user mentions is missing locally.
