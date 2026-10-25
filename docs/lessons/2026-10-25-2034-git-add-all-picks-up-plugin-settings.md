---
id: 2026-10-25-2034-git-add-all-picks-up-plugin-settings
title: "git add -A commits .claude/settings.json written by /plugin install"
applies_when: >
  an agent stages a commit with git add -A or git add . in a repo where the user
  installed or enabled a Claude Code plugin during the session
rule: >
  When committing at the end of a session, run git status and stage named paths instead
  of git add -A, because /plugin install writes .claude/settings.json at project scope and
  it isn't gitignored, so it gets committed with unrelated work.
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
  date: 2026-10-25
  source: direct-experience
  evidence: "PR #37: commit f7a2d46 included .claude/settings.json, removed by commit 60bce8e"
  author:
related: []
proposed_tags: []
---

When an agent stages everything with `git add -A` after the user has installed a Claude Code plugin in the session, the plugin's project-scope `.claude/settings.json` goes into the commit.

## What happened
During #35 the user ran `/plugin install question-panel`, which wrote `.claude/settings.json` (`enabledPlugins: { "question-panel@aiso-skills": true }`). The #35 commit (f7a2d46) used `git add -A` and was pushed with it. Rewriting the pushed commit with a force-push was blocked by the auto-mode classifier, so a follow-up commit (60bce8e) untracked it, and the PR's net change to `main` excluded it.

## Why it happened
`.gitignore` covers `.claude/settings.local.json` and `.claude/worktrees/`, not `.claude/settings.json`, which is meant to be shared. A file created by a command the agent didn't run isn't on its mind when staging.

## What to do instead
- Run `git status --short` and stage the paths you changed by name.
- If an unexpected file is already pushed, untrack it in a follow-up commit (`git rm --cached <file>`) rather than force-pushing.
- Ask the user before committing a shared `.claude/settings.json`: it changes every collaborator's setup.

## How to recognise it early
`A  .claude/settings.json` (or any path you didn't touch) in `git status` before the commit.

## When this does NOT apply
When the team deliberately shares plugin settings, commit that file on its own, with its own message.
