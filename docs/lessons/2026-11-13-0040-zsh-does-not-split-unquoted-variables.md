---
id: 2026-11-13-0040-zsh-does-not-split-unquoted-variables
title: "The Bash tool runs zsh, which doesn't split an unquoted variable into words"
applies_when: >
  writing a shell loop in the agent's Bash tool on the developer's Mac that iterates over a space-separated list
  held in a variable, for example IDs returned by a Web API query, especially when each iteration writes to Dataverse
rule: >
  When looping over several values in the Bash tool, hold them in an array and loop over "${arr[@]}" (or use
  ${=VAR}), and print each request's HTTP status, because the shell is zsh, where `for x in $VAR` runs once with the
  whole string, so a write to every item silently becomes one malformed request.
lesson_type: pitfall
phase: testing
domain: [agent-workflow, testing]
tech: [dataverse-web-api]
scope: this-project
cost_if_ignored: rework
confidence: one-off
status: active
superseded_by:
expires:
provenance:
  projects: [pcf-controls]
  date: 2026-11-13
  source: direct-experience
  evidence: "TextHash LowCode test run, 13 Nov 2026: plugins/TextHash/docs/decisions.md (the key-only case was re-run)"
  author:
related: []
proposed_tags: [zsh, shell]
---

When a Bash tool command ran `STEPS=$(…); for s in $STEPS; do curl -X PATCH …($s) …; done` to disable two plug-in steps, it sent one request with both IDs in the URL, so neither step was disabled.

## What happened
Testing TextHash's alternate key needed both steps disabled. The loop printed `disable 000` once instead of `disable 204` twice: curl couldn't send the malformed URL. The plug-in stayed on, so the key test's "failures" were really the plug-in doing its job, and the run proved nothing. With `STEPS=(id1 id2)` and `for s in "${STEPS[@]}"` it printed `disable 204` twice, and the test passed.

## Why it happened
The developer's login shell is zsh, and the Bash tool uses it. zsh doesn't word-split unquoted parameter expansions (bash does), so `$STEPS` stays one word.

## What to do instead
- Put lists in arrays and loop over `"${arr[@]}"`, or split explicitly with `${=VAR}`.
- Print each write's status (`curl -w "%{http_code}"`), and don't trust a test whose setup step didn't report success.
- For anything longer, write a Node script, as `scripts/test-env/` does.

## How to recognise it early
A loop that should run N times prints once, or curl reports HTTP `000`.

## When this does NOT apply
Scripts run with `bash` explicitly (`bash -c`, a `#!/bin/bash` file, GitHub Actions).
